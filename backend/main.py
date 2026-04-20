import hashlib
import hmac

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from backend.lib.classes.db import MOADB

app = FastAPI()

# Configure CORS for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
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


@app.get("/standee-data")
async def get_standee_data(standee_type: int, data_type: str):
    db = MOADB()
    type_mapping = {0: "Simple Standee", 1: "Moderate Standee", 2: "Complex Standee"}

    standee_data = db.get_standee_data(type_mapping[standee_type], data_type.strip())
    print(
        f"Retrieved standee data for type {type_mapping[standee_type]} and field '{data_type}': {standee_data}"
    )
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
