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
        self.corrugated_collection = self.db["corrugate"]
        self.comp_collection = self.db["comp"]
        self.freight_collection = self.db["freight"]
        self.labels_collection = self.db["labels"]
        self.pallet_collection = self.db["pallets"]
        self.print_blank_collection = self.db["print_blank_ratio"]
        self.shipper_box_collection = self.db["shipper_boxes"]
        self.users_collection = self.db["users"]
        self.print_materials = self.db["print_materials"]
        self.die_cost = self.db["die_cost"]

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

    def get_imposition_cost(self, print_forms: int) -> float:
        """Return the imposition cost for a given number of print forms."""
        result = self.by_unit_costs_collection.find_one({"name": "imposition_labor"})
        if result and "cost" in result and result["type"] == "imposition":
            return result["cost"] * print_forms
        else:
            raise ValueError("Imposition cost not found")

    def set_imposition_cost(self, cost: float) -> None:
        """Set the imposition cost."""
        try:
            self.by_unit_costs_collection.update_one({"name": "imposition_labor"}, {"$set": {"cost": cost}})
        except Exception as e:
            raise ValueError(f"Failed to set imposition cost: {str(e)}")

    def get_comp_cost(self, comp_type: str) -> float:
        """Return the cost for a given comp type."""
        result = self.by_unit_costs_collection.find_one({"name": comp_type})
        if result and "cost" in result and result["type"] == "comp":
            return result["cost"]
        else:
            raise ValueError(f"Cost not found for comp type '{comp_type}'")

    def set_comp_cost(self, comp_type: str, cost: float) -> None:
        """Set the cost for a given comp type."""
        try:
            self.by_unit_costs_collection.update_one({"name": comp_type}, {"$set": {"cost": cost}})
        except Exception as e:
            raise ValueError(f"Failed to set cost for comp type '{comp_type}': {str(e)}")

    def get_corrugate_cost(self) -> float:
        """Return the current corrugate cost."""
        result = self.by_unit_costs_collection.find_one({"name": "blank_corrugate"})
        if result and "cost" in result and result["type"] == "standee_material":
            return result["cost"]
        else:
            raise ValueError("Corrugate cost not found")

    def set_corrugate_cost(self, cost: float) -> None:
        """Set the current corrugate cost."""
        try:
            self.by_unit_costs_collection.update_one({"name": "blank_corrugate"}, {"$set": {"cost": cost}})
        except Exception as e:
            raise ValueError(f"Failed to set corrugate cost: {str(e)}")

    def get_freight_cost(self, freight_type: int) -> float:
        """Return the current freight cost for a given freight type."""
        result = self.by_unit_costs_collection.find_one({"name": freight_type})
        if result and "cost" in result and result["type"] == "freight":
            return result["cost"]
        else:
            raise ValueError(f"Freight cost not found for freight type {freight_type}")

    def set_freight_cost(self, freight_type: int, cost: float) -> None:
        """Set the current freight cost for a given freight type."""
        try:
            self.by_unit_costs_collection.update_one({"name": freight_type}, {"$set": {"cost": cost}})
        except Exception as e:
            raise ValueError(f"Failed to set freight cost for type {freight_type}: {str(e)}")

    def get_label_cost(self, label_type: str) -> float:
        """Return the current label cost for a given label type."""
        result = self.by_unit_costs_collection.find_one({"name": label_type})
        if result and "cost" in result and result["type"] == "label":
            return result["cost"]
        else:
            raise ValueError(f"Label cost not found for label type '{label_type}'")

    def set_label_cost(self, label_type: str, cost: float) -> None:
        """Set the current label cost for a given label type."""
        try:
            self.by_unit_costs_collection.update_one({"name": label_type}, {"$set": {"cost": cost}})
        except Exception as e:
            raise ValueError(f"Failed to set label cost for type '{label_type}': {str(e)}")

    def get_pallet_cost(self) -> float:
        """Return the current pallet cost for a given pallet type."""
        result = self.by_unit_costs_collection.find_one({"name": "pallet"})
        if result and "cost" in result and result["type"] == "pallet":
            return result["cost"]
        else:
            raise ValueError("Pallet cost not found")

    def set_pallet_cost(self, cost: float) -> None:
        """Set the current pallet cost."""
        try:
            self.by_unit_costs_collection.update_one({"name": "pallet"}, {"$set": {"cost": cost}})
        except Exception as e:
            raise ValueError(f"Failed to set pallet cost: {str(e)}")

    def get_pallet_labor_cost(self) -> float:
        """Return the current pallet labor cost."""
        result = self.by_unit_costs_collection.find_one({"name": "pallet_labor"})
        if result and "cost" in result and result["type"] == "pallet":
            return result["cost"]
        else:
            raise ValueError("Pallet labor cost not found")

    def set_pallet_labor_cost(self, labor_cost: float) -> None:
        """Set the current pallet labor cost."""
        try:
            self.by_unit_costs_collection.update_one({"name": "pallet_labor"}, {"$set": {"cost": labor_cost}})
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
        result = self.by_unit_costs_collection.find_one({"name": "shipper_box"})
        if result and "cost" in result and result["type"] == "box":
            return result["cost"]
        else:
            raise ValueError("Shipper box cost not found")

    def set_shipper_box_cost(self, cost: float) -> None:
        """Set the current shipper box cost for a given box type."""
        try:
            self.by_unit_costs_collection.update_one({"name": "shipper_box"}, {"$set": {"cost": cost}})
        except Exception as e:
            raise ValueError(f"Failed to set shipper box cost: {str(e)}")

    def get_print_material_cost(self, material_type: int) -> float:
        """Return the current print material cost for a given material type."""
        result = self.by_unit_costs_collection.find_one({"name": material_type})
        if result and "cost" in result and result["type"] == "standee_material":
            return result["cost"]
        else:
            raise ValueError(f"Print material cost not found for material type {material_type}")

    def set_print_material_cost(self, material_type: int, cost: float) -> None:
        """Set the current print material cost for a given material type."""
        try:
            self.by_unit_costs_collection.update_one({"name": material_type}, {"$set": {"cost": cost}})
        except Exception as e:
            raise ValueError(f"Failed to set print material cost for type {material_type}: {str(e)}")

    def get_die_cost(self) -> float:
        """Return the current die cost."""
        result = self.by_unit_costs_collection.find_one({"name": "die_cost"})
        if result and "cost" in result and result["type"] == "die":
            return result["cost"]
        else:
            raise ValueError("Die cost not found")

    def set_die_cost(self, cost: float) -> None:
        """Set the current die cost."""
        try:
            self.by_unit_costs_collection.update_one({"name": "die_cost"}, {"$set": {"cost": cost}})
        except Exception as e:
            raise ValueError(f"Failed to set die cost: {str(e)}")


def _hash_password(password: str) -> str:
    """Hash a password using PBKDF2-HMAC-SHA256 with random salt."""
    iterations = 120_000
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return f"pbkdf2_sha256${iterations}${salt.hex()}${digest.hex()}"
