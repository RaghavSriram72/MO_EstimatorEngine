import hashlib
import hmac

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from lib.classes.db import MidnightOilDB as MOADB

# from lib.globals import
from lib.classes.form import Element, Form, Complexity
from lib.classes.project import Project
from lib.classes.scenarios import Scenario1, Scenario2, Scenario3, Scenario4, Scenario5
from lib.persisted_project import (
    PersistedProjectCreate,
    PersistedProjectUpdateBody,
    complexity_to_str,
    elements_to_persisted,
    persisted_create_to_mongo_document,
    persisted_update_to_mongo_set,
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


class ElementType(BaseModel):
    name: str = ""
    height: float
    width: float
    linear_inches: float | None = None
    complexity: str = "Simple"


class QuoteRequest(BaseModel):
    elements: list[ElementType]
    num_standees: int
    scenario: int = 1
    standee_type: int = 1
    owner: str | None = None
    project_name: str | None = None
    project_id: str | None = None
    print_forms_per_standee: int | None = None
    structure_forms_per_standee: int | None = None
    num_overs: int | None = None


@app.post("/generate_quote")
async def generate_quote(payload: QuoteRequest):
    elements = [
        Element(
            name=e.name,
            length=e.height,
            width=e.width,
            linear_inches=e.linear_inches,
            complexity=_COMPLEXITY_MAP.get(e.complexity, Complexity.SIMPLE),
        )
        for e in payload.elements
    ]

    # Determine standee complexity by taking majority of element complexities
    # complexity_counts = {Complexity.SIMPLE: 0, Complexity.MODERATE: 0, Complexity.COMPLEX: 0}
    # for element in elements:
    #     complexity_counts[element.complexity] += 1
    # majority_complexity = max(complexity_counts, key=complexity_counts.get)

    _, bin_dict = print_form_calculator(elements, payload.num_standees)
    print_forms = list(bin_dict.values())

    form_overrides = {
        "print_forms_per_standee": payload.print_forms_per_standee or 0,
        "structure_forms_per_standee": payload.structure_forms_per_standee or 0,
        "num_overs": payload.num_overs or 0,
    }

    scenario_1 = Scenario1(
        name="API quote",
        print_forms=print_forms,
        num_standees=payload.num_standees,
        standee_type=Complexity(payload.standee_type),
    )

    scenario_1.calculate_cost(**form_overrides)
    scenario_1_obj = scenario_1.to_dict()

    scenario_2 = Scenario2(
        name="API quote",
        print_forms=print_forms,
        num_standees=payload.num_standees,
        standee_type=Complexity(payload.standee_type),
    )

    scenario_2.calculate_cost(**form_overrides)

    scenario_2_obj = scenario_2.to_dict()

    scenario_3 = Scenario3(
        name="API quote",
        print_forms=print_forms,
        num_standees=payload.num_standees,
        standee_type=Complexity(payload.standee_type),
    )

    scenario_3.calculate_cost(**form_overrides)

    scenario_3_obj = scenario_3.to_dict()

    scenario_4 = Scenario4(
        name="API quote",
        print_forms=print_forms,
        num_standees=payload.num_standees,
        standee_type=Complexity(payload.standee_type),
    )

    scenario_4.calculate_cost(**form_overrides)

    scenario_4_obj = scenario_4.to_dict()

    scenario_5 = Scenario5(
        name="API quote",
        print_forms=print_forms,
        num_standees=payload.num_standees,
        standee_type=Complexity(payload.standee_type),
    )

    scenario_5.calculate_cost(**form_overrides)

    scenario_5_obj = scenario_5.to_dict()

    out: dict = {
        "scenario_1": scenario_1_obj,
        "scenario_2": scenario_2_obj,
        "scenario_3": scenario_3_obj,
        "scenario_4": scenario_4_obj,
        "scenario_5": scenario_5_obj,
    }

    # Persist the project if an authenticated owner is provided.
    owner = None
    if payload.owner:
        owner = payload.owner.strip()

    if owner and payload.num_standees >= 1 and payload.elements:
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


@app.get("/work-center-costs")
async def get_work_center_costs():
    """Return all work center cost records."""
    with MOADB() as db:
        return {"data": db.get_all_work_center_costs()}


class UpdateWorkCenterRequest(BaseModel):
    """Payload for updating fields on a work center cost record. All fields optional."""

    cost: float | None = None
    uom: str | None = None
    speed: str | None = None
    unit: str | None = None


@app.patch("/work-center-costs/{activity}")
async def update_work_center_cost(activity: str, payload: UpdateWorkCenterRequest):
    """Update editable fields on a work center cost record."""
    with MOADB() as db:
        updates = {k: v for k, v in payload.model_dump().items() if v is not None}
        try:
            db.update_work_center_cost(activity, updates)
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


@app.patch("/overs/{record_id}")
async def update_overs(record_id: str, payload: UpdateOversRequest):
    """Update lower_bound, upper_bound, and overs percentage for a tier."""
    with MOADB() as db:
        try:
            db.update_overs(record_id, payload.lower_bound, payload.upper_bound, payload.overs)
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
