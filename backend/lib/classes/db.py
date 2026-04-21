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
        self.by_unit_costs_collection = self.db["by_unit_costs"]
        self.standee_collection = self.db["standee_static_costs"]
        self.print_blank_collection = self.db["print_blank_ratio"]
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

    def get_unit_cost(self, cost_name: str) -> float:
        """Return the unit cost for a given cost name."""
        result = self.by_unit_costs_collection.find_one({"name": cost_name})
        if result and "cost" in result:
            return result["cost"]
        else:
            raise ValueError(f"Cost not found for '{cost_name}'")

    def get_unit_cost_entry(self, cost_name: str) -> dict:
        """Return the entire unit cost entry for a given cost name."""
        result = self.by_unit_costs_collection.find_one({"name": cost_name})
        if result:
            return result
        else:
            raise ValueError(f"Cost entry not found for '{cost_name}'")

    def get_units_by_type(self, cost_type: str) -> list[dict[str, float]]:
        """Return the unit cost for a given cost name and type."""
        result = self.by_unit_costs_collection.find({"type": cost_type})
        return list(result)

    def set_unit_cost(self, cost_name: str, cost: float) -> None:
        """Set the unit cost for a given cost name."""
        try:
            self.by_unit_costs_collection.update_one({"name": cost_name}, {"$set": {"cost": cost}})
        except Exception as e:
            raise ValueError(f"Failed to set cost for '{cost_name}': {str(e)}")

    def get_standee_data(self, standee_category: str, data_field: str) -> int | float:
        """Return the specified data field for a given standee category."""
        result = self.standee_collection.find_one({"standee_type": standee_category})
        if result and data_field in result:
            return result[data_field]
        else:
            raise ValueError(f"Data field '{data_field}' not found for standee category '{standee_category}'")

    def set_standee_data(self, standee_category: str, data_field: str, value: int | float) -> bool:
        """Update the specified data field for a given standee category."""
        result = self.standee_collection.update_one({"standee_type": standee_category}, {"$set": {data_field: value}})
        return result.modified_count > 0  # Return True if the update was successful

    def get_structure_forms_per_standee(self, print_forms: int) -> int:
        """Return the current print blank ratio."""
        result = self.print_blank_collection.find_one({"print_forms": print_forms})
        if result and "blank_forms" in result:
            return result["blank_forms"]
        else:
            raise ValueError(f"Print blank ratio not found for {print_forms} print forms")

    def set_blank_forms_per_standee(self, print_forms: int, blank_forms: int) -> None:
        """Set the current print blank ratio."""
        try:
            self.print_blank_collection.update_one({"print_forms": print_forms}, {"$set": {"blank_forms": blank_forms}})
        except Exception as e:
            raise ValueError(f"Failed to set print blank ratio: {str(e)}")

    def close(self):
        """Close the MongoDB client connection."""
        self.client.close()


def _hash_password(password: str) -> str:
    """Hash a password using PBKDF2-HMAC-SHA256 with random salt."""
    iterations = 120_000
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return f"pbkdf2_sha256${iterations}${salt.hex()}${digest.hex()}"
