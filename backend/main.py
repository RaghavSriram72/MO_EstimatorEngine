from fastapi import FastAPI, HTTPException
from fastapi.encoders import jsonable_encoder
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import hashlib
import hmac
import secrets

app = FastAPI()

# Configure CORS for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


from pymongo.mongo_client import MongoClient
from pymongo.server_api import ServerApi

import os
from dotenv import load_dotenv



# Create a new client and connect to the server




class MOADB :
    """MongoDB helper for flute-price collection operations."""

    def __init__(self):
        load_dotenv()  # Load environment variables from .env file
        self.uri  = os.getenv("MONGO_URI")
        self.client = client = MongoClient(self.uri, server_api=ServerApi('1'))
        self.db = client["DB"]
        self.standee_collection = self.db["standee-fixed-costs"]
        self.users_collection = self.db["users"]

    def get_flute_names_and_ids(self):
        """Return all flute records as JSON-safe dictionaries."""
        return list(self.flute_collection.find({}, {"_id": 0}))

    def list_all_objects(self):
        """Return all documents in the collection with all properties."""
        return list(self.flute_collection.find({}))

    def check_username_exists(self, username: str) -> bool:
        """Check if a username already exists in the users collection."""
        
        return self.users_collection.find_one({"username": username}) is not None

    def create_user(self, username: str, password: str) -> bool:
        """Create a new user if the username doesn't already exist."""
        if self.check_username_exists(username):
            return False  # Username already exists

        self.users_collection.insert_one(
            {
                "username": username,
                "password_hash": hash_password(password),
            }
        )
        return True  # User created successfully
    
    def get_user(self, username: str):
        """Retrieve a user document by username."""
        return self.users_collection.find_one({"username": username})

    def get_standee_data(self, standee_category: str, data_field: str):
        """Return the specified data field for a given standee category."""
        result = self.standee_collection.find_one({"standee_type": standee_category})
        if result and data_field in result:
            return result[data_field]
        else:
            return None  # or raise an exception if preferred


def hash_password(password: str) -> str:
    """Hash a password using PBKDF2-HMAC-SHA256 with random salt."""
    iterations = 120_000
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return f"pbkdf2_sha256${iterations}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored_hash: str) -> bool:
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


class AccountRequest(BaseModel):
    username: str
    password: str


@app.get("/")
async def root():
    return {"message": "Hello from FastAPI"}


@app.get("/health")
async def health_check():
    return {"status": "healthy"}




@app.get("/standee-data")
async def get_standee_data(standee_type: int, data_type: str):
    db = MOADB()
    type_mapping = {
        0: "Simple Standee",
        1: "Moderate Standee",
        2: "Complex Standee"
    }
    standee_data = db.get_standee_data(type_mapping[standee_type], data_type.strip())
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
    if verify_password(password, user["password_hash"]):
        return JSONResponse(status_code=200, content={"message": "Sign-in successful"})
    else:
        return JSONResponse(status_code=400, content={"error": "Invalid username or password"})

