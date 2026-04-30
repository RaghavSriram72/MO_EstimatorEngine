import hashlib
import os
import secrets
from datetime import UTC, datetime
from typing import Any

from bson import ObjectId
from bson.errors import InvalidId
from dotenv import load_dotenv
from pymongo.mongo_client import MongoClient
from pymongo.server_api import ServerApi

from lib.globals import UNIT_MAP


class MidnightOilDB:
    """MongoDB helper for flute-price collection operations."""

    def __init__(self):
        load_dotenv()
        self.uri = os.getenv("MONGO_URI")
        self.connect()

    def connect(self):
        """Establish a connection to the MongoDB database."""
        self.client = MongoClient(self.uri, server_api=ServerApi("1"))
        self.db = self.client["DB"]
        self.by_unit_costs_collection = self.db["by_unit_costs"]
        self.standee_collection = self.db["standee_static_costs"]
        self.print_blank_collection = self.db["print_blank_ratio"]
        self.fosters_collection = self.db["fosters"]
        self.users_collection = self.db["users"]
        self.projects_collection = self.db["projects"]
        self.projects_collection.create_index([("owner", 1), ("_id", -1)])
        return self

    def close(self):
        """Close the MongoDB connection."""
        self.client.close()

    def __enter__(self):
        return self.connect()

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()

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

    def insert_persisted_project(self, doc: dict[str, Any]) -> str:
        """Insert a canonical v1 project document; returns the new document id as a string."""
        result = self.projects_collection.insert_one(doc)
        return str(result.inserted_id)

    def list_projects_by_owner(self, owner: str) -> list[dict[str, Any]]:
        """Return all project documents for an owner, newest ``_id`` first."""
        cursor = self.projects_collection.find({"owner": owner}).sort("_id", -1)
        out: list[dict[str, Any]] = []
        for row in cursor:
            doc = dict(row)
            doc["_id"] = str(doc["_id"])
            out.append(doc)
        return out

    def get_project_by_owner(self, project_id: str, owner: str) -> dict[str, Any] | None:
        """Return one project document if it exists and belongs to ``owner``."""
        try:
            oid = ObjectId(project_id)
        except (InvalidId, TypeError):
            return None
        row = self.projects_collection.find_one({"_id": oid, "owner": owner})
        if row is None:
            return None
        doc = dict(row)
        doc["_id"] = str(doc["_id"])
        return doc

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

    def get_all_unit_costs(self) -> list[dict]:
        """Return all unit cost records, serialized for JSON."""
        records = []
        for r in self.by_unit_costs_collection.find({}, sort=[("type", 1), ("display_name", 1)]):
            r["_id"] = str(r["_id"])
            if "last_updated" in r and hasattr(r["last_updated"], "isoformat"):
                r["last_updated"] = r["last_updated"].isoformat()
            records.append(r)
        return records

    def get_units_by_type(self, cost_type: str) -> list[dict[str, float]]:
        """Return the unit cost for a given cost name and type."""
        result = self.by_unit_costs_collection.find({"type": cost_type})
        return list(result)

    def set_unit_cost(self, cost_name: str, cost: float) -> None:
        """Set the unit cost for a given cost name, stamping last_updated."""
        try:
            self.by_unit_costs_collection.update_one(
                {"name": cost_name},
                {"$set": {"cost": cost, "last_updated": datetime.now(UTC)}},
            )
        except Exception as e:
            raise ValueError(f"Failed to set cost for '{cost_name}': {str(e)}")

    def update_unit_cost_entry(self, cost_name: str, updates: dict) -> None:
        """Update arbitrary fields on a unit cost record, stamping last_updated."""
        if not updates:
            return
        updates["last_updated"] = datetime.now(UTC)
        try:
            self.by_unit_costs_collection.update_one({"name": cost_name}, {"$set": updates})
        except Exception as e:
            raise ValueError(f"Failed to update entry for '{cost_name}': {str(e)}")

    def get_standee_record(self, standee_category: str) -> dict:
        """Return the full standee static cost document for a given category."""
        result = self.standee_collection.find_one({"standee_type": standee_category})
        if result:
            result["_id"] = str(result["_id"])
            return result
        raise ValueError(f"Standee record not found for '{standee_category}'")

    def update_standee_record(self, standee_category: str, updates: dict) -> None:
        """Update arbitrary numeric fields on a standee static cost record."""
        if not updates:
            return
        try:
            self.standee_collection.update_one({"standee_type": standee_category}, {"$set": updates})
        except Exception as e:
            raise ValueError(f"Failed to update standee record for '{standee_category}': {str(e)}")

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

    def get_fosters_values(self) -> dict[str, list[float]]:
        """Return the current Fosters print values."""
        # get all records from the fosters collection and return as a dict of lists
        fosters_data = {"amounts": [], "costs": []}
        for record in self.fosters_collection.find({}):
            fosters_data["amounts"].append(record["amount"])
            fosters_data["costs"].append(record["cost"] * UNIT_MAP[record["unit"]])
        return fosters_data

    def update_or_insert_foster_value(self, amount: float, cost: float, unit: str) -> None:
        """Update or insert a Fosters print value."""
        try:
            self.fosters_collection.update_one({"amount": amount}, {"$set": {"cost": cost, "unit": unit}}, upsert=True)
        except Exception as e:
            raise ValueError(f"Failed to update/insert Fosters value for amount {amount}: {str(e)}")


def _hash_password(password: str) -> str:
    """Hash a password using PBKDF2-HMAC-SHA256 with random salt."""
    iterations = 120_000
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return f"pbkdf2_sha256${iterations}${salt.hex()}${digest.hex()}"
