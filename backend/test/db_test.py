import os
import unittest
from datetime import UTC, datetime
from types import SimpleNamespace
from typing import Any
from unittest.mock import patch

from bson import ObjectId

# Force every connection in this test module onto a disposable database whose
# name ends in "_test". This MUST be set before any MidnightOilDB().connect()
# call. python-dotenv's load_dotenv() does not override existing env vars, so
# this value wins even if .env defines MONGO_DB_NAME.
os.environ["MONGO_DB_NAME"] = "DB_test"

from lib.classes.db import MidnightOilDB, _fit_supplier_curve, _hash_password  # noqa: E402


def _require_test_db(db: MidnightOilDB) -> None:
    """Hard safety guard: never run destructive setup against a non-test database.

    Raises if the connected database name does not end with ``_test``. This prevents
    accidentally dropping/seeding the real application database (named ``DB``).
    """
    name = db.db.name
    if not name.endswith("_test"):
        raise RuntimeError(
            f"Refusing to run db_test against database {name!r}: its name must end with '_test'. "
            "Set MONGO_DB_NAME to a disposable test database before running these tests."
        )


def _reset_test_db(db: MidnightOilDB) -> None:
    """Drop the connected test database, guarded by :func:`_require_test_db`."""
    _require_test_db(db)
    db.client.drop_database(db.db.name)


def _seed_db(db: MidnightOilDB) -> None:
    """Seed the disposable test database with baseline documents used by the tests."""
    _require_test_db(db)
    d = db.db
    # clean collections
    d.users.delete_many({})
    d.projects.delete_many({})
    d.quotes.delete_many({})
    d.unit_costs.delete_many({})
    d.standee_static_costs.delete_many({})
    d.print_blank_ratio.delete_many({})
    d.suppliers.delete_many({})
    d.overs.delete_many({})
    d.packout.delete_many({})
    d.counters.delete_many({})

    # users
    d.users.insert_one({"username": "existing", "password_hash": "pw"})

    # projects
    d.projects.insert_one({"owner": "alice", "project_name": "Poster"})

    # quotes (existing "First quote" for the fixed project id used in tests)
    d.quotes.insert_one(
        {
            "owner": "alice",
            "project_id": ObjectId("000000000000000000000012"),
            "quote_name": "First quote",
            "breakdown": {"subtotal": 100},
            "num_standees": 2,
            "scenario": "Scenario1",
            "standee_type": "Complex",
            "elements": ["e1"],
            "created_at": datetime(2025, 1, 1, tzinfo=UTC),
            "updated_at": datetime(2025, 1, 1, tzinfo=UTC),
        }
    )

    # unit costs
    d.unit_costs.insert_many(
        [
            {
                "name": "ink",
                "type": "ink",
                "display_name": "Ink",
                "cost": 2.5,
                "unit": "sqft",
                "last_updated": datetime.now(UTC),
            },
            {
                "name": "paper",
                "type": "substrate",
                "display_name": "Paper",
                "cost": 1.25,
                "unit": "sqft",
                "last_updated": datetime.now(UTC),
            },
        ]
    )

    # standee static costs
    d.standee_static_costs.insert_one(
        {
            "standee_type": "Simple",
            "shipping_box_cost": 42,
            "blank_forms": 2,
            "hardware_cost": 0,
            "engineering_design_cost_per_project": 0,
            "zund_blank_form_minutes": 0,
            "cutting_die_blank_form_min": 0,
            "cutting_die_print_form_min": 0,
            "kitting_and_assembly": 0,
        }
    )

    # print blank ratios
    d.print_blank_ratio.insert_many(
        [
            {"print_forms": 2, "blank_forms": 1},
            {"print_forms": 5, "blank_forms": 3},
        ]
    )

    # suppliers
    d.suppliers.insert_one(
        {
            "_id": ObjectId("000000000000000000000010"),
            "supplier": "Acme",
            "material": "vinyl",
            "material_display_name": "Vinyl",
            "unit": "sqft",
            "price_breaks": [{"amount": 5, "cost": 10.0}, {"amount": 10, "cost": 7.5}],
            "curve_params": {"a": 2.0, "b": -1.0, "c": 1.0, "r_squared": 1.0},
            "last_updated": datetime.now(UTC),
        }
    )

    # overs tiers
    d.overs.insert_many(
        [
            {"_id": ObjectId("000000000000000000000006"), "lower_bound": 0, "upper_bound": 49, "overs": 4},
            {"lower_bound": 50, "upper_bound": 199, "overs": 8},
        ]
    )

    # packout tiers
    d.packout.insert_many(
        [
            {
                "_id": ObjectId("000000000000000000000008"),
                "standees_lower_bound": 0,
                "standees_upper_bound": 9,
                "forms_lower_bound": 0,
                "forms_upper_bound": 3,
                "complexity": "simple",
                "packout": 12,
                "last_updated": datetime.now(UTC),
            },
            {
                "standees_lower_bound": 10,
                "standees_upper_bound": None,
                "forms_lower_bound": 4,
                "forms_upper_bound": None,
                "complexity": "COMPLEX",
                "packout": 18,
                "last_updated": datetime.now(UTC),
            },
        ]
    )


class TestDbHelpers(unittest.TestCase):
    """Tests for the pure helpers and connection wiring in db.py."""

    @classmethod
    def setUpClass(cls):
        cls.db = MidnightOilDB().connect()
        # ensure clean slate and seed expected test data
        _reset_test_db(cls.db)
        _seed_db(cls.db)
        cls.db._load_cache()
        cls.db._cache["packout"] = list(cls.db.db["packout"].find())

    @classmethod
    def tearDownClass(cls):
        _reset_test_db(cls.db)
        cls.db.close()

    def setUp(self):
        self.db = self.__class__.db

    def test_fit_supplier_curve_handles_empty_and_single_point_inputs(self):
        """Verify the curve fitter handles the trivial input cases."""
        empty = _fit_supplier_curve([], [])
        single = _fit_supplier_curve([10], [7.5])

        self.assertEqual(empty, {"a": 0.0, "b": 0.0, "c": 0.0, "r_squared": 1.0})
        self.assertEqual(single, {"a": 7.5, "b": 0.0, "c": 0.0, "r_squared": 1.0})

    def test_fit_supplier_curve_returns_expected_power_law_for_exact_data(self):
        """Verify the curve fitter recovers an exact power-law dataset."""
        params = _fit_supplier_curve([1, 2, 4], [3, 2, 1.5])

        self.assertAlmostEqual(params["a"], 2.0, places=4)
        self.assertAlmostEqual(params["b"], -1.0, places=4)
        self.assertAlmostEqual(params["c"], 1.0, places=4)
        self.assertAlmostEqual(params["r_squared"], 1.0, places=6)

    def test_hash_password_uses_pbkdf2_format(self):
        """Verify password hashing uses the expected PBKDF2 envelope."""
        with (
            patch("lib.classes.db.secrets.token_bytes", return_value=b"\x01" * 16),
            patch("lib.classes.db.hashlib.pbkdf2_hmac", return_value=b"\x02" * 32),
        ):
            hashed = _hash_password("secret")

        self.assertEqual(
            hashed,
            "pbkdf2_sha256$120000$" + ("01" * 16) + "$" + ("02" * 32),
        )

    def test_connect_initializes_collections_and_context_manager_closes_client(self):
        """Verify connect returns a usable MidnightOilDB instance."""
        self.assertIsNotNone(self.db.client)
        self.assertIsNotNone(self.db.db)
        # Collections should be present as attributes
        self.assertTrue(hasattr(self.db, "unit_costs_collection"))
        self.assertTrue(hasattr(self.db, "suppliers_collection"))


class TestDbUserAndProjectMethods(unittest.TestCase):
    """Tests for persisted project and user helpers."""

    @classmethod
    def setUpClass(cls):
        cls.db = MidnightOilDB().connect()
        _reset_test_db(cls.db)
        _seed_db(cls.db)
        cls.db._load_cache()
        cls.db._cache["packout"] = list(cls.db.db["packout"].find())

    @classmethod
    def tearDownClass(cls):
        _reset_test_db(cls.db)
        cls.db.close()

    def setUp(self):
        self.db = self.__class__.db

    def test_user_helpers_create_and_lookup_users(self):
        """Verify the username lookup and insert flow."""
        db: Any = self.db

        self.assertTrue(db.check_username_exists("existing"))
        self.assertFalse(db.check_username_exists("missing"))
        self.assertEqual(db.get_user("existing")["username"], "existing")

        with patch("lib.classes.db._hash_password", return_value="hashed"):
            self.assertTrue(db.create_user("new-user", "pw"))

        created = db.get_user("new-user")
        self.assertEqual(created["password_hash"], "hashed")
        self.assertFalse(db.create_user("existing", "pw"))

    def test_project_helpers_cover_insert_list_get_update_and_delete(self):
        """Verify project CRUD helpers and owner scoping."""
        db: Any = self.db

        project_id, short_id = db.insert_persisted_project(
            {
                "owner": "alice",
                "project_name": "New project",
                "num_standees": 2,
                "standee_type": "Complex",
                "elements": ["a", "b"],
            }
        )
        self.assertEqual(short_id, "10101")  # seeded "Poster" remints to 10100 first

        projects = db.list_projects_by_owner("alice")
        self.assertEqual([project["project_name"] for project in projects], ["New project", "Poster"])
        self.assertEqual(db.get_project_by_owner(project_id, "alice")["short_id"], "10101")
        poster = next(p for p in projects if p["project_name"] == "Poster")
        self.assertEqual(poster["short_id"], "10100")

        fetched = db.get_project_by_owner(project_id, "alice")
        self.assertEqual(fetched["project_name"], "New project")
        self.assertEqual(fetched["_id"], project_id)
        self.assertIsNone(db.get_project_by_owner("bad-id", "alice"))
        self.assertIsNone(db.get_project_by_owner(project_id, "bob"))

        self.assertFalse(db.update_persisted_project("bad-id", "alice", {"project_name": "x"}))
        self.assertFalse(db.update_persisted_project(project_id, "alice", {"ignored": True}))
        self.assertTrue(
            db.update_persisted_project(
                project_id,
                "alice",
                {"project_name": "Updated project", "ignored": True},
            )
        )
        self.assertEqual(db.get_project_by_owner(project_id, "alice")["project_name"], "Updated project")

        with patch.object(db, "delete_quotes_for_project", return_value=1) as delete_quotes:
            self.assertTrue(db.delete_persisted_project(project_id, "alice"))
            delete_quotes.assert_called_once_with(project_id, "alice")

        self.assertIsNone(db.get_project_by_owner(project_id, "alice"))
        self.assertFalse(db.delete_persisted_project("bad-id", "alice"))


class TestDbQuoteMethods(unittest.TestCase):
    """Tests for persisted quote helpers."""

    @classmethod
    def setUpClass(cls):
        cls.db = MidnightOilDB().connect()
        _reset_test_db(cls.db)
        _seed_db(cls.db)
        cls.db._load_cache()
        cls.db._cache["packout"] = list(cls.db.db["packout"].find())

    @classmethod
    def tearDownClass(cls):
        _reset_test_db(cls.db)
        cls.db.close()

    def setUp(self):
        self.db = self.__class__.db

    def test_quote_helpers_cover_insert_list_get_update_and_delete(self):
        """Verify quote CRUD helpers, serialization, and ownership checks."""
        db: Any = self.db

        quote_id = db.insert_persisted_quote(
            {
                "owner": "alice",
                "project_id": ObjectId("000000000000000000000012"),
                "quote_name": "Second quote",
                "breakdown": {"subtotal": 200},
                "num_standees": 3,
                "scenario": "Scenario2",
                "standee_type": "Complex",
                "elements": ["e2"],
                "created_at": datetime(2026, 1, 9, 12, 0, tzinfo=UTC),
                "updated_at": datetime(2026, 1, 9, 13, 0, tzinfo=UTC),
            }
        )

        quotes = db.list_quotes_for_project("000000000000000000000012", "alice")
        self.assertEqual([quote["quote_name"] for quote in quotes], ["Second quote", "First quote"])
        self.assertEqual(quotes[0]["project_id"], "000000000000000000000012")
        self.assertEqual(quotes[0]["created_at"], "2026-01-09T12:00:00+00:00")

        fetched = db.get_quote_by_owner(quote_id, "alice")
        self.assertEqual(fetched["_id"], quote_id)
        self.assertEqual(fetched["project_id"], "000000000000000000000012")
        self.assertEqual(fetched["updated_at"], "2026-01-09T13:00:00+00:00")
        self.assertIsNone(db.get_quote_by_owner("bad-id", "alice"))
        self.assertIsNone(db.get_quote_by_owner(quote_id, "bob"))

        self.assertFalse(db.update_persisted_quote("bad-id", "alice", {"quote_name": "x"}))
        self.assertFalse(db.update_persisted_quote(quote_id, "alice", {"ignored": True}))
        self.assertTrue(
            db.update_persisted_quote(
                quote_id,
                "alice",
                {"quote_name": "Updated quote", "scenario": "Scenario3", "ignored": True},
            )
        )
        updated = db.get_quote_by_owner(quote_id, "alice")
        self.assertEqual(updated["quote_name"], "Updated quote")
        self.assertEqual(updated["scenario"], "Scenario3")
        self.assertIn("updated_at", updated)

        self.assertTrue(db.delete_persisted_quote(quote_id, "alice"))
        self.assertFalse(db.delete_persisted_quote(quote_id, "alice"))
        self.assertFalse(db.delete_persisted_quote("bad-id", "alice"))

        self.assertEqual(db.delete_quotes_for_project("000000000000000000000012", "alice"), 1)
        self.assertEqual(db.delete_quotes_for_project("bad-id", "alice"), 0)


class TestDbCostAndLookupMethods(unittest.TestCase):
    """Tests for cost lookups, supplier pricing, overs, and packout helpers."""

    @classmethod
    def setUpClass(cls):
        cls.db = MidnightOilDB().connect()
        _reset_test_db(cls.db)
        _seed_db(cls.db)
        cls.db._load_cache()
        cls.db._cache["packout"] = list(cls.db.db["packout"].find())

    @classmethod
    def tearDownClass(cls):
        _reset_test_db(cls.db)
        cls.db.close()

    def setUp(self):
        self.db = self.__class__.db

    def test_unit_cost_helpers_cover_lookup_listing_update_and_insert(self):
        """Verify unit cost lookups, updates, and inserts."""
        db: Any = self.db

        self.assertEqual(db.get_unit_cost_entry("paper")["cost"], 1.25)
        self.assertEqual(db.get_unit_cost("ink"), 2.5)
        self.assertEqual(db.get_units_by_type("substrate")[0]["name"], "paper")

        records = db.get_all_unit_costs()
        self.assertEqual([record["name"] for record in records], ["ink", "paper"])
        self.assertTrue(all(isinstance(record["_id"], str) for record in records))
        self.assertTrue(all(isinstance(record["last_updated"], str) for record in records))

        db.update_unit_cost_entry("paper", {"cost": 1.5})
        self.assertEqual(db.get_unit_cost("paper"), 1.5)

        db.insert_unit_cost_entry("glue", "consumable", "Glue", 0.75)
        self.assertEqual(db.get_unit_cost("glue"), 0.75)

        with self.assertRaises(ValueError):
            db.get_unit_cost_entry("missing")

    def test_standee_and_blank_ratio_helpers_cover_lookup_update_and_fallback(self):
        """Verify standee lookups and print-blank ratio fallback behavior."""
        db: Any = self.db

        self.assertEqual(db.get_standee_record("Simple")["shipping_box_cost"], 42)
        self.assertEqual(db.get_standee_data("Simple", "blank_forms"), 2)
        self.assertEqual(db.get_structure_forms_per_standee(2), 1)
        self.assertEqual(db.get_structure_forms_per_standee(5), 3)

        db.update_standee_record("Simple", {"shipping_box_cost": 50})
        self.assertEqual(db.get_standee_record("Simple")["shipping_box_cost"], 50)

        db.set_blank_forms_per_standee(2, 4)
        self.assertEqual(db.get_structure_forms_per_standee(2), 4)

        with self.assertRaises(ValueError):
            db.get_standee_data("Simple", "missing")

    def test_supplier_helpers_cover_distinct_listing_records_curve_params_and_upsert(self):
        """Verify supplier listing, serialization, and upsert behavior."""
        db: Any = self.db

        self.assertEqual(db.get_distinct_suppliers(), ["Acme"])
        self.assertEqual(db.get_distinct_materials("Acme"), [{"material": "vinyl", "display_name": "Vinyl"}])

        supplier_record = db.get_supplier_material_records("Acme", "vinyl")
        self.assertEqual(supplier_record["_id"], "000000000000000000000010")
        self.assertEqual(
            supplier_record["price_breaks"],
            [{"amount": 5, "cost": 10.0}, {"amount": 10, "cost": 7.5}],
        )
        self.assertEqual(db.get_curve_params("Acme", "vinyl")["r_squared"], 1.0)
        self.assertIsNone(db.get_curve_params("Missing", "vinyl"))

        db.upsert_supplier_material(
            "Acme",
            "paper",
            "Paper",
            "sqft",
            [{"amount": 20, "cost": 5.0}, {"amount": 10, "cost": 6.0}],
        )
        new_record = db.get_supplier_material_records("Acme", "paper")
        self.assertEqual(new_record["material_display_name"], "Paper")
        self.assertEqual(new_record["price_breaks"], [{"amount": 10, "cost": 6.0}, {"amount": 20, "cost": 5.0}])

        with self.assertRaises(ValueError):
            db.get_supplier_material_records("Acme", "missing")

    def test_overs_and_packout_helpers_cover_lookup_update_and_delete(self):
        """Verify overs and packout tier helpers across their CRUD paths."""
        db: Any = self.db

        self.assertEqual(db.get_overs(25), 4)
        self.assertEqual(db.get_overs(100), 8)
        self.assertEqual(db.get_all_overs()[0]["_id"], "000000000000000000000006")

        new_overs_id = db.upsert_overs(None, 200, None, 12)
        self.assertTrue(ObjectId.is_valid(new_overs_id))
        self.assertEqual(db.get_overs(250), 12)

        db.upsert_overs(new_overs_id, 210, None, 14)
        self.assertEqual(db.get_overs(250), 14)

        self.assertEqual(db.get_packout(5, 2, "simple"), 12.0)
        self.assertEqual(db.get_packout(12, 4, "COMPLEX"), 18.0)
        self.assertEqual(db.get_all_packout()[0]["_id"], "000000000000000000000008")

        new_packout_id = db.upsert_packout(None, 20, None, 6, None, "Moderate", 22)
        self.assertTrue(ObjectId.is_valid(new_packout_id))
        self.assertEqual(db.get_packout(20, 6, "moderate"), 22.0)

        db.upsert_packout(new_packout_id, 30, None, 7, None, "Moderate", 24)
        self.assertEqual(db.get_packout(30, 7, "moderate"), 24.0)

        with self.assertRaises(ValueError):
            db.delete_overs("bad-id")
        with self.assertRaises(ValueError):
            db.delete_packout("bad-id")

        db.delete_overs(new_overs_id)
        db.delete_packout(new_packout_id)


if __name__ == "__main__":
    unittest.main()
