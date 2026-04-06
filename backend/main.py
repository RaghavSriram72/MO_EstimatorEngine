import hashlib
import hmac
import os
import secrets

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.encoders import jsonable_encoder
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from pymongo.mongo_client import MongoClient
from pymongo.server_api import ServerApi

app = FastAPI()

# Configure CORS for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create a new client and connect to the server




class MOADB :
    """MongoDB helper for flute-price collection operations."""

    def __init__(self):
        load_dotenv()  # Load environment variables from .env file
        self.uri  = os.getenv("MONGO_URI")
        self.client = client = MongoClient(self.uri, server_api=ServerApi('1'))
        self.db = client["DB"]
        self.standee_collection = self.db["standee-static-costs"]
        self.corrugated_collection = self.db["corrugate"]
        self.comp_collection = self.db["comp"]
        self.freight_collection = self.db["freight"]
        self.labels_collection = self.db["labels"]
        self.pallet_collection = self.db["pallet"]
        self.print_blank_collection = self.db["print_blank_ratio"]
        self.shipper_box_collection = self.db["shipper_boxes"]
        self.users_collection = self.db["users"]

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
    
    def set_standee_data(self, standee_category: str, data_field: str, value):
        """Update the specified data field for a given standee category."""
        result = self.standee_collection.update_one(
            {"standee_type": standee_category},
            {"$set": {data_field: value}}
        )
        return result.modified_count > 0  # Return True if the update was successful
    
    def get_comp_cost(self,comp_type: str):
        """Return the cost for a given comp type."""
        result = self.comp_collection.find_one({"comp_type": comp_type})
        if result and "cost" in result:
            return result["cost"]
        else:
            return None  # or raise an exception if preferred

    def set_comp_cost(self, comp_type: str, cost: float):
        """Set the cost for a given comp type."""
        result = self.comp_collection.find_one({"comp_type": comp_type})
        if result and "cost" in result:
            result["cost"] = cost
        else:
            return None  # or raise an exception if preferred
    


    def get_corrugate_cost(self):
        """Return the current corrugate cost."""
        result = self.corrugated_collection.find_one({})
        if result and "cost" in result:
            return result["cost"]
        else:
            return None  # or raise an exception if preferred

    def set_corrugate_cost(self, cost: float):
        """Set the current corrugate cost."""
        result = self.corrugated_collection.find_one({})
        if result and "cost" in result:
            result["cost"] = cost
        else:
            return None  # or raise an exception if preferred
    



    def get_freight_cost(self, freight_type: int):
        """Return the current freight cost for a given freight type."""
        result = self.freight_collection.find_one({"freight_type": freight_type})
        if result and "cost" in result:
            return result["cost"]
        else:
            return None  # or raise an exception if preferred
    

    def set_freight_cost(self, freight_type: int, cost: float):
        """Set the current freight cost for a given freight type."""
        result = self.freight_collection.find_one({"freight_type": freight_type})
        if result and "cost" in result:
            result["cost"] = cost
        else:
            return None  # or raise an exception if preferred

    def get_label_cost(self, label_type: str):
        """Return the current label cost for a given label type."""
        result = self.labels_collection.find_one({"label_type": label_type})
        if result and "cost" in result:
            return result["cost"]
        else:
            return None  # or raise an exception if preferred

    def set_label_cost(self, label_type: str, cost: float):
        """Set the current label cost for a given label type."""
        result = self.labels_collection.find_one({"label_type": label_type})
        if result and "cost" in result:
            result["cost"] = cost
        else:
            return None  # or raise an exception if preferred
    


    def get_pallet_cost(self):
        """Return the current pallet cost for a given pallet type."""
        result = self.pallet_collection.find_one({})
        if result and "cost" in result:
            return result["cost"]
        else:
            return None  # or raise an exception if preferred

    def set_pallet_cost(self, cost: float):
        """Set the current pallet cost for a given pallet type."""
        result = self.pallet_collection.find_one({})
        if result and "cost" in result:
            result["cost"] = cost
        else:
            return None  # or raise an exception if preferred



    def get_print_blank_ratio(self, print_forms: int):
        """Return the current print blank ratio."""
        result = self.print_blank_collection.find_one({"print_forms": print_forms})
        if result and "blank_forms" in result:
            return result["blank_forms"]
        else:
            return None  # or raise an exception if preferred

    def set_print_blank_ratio(self, print_forms: int, blank_forms: int):
        """Set the current print blank ratio."""
        result = self.print_blank_collection.find_one({"print_forms": print_forms})
        if result and "blank_forms" in result:
            result["blank_forms"] = blank_forms
        else:
            return None  # or raise an exception if preferred
    

    def get_shipper_box_cost(self, box_type: str):
        """Return the current shipper box cost for a given box type."""
        result = self.shipper_box_collection.find_one({})
        if result and "cost" in result:
            return result["cost"]
        else:
            return None  # or raise an exception if preferred

    def set_shipper_box_cost(self, box_type: str, cost: float):
        """Set the current shipper box cost for a given box type."""
        result = self.shipper_box_collection.find_one({})
        if result and "cost" in result:
            result["cost"] = cost
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
    print(f"Retrieved standee data for type {type_mapping[standee_type]} and field '{data_type}': {standee_data}"  )
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
    
    if not user or not verify_password(password, user["password_hash"]):
        return JSONResponse(status_code=400, content={"error": "Invalid username or password"})
    else:
        return JSONResponse(status_code=200, content={"message": "Sign-in successful"})

