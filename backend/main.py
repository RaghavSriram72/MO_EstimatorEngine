from __future__ import annotations

import base64
import hashlib
import hmac
from datetime import UTC, datetime
from typing import Any

import cv2
import numpy as np
from fastapi import FastAPI, File, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

# Scenario 2 disabled — no longer offered as a quote scenario. Tabs now go 1, 3, 4, 5.
from lib.classes import Project, Scenario1, Scenario3, Scenario4, Scenario5
from lib.classes.cost_inputs import (
    Scenario1Input,
    Scenario3Input,
    Scenario4Input,
    Scenario5Input,
)
from lib.classes.db import MidnightOilDB

from lib.globals import (
    BUSMARK_FORM_LENGTH,
    BUSMARK_FORM_WIDTH,
    FORM_95_LENGTH,
    FORM_95_WIDTH,
    PADDING,
)
from lib.classes.form import Complexity, Element
from lib.cost_debug import maybe_attach_cost_explanations
from lib.persisted_project import (
    PersistedProjectCreate,
    PersistedProjectUpdateBody,
    complexity_to_str,
    elements_to_persisted,
    persisted_create_to_document,
    persisted_update_to_set,
    project_short_id,
)
from lib.persisted_quote import (
    PersistedQuoteCreateBody,
    PersistedQuoteUpdateBody,
    persisted_quote_create_from_path,
    persisted_quote_insert_document,
    persisted_quote_update_to_set,
)
from lib.print_form_calculator import print_form_calculator
from vision.functions import process_image as vision_process_image

app = FastAPI()
db = None


def _ensure_db():
    global db
    if not db:
        db = MidnightOilDB().connect()
    return db


# Configure CORS for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class AccountRequest(BaseModel):
    """Payload for account creation and sign-in endpoints."""

    username: str
    password: str


def _verify_password(password: str, stored_hash: str) -> bool:
    """Verify a password against a stored PBKDF2 hash string."""
    try:
        algorithm, iterations, salt_hex, digest_hex = stored_hash.split("$")
        if algorithm != "pbkdf2_sha256":
            return False

        recomputed = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            bytes.fromhex(salt_hex),
            int(iterations),
        )
        return hmac.compare_digest(recomputed.hex(), digest_hex)
    except (ValueError, TypeError):
        return False

async def root():
    """Simple root endpoint to verify the server is running."""
    return {"message": "Hello from FastAPI"}


_COMPLEXITY_MAP = {
    "Simple": Complexity.SIMPLE,
    "Moderate": Complexity.MODERATE,
    "Complex": Complexity.COMPLEX,
}


def _elements_from_element_types(types: list[ElementType]) -> list[Element]:
    return [
        Element(
            name=e.name,
            length=e.height,
            width=e.width,
            linear_inches=e.linear_inches or 0,
            complexity=_COMPLEXITY_MAP.get(e.complexity, Complexity.SIMPLE),
            description=e.description or "",
        )
        for e in types
    ]


def _scenario_cost_input(sid: int, payload: QuoteRequest):
    """Build the typed input dataclass each scenario's ``calculate_cost`` expects."""
    ns = payload.num_standees
    pfps = payload.print_forms_per_standee
    sfps = payload.structure_forms_per_standee
    no = payload.num_overs
    ph = payload.print_hours
    rh = payload.rollx_hours
    zh = payload.zund_hours

    scenario_map = {
        1: Scenario1Input,
        # 2: Scenario2Input,  # Scenario 2 disabled — no longer offered as a quote scenario.
        3: Scenario3Input,
        4: Scenario4Input,
        5: Scenario5Input,
    }
    common_base: dict[str, Any] = dict(
        num_standees=ns,
        print_forms_per_standee=pfps,
        structure_forms_per_standee=sfps,
        num_overs=no,
    )

    if sid in [1, 3]:
        return scenario_map[sid](**common_base, print_hours=ph, rollx_hours=rh, zund_hours=zh)

    if sid == 4:
        return scenario_map[sid](**common_base, print_hours=ph, imposition_hours=ph)

    if sid == 5:
        return scenario_map[sid](**common_base)
    raise ValueError(f"Unknown scenario id: {sid}")


def _print_form_bins(label: str, bin_dict: dict) -> None:
    """Debug print: which elements landed on which form, per print_form_calculator call."""
    print(f"--- {label}: {len(bin_dict)} form(s) ---")
    for bin_id, form in bin_dict.items():
        names = [element.name for element in form.elements]
        print(f"Form {bin_id}: {names}, complexity: {form.complexity}")


def _compute_quote_scenarios(db: MidnightOilDB, elements: list[Element], payload: QuoteRequest) -> dict[str, Any]:
    _, busmark_bins = print_form_calculator(
        elements,
        form_width=BUSMARK_FORM_WIDTH,
        form_length=BUSMARK_FORM_LENGTH,
        padding=PADDING,
    )
    _print_form_bins("Busmark forms", busmark_bins)
    _, form_95_bins = print_form_calculator(
        elements,
        form_width=FORM_95_WIDTH,
        form_length=FORM_95_LENGTH,
        padding=PADDING,
    )
    _print_form_bins("95\" forms", form_95_bins)
    busmark_forms = list(busmark_bins.values())
    form_95_forms = list(form_95_bins.values())

    # Scenario 2 disabled — no longer offered as a quote scenario. Tabs now go 1, 3, 4, 5.
    scenarios_to_run = [payload.scenario] if payload.scenario is not None else [1, 3, 4, 5]
    out: dict[str, Any] = {}
    for sid in scenarios_to_run:
        print_forms = busmark_forms if sid in (1, 3) else form_95_forms
        s: Project = _SCENARIO_CLASSES[sid](
            db=db,
            name="API quote",
            print_forms=print_forms,
            num_standees=payload.num_standees,
            standee_type=Complexity(payload.standee_type),
        )
        cost_input = _scenario_cost_input(sid, payload)
        s.calculate_cost(cost_input)
        # Debug-only: see lib/cost_debug.py — set COST_DEBUG_ENABLED = False for production.
        out[f"scenario_{sid}"] = maybe_attach_cost_explanations(s.to_serializable_dict(), s, sid)
    return out


class ElementType(BaseModel):
    """Element data received from the frontend for quote generation."""

    name: str = ""
    height: float
    width: float
    linear_inches: float | None = None
    complexity: str = "Simple"
    description: str = ""


class QuoteRequest(BaseModel):
    """Payload for generating quote scenarios."""

    elements: list[ElementType]
    num_standees: float
    scenario: int | None = None
    standee_type: int = 1
    owner: str | None = None
    project_name: str | None = None
    project_id: str | None = None
    print_forms_per_standee: float | None = None
    structure_forms_per_standee: float | None = None
    num_overs: float | None = None
    print_hours: float | None = None
    rollx_hours: float | None = None
    zund_hours: float | None = None
    # When True, persist/update the saved project from this request. Quote preview uses False.
    persist_project: bool = False


_SCENARIO_CLASSES = {
    1: Scenario1,
    # 2: Scenario2,  # Scenario 2 disabled — no longer offered as a quote scenario.
    3: Scenario3,
    4: Scenario4,
    5: Scenario5,
}


@app.post("/generate_quote")
async def generate_quote(payload: QuoteRequest):
    """
    Generate quote scenarios based on input elements and parameters.

    If ``payload.scenario`` is provided, only calculate that scenario;
    otherwise calculate all. Returns a dict of scenario names to cost breakdowns.
    If ``payload.persist_project`` is True and a valid ``payload.owner`` is
    provided, also creates or updates a project record in the database with the
    provided details (but does not persist the quote itself).
    """
    try:
        elements = _elements_from_element_types(payload.elements)
        out: dict[str, Any] = {}
        db = _ensure_db()
        out = _compute_quote_scenarios(db, elements, payload)
    except ValueError as exc:
        return JSONResponse(status_code=400, content={"detail": str(exc)})
    except Exception as exc:
        return JSONResponse(status_code=500, content={"detail": str(exc)})

    # Persist the project if an authenticated owner is provided.
    owner = None
    if payload.owner:
        owner = payload.owner.strip()

    if payload.persist_project and owner and payload.num_standees >= 1 and payload.elements:
        if db.check_username_exists(owner):
            pname = (payload.project_name or "").strip() or "Untitled project"
            persisted = PersistedProjectCreate(
                owner=owner,
                project_name=pname,
                num_standees=int(payload.num_standees),
                standee_type=complexity_to_str(Complexity(payload.standee_type)),
                elements=elements_to_persisted(elements),
            )
            full_doc = persisted_create_to_document(persisted)

            persisted_project_id = (payload.project_id or "").strip()
            updatable_keys = ("project_name", "num_standees", "standee_type", "elements")

            if persisted_project_id:
                update_fields = {}
                for key, value in full_doc.items():
                    if key in updatable_keys:
                        update_fields[key] = value

                updated = db.update_persisted_project(persisted_project_id, owner, update_fields)
                if updated:
                    out["project_id"] = persisted_project_id
            else:
                inserted_id = db.insert_persisted_project(full_doc)
                out["project_id"] = inserted_id

    return out


@app.get("/standee-data")
async def get_standee_data(standee_type: int, data_type: str):
    """Return a single field from the standee static costs collection based on standee type and requested data_type."""
    type_mapping = {0: "Simple Standee", 1: "Moderate Standee", 2: "Complex Standee"}
    db = _ensure_db()
    standee_data = db.get_standee_data(type_mapping[standee_type], data_type.strip())
    print(f"Retrieved standee data for type {type_mapping[standee_type]} and field '{data_type}': {standee_data}")
    return {"data": standee_data}


@app.get("/unit-costs")
async def get_unit_costs():
    """Return all unit cost records as a dict of {key: {cost, unit, display_name, type}}."""
    db = _ensure_db()
    return {"data": db.get_all_unit_costs()}


class UpdateCostRequest(BaseModel):
    """Payload for updating fields on a unit cost record. All fields optional — only changed ones need to be sent."""

    cost: float | None = None
    unit: str | None = None
    display_name: str | None = None
    type: str | None = None
    throughput: float | None = None
    throughput_unit: str | None = None
    setup_time: float | None = None


@app.get("/standee-static-costs")
async def get_standee_static_costs(standee_type: str):
    """Return the full static cost record for a given standee type."""
    try:
        db = _ensure_db()
        print(f"Fetching standee static costs for type: {standee_type}")
        return {"data": db.get_standee_record(standee_type)}
    except ValueError as e:
        return JSONResponse(status_code=404, content={"error": str(e)})


class UpdateStandeeRequest(BaseModel):
    """Payload for updating standee static cost fields. Only changed fields need to be sent."""

    updates: dict[str, float]


@app.patch("/standee-static-costs")
async def update_standee_static_costs(standee_type: str, payload: UpdateStandeeRequest):
    """Update numeric fields on a standee static cost record."""
    db = _ensure_db()
    try:
        db.update_standee_record(standee_type, payload.updates)
        return {"message": "Updated successfully"}
    except ValueError as e:
        return JSONResponse(status_code=404, content={"error": str(e)})


@app.patch("/unit-costs/{name}")
async def update_unit_cost(name: str, payload: UpdateCostRequest):
    """Update fields on a unit cost record. Only fields included in the payload will be updated."""
    db = _ensure_db()
    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    try:
        db.update_unit_cost_entry(name, updates)
        return {"message": "Updated successfully"}
    except ValueError as e:
        return JSONResponse(status_code=404, content={"error": str(e)})


@app.get("/overs")
async def get_overs():
    """Return all overs tier records sorted by lower_bound."""
    db = _ensure_db()
    return {"data": db.get_all_overs()}


class UpdateOversRequest(BaseModel):
    """Payload for updating all editable fields on an overs tier record."""

    lower_bound: int
    upper_bound: int | None
    overs: int


@app.post("/overs")
async def add_overs(payload: UpdateOversRequest):
    """Insert a new overs tier record."""
    db = _ensure_db()
    new_id = db.upsert_overs(None, payload.lower_bound, payload.upper_bound, payload.overs)
    return {"message": "Created successfully", "id": new_id}


@app.delete("/overs/{record_id}")
async def delete_overs(record_id: str):
    """Delete an overs tier record by id."""
    db = _ensure_db()
    try:
        db.delete_overs(record_id)
        return {"message": "Deleted successfully"}
    except ValueError as e:
        return JSONResponse(status_code=404, content={"error": str(e)})


@app.patch("/overs/{record_id}")
async def update_overs(record_id: str, payload: UpdateOversRequest):
    """Upsert lower_bound, upper_bound, and overs percentage for a tier."""
    db = _ensure_db()
    try:
        db.upsert_overs(record_id, payload.lower_bound, payload.upper_bound, payload.overs)
        return {"message": "Updated successfully"}
    except ValueError as e:
        return JSONResponse(status_code=404, content={"error": str(e)})


@app.get("/packout")
async def get_packout():
    """Return all packout tier records sorted by standees then forms lower bound."""
    db = _ensure_db()
    return {"data": db.get_all_packout()}


class UpdatePackoutRequest(BaseModel):
    """Payload for creating or updating a packout tier record."""

    standees_lower_bound: int
    standees_upper_bound: int | None
    forms_lower_bound: int
    forms_upper_bound: int | None
    complexity: str
    packout: int


@app.post("/packout")
async def add_packout(payload: UpdatePackoutRequest):
    """Insert a new packout tier record."""
    db = _ensure_db()
    new_id = db.upsert_packout(
        None,
        payload.standees_lower_bound,
        payload.standees_upper_bound,
        payload.forms_lower_bound,
        payload.forms_upper_bound,
        payload.complexity,
        payload.packout,
    )
    return {"message": "Created successfully", "id": new_id}


@app.delete("/packout/{record_id}")
async def delete_packout(record_id: str):
    """Delete a packout tier record by id."""
    db = _ensure_db()
    try:
        db.delete_packout(record_id)
        return {"message": "Deleted successfully"}
    except ValueError as e:
        return JSONResponse(status_code=404, content={"error": str(e)})


@app.patch("/packout/{record_id}")
async def update_packout(record_id: str, payload: UpdatePackoutRequest):
    """Update all fields on an existing packout tier record."""
    db = _ensure_db()
    try:
        db.upsert_packout(
            record_id,
            payload.standees_lower_bound,
            payload.standees_upper_bound,
            payload.forms_lower_bound,
            payload.forms_upper_bound,
            payload.complexity,
            payload.packout,
        )
        return {"message": "Updated successfully"}
    except ValueError as e:
        return JSONResponse(status_code=404, content={"error": str(e)})


@app.post("/refresh-cache")
async def refresh_cache():
    """Reload all reference tables into the in-memory cache."""
    db = _ensure_db()
    db._load_cache()
    return {"message": "Cache refreshed"}


@app.get("/suppliers")
async def get_suppliers():
    """Return all distinct supplier names."""
    db = _ensure_db()
    return {"data": db.get_distinct_suppliers()}


@app.get("/suppliers/{supplier}/materials")
async def get_supplier_materials(supplier: str):
    """Return distinct materials for a supplier with display names."""
    db = _ensure_db()
    return {"data": db.get_distinct_materials(supplier)}


@app.get("/suppliers/{supplier}/{material}")
async def get_supplier_material_records(supplier: str, material: str, material_type: str = Query("")):
    """Return one supplier/material document with embedded price breaks."""
    db = _ensure_db()
    return {"data": db.get_supplier_material_records(supplier, material, material_type)}


class UpdateSupplierMaterialRequest(BaseModel):
    """Payload for updating supplier/material-level fields like unit or cost (not price break specific)."""

    unit: str
    price_breaks: list[dict[str, float]]
    display_name: str
    material_type: str = ""


@app.patch("/suppliers/{supplier}/{material}")
async def update_supplier_material(supplier: str, material: str, payload: UpdateSupplierMaterialRequest):
    """Update the unit or cost fields for a supplier/material document."""
    db = _ensure_db()
    try:
        db.upsert_supplier_material(supplier, material, payload.display_name, payload.unit, payload.price_breaks, payload.material_type)
        return {"message": "Updated successfully"}
    except ValueError as e:
        return JSONResponse(status_code=404, content={"error": str(e)})


@app.post("/create-project")
async def create_project(payload: PersistedProjectCreate):
    """Create a new project document owned by ``payload.owner`` with the provided details."""
    db = _ensure_db()
    if not db.check_username_exists(payload.owner):
        return JSONResponse(status_code=404, content={"error": "Unknown owner"})
    doc = persisted_create_to_document(payload)
    project_id = db.insert_persisted_project(doc)
    return JSONResponse(
        status_code=201,
        content={
            "project_id": project_id,
            "short_id": project_short_id(project_id),
            "message": "Project created successfully",
        },
    )


@app.get("/projects")
async def list_projects(
    owner: str | None = Query(None, description="Optional: filter to one owner; omit for every project in the database"),
):
    """List projects — every saved project when ``owner`` is omitted, or one owner's projects."""
    db = _ensure_db()
    if owner is None:
        return {"projects": db.list_all_projects()}
    if not db.check_username_exists(owner):
        return JSONResponse(status_code=404, content={"error": "Unknown owner"})
    projects = db.list_projects_by_owner(owner)
    return {"projects": projects}


@app.get("/projects/{project_id}")
async def get_project(
    project_id: str,
    owner: str = Query(..., description="Must match the document's owner field"),
):
    """Return one project document if it exists and belongs to ``owner``."""
    db = _ensure_db()
    row = db.get_project_by_owner(project_id, owner)
    if row is None:
        return JSONResponse(status_code=404, content={"error": "Project not found"})
    return row


@app.get("/projects/{project_id}/quotes")
async def list_project_quotes(
    project_id: str,
    owner: str = Query(..., description="Must match the document's owner field"),
):
    """Return all persisted quotes for a project (sidebar list)."""
    db = _ensure_db()
    if not db.check_username_exists(owner):
        return JSONResponse(status_code=404, content={"error": "Unknown owner"})
    if db.get_project_by_owner(project_id, owner) is None:
        return JSONResponse(status_code=404, content={"error": "Project not found"})
    quotes = db.list_quotes_for_project(project_id, owner)
    return {"quotes": quotes}


@app.post("/projects/{project_id}/quotes")
async def create_project_quote(project_id: str, payload: PersistedQuoteCreateBody):
    """Insert a quote under an existing project owned by ``payload.owner``."""
    db = _ensure_db()
    if not db.check_username_exists(payload.owner):
        return JSONResponse(status_code=404, content={"error": "Unknown owner"})
    if payload.changed_by and not db.check_username_exists(payload.changed_by):
        return JSONResponse(status_code=404, content={"error": "Unknown changed_by user"})
    if db.get_project_by_owner(project_id, payload.owner) is None:
        return JSONResponse(status_code=404, content={"error": "Project not found"})
    create = persisted_quote_create_from_path(project_id, payload)
    doc = persisted_quote_insert_document(create, created_at=datetime.now(UTC), updated_at=datetime.now(UTC))
    quote_id = db.insert_persisted_quote(doc, changed_by=payload.changed_by or payload.owner)
    return JSONResponse(
        status_code=201,
        content={"quote_id": quote_id, "message": "Quote created successfully"},
    )


@app.get("/quotes")
async def list_quotes(
    owner: str | None = Query(None, description="Optional: filter to one owner; omit for every quote in the database"),
):
    """List quotes — every saved quote when ``owner`` is omitted, or one owner's quotes."""
    db = _ensure_db()
    if owner is None:
        return {"quotes": db.list_all_quotes()}
    if not db.check_username_exists(owner):
        return JSONResponse(status_code=404, content={"error": "Unknown owner"})
    projects = db.list_projects_by_owner(owner)
    quotes: list[dict[str, Any]] = []
    for project in projects:
        quotes.extend(db.list_quotes_for_project(project["_id"], owner))
    # Row ids are numeric strings, so sort numerically (string sort would put "9" after "10").
    quotes.sort(key=lambda q: int(q.get("_id", 0)), reverse=True)
    return {"quotes": quotes}


@app.get("/quotes/{quote_id}")
async def get_quote(
    quote_id: str,
    owner: str = Query(..., description="Must match the document's owner field"),
):
    """Get one quote document if it exists and belongs to ``owner``."""
    db = _ensure_db()
    if not db.check_username_exists(owner):
        return JSONResponse(status_code=404, content={"error": "Unknown owner"})
    row = db.get_quote_by_owner(quote_id, owner)
    if row is None:
        return JSONResponse(status_code=404, content={"error": "Quote not found"})
    return row


@app.patch("/quotes/{quote_id}")
async def update_quote(
    quote_id: str,
    payload: PersistedQuoteUpdateBody,
    owner: str = Query(..., description="Must match the document's owner field"),
    changed_by: str = Query(
        ..., description="Username of the person actually making this edit — used for history attribution"
    ),
):
    """Update allowed fields on a quote document if it exists and belongs to ``owner``."""
    db = _ensure_db()
    if not db.check_username_exists(owner):
        return JSONResponse(status_code=404, content={"error": "Unknown owner"})
    if not db.check_username_exists(changed_by):
        return JSONResponse(status_code=404, content={"error": "Unknown changed_by user"})
    fields = persisted_quote_update_to_set(payload)
    if not db.update_persisted_quote(quote_id, owner, fields, changed_by=changed_by, change_type="update"):
        return JSONResponse(status_code=404, content={"error": "Quote not found"})
    return {"message": "Quote updated successfully", "quote_id": quote_id}


class RenameQuoteBody(BaseModel):
    quote_name: str = Field(..., min_length=1, max_length=512)


@app.patch("/quotes/{quote_id}/rename")
async def rename_quote(
    quote_id: str,
    payload: RenameQuoteBody,
    owner: str = Query(..., description="Must match the document's owner field"),
    changed_by: str = Query(
        ..., description="Username of the person actually making this edit — used for history attribution"
    ),
):
    """Rename a quote without touching any other fields."""
    db = _ensure_db()
    if not db.check_username_exists(owner):
        return JSONResponse(status_code=404, content={"error": "Unknown owner"})
    if not db.check_username_exists(changed_by):
        return JSONResponse(status_code=404, content={"error": "Unknown changed_by user"})
    if not db.update_persisted_quote(
        quote_id, owner, {"quote_name": payload.quote_name.strip()}, changed_by=changed_by, change_type="rename"
    ):
        return JSONResponse(status_code=404, content={"error": "Quote not found"})
    return {"message": "Quote renamed", "quote_id": quote_id, "quote_name": payload.quote_name.strip()}


@app.delete("/quotes/{quote_id}")
async def delete_quote(
    quote_id: str,
    owner: str = Query(..., description="Owner must match quote document's owner field"),
):
    """Delete one quote document if it exists and belongs to ``owner``."""
    db = _ensure_db()
    if not db.check_username_exists(owner):
        return JSONResponse(status_code=404, content={"error": "Unknown owner"})
    if not db.delete_persisted_quote(quote_id, owner):
        return JSONResponse(status_code=404, content={"error": "Quote not found"})
    return {"message": "Quote deleted", "quote_id": quote_id}


@app.patch("/projects/{project_id}")
async def update_project(
    project_id: str,
    payload: PersistedProjectUpdateBody,
    owner: str = Query(..., description="Must match the document's owner field"),
    changed_by: str = Query(
        ...,
        description=(
            "Username of the person actually making this edit — used for history "
            "attribution, distinct from `owner` since anyone can edit another user's project"
        ),
    ),
):
    """Update allowed fields on a project document if it exists and belongs to ``owner``. Does not update quotes."""
    db = _ensure_db()
    if not db.check_username_exists(owner):
        return JSONResponse(status_code=404, content={"error": "Unknown owner"})
    if not db.check_username_exists(changed_by):
        return JSONResponse(status_code=404, content={"error": "Unknown changed_by user"})
    fields = persisted_update_to_set(payload)
    if not db.update_persisted_project(project_id, owner, fields, changed_by=changed_by, change_type="update"):
        return JSONResponse(status_code=404, content={"error": "Project not found"})
    return {"message": "Project updated successfully", "project_id": project_id}


class RenameProjectBody(BaseModel):
    project_name: str = Field(..., min_length=1, max_length=512)


@app.patch("/projects/{project_id}/rename")
async def rename_project(
    project_id: str,
    payload: RenameProjectBody,
    owner: str = Query(..., description="Must match the document's owner field"),
    changed_by: str = Query(
        ..., description="Username of the person actually making this edit — used for history attribution"
    ),
):
    """Rename a project without touching any other fields."""
    db = _ensure_db()
    if not db.check_username_exists(owner):
        return JSONResponse(status_code=404, content={"error": "Unknown owner"})
    if not db.check_username_exists(changed_by):
        return JSONResponse(status_code=404, content={"error": "Unknown changed_by user"})
    if not db.update_persisted_project(
        project_id, owner, {"project_name": payload.project_name.strip()}, changed_by=changed_by, change_type="rename"
    ):
        return JSONResponse(status_code=404, content={"error": "Project not found"})
    return {"message": "Project renamed", "project_id": project_id, "project_name": payload.project_name.strip()}


class DuplicateProjectBody(BaseModel):
    """Body for ``POST /projects/{project_id}/duplicate``."""

    new_owner: str = Field(..., min_length=1, max_length=256, description="Username the copy will belong to")
    project_name: str | None = Field(default=None, max_length=512)


@app.post("/projects/{project_id}/duplicate")
async def duplicate_project(
    project_id: str,
    payload: DuplicateProjectBody,
    owner: str = Query(..., description="Must match the source project's owner field"),
):
    """Clone a project and all of its saved quotes into a brand-new project/quote set.

    The copy gets its own fresh history (just its own "create" entries) — the source
    project's edit history never carries over, since history is scoped to its own
    project_id and only ever written by inserts/updates, never copied.
    """
    db = _ensure_db()
    if not db.check_username_exists(owner):
        return JSONResponse(status_code=404, content={"error": "Unknown owner"})
    if not db.check_username_exists(payload.new_owner):
        return JSONResponse(status_code=404, content={"error": "Unknown new_owner"})
    source = db.get_project_by_owner(project_id, owner)
    if source is None:
        return JSONResponse(status_code=404, content={"error": "Project not found"})

    new_project_doc = {
        "schema_version": source.get("schema_version", 1),
        "owner": payload.new_owner,
        "project_name": payload.project_name or f"{source.get('project_name', 'Untitled project')} (Copy)",
        "num_standees": source["num_standees"],
        "standee_type": source["standee_type"],
        "elements": source["elements"],
    }
    new_project_id = db.insert_persisted_project(new_project_doc)

    quote_ids: list[str] = []
    for quote in db.list_quotes_for_project(project_id, owner):
        new_quote_doc = {
            "schema_version": quote.get("schema_version", 2),
            "owner": payload.new_owner,
            "project_id": new_project_id,
            "quote_name": quote.get("quote_name") or "Untitled quote",
            "scenario": quote.get("scenario", 1),
            "num_standees": quote["num_standees"],
            "contribution_margin": quote.get("contribution_margin", 0),
            "standee_type": quote["standee_type"],
            "elements": quote["elements"],
            "scenarios": quote.get("scenarios", {}),
            "universal": quote.get("universal", {}),
            "params": quote.get("params", {}),
            "breakdown": quote.get("breakdown", {}),
            "created_at": datetime.now(UTC),
            "updated_at": datetime.now(UTC),
        }
        quote_ids.append(db.insert_persisted_quote(new_quote_doc))

    return JSONResponse(
        status_code=201,
        content={
            "project_id": new_project_id,
            "short_id": project_short_id(new_project_id),
            "quote_ids": quote_ids,
            "message": "Project duplicated successfully",
        },
    )


@app.delete("/projects/{project_id}")
async def delete_project(
    project_id: str,
    owner: str = Query(..., description="Owner must match project document's owner field"),
):
    """Delete one project document if it exists and belongs to ``owner``. Also deletes all linked quotes."""
    db = _ensure_db()
    if not db.check_username_exists(owner):
        return JSONResponse(status_code=404, content={"error": "Unknown owner"})
    if not db.delete_persisted_project(project_id, owner):
        return JSONResponse(status_code=404, content={"error": "Project not found"})
    return {"message": "Project deleted", "project_id": project_id}


@app.get("/projects/{project_id}/history")
async def list_project_history(
    project_id: str,
    owner: str = Query(..., description="Must match the document's owner field"),
):
    """Combined project+quote history timeline for a project, newest first."""
    db = _ensure_db()
    if not db.check_username_exists(owner):
        return JSONResponse(status_code=404, content={"error": "Unknown owner"})
    if db.get_project_by_owner(project_id, owner) is None:
        return JSONResponse(status_code=404, content={"error": "Project not found"})
    return {"history": db.list_project_history(project_id, owner)}


@app.get("/projects/{project_id}/history/{history_id}")
async def get_project_history_entry(
    project_id: str,
    history_id: str,
    owner: str = Query(..., description="Must match the document's owner field"),
):
    """Return one history entry including its full snapshot, for the preview pane."""
    db = _ensure_db()
    if not db.check_username_exists(owner):
        return JSONResponse(status_code=404, content={"error": "Unknown owner"})
    entry = db.get_history_entry(project_id, history_id, owner)
    if entry is None:
        return JSONResponse(status_code=404, content={"error": "History entry not found"})
    return entry


@app.post("/projects/{project_id}/history/{history_id}/revert")
async def revert_project_history(
    project_id: str,
    history_id: str,
    owner: str = Query(..., description="Must match the document's owner field"),
    changed_by: str = Query(
        ..., description="Username of the person actually performing this revert — used for history attribution"
    ),
):
    """Restore a project or quote to a past snapshot; records a new 'revert' history entry."""
    db = _ensure_db()
    if not db.check_username_exists(owner):
        return JSONResponse(status_code=404, content={"error": "Unknown owner"})
    if not db.check_username_exists(changed_by):
        return JSONResponse(status_code=404, content={"error": "Unknown changed_by user"})
    result = db.revert_history_entry(project_id, history_id, owner, changed_by=changed_by)
    if result is None:
        return JSONResponse(status_code=404, content={"error": "History entry not found"})
    return result


@app.post("/create-account")
async def create_account(payload: AccountRequest):
    """Create a new user account with a username and password."""
    db = _ensure_db()
    if db.check_username_exists(payload.username):
        return JSONResponse(status_code=400, content={"error": "Username already exists"})

    success = db.create_user(payload.username, payload.password)
    if success:
        return JSONResponse(status_code=201, content={"message": "Account created successfully"})
    else:
        return JSONResponse(status_code=400, content={"error": "Failed to create account"})


@app.post("/sign-in")
async def sign_in(payload: AccountRequest):
    """Verify username and password for sign-in."""
    db = _ensure_db()
    username = payload.username
    password = payload.password

    if not db.check_username_exists(username):
        return JSONResponse(status_code=400, content={"error": "Invalid username or password"})

    user = db.get_user(username)

    if not user or not _verify_password(password, user["password_hash"]):
        return JSONResponse(status_code=400, content={"error": "Invalid username or password"})
    else:
        return JSONResponse(status_code=200, content={"message": "Sign-in successful"})


_MAX_HIGHLIGHT_WIDTH = 800


def _encode_element_highlight(image: np.ndarray, mask: np.ndarray) -> str:
    """Return a base64 JPEG with the element region clearly highlighted and background near-black."""
    mask_u8 = (mask * 255).astype(np.uint8)
    mask_bool = mask_u8 > 0

    result = image.copy().astype(np.float32)
    # Near-black background
    result[~mask_bool] = result[~mask_bool] * 0.28

    # Yellow on element region (BGR: 0, 230, 255)
    yellow = np.array([0.0, 230.0, 255.0], dtype=np.float32)
    result[mask_bool] = result[mask_bool] * 0.4 + yellow * 0.6
    result = np.clip(result, 0, 255).astype(np.uint8)

    # Bright red outline around the mask contour (BGR: 0, 0, 255)
    contours, _ = cv2.findContours(mask_u8, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    cv2.drawContours(result, contours, -1, (0, 0, 255), thickness=1)

    h, w = result.shape[:2]
    if w > _MAX_HIGHLIGHT_WIDTH:
        scale = _MAX_HIGHLIGHT_WIDTH / w
        result = cv2.resize(result, (_MAX_HIGHLIGHT_WIDTH, int(h * scale)))
    ok, buf = cv2.imencode(".jpg", result, [cv2.IMWRITE_JPEG_QUALITY, 80])
    if not ok:
        return ""
    return base64.b64encode(buf.tobytes()).decode("utf-8")


@app.post("/vision/process")
async def process_vision_image(file: UploadFile = File(...)):
    """Segment an uploaded image and return detected element bounding-box dimensions with highlight previews."""
    contents = await file.read()
    nparr = np.frombuffer(contents, np.uint8)
    image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if image is None:
        return JSONResponse(status_code=400, content={"error": "Could not decode image"})
    try:
        _, _, all_results, binary_masks = vision_process_image(image)
        elements = []
        for i, r in enumerate(all_results):
            mask_b64 = _encode_element_highlight(image, binary_masks[i]) if i < len(binary_masks) else ""
            elements.append({"id": r["id"], "width": r["width"], "height": r["height"], "mask_b64": mask_b64})
        return {"elements": elements}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})


if __name__ == "__main__":
    import code

    code.interact(local=globals())
