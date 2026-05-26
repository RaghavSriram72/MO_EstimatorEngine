import hashlib
import os
import secrets
from datetime import UTC, datetime
from typing import Any

import numpy as np
from bson import ObjectId
from bson.errors import InvalidId
from dotenv import load_dotenv
from pymongo.mongo_client import MongoClient
from pymongo.server_api import ServerApi
from scipy.optimize import curve_fit

from lib.globals import UNIT_MAP


def _fit_supplier_curve(amounts: list[float], costs: list[float]) -> dict[str, float]:
    """Fit a power-law curve to supplier price breaks and return params plus R²."""
    x_values = np.asarray(amounts, dtype=float)
    y_values = np.asarray(costs, dtype=float)

    if len(x_values) == 0:
        return {"a": 0.0, "b": 0.0, "c": 0.0, "r_squared": 1.0}
    if len(x_values) == 1:
        value = float(y_values[0])
        return {"a": value, "b": 0.0, "c": 0.0, "r_squared": 1.0}

    a_guess = float(np.max(y_values))
    if x_values[0] > 0 and x_values[-1] > 0 and y_values[-1] > 0:
        b_guess = float(np.log(y_values[0] / y_values[-1]) / np.log(x_values[0] / x_values[-1]))
    else:
        b_guess = -1.0
    c_guess = float(np.min(y_values) * 0.8)

    try:
        params, _ = curve_fit(
            lambda x, a, b, c: a * np.asarray(x, dtype=float) ** b + c,
            x_values,
            y_values,
            p0=[a_guess, b_guess, c_guess],
            maxfev=10_000,
        )
        a, b, c = (float(params[0]), float(params[1]), float(params[2]))
    except Exception:
        a, b, c = a_guess, b_guess, c_guess

    predicted = a * x_values**b + c
    ss_res = float(np.sum((y_values - predicted) ** 2))
    ss_tot = float(np.sum((y_values - np.mean(y_values)) ** 2))
    r_squared = 1.0 if ss_tot == 0 else 1 - (ss_res / ss_tot)
    return {"a": round(a, 6), "b": round(b, 6), "c": round(c, 6), "r_squared": round(float(r_squared), 6)}


class MidnightOilDB:
    """MongoDB helper for flute-price collection operations."""

    def __init__(self):
        load_dotenv()
        self.uri = os.getenv("MONGO_URI")

    def connect(self):
        """Establish a connection to the MongoDB database."""
        self._cache: dict[str, list] = {}
        self.client = MongoClient(self.uri, server_api=ServerApi("1"))
        self.db = self.client["DB"]
        self.unit_costs_collection = self.db["unit_costs"]
        self.standee_collection = self.db["standee_static_costs"]
        self.print_blank_collection = self.db["print_blank_ratio"]
        self.overs_collection = self.db["overs"]
        self.packout_collection = self.db["packout"]
        self.work_center_costs_collection = self.db["work_center_costs"]
        self.suppliers_collection = self.db["suppliers"]
        self.users_collection = self.db["users"]
        self.projects_collection = self.db["projects"]
        self.quotes_collection = self.db["quotes"]
        self._load_cache()
        return self

    def _load_cache(self) -> None:
        self._cache["unit_costs"] = list(self.db["unit_costs"].find())
        self._cache["standee_static_costs"] = list(self.db["standee_static_costs"].find())
        self._cache["print_blank_ratio"] = list(self.db["print_blank_ratio"].find())
        self._cache["overs"] = list(self.db["overs"].find())
        self._cache["suppliers"] = list(self.db["suppliers"].find())

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

    def update_persisted_project(self, project_id: str, owner: str, fields: dict[str, Any]) -> bool:
        """Update an existing project MongoDB entry."""
        try:
            oid = ObjectId(project_id)
        except (InvalidId, TypeError):
            return False
        allowed = {"project_name", "num_standees", "standee_type", "elements"}
        update_doc = {k: v for k, v in fields.items() if k in allowed}
        if not update_doc:
            return False
        result = self.projects_collection.update_one({"_id": oid, "owner": owner}, {"$set": update_doc})
        self._load_cache()
        return result.matched_count > 0

    def delete_persisted_project(self, project_id: str, owner: str) -> bool:
        """Delete project entry if it exists and belongs to the owner asking to delete it."""
        try:
            oid = ObjectId(project_id)
        except (InvalidId, TypeError):
            return False
        result = self.projects_collection.delete_one({"_id": oid, "owner": owner})
        if result.deleted_count > 0:
            self.delete_quotes_for_project(project_id, owner)
            self._load_cache()
            return True
        else:
            return False

    def insert_persisted_quote(self, doc: dict[str, Any]) -> str:
        """Insert a quote document.

        Caller must supply a BSON-safe ``doc`` (no ``Form`` objects).
        Returns the new ``_id`` as a string.
        """
        result = self.quotes_collection.insert_one(doc)
        return str(result.inserted_id)

    def get_quote_by_owner(self, quote_id: str, owner: str) -> dict[str, Any] | None:
        """Return one quote document if it exists and belongs to ``owner``."""
        try:
            qid = ObjectId(quote_id)
        except (InvalidId, TypeError):
            return None
        row = self.quotes_collection.find_one({"_id": qid, "owner": owner})
        if row is None:
            return None
        doc = dict(row)
        doc["_id"] = str(doc["_id"])
        doc["project_id"] = str(doc["project_id"])
        for key in ("created_at", "updated_at"):
            if key in doc and hasattr(doc[key], "isoformat"):
                doc[key] = doc[key].isoformat()
        return doc

    def list_quotes_for_project(self, project_id: str, owner: str) -> list[dict[str, Any]]:
        """Return all quote documents for ``project_id`` that belong to ``owner``, newest ``_id`` first."""
        try:
            pid = ObjectId(project_id)
        except (InvalidId, TypeError):
            return []
        cursor = self.quotes_collection.find({"project_id": pid, "owner": owner}).sort("_id", -1)
        out: list[dict[str, Any]] = []
        for row in cursor:
            doc = dict(row)
            doc["_id"] = str(doc["_id"])
            doc["project_id"] = str(doc["project_id"])
            for key in ("created_at", "updated_at"):
                if key in doc and hasattr(doc[key], "isoformat"):
                    doc[key] = doc[key].isoformat()
            out.append(doc)
        return out

    def update_persisted_quote(self, quote_id: str, owner: str, fields: dict[str, Any]) -> bool:
        """Update allowed fields on a quote owned by ``owner``."""
        try:
            qid = ObjectId(quote_id)
        except (InvalidId, TypeError):
            return False
        allowed = {"quote_name", "breakdown", "num_standees", "scenario", "standee_type", "elements"}
        update_doc_final = {k: v for k, v in fields.items() if k in allowed}
        if not update_doc_final:
            return False
        update_doc_final["updated_at"] = datetime.now(UTC)
        result = self.quotes_collection.update_one({"_id": qid, "owner": owner}, {"$set": update_doc_final})
        return result.matched_count > 0

    def delete_persisted_quote(self, quote_id: str, owner: str) -> bool:
        """Delete one quote if it exists and belongs to ``owner``."""
        try:
            qid = ObjectId(quote_id)
        except (InvalidId, TypeError):
            return False
        result = self.quotes_collection.delete_one({"_id": qid, "owner": owner})
        return result.deleted_count > 0

    def delete_quotes_for_project(self, project_id: str, owner: str) -> int:
        """Remove all quotes linked to ``project_id`` for ``owner``. Returns deleted count."""
        try:
            oid = ObjectId(project_id)
        except (InvalidId, TypeError):
            return 0
        result = self.quotes_collection.delete_many({"project_id": oid, "owner": owner})
        return result.deleted_count

    def get_unit_cost_entry(self, cost_name: str) -> dict:
        """Return the entire unit cost entry for a given cost name."""
        record = next((entry for entry in self._cache["unit_costs"] if entry["name"] == cost_name), None)
        if record:
            return record
        else:
            raise ValueError(f"Cost entry not found for '{cost_name}'")

    def get_unit_cost(self, cost_name: str) -> float:
        """Return the unit cost for a given cost name."""
        return self.get_unit_cost_entry(cost_name)["cost"]

    def get_all_unit_costs(self) -> list[dict]:
        """Return all unit cost records, serialized for JSON."""
        records = []
        for r in sorted(self._cache["unit_costs"], key=lambda x: (x["type"], x["display_name"])):
            r["_id"] = str(r["_id"])
            if "last_updated" in r and hasattr(r["last_updated"], "isoformat"):
                r["last_updated"] = r["last_updated"].isoformat()
            records.append(r)
        return records

    def get_units_by_type(self, cost_type: str) -> list[dict[str, float]]:
        """Return the unit cost for a given cost name and type."""
        return [entry for entry in self._cache["unit_costs"] if entry["type"] == cost_type]

    def update_unit_cost_entry(self, cost_name: str, updates: dict) -> None:
        """Update arbitrary fields on a unit cost record, stamping last_updated."""
        if not updates:
            return
        updates["last_updated"] = datetime.now(UTC)
        try:
            self.unit_costs_collection.update_one({"name": cost_name}, {"$set": updates})
            self._load_cache()
        except Exception as e:
            raise ValueError(f"Failed to update entry for '{cost_name}': {str(e)}")

    def get_standee_record(self, standee_category: str) -> dict:
        """Return the full standee static cost document for a given category."""
        record = next(
            (entry for entry in self._cache["standee_static_costs"] if entry["standee_type"] == standee_category), None
        )
        if record:
            record["_id"] = str(record["_id"])
            return record
        raise ValueError(f"Standee record not found for '{standee_category}'")

    def get_standee_data(self, standee_category: str, data_field: str) -> int | float:
        """Return the specified data field for a given standee category."""
        record = next(
            (entry for entry in self._cache["standee_static_costs"] if entry["standee_type"] == standee_category), None
        )
        if record and data_field in record:
            return record[data_field]
        else:
            raise ValueError(f"Data field '{data_field}' not found for standee category '{standee_category}'")

    def update_standee_record(self, standee_category: str, updates: dict) -> None:
        """Update arbitrary numeric fields on a standee static cost record."""
        if not updates:
            return
        try:
            self.standee_collection.update_one({"standee_type": standee_category}, {"$set": updates})
            self._load_cache()
        except Exception as e:
            raise ValueError(f"Failed to update standee record for '{standee_category}': {str(e)}")

    def get_structure_forms_per_standee(self, print_forms: int) -> int:
        """Return the print blank ratio, falling back to the nearest available value."""
        ratios = self._cache["print_blank_ratio"]
        record = next((e for e in ratios if e["print_forms"] == print_forms), None)
        if record and "blank_forms" in record:
            return record["blank_forms"]
        valid = [e for e in ratios if "print_forms" in e and "blank_forms" in e]
        if valid:
            closest = min(valid, key=lambda e: abs(e["print_forms"] - print_forms))
            return closest["blank_forms"]
        raise ValueError(f"Print blank ratio not found for {print_forms} print forms")

    def set_blank_forms_per_standee(self, print_forms: int, blank_forms: int) -> None:
        """Set the current print blank ratio."""
        try:
            self.print_blank_collection.update_one({"print_forms": print_forms}, {"$set": {"blank_forms": blank_forms}})
            self._load_cache()
        except Exception as e:
            raise ValueError(f"Failed to set print blank ratio: {str(e)}")

    def get_distinct_suppliers(self) -> list[str]:
        """Return all distinct supplier names."""
        return sorted({r["supplier"] for r in self._cache["suppliers"]})

    def get_distinct_materials(self, supplier: str) -> list[dict]:
        """Return distinct materials for a supplier with their display names."""
        return sorted(
            [
                {"material": r["material"], "display_name": r["material_display_name"]}
                for r in self._cache["suppliers"]
                if r["supplier"] == supplier
            ],
            key=lambda x: x["material"],
        )

    def _get_supplier_doc(self, supplier: str, material: str) -> dict[str, Any] | None:
        """Return one supplier/material document from cache."""
        return next(
            (r for r in self._cache["suppliers"] if r["supplier"] == supplier and r["material"] == material),
            None,
        )

    def get_supplier_material_records(self, supplier: str, material: str) -> dict[str, Any] | None:
        """Return one supplier/material document with serialized price_breaks."""
        doc = self._get_supplier_doc(supplier, material)
        if doc is None:
            return None

        last_updated = doc.get("last_updated")
        if last_updated is not None and hasattr(last_updated, "isoformat"):
            last_updated = last_updated.isoformat()

        # Return price_breaks as simple amount/cost objects. Older documents may have
        # embedded `_id` fields; drop them and only expose amount/cost to the frontend.
        serialized_breaks = [
            {
                "amount": price_break.get("amount"),
                "cost": price_break.get("cost"),
            }
            for price_break in sorted(doc.get("price_breaks", []), key=lambda row: row.get("amount", 0))
        ]

        return {
            "_id": str(doc.get("_id", "")),
            "supplier": doc["supplier"],
            "material": doc["material"],
            "material_display_name": doc["material_display_name"],
            "unit": doc["unit"],
            "price_breaks": serialized_breaks,
            "curve_params": doc.get("curve_params"),
            "last_updated": last_updated,
        }

    def upsert_supplier_material(
        self,
        supplier: str,
        material: str,
        material_display_name: str,
        unit: str,
        price_breaks: list[dict[str, float]],
    ) -> None:
        """Insert or replace a supplier/material document and precompute curve parameters."""
        ordered_breaks = sorted(price_breaks, key=lambda row: row["amount"])

        amounts = [row["amount"] for row in ordered_breaks]
        costs = [row["cost"] * UNIT_MAP[unit] for row in ordered_breaks]
        curve_params = _fit_supplier_curve(amounts, costs)

        self.suppliers_collection.replace_one(
            {"supplier": supplier, "material": material},
            {
                "supplier": supplier,
                "material": material,
                "material_display_name": material_display_name,
                "unit": unit,
                "price_breaks": ordered_breaks,
                "curve_params": curve_params,
                "last_updated": datetime.now(UTC),
            },
            upsert=True,
        )
        self._load_cache()

    def get_curve_params(self, supplier: str, material: str) -> dict[str, float] | None:
        """Return precomputed curve params for a supplier/material pair."""
        doc = self._get_supplier_doc(supplier, material)
        return doc.get("curve_params") if doc else None

    def get_overs(self, quantity: int) -> int:
        """Return the over cost for a given quantity."""
        record = next(
            (
                entry
                for entry in self._cache["overs"]
                if entry["lower_bound"] <= quantity
                and (entry["upper_bound"] is None or entry["upper_bound"] >= quantity)
            ),
            None,
        )
        if record and "overs" in record:
            return record["overs"]
        else:
            raise ValueError(f"Overs not found for quantity {quantity}")

    def get_all_overs(self) -> list[dict]:
        """Return all overs tier records sorted by lower_bound."""
        records = []
        for r in sorted(self._cache["overs"], key=lambda x: x["lower_bound"]):
            r["_id"] = str(r["_id"])
            if "last_updated" in r and hasattr(r["last_updated"], "isoformat"):
                r["last_updated"] = r["last_updated"].isoformat()
            records.append(r)
        return records

    def upsert_overs(self, record_id: str | None, lower_bound: int, upper_bound: int | None, overs: int) -> str:
        """Upsert an overs tier record. Generates a new _id when record_id is None."""
        if record_id is not None:
            try:
                oid = ObjectId(record_id)
            except Exception:
                raise ValueError(f"Invalid overs record id '{record_id}'")
        else:
            oid = ObjectId()
        self.overs_collection.update_one(
            {"_id": oid},
            {
                "$set": {
                    "lower_bound": lower_bound,
                    "upper_bound": upper_bound,
                    "overs": overs,
                    "last_updated": datetime.now(UTC),
                }
            },
            upsert=True,
        )
        self._load_cache()
        return str(oid)

    def delete_overs(self, record_id: str) -> None:
        """Delete an overs tier record by _id."""
        try:
            oid = ObjectId(record_id)
        except Exception:
            raise ValueError(f"Invalid overs record id '{record_id}'")
        result = self.overs_collection.delete_one({"_id": oid})
        if result.deleted_count == 0:
            raise ValueError(f"Overs record not found for id '{record_id}'")
    
    def get_packout(self, standees, forms, complexity):
        """Return the packout cost for a given quantity of standees, forms, and complexity"""
        result = {
        "$and": [
            {
                "standees_lower_bound": {"$lte": standees}
            },
            {
                "$or": [
                    {"standees_upper_bound": None},
                    {"standees_upper_bound": {"$gte": standees}}
                ]
            },
            {
                "forms_lower_bound": {"$lte": forms}
            },
            {
                "$or": [
                    {"forms_upper_bound": None},
                    {"forms_upper_bound": {"$gte": forms}}
                ]
            },
            {
                {
                    "complexity": {
                        "$regex": f"^{complexity}$",
                        "$options": "i"
                    }
                }
            }
        ]
        }
        if result and "packout" in result:
            return result["packout"]
        else:
            raise ValueError(f"Overs not found for standees {standees}, forms {forms}, and complexity {complexity}")
        
    def get_all_packout(self) -> list[dict]:
        """Return all packout costs sorted by lower_bound."""
        records = []
        for r in sorted(self._cache["packout"], key=lambda x: (x["standees_lower_bound"], x["forms_lower_bound"])):
            r["_id"] = str(r["_id"])
            if "last_updated" in r and hasattr(r["last_updated"], "isoformat"):
                r["last_updated"] = r["last_updated"].isoformat()
            records.append(r)
        return records
    
    def upsert_packout(
        self,
        record_id: str | None,
        standees_lower_bound: int,
        standees_upper_bound: int | None,
        forms_lower_bound: int,
        forms_upper_bound: int | None,
        complexity: str,
        packout: int,
    ) -> str:
        """Upsert a packout tier record. Generates a new _id when record_id is None."""

        if record_id is not None:
            try:
                oid = ObjectId(record_id)
            except Exception:
                raise ValueError(f"Invalid packout record id '{record_id}'")
        else:
            oid = ObjectId()

        self.packout_collection.update_one(
            {"_id": oid},
            {
                "$set": {
                    "standees_lower_bound": standees_lower_bound,
                    "standees_upper_bound": standees_upper_bound,
                    "forms_lower_bound": forms_lower_bound,
                    "forms_upper_bound": forms_upper_bound,
                    "complexity": complexity,
                    "packout": packout,
                    "last_updated": datetime.now(UTC),
                }
            },
            upsert=True,
        )

        self._load_cache()
        return str(oid)


    def delete_packout(self, record_id: str) -> None:
        """Delete a packout tier record by _id."""

        try:
            oid = ObjectId(record_id)
        except Exception:
            raise ValueError(f"Invalid packout record id '{record_id}'")

        result = self.packout_collection.delete_one({"_id": oid})

        if result.deleted_count == 0:
            raise ValueError(f"Packout record not found for id '{record_id}'")

def _hash_password(password: str) -> str:
    """Hash a password using PBKDF2-HMAC-SHA256 with random salt."""
    iterations = 120_000
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return f"pbkdf2_sha256${iterations}${salt.hex()}${digest.hex()}"
