from __future__ import annotations

import hashlib
import hmac
from datetime import UTC, datetime
from typing import Any

from bson import ObjectId
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from lib.classes.db import MidnightOilDB as MOADB

# from lib.globals import
from lib.classes.form import Element, Complexity
from lib.classes.cost_inputs import (
    Scenario1Input,
    Scenario2Input,
    Scenario3Input,
    Scenario4Input,
    Scenario5Input,
)
from lib.classes.scenarios import Scenario1, Scenario2, Scenario3, Scenario4, Scenario5
from lib.persisted_project import (
    PersistedProjectCreate,
    PersistedProjectUpdateBody,
    complexity_to_str,
    elements_to_persisted,
    persisted_create_to_mongo_document,
    persisted_update_to_mongo_set,
)
from lib.persisted_quote import (
    PersistedQuoteCreateBody,
    PersistedQuoteUpdateBody,
    persisted_quote_create_from_path,
    persisted_quote_insert_document,
    persisted_quote_update_to_mongo_set,
)

from lib.print_form_calculator import print_form_calculator


app = FastAPI()

# Configure CORS for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class AccountRequest(BaseModel):
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


@app.get("/")
async def root():
    return {"message": "Hello from FastAPI"}


@app.get("/health")
async def health_check():
    return {"status": "healthy"}


_COMPLEXITY_MAP = {
    "Simple": Complexity.SIMPLE,
    "Moderate": Complexity.MODERATE,
    "Complex": Complexity.COMPLEX,
}


def _elements_from_element_types(types: list["ElementType"]) -> list[Element]:
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
    ns   = payload.num_standees
    pfps = payload.print_forms_per_standee
    sfps = payload.structure_forms_per_standee
    no   = payload.num_overs
    ph   = payload.print_hours
    rh   = payload.rollx_hours
    zh   = payload.zund_hours
    kw = dict(num_standees=ns, print_forms_per_standee=pfps,
              structure_forms_per_standee=sfps, num_overs=no)
    if sid == 1:
        return Scenario1Input(**kw, print_hours=ph, rollx_hours=rh, zund_hours=zh)
    if sid == 2:
        return Scenario2Input(**kw, print_hours=ph, rollx_hours=rh, zund_hours=zh)
    if sid == 3:
        return Scenario3Input(**kw, print_hours=ph, rollx_hours=rh, zund_hours=zh)
    if sid == 4:
        return Scenario4Input(
            num_standees=ns, print_forms_per_standee=pfps,
            structure_forms_per_standee=sfps, num_overs=no,
            print_hours=ph,
        )
    if sid == 5:
        return Scenario5Input(
            num_standees=ns, print_forms_per_standee=pfps,
            structure_forms_per_standee=sfps, num_overs=no,
        )
    raise ValueError(f"Unknown scenario id: {sid}")


def _compute_quote_scenarios(db: MOADB, elements: list[Element], payload: QuoteRequest) -> dict[str, Any]:
    _, bin_dict = print_form_calculator(elements, payload.num_standees)
    print_forms = list(bin_dict.values())

    scenarios_to_run = [payload.scenario] if payload.scenario is not None else [1, 2, 3, 4, 5]
    out: dict[str, Any] = {}
    for sid in scenarios_to_run:
        s = _SCENARIO_CLASSES[sid](
            db=db,
            name="API quote",
            print_forms=print_forms,
            num_standees=payload.num_standees,
            standee_type=Complexity(payload.standee_type),
        )
        cost_input = _scenario_cost_input(sid, payload)
        s.calculate_cost(cost_input)
        out[f"scenario_{sid}"] = s.to_serializable_dict()
    return out


class ElementType(BaseModel):
    name: str = ""
    height: float
    width: float
    linear_inches: float | None = None
    complexity: str = "Simple"
    description: str = ""


class QuoteRequest(BaseModel):
    elements: list[ElementType]
    num_standees: int
    scenario: int | None = None
    standee_type: int = 1
    owner: str | None = None
    project_name: str | None = None
    project_id: str | None = None
    print_forms_per_standee: int | None = None
    structure_forms_per_standee: int | None = None
    num_overs: int | None = None
    print_hours: float | None = None
    rollx_hours: float | None = None
    zund_hours: float | None = None
    # When True, persist/update Mongo project from this request. Quote preview uses False.
    persist_project: bool = False


_SCENARIO_CLASSES = {
    1: Scenario1,
    2: Scenario2,
    3: Scenario3,
    4: Scenario4,
    5: Scenario5,
}


@app.post("/generate_quote")
async def generate_quote(payload: QuoteRequest):
    elements = _elements_from_element_types(payload.elements)
    out: dict[str, Any] = {}
    with MOADB() as db:
        out = _compute_quote_scenarios(db, elements, payload)

    # Persist the project if an authenticated owner is provided.
    owner = None
    if payload.owner:
        owner = payload.owner.strip()

    if payload.persist_project and owner and payload.num_standees >= 1 and payload.elements:
        with MOADB() as db:
            if db.check_username_exists(owner):
                pname = (payload.project_name or "").strip() or "Untitled project"
                persisted = PersistedProjectCreate(
                    owner=owner,
                    project_name=pname,
                    num_standees=payload.num_standees,
                    standee_type=complexity_to_str(Complexity(payload.standee_type)),
                    elements=elements_to_persisted(elements),
                )
                full_doc = persisted_create_to_mongo_document(persisted)

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
    type_mapping = {0: "Simple Standee", 1: "Moderate Standee", 2: "Complex Standee"}
    with MOADB() as db:
        standee_data = db.get_standee_data(type_mapping[standee_type], data_type.strip())
    print(f"Retrieved standee data for type {type_mapping[standee_type]} and field '{data_type}': {standee_data}")
    return {"data": standee_data}


@app.get("/unit-costs")
async def get_unit_costs():
    with MOADB() as db:
        return {"data": db.get_all_unit_costs()}


class UpdateCostRequest(BaseModel):
    """Payload for updating fields on a unit cost record. All fields optional — only changed ones need to be sent."""

    cost: float | None = None
    unit: str | None = None
    display_name: str | None = None
    type: str | None = None


@app.get("/standee-static-costs")
async def get_standee_static_costs(standee_type: str):
    """Return the full static cost record for a given standee type."""
    with MOADB() as db:
        try:
            return {"data": db.get_standee_record(standee_type)}
        except ValueError as e:
            return JSONResponse(status_code=404, content={"error": str(e)})


class UpdateStandeeRequest(BaseModel):
    """Payload for updating standee static cost fields. Only changed fields need to be sent."""

    updates: dict[str, float]


@app.patch("/standee-static-costs")
async def update_standee_static_costs(standee_type: str, payload: UpdateStandeeRequest):
    """Update numeric fields on a standee static cost record."""
    with MOADB() as db:
        try:
            db.update_standee_record(standee_type, payload.updates)
            return {"message": "Updated successfully"}
        except ValueError as e:
            return JSONResponse(status_code=404, content={"error": str(e)})


@app.patch("/unit-costs/{name}")
async def update_unit_cost(name: str, payload: UpdateCostRequest):
    with MOADB() as db:
        updates = {k: v for k, v in payload.model_dump().items() if v is not None}
        try:
            db.update_unit_cost_entry(name, updates)
            return {"message": "Updated successfully"}
        except ValueError as e:
            return JSONResponse(status_code=404, content={"error": str(e)})


@app.get("/overs")
async def get_overs():
    """Return all overs tier records sorted by lower_bound."""
    with MOADB() as db:
        return {"data": db.get_all_overs()}


class UpdateOversRequest(BaseModel):
    """Payload for updating all editable fields on an overs tier record."""

    lower_bound: int
    upper_bound: int | None
    overs: int


@app.post("/overs")
async def add_overs(payload: UpdateOversRequest):
    """Insert a new overs tier record."""
    with MOADB() as db:
        new_id = db.upsert_overs(None, payload.lower_bound, payload.upper_bound, payload.overs)
        return {"message": "Created successfully", "id": new_id}


@app.delete("/overs/{record_id}")
async def delete_overs(record_id: str):
    """Delete an overs tier record by id."""
    with MOADB() as db:
        try:
            db.delete_overs(record_id)
            return {"message": "Deleted successfully"}
        except ValueError as e:
            return JSONResponse(status_code=404, content={"error": str(e)})


@app.patch("/overs/{record_id}")
async def update_overs(record_id: str, payload: UpdateOversRequest):
    """Upsert lower_bound, upper_bound, and overs percentage for a tier."""
    with MOADB() as db:
        try:
            db.upsert_overs(record_id, payload.lower_bound, payload.upper_bound, payload.overs)
            return {"message": "Updated successfully"}
        except ValueError as e:
            return JSONResponse(status_code=404, content={"error": str(e)})


@app.get("/suppliers")
async def get_suppliers():
    """Return all distinct supplier names."""
    with MOADB() as db:
        return {"data": db.get_distinct_suppliers()}


@app.get("/suppliers/{supplier}/materials")
async def get_supplier_materials(supplier: str):
    """Return distinct materials for a supplier with display names."""
    with MOADB() as db:
        return {"data": db.get_distinct_materials(supplier)}


@app.get("/suppliers/{supplier}/{material}")
async def get_supplier_material_records(supplier: str, material: str):
    """Return all cost records for a supplier+material pair sorted by amount."""
    with MOADB() as db:
        return {"data": db.get_supplier_material_records(supplier, material)}


class UpdateSupplierRequest(BaseModel):
    """Payload for updating amount, cost, and unit on a supplier record."""

    amount: float
    cost: float
    unit: str


@app.patch("/suppliers/{record_id}")
async def update_supplier_record(record_id: str, payload: UpdateSupplierRequest):
    """Update amount, cost, and unit on a supplier cost record."""
    with MOADB() as db:
        try:
            db.update_supplier_record(record_id, payload.amount, payload.cost, payload.unit)
            return {"message": "Updated successfully"}
        except ValueError as e:
            return JSONResponse(status_code=404, content={"error": str(e)})


@app.post("/create-project")
async def create_project(payload: PersistedProjectCreate):
    with MOADB() as db:
        if not db.check_username_exists(payload.owner):
            return JSONResponse(status_code=404, content={"error": "Unknown owner"})
        doc = persisted_create_to_mongo_document(payload)
        project_id = db.insert_persisted_project(doc)
        return JSONResponse(
            status_code=201,
            content={"project_id": project_id, "message": "Project created successfully"},
        )


@app.get("/projects")
async def list_projects(owner: str = Query(..., description="Username of the account that owns the projects")):
    with MOADB() as db:
        if not db.check_username_exists(owner):
            return JSONResponse(status_code=404, content={"error": "Unknown owner"})
        projects = db.list_projects_by_owner(owner)
    return {"projects": projects}


@app.get("/projects/{project_id}")
async def get_project(
    project_id: str,
    owner: str = Query(..., description="Must match the document's owner field"),
):
    with MOADB() as db:
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
    with MOADB() as db:
        if not db.check_username_exists(owner):
            return JSONResponse(status_code=404, content={"error": "Unknown owner"})
        if db.get_project_by_owner(project_id, owner) is None:
            return JSONResponse(status_code=404, content={"error": "Project not found"})
        quotes = db.list_quotes_for_project(project_id, owner)
    return {"quotes": quotes}


@app.post("/projects/{project_id}/quotes")
async def create_project_quote(project_id: str, payload: PersistedQuoteCreateBody):
    """Insert a quote under an existing project owned by ``payload.owner``."""
    with MOADB() as db:
        if not db.check_username_exists(payload.owner):
            return JSONResponse(status_code=404, content={"error": "Unknown owner"})
        if db.get_project_by_owner(project_id, payload.owner) is None:
            return JSONResponse(status_code=404, content={"error": "Project not found"})
        create = persisted_quote_create_from_path(project_id, payload)
        doc = persisted_quote_insert_document(create, created_at=datetime.now(UTC), updated_at=datetime.now(UTC))
        doc["project_id"] = ObjectId(doc["project_id"])
        quote_id = db.insert_persisted_quote(doc)
    return JSONResponse(
        status_code=201,
        content={"quote_id": quote_id, "message": "Quote created successfully"},
    )


@app.get("/quotes/{quote_id}")
async def get_quote(
    quote_id: str,
    owner: str = Query(..., description="Must match the document's owner field"),
):
    with MOADB() as db:
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
):
    with MOADB() as db:
        if not db.check_username_exists(owner):
            return JSONResponse(status_code=404, content={"error": "Unknown owner"})
        fields = persisted_quote_update_to_mongo_set(payload)
        if not db.update_persisted_quote(quote_id, owner, fields):
            return JSONResponse(status_code=404, content={"error": "Quote not found"})
    return {"message": "Quote updated successfully", "quote_id": quote_id}


@app.delete("/quotes/{quote_id}")
async def delete_quote(
    quote_id: str,
    owner: str = Query(..., description="Owner must match quote document's owner field"),
):
    with MOADB() as db:
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
):
    with MOADB() as db:
        if not db.check_username_exists(owner):
            return JSONResponse(status_code=404, content={"error": "Unknown owner"})
        fields = persisted_update_to_mongo_set(payload)
        if not db.update_persisted_project(project_id, owner, fields):
            return JSONResponse(status_code=404, content={"error": "Project not found"})
    return {"message": "Project updated successfully", "project_id": project_id}


@app.delete("/projects/{project_id}")
async def delete_project(
    project_id: str,
    owner: str = Query(..., description="Owner must match project document's owner field"),
):
    with MOADB() as db:
        if not db.check_username_exists(owner):
            return JSONResponse(status_code=404, content={"error": "Unknown owner"})
        if not db.delete_persisted_project(project_id, owner):
            return JSONResponse(status_code=404, content={"error": "Project not found"})
    return {"message": "Project deleted", "project_id": project_id}


@app.post("/create-account")
async def create_account(payload: AccountRequest):
    with MOADB() as db:
        username = payload.username
        password = payload.password

        # Check if username already exists
        if db.check_username_exists(username):
            return JSONResponse(status_code=400, content={"error": "Username already exists"})

        # Create new user
        success = db.create_user(username, password)
        if success:
            return JSONResponse(status_code=201, content={"message": "Account created successfully"})
        else:
            return JSONResponse(status_code=400, content={"error": "Failed to create account"})


@app.post("/sign-in")
async def sign_in(payload: AccountRequest):
    with MOADB() as db:
        username = payload.username
        password = payload.password

        if not db.check_username_exists(username):
            return JSONResponse(status_code=400, content={"error": "Invalid username or password"})

        user = db.get_user(username)

        if not user or not _verify_password(password, user["password_hash"]):
            return JSONResponse(status_code=400, content={"error": "Invalid username or password"})
        else:
            return JSONResponse(status_code=200, content={"message": "Sign-in successful"})


if __name__ == "__main__":
    import code

    db = MOADB()
    db.connect()
    code.interact(local=globals())
