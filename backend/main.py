import hashlib
import hmac

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from lib.classes.db import MidnightOilDB as MOADB

# from lib.globals import
from lib.classes.form import Element, Form, Complexity
from lib.classes.project import Project, Scenario1, Scenario2, Scenario3, Scenario4, Scenario5
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

    scenario_1 = Scenario1(
        name="API quote",
        print_forms=print_forms,
        num_standees=payload.num_standees,
        standee_type=Complexity(payload.standee_type),
    )

    scenario_1.calculate_cost()

    scenario_1_obj = {
        "total_cost": scenario_1.total_cost,
        "total_universal_cost": scenario_1.total_universal_cost,
        "corrugate_cost": scenario_1.corrugate_cost,
        "imposition_cost": scenario_1.imposition_cost,
        "blank_comp_cost": scenario_1.blank_comp_cost,
        "color_comp_cost": scenario_1.color_comp_cost,
        "engineering_design_cost": scenario_1.engineering_design_cost,
        "hardware_cost": scenario_1.hardware_cost,
        "print_form_cost": scenario_1.print_form_cost,
        "zund_cut_cost": scenario_1.zund_cut_cost,
        "shipping_box_cost": scenario_1.shipping_box_cost,
        "label_cost": scenario_1.label_cost,
        "instruction_sheet_cost": scenario_1.instruction_sheet_cost,
    }

    return {"scenario_1": scenario_1_obj}
    # "scenario_2": scenario_2}


@app.get("/standee-data")
async def get_standee_data(standee_type: int, data_type: str):
    db = MOADB()
    type_mapping = {0: "Simple Standee", 1: "Moderate Standee", 2: "Complex Standee"}

    standee_data = db.get_standee_data(type_mapping[standee_type], data_type.strip())
    print(f"Retrieved standee data for type {type_mapping[standee_type]} and field '{data_type}': {standee_data}")
    return {"data": standee_data}


@app.post("/create-account")
async def create_account(payload: AccountRequest):
    db = MOADB()
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
    db = MOADB()
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
    code.interact(local=globals())
