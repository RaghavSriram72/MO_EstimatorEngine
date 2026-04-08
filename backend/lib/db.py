import hashlib
import os
import secrets

from dotenv import load_dotenv
from pymongo.mongo_client import MongoClient
from pymongo.server_api import ServerApi


class MOADB:
    """MongoDB helper for flute-price collection operations."""

    def __init__(self):
        load_dotenv()  # Load environment variables from .env file
        self.uri = os.getenv("MONGO_URI")
        self.client = client = MongoClient(self.uri, server_api=ServerApi("1"))
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
                "password_hash": _hash_password(password),
            }
        )
        return True  # User created successfully

    def get_user(self, username: str):
        """Retrieve a user document by username."""
        return self.users_collection.find_one({"username": username})

    def get_standee_data(self, standee_category: str, data_field: str) -> int | float:
        """Return the specified data field for a given standee category."""
        result = self.standee_collection.find_one({"standee_type": standee_category})
        if result and data_field in result:
            return result[data_field]
        else:
            raise ValueError(f"Data field '{data_field}' not found for standee category '{standee_category}'")

    def set_standee_data(self, standee_category: str, data_field: str, value: int | float) -> bool:
        """Update the specified data field for a given standee category."""
        result = self.standee_collection.update_one(
            {"standee_type": standee_category}, {"$set": {data_field: value}}
        )
        return result.modified_count > 0  # Return True if the update was successful

    def get_comp_cost(self, comp_type: str) -> float:
        """Return the cost for a given comp type."""
        result = self.comp_collection.find_one({"comp_type": comp_type})
        if result and "cost" in result:
            return result["cost"]
        else:
            raise ValueError(f"Cost not found for comp type '{comp_type}'")

    def set_comp_cost(self, comp_type: str, cost: float) -> None:
        """Set the cost for a given comp type."""
        try:
            self.comp_collection.update_one({"comp_type": comp_type}, {"$set": {"cost": cost}})
        except Exception as e:
            raise ValueError(f"Failed to set cost for comp type '{comp_type}': {str(e)}")

    def get_corrugate_cost(self) -> float:
        """Return the current corrugate cost."""
        result = self.corrugated_collection.find_one({})
        if result and "cost" in result:
            return result["cost"]
        else:
            raise ValueError("Corrugate cost not found")

    def set_corrugate_cost(self, cost: float) -> None:
        """Set the current corrugate cost."""
        try:
            self.corrugated_collection.update_one({}, {"$set": {"cost": cost}})
        except Exception as e:
            raise ValueError(f"Failed to set corrugate cost: {str(e)}")

    def get_freight_cost(self, freight_type: int) -> float:
        """Return the current freight cost for a given freight type."""
        result = self.freight_collection.find_one({"freight_type": freight_type})
        if result and "cost" in result:
            return result["cost"]
        else:
            raise ValueError(f"Freight cost not found for freight type {freight_type}")

    def set_freight_cost(self, freight_type: int, cost: float) -> None:
        """Set the current freight cost for a given freight type."""
        try:
            self.freight_collection.update_one({"freight_type": freight_type}, {"$set": {"cost": cost}})
        except Exception as e:
            raise ValueError(f"Failed to set freight cost for type {freight_type}: {str(e)}")

    def get_label_cost(self, label_type: str) -> float:
        """Return the current label cost for a given label type."""
        result = self.labels_collection.find_one({"label_type": label_type})
        if result and "cost" in result:
            return result["cost"]
        else:
            raise ValueError(f"Label cost not found for label type '{label_type}'")

    def set_label_cost(self, label_type: str, cost: float) -> None:
        """Set the current label cost for a given label type."""
        try:
            self.labels_collection.update_one({"label_type": label_type}, {"$set": {"cost": cost}})
        except Exception as e:
            raise ValueError(f"Failed to set label cost for type '{label_type}': {str(e)}")

    def get_pallet_cost(self) -> float:
        """Return the current pallet cost for a given pallet type."""
        result = self.pallet_collection.find_one({})
        if result and "cost" in result:
            return result["cost"]
        else:
            raise ValueError("Pallet cost not found")

    def set_pallet_cost(self, cost: float) -> None:
        """Set the current pallet cost."""
        try:
            self.pallet_collection.update_one({}, {"$set": {"cost": cost}})
        except Exception as e:
            raise ValueError(f"Failed to set pallet cost: {str(e)}")

    def get_pallet_labor_cost(self) -> float:
        """Return the current pallet labor cost."""
        result = self.pallet_collection.find_one({})
        if result and "labor_cost" in result:
            return result["labor_cost"]
        else:
            raise ValueError("Pallet labor cost not found")

    def set_pallet_labor_cost(self, labor_cost: float) -> None:
        """Set the current pallet labor cost."""
        try:
            self.pallet_collection.update_one({}, {"$set": {"labor_cost": labor_cost}})
        except Exception as e:
            raise ValueError(f"Failed to set pallet labor cost: {str(e)}")

    def get_print_blank_ratio(self, print_forms: int) -> int:
        """Return the current print blank ratio."""
        result = self.print_blank_collection.find_one({"print_forms": print_forms})
        if result and "blank_forms" in result:
            return result["blank_forms"]
        else:
            raise ValueError(f"Print blank ratio not found for {print_forms} print forms")

    def set_print_blank_ratio(self, print_forms: int, blank_forms: int) -> None:
        """Set the current print blank ratio."""
        try:
            self.print_blank_collection.update_one(
                {"print_forms": print_forms}, {"$set": {"blank_forms": blank_forms}}
            )
        except Exception as e:
            raise ValueError(f"Failed to set print blank ratio: {str(e)}")

    def get_shipper_box_cost(self) -> float:
        """Return the current shipper box cost for a given box type."""
        result = self.shipper_box_collection.find_one({})
        if result and "cost" in result:
            return result["cost"]
        else:
            raise ValueError("Shipper box cost not found")

    def set_shipper_box_cost(self, cost: float) -> None:
        """Set the current shipper box cost for a given box type."""
        try:
            self.shipper_box_collection.update_one({}, {"$set": {"cost": cost}})
        except Exception as e:
            raise ValueError(f"Failed to set shipper box cost: {str(e)}")


def _hash_password(password: str) -> str:
    """Hash a password using PBKDF2-HMAC-SHA256 with random salt."""
    iterations = 120_000
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return f"pbkdf2_sha256${iterations}${salt.hex()}${digest.hex()}"
