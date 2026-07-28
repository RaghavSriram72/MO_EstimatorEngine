import os
import re
import unittest
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from unittest.mock import patch

# Force every connection in this test module onto a disposable database whose
# name ends in "_test". This MUST be set before any MidnightOilDB().connect()
# call. python-dotenv's load_dotenv() does not override existing env vars, so
# these values win even if .env defines SQL Server settings.
os.environ["SQLSERVER_CONN_STR"] = ""
os.environ["SQLSERVER_DATABASE"] = "MidnighOilEstimator_test"

import pyodbc  # noqa: E402

from lib.classes.db import MidnightOilDB, _fit_supplier_curve, _hash_password  # noqa: E402

SCHEMA_PATH = Path(__file__).resolve().parents[2] / "sql" / "create_tables.sql"

ELEMENT = {
    "name": "monkey",
    "length": 80.0,
    "width": 74.0,
    "linear_inches": None,
    "complexity": "Complex",
    "description": "Monkey cutout on front of standee",
    "mask_b64": None,
}


def _require_test_db(db: MidnightOilDB) -> None:
    """Hard safety guard: never run destructive setup against a non-test database.

    Raises if the configured database name does not end with ``_test``. This prevents
    accidentally wiping the real application database.
    """
    if not db.db_name.endswith("_test"):
        raise RuntimeError(
            f"Refusing to run db_test against database {db.db_name!r}: its name must end with '_test'. "
            "Set SQLSERVER_DATABASE to a disposable test database before running these tests."
        )


def _run_script(conn: pyodbc.Connection, script_path: Path) -> None:
    """Execute a T-SQL script batch-by-batch (batches separated by ``GO`` lines)."""
    sql_text = script_path.read_text(encoding="utf-8")
    cursor = conn.cursor()
    for batch in re.split(r"^\s*GO\s*$", sql_text, flags=re.MULTILINE | re.IGNORECASE):
        if batch.strip():
            cursor.execute(batch)
    conn.commit()


def _ensure_test_database_and_schema() -> None:
    """Create the ``*_test`` database (if missing) and apply the table schema."""
    probe = MidnightOilDB()
    _require_test_db(probe)
    master_str = re.sub(r"DATABASE=[^;]+", "DATABASE=master", probe.conn_str, flags=re.IGNORECASE)
    master = pyodbc.connect(master_str, autocommit=True)
    try:
        master.execute(f"IF DB_ID(N'{probe.db_name}') IS NULL CREATE DATABASE [{probe.db_name}]")
    finally:
        master.close()
    conn = pyodbc.connect(probe.conn_str, autocommit=False)
    try:
        _run_script(conn, SCHEMA_PATH)
    finally:
        conn.close()


def _reset_test_db(db: MidnightOilDB) -> None:
    """Empty every table in the connected test database, guarded by :func:`_require_test_db`."""
    _require_test_db(db)
    # projects cascades quotes/elements/history; supplier_materials cascades price breaks.
    for table in (
        "projects",
        "users",
        "unit_costs",
        "standee_static_costs",
        "print_blank_ratio",
        "supplier_materials",
        "overs",
        "packout",
    ):
        db._execute(f"DELETE FROM {table}")
    db.conn.commit()
    db._load_cache()


def _seed_db(db: MidnightOilDB) -> dict[str, str]:
    """Seed the disposable test database with baseline rows used by the tests."""
    _require_test_db(db)

    # users
    db._execute("INSERT INTO users (username, password_hash) VALUES (?, ?)", ("existing", "pw"))
    db._execute("INSERT INTO users (username, password_hash) VALUES (?, ?)", ("alice", "pw"))
    db.conn.commit()

    # projects
    project_id = db.insert_persisted_project(
        {
            "owner": "alice",
            "project_name": "Poster",
            "num_standees": 2,
            "standee_type": "Complex",
            "elements": [ELEMENT],
        }
    )

    # quotes ("First quote" attached to the seeded project)
    quote_id = db.insert_persisted_quote(
        {
            "owner": "alice",
            "project_id": project_id,
            "quote_name": "First quote",
            "scenario": 1,
            "num_standees": 2,
            "contribution_margin": 12.5,
            "standee_type": "Complex",
            "elements": [ELEMENT],
            "scenarios": {"1": {"defaults": {"total": 100}}},
            "universal": {"line_edits": {}},
            "params": {"current": {"num_standees": 2}},
            "breakdown": {"subtotal": 100},
            "created_at": datetime(2025, 1, 1, tzinfo=UTC),
            "updated_at": datetime(2025, 1, 1, tzinfo=UTC),
        }
    )

    # unit costs
    db.insert_unit_cost_entry("ink", "ink", "Ink", 2.5, unit="sqft")
    db.insert_unit_cost_entry("paper", "substrate", "Paper", 1.25, unit="sqft")

    # standee static costs
    db._execute(
        "INSERT INTO standee_static_costs (standee_type, hardware_cost, zund_blank_form_minutes) "
        "VALUES (?, ?, ?)",
        ("Simple Standee", 42, 2),
    )
    db.conn.commit()

    # print blank ratios
    db._execute("INSERT INTO print_blank_ratio (print_forms, blank_forms) VALUES (2, 1)")
    db._execute("INSERT INTO print_blank_ratio (print_forms, blank_forms) VALUES (5, 3)")
    db.conn.commit()

    # suppliers
    db.upsert_supplier_material(
        "Acme", "vinyl", "Vinyl", "sqft", [{"amount": 5, "cost": 10.0}, {"amount": 10, "cost": 7.5}]
    )

    # overs tiers
    overs_id = db.upsert_overs(None, 0, 49, 4)
    db.upsert_overs(None, 50, 199, 8)

    # packout tiers
    packout_id = db.upsert_packout(None, 0, 9, 0, 3, "simple", 12)
    db.upsert_packout(None, 10, None, 4, None, "COMPLEX", 18)

    db._load_cache()
    return {"project_id": project_id, "quote_id": quote_id, "overs_id": overs_id, "packout_id": packout_id}


class _DbTestCase(unittest.TestCase):
    """Shared setup: fresh schema, wiped tables, baseline seed rows."""

    ids: dict[str, str]

    @classmethod
    def setUpClass(cls):
        _ensure_test_database_and_schema()
        cls.db = MidnightOilDB().connect()
        _reset_test_db(cls.db)
        cls.ids = _seed_db(cls.db)

    @classmethod
    def tearDownClass(cls):
        _reset_test_db(cls.db)
        cls.db.close()

    def setUp(self):
        self.db = self.__class__.db


class TestDbHelpers(_DbTestCase):
    """Tests for the pure helpers and connection wiring in db.py."""

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

    def test_connect_targets_test_database_and_loads_cache(self):
        """Verify connect returns a usable MidnightOilDB instance on the test database."""
        self.assertIsNotNone(self.db.conn)
        self.assertTrue(self.db.db_name.endswith("_test"))
        self.assertIn("unit_costs", self.db._cache)
        self.assertIn("suppliers", self.db._cache)


class TestDbUserAndProjectMethods(_DbTestCase):
    """Tests for persisted project and user helpers."""

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

        project_id = db.insert_persisted_project(
            {
                "owner": "alice",
                "project_name": "New project",
                "num_standees": 2,
                "standee_type": "Complex",
                "elements": [ELEMENT, {**ELEMENT, "name": "banana"}],
            }
        )

        projects = db.list_projects_by_owner("alice")
        self.assertEqual([project["project_name"] for project in projects], ["New project", "Poster"])

        fetched = db.get_project_by_owner(project_id, "alice")
        self.assertEqual(fetched["project_name"], "New project")
        self.assertEqual(fetched["_id"], project_id)
        self.assertEqual([el["name"] for el in fetched["elements"]], ["monkey", "banana"])
        self.assertEqual(fetched["short_id"], f"{int(fetched['short_id']):08d}")
        self.assertIsNone(db.get_project_by_owner("bad-id", "alice"))
        self.assertIsNone(db.get_project_by_owner(project_id, "bob"))

        self.assertFalse(db.update_persisted_project("bad-id", "alice", {"project_name": "x"}))
        self.assertFalse(db.update_persisted_project(project_id, "alice", {"ignored": True}))
        self.assertTrue(
            db.update_persisted_project(
                project_id,
                "alice",
                {"project_name": "Updated project", "elements": [ELEMENT], "ignored": True},
            )
        )
        updated = db.get_project_by_owner(project_id, "alice")
        self.assertEqual(updated["project_name"], "Updated project")
        self.assertEqual(len(updated["elements"]), 1)

        # Deleting the project cascades to its quotes.
        quote_id = db.insert_persisted_quote(
            {
                "owner": "alice",
                "project_id": project_id,
                "quote_name": "Doomed quote",
                "scenario": 1,
                "num_standees": 1,
                "standee_type": "Simple",
                "elements": [ELEMENT],
            }
        )
        self.assertTrue(db.delete_persisted_project(project_id, "alice"))
        self.assertIsNone(db.get_project_by_owner(project_id, "alice"))
        self.assertIsNone(db.get_quote_by_owner(quote_id, "alice"))
        self.assertFalse(db.delete_persisted_project("bad-id", "alice"))

    def test_history_records_lists_and_reverts_project_changes(self):
        """Verify the append-only history trail and snapshot revert."""
        db: Any = self.db

        project_id = db.insert_persisted_project(
            {
                "owner": "alice",
                "project_name": "Hist project",
                "num_standees": 2,
                "standee_type": "Simple",
                "elements": [ELEMENT],
            }
        )
        db.update_persisted_project(
            project_id, "alice", {"project_name": "Renamed"}, changed_by="alice", change_type="rename"
        )

        history = db.list_project_history(project_id, "alice")
        self.assertEqual([entry["change_type"] for entry in history], ["rename", "create"])
        self.assertNotIn("snapshot", history[0])

        create_entry = db.get_history_entry(project_id, history[1]["_id"], "alice")
        self.assertEqual(create_entry["snapshot"]["project_name"], "Hist project")

        result = db.revert_history_entry(project_id, history[1]["_id"], "alice", changed_by="alice")
        self.assertEqual(result["entity_type"], "project")
        self.assertEqual(result["doc"]["project_name"], "Hist project")
        self.assertEqual(db.get_project_by_owner(project_id, "alice")["project_name"], "Hist project")

        history = db.list_project_history(project_id, "alice")
        self.assertEqual(history[0]["change_type"], "revert")
        self.assertEqual(history[0]["reverted_from_history_id"], create_entry["_id"])

        self.assertIsNone(db.get_history_entry(project_id, "bad-id", "alice"))
        self.assertIsNone(db.revert_history_entry(project_id, "bad-id", "alice", changed_by="alice"))

    def test_history_skips_saves_that_change_nothing_significant(self):
        """Verify no-op saves are dropped, and that a quote's `scenario` alone is a no-op."""
        db: Any = self.db

        project_id = db.insert_persisted_project(
            {
                "owner": "alice",
                "project_name": "Noop project",
                "num_standees": 2,
                "standee_type": "Simple",
                "elements": [ELEMENT],
            }
        )
        # Saving identical project content is not a new version.
        db.update_persisted_project(
            project_id,
            "alice",
            {"project_name": "Noop project", "num_standees": 2, "standee_type": "Simple", "elements": [ELEMENT]},
        )
        self.assertEqual([e["change_type"] for e in db.list_project_history(project_id, "alice")], ["create"])

        quote_id = db.insert_persisted_quote(
            {
                "owner": "alice",
                "project_id": project_id,
                "quote_name": "Noop quote",
                "scenario": 1,
                "num_standees": 2,
                "standee_type": "Simple",
                "elements": [ELEMENT],
            }
        )
        # `scenario` only records which tab was open, so switching tabs is not a new version.
        db.update_persisted_quote(quote_id, "alice", {"quote_name": "Noop quote", "scenario": 4})
        quote_entries = [
            e for e in db.list_project_history(project_id, "alice") if e["entity_type"] == "quote"
        ]
        self.assertEqual([e["change_type"] for e in quote_entries], ["create"])

        # A real edit still lands, and the project's own timeline is untouched by quote writes.
        db.update_persisted_quote(quote_id, "alice", {"quote_name": "Renamed quote"}, change_type="rename")
        history = db.list_project_history(project_id, "alice")
        self.assertEqual([e["change_type"] for e in history if e["entity_type"] == "quote"], ["rename", "create"])
        self.assertEqual([e["change_type"] for e in history if e["entity_type"] == "project"], ["create"])


class TestDbQuoteMethods(_DbTestCase):
    """Tests for persisted quote helpers."""

    def test_quote_helpers_cover_insert_list_get_update_and_delete(self):
        """Verify quote CRUD helpers, serialization, and ownership checks."""
        db: Any = self.db
        project_id = self.ids["project_id"]

        quote_id = db.insert_persisted_quote(
            {
                "owner": "alice",
                "project_id": project_id,
                "quote_name": "Second quote",
                "scenario": 2,
                "num_standees": 3,
                "contribution_margin": 20.0,
                "standee_type": "Complex",
                "elements": [ELEMENT],
                "scenarios": {"2": {"line_edits": {"die_cost": {"qty": 1, "unit_cost": 4}}}},
                "universal": {"subtotal_override": ""},
                "params": {"current": {"num_standees": 3}},
                "breakdown": {"subtotal": 200},
                "created_at": datetime(2026, 1, 9, 12, 0, tzinfo=UTC),
                "updated_at": datetime(2026, 1, 9, 13, 0, tzinfo=UTC),
            }
        )

        quotes = db.list_quotes_for_project(project_id, "alice")
        self.assertEqual([quote["quote_name"] for quote in quotes], ["Second quote", "First quote"])
        self.assertEqual(quotes[0]["project_id"], project_id)
        self.assertEqual(quotes[0]["created_at"], "2026-01-09T12:00:00+00:00")

        fetched = db.get_quote_by_owner(quote_id, "alice")
        self.assertEqual(fetched["_id"], quote_id)
        self.assertEqual(fetched["project_id"], project_id)
        self.assertEqual(fetched["updated_at"], "2026-01-09T13:00:00+00:00")
        self.assertEqual(fetched["scenarios"]["2"]["line_edits"]["die_cost"], {"qty": 1, "unit_cost": 4})
        self.assertEqual(fetched["breakdown"], {"subtotal": 200})
        self.assertEqual([el["name"] for el in fetched["elements"]], ["monkey"])
        self.assertIsNone(db.get_quote_by_owner("bad-id", "alice"))
        self.assertIsNone(db.get_quote_by_owner(quote_id, "bob"))

        self.assertFalse(db.update_persisted_quote("bad-id", "alice", {"quote_name": "x"}))
        self.assertFalse(db.update_persisted_quote(quote_id, "alice", {"ignored": True}))
        self.assertTrue(
            db.update_persisted_quote(
                quote_id,
                "alice",
                {"quote_name": "Updated quote", "scenario": 3, "ignored": True},
            )
        )
        updated = db.get_quote_by_owner(quote_id, "alice")
        self.assertEqual(updated["quote_name"], "Updated quote")
        self.assertEqual(updated["scenario"], 3)
        self.assertIn("updated_at", updated)

        self.assertTrue(db.delete_persisted_quote(quote_id, "alice"))
        self.assertFalse(db.delete_persisted_quote(quote_id, "alice"))
        self.assertFalse(db.delete_persisted_quote("bad-id", "alice"))

        self.assertEqual(db.delete_quotes_for_project(project_id, "alice"), 1)
        self.assertEqual(db.delete_quotes_for_project("bad-id", "alice"), 0)


class TestDbCostAndLookupMethods(_DbTestCase):
    """Tests for cost lookups, supplier pricing, overs, and packout helpers."""

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
        with self.assertRaises(ValueError):
            db.update_unit_cost_entry("paper", {"not_a_column": 1})

    def test_standee_and_blank_ratio_helpers_cover_lookup_update_and_fallback(self):
        """Verify standee lookups and print-blank ratio fallback behavior."""
        db: Any = self.db

        self.assertEqual(db.get_standee_record("Simple Standee")["hardware_cost"], 42)
        self.assertEqual(db.get_standee_data("Simple Standee", "zund_blank_form_minutes"), 2)
        self.assertEqual(db.get_structure_forms_per_standee(2), 1)
        self.assertEqual(db.get_structure_forms_per_standee(5), 3)
        # 4 has no exact row; the closest print_forms value (5) wins.
        self.assertEqual(db.get_structure_forms_per_standee(4), 3)

        db.update_standee_record("Simple Standee", {"hardware_cost": 50})
        self.assertEqual(db.get_standee_record("Simple Standee")["hardware_cost"], 50)

        db.set_blank_forms_per_standee(2, 4)
        self.assertEqual(db.get_structure_forms_per_standee(2), 4)

        with self.assertRaises(ValueError):
            db.get_standee_data("Simple Standee", "missing")
        with self.assertRaises(ValueError):
            db.update_standee_record("Simple Standee", {"missing": 1})

    def test_supplier_helpers_cover_distinct_listing_records_curve_params_and_upsert(self):
        """Verify supplier listing, serialization, and upsert behavior."""
        db: Any = self.db

        self.assertEqual(db.get_distinct_suppliers(), ["Acme"])
        self.assertEqual(db.get_distinct_materials("Acme"), [{"material": "vinyl", "display_name": "Vinyl"}])

        supplier_record = db.get_supplier_material_records("Acme", "vinyl")
        self.assertTrue(supplier_record["_id"].isdigit())
        self.assertEqual(
            supplier_record["price_breaks"],
            [{"amount": 5, "cost": 10.0}, {"amount": 10, "cost": 7.5}],
        )
        self.assertAlmostEqual(db.get_curve_params("Acme", "vinyl")["r_squared"], 1.0, places=4)
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
        self.assertEqual(db.get_all_overs()[0]["_id"], self.ids["overs_id"])

        new_overs_id = db.upsert_overs(None, 200, None, 12)
        self.assertTrue(new_overs_id.isdigit())
        self.assertEqual(db.get_overs(250), 12)

        db.upsert_overs(new_overs_id, 210, None, 14)
        self.assertEqual(db.get_overs(250), 14)

        self.assertEqual(db.get_packout(5, 2, "simple"), 12.0)
        self.assertEqual(db.get_packout(12, 4, "COMPLEX"), 18.0)
        self.assertEqual(db.get_all_packout()[0]["_id"], self.ids["packout_id"])

        new_packout_id = db.upsert_packout(None, 20, None, 6, None, "Moderate", 22)
        self.assertTrue(new_packout_id.isdigit())
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
