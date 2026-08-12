import hashlib
import json
import os
import re
import secrets
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import numpy as np
import pyodbc
from dotenv import load_dotenv
from scipy.optimize import curve_fit

from lib.globals import PROJECT_SHORT_ID_START

# Fields a caller may set via update_persisted_project / update_persisted_quote — also
# the field set snapshotted into a history entry's "snapshot" and restored on revert.
_PROJECT_UPDATE_ALLOWED_FIELDS = {"project_name", "num_standees", "standee_counts", "standee_type", "elements"}
_QUOTE_UPDATE_ALLOWED_FIELDS = {
    "quote_name",
    "breakdown",
    "scenarios",
    "universal",
    "params",
    "num_standees",
    "scenario",
    "standee_type",
    "elements",
    "contribution_margin",
    # Stamp of cost-table version when engine defaults were last refreshed (data-collector sync).
    "cost_tables_version",
}
# Subset of _QUOTE_UPDATE_ALLOWED_FIELDS that counts as "a real change" for history purposes.
# `scenario` only records which tab was last open and `breakdown` is a legacy blob that's
# always empty on new writes — neither is a change from the user's point of view, so a save
# that only touches these would otherwise still clutter the timeline as a no-op entry.
_QUOTE_HISTORY_SIGNIFICANT_FIELDS = _QUOTE_UPDATE_ALLOWED_FIELDS - {"scenario", "breakdown"}

# Scalar (single-column) subsets of the allowed fields; "elements" lives in its own
# child table and the quote JSON blobs are serialized before hitting their columns.
_PROJECT_SCALAR_FIELDS = ("project_name", "num_standees", "standee_type")
_PROJECT_JSON_FIELDS = ("standee_counts",)
_QUOTE_SCALAR_FIELDS = (
    "quote_name",
    "num_standees",
    "scenario",
    "standee_type",
    "contribution_margin",
    "cost_tables_version",
)
_QUOTE_JSON_FIELDS = ("quantity_variants", "scenarios", "universal", "params", "breakdown")

_ELEMENT_COLUMNS = ("name", "length", "width", "linear_inches", "complexity", "description", "mask_b64")

# Whitelist for the dynamic UPDATE in update_unit_cost_entry / kwargs in insert.
_UNIT_COST_COLUMNS = ("cost", "unit", "display_name", "type", "throughput", "throughput_unit", "setup_time")
_UNIT_COST_OPTIONAL_COLUMNS = ("setup_time", "throughput", "throughput_unit")

# Whitelist for the dynamic UPDATE in update_standee_record.
_STANDEE_COLUMNS = (
    "engineering_design_cost_per_project",
    "instruction_sheet_engineering_cost_per_project",
    "hardware_cost",
    "zund_print_form_minutes",
    "zund_blank_form_minutes",
    "instruction_sheet_total_cost",
    "cutting_die_inches_multiplier",
    "kitting_and_assembly",
    "cutting_die_blank_form_min",
    "cutting_die_print_form_min",
)


def _significant_history_fields(snapshot: dict[str, Any], entity_type: str) -> dict[str, Any]:
    """Subset of a history snapshot that counts as "a real change" for no-op detection."""
    if entity_type != "quote":
        return snapshot
    return {k: v for k, v in snapshot.items() if k in _QUOTE_HISTORY_SIGNIFICANT_FIELDS}


def _history_fingerprint(snapshot: dict[str, Any], entity_type: str) -> str:
    """Canonical JSON of a snapshot's significant fields, for no-op comparison.

    Comparing the JSON text rather than the dicts keeps a freshly built snapshot
    comparable to one that has already round-tripped through the ``history.snapshot``
    JSON column (where key order is arbitrary and non-JSON values were stringified).
    """
    return json.dumps(_significant_history_fields(snapshot, entity_type), sort_keys=True, default=str)


def _fit_supplier_curve(amounts: list[float], costs: list[float]) -> dict[str, float]:
    """Fit a power-law curve to supplier price breaks and return params plus R²."""
    x_values = np.asarray(amounts, dtype=float)
    y_values = np.asarray(costs, dtype=float)

    if len(x_values) == 0:
        return {"a": 0.0, "b": 0.0, "c": 0.0, "r_squared": 1.0}
    if len(x_values) == 1:
        value = float(y_values[0])
        return {"a": value, "b": 0.0, "c": 0.0, "r_squared": 1.0}
    if len(x_values) == 2:
        # Two price breaks cannot pin down three free parameters. curve_fit hits an
        # underdetermined system, gives up, and hands back its own starting guess — which
        # can score worse than a flat mean line. Pin c to 0 and solve a * x**b through both
        # points exactly instead; only fall through to the fit when the logs are undefined.
        (x0, x1), (y0, y1) = x_values, y_values
        if x0 > 0 and x1 > 0 and y0 > 0 and y1 > 0 and x0 != x1:
            b = float(np.log(y0 / y1) / np.log(x0 / x1))
            a = float(y0 / x0**b)
            return {"a": round(a, 6), "b": round(b, 6), "c": 0.0, "r_squared": 1.0}

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


def _parse_id(value: Any) -> int | None:
    """Parse an id passed in by the API (a string) into a row id, or None if invalid."""
    try:
        parsed = int(str(value))
    except (TypeError, ValueError):
        return None
    return parsed if parsed > 0 else None


def _to_db_datetime(value: datetime) -> datetime:
    """Normalize to a naive UTC datetime for a DATETIME2 column."""
    if value.tzinfo is not None:
        value = value.astimezone(UTC).replace(tzinfo=None)
    return value


def _from_db_datetime(value: Any) -> Any:
    """Re-attach UTC to a naive DATETIME2 value read from the database."""
    if isinstance(value, datetime) and value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value


class MidnightOilDB:
    """SQL Server data layer for the estimator (pyodbc)."""

    def __init__(self):
        load_dotenv()
        conn_str = os.getenv("SQLSERVER_CONN_STR")
        if not conn_str:
            driver = os.getenv("SQLSERVER_DRIVER", "ODBC Driver 18 for SQL Server")
            host = os.getenv("SQLSERVER_HOST", "localhost")
            database = os.getenv("SQLSERVER_DATABASE", "MidnighOilEstimator")
            user = os.getenv("SQLSERVER_USER")
            password = os.getenv("SQLSERVER_PASSWORD", "")
            parts = [f"DRIVER={{{driver}}}", f"SERVER={host}", f"DATABASE={database}"]
            if user:
                parts += [f"UID={user}", f"PWD={password}"]
            else:
                parts.append("Trusted_Connection=yes")
            parts.append("TrustServerCertificate=yes")
            conn_str = ";".join(parts)
        self.conn_str = conn_str
        match = re.search(r"DATABASE=([^;]+)", conn_str, re.IGNORECASE)
        self.db_name = match.group(1) if match else ""

    def connect(self):
        """Establish a connection to the SQL Server database."""
        self._cache: dict[str, list] = {}
        self.conn = pyodbc.connect(self.conn_str, autocommit=False)
        self._ensure_short_id_counter()
        self._backfill_quote_cost_table_versions()
        self._load_cache()
        return self

    def _backfill_quote_cost_table_versions(self) -> None:
        """Stamp quotes that predate fingerprinting (or hold a malformed stamp)."""
        fingerprint = self.get_cost_tables_version()
        for row in self._fetchall("SELECT quote_id, cost_tables_version FROM quotes"):
            stamp = row["cost_tables_version"]
            if isinstance(stamp, str) and len(stamp) == 24:
                continue
            self._execute(
                "UPDATE quotes SET cost_tables_version = ? WHERE quote_id = ?",
                (fingerprint, row["quote_id"]),
            )
        self.conn.commit()

    def _ensure_short_id_counter(self) -> None:
        """Seed the estimate-ID counter; remint hash-style short_ids to 10100, 10101, …"""
        needs_remint = (
            self._fetchone("SELECT seq FROM counters WHERE counter_id = 'project_short_id'") is None
        )
        if not needs_remint:
            for row in self._fetchall("SELECT short_id FROM projects WHERE short_id IS NOT NULL"):
                text = str(row["short_id"]).strip()
                if not text.isdigit() or int(text) < PROJECT_SHORT_ID_START or int(text) >= 1_000_000:
                    needs_remint = True
                    break
        if not needs_remint:
            return

        project_ids = [
            row["project_id"] for row in self._fetchall("SELECT project_id FROM projects ORDER BY project_id")
        ]
        n = PROJECT_SHORT_ID_START
        for project_id in project_ids:
            self._execute("UPDATE projects SET short_id = ? WHERE project_id = ?", (str(n), project_id))
            n += 1
        last_allocated = n - 1 if project_ids else PROJECT_SHORT_ID_START - 1
        updated = self._execute(
            "UPDATE counters SET seq = ? WHERE counter_id = 'project_short_id'", (last_allocated,)
        )
        if updated == 0:
            self._execute(
                "INSERT INTO counters (counter_id, seq) VALUES ('project_short_id', ?)", (last_allocated,)
            )
        self.conn.commit()

    def _allocate_project_short_id(self) -> str:
        """Return the next sequential estimate ID (10100, 10101, …)."""
        self._ensure_short_id_counter()
        row = self._fetchone(
            "UPDATE counters SET seq = seq + 1 OUTPUT INSERTED.seq WHERE counter_id = 'project_short_id'"
        )
        return str(int(row["seq"]))

    def get_cost_tables_version(self) -> str:
        """Return a stable fingerprint of all data-collector tables that affect estimates.

        Reverting a cost edit (e.g. 750 → 700 → 750) restores the same fingerprint, so
        quotes stamped at the original value are no longer marked stale.
        Row ids and ``last_updated`` timestamps are excluded so metadata-only
        changes do not matter.
        """

        def _norm(value: Any) -> Any:
            if isinstance(value, float) and value.is_integer():
                return int(value)
            if isinstance(value, dict):
                return {k: _norm(v) for k, v in value.items()}
            if isinstance(value, list):
                return [_norm(v) for v in value]
            if hasattr(value, "isoformat"):
                return value.isoformat()
            return value

        def _canon(rows: list[dict[str, Any]], drop: set[str]) -> list[dict[str, Any]]:
            out: list[dict[str, Any]] = []
            for row in rows:
                cleaned = {
                    k: _norm(v)
                    for k, v in row.items()
                    if k not in drop and not k.startswith("_")
                }
                out.append(cleaned)
            return sorted(out, key=lambda r: json.dumps(r, sort_keys=True, default=str))

        drop_meta = {"_id", "last_updated"}
        payload = {
            "unit_costs": _canon(self._load_unit_costs_cache(), drop_meta),
            "standee_static_costs": _canon(self._load_standee_cache(), drop_meta),
            "overs": _canon(self._load_overs_cache(), drop_meta),
            "packout": _canon(self._load_packout_cache(), drop_meta),
            "suppliers": _canon(self._load_suppliers_cache(), drop_meta),
            "print_blank_ratio": _canon(
                self._fetchall("SELECT print_forms, blank_forms FROM print_blank_ratio"), drop_meta
            ),
        }
        raw = json.dumps(payload, sort_keys=True, default=str, separators=(",", ":"))
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:24]

    def close(self):
        """Close the SQL Server connection."""
        self.conn.close()

    def __enter__(self):
        return self.connect()

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()

    # ------------------------------------------------------------------
    # Low-level helpers
    # ------------------------------------------------------------------

    def _fetchall(self, sql: str, params: tuple = ()) -> list[dict[str, Any]]:
        cursor = self.conn.cursor()
        try:
            cursor.execute(sql, params)
            columns = [col[0] for col in cursor.description]
            return [dict(zip(columns, row)) for row in cursor.fetchall()]
        finally:
            cursor.close()

    def _fetchone(self, sql: str, params: tuple = ()) -> dict[str, Any] | None:
        rows = self._fetchall(sql, params)
        return rows[0] if rows else None

    def _execute(self, sql: str, params: tuple = ()) -> int:
        """Execute a statement inside the current transaction; returns affected row count."""
        cursor = self.conn.cursor()
        try:
            cursor.execute(sql, params)
            return cursor.rowcount
        finally:
            cursor.close()

    def _insert_returning_id(self, sql: str, params: tuple = ()) -> int:
        """Execute an ``INSERT ... OUTPUT INSERTED.<id>`` statement and return the new id."""
        cursor = self.conn.cursor()
        try:
            cursor.execute(sql, params)
            return int(cursor.fetchone()[0])
        finally:
            cursor.close()

    @staticmethod
    def _diff_fields(old: dict[str, Any], new: dict[str, Any], fields: list[str]) -> dict[str, Any]:
        """Return ``{field: {"old": ..., "new": ...}}`` for just the fields that differ."""
        diff: dict[str, Any] = {}
        for field in fields:
            old_val, new_val = old.get(field), new.get(field)
            if old_val != new_val:
                diff[field] = {"old": old_val, "new": new_val}
        return diff

    def _log_data_collector_change(
        self,
        table_name: str,
        record_key: str,
        record_label: str,
        change_type: str,
        changed_by: str,
        changes: dict[str, Any],
    ) -> None:
        """Insert one Data Collector audit row (part of the caller's transaction). No-op if nothing changed."""
        if not changes:
            return
        self._execute(
            "INSERT INTO data_collector_history (table_name, record_key, record_label, change_type, "
            "changed_by, changes, created_at) VALUES (?, ?, ?, ?, ?, CAST(? AS NVARCHAR(MAX)), ?)",
            (
                table_name,
                record_key,
                record_label,
                change_type,
                changed_by,
                json.dumps(changes, default=str),
                _to_db_datetime(datetime.now(UTC)),
            ),
        )

    def get_data_collector_history(self, table_name: str, record_key: str | None = None) -> list[dict[str, Any]]:
        """Return Data Collector audit entries for one table (optionally one record), newest first."""
        sql = (
            "SELECT dc_history_id, record_key, record_label, change_type, changed_by, changes, created_at "
            "FROM data_collector_history WHERE table_name = ?"
        )
        params: tuple = (table_name,)
        if record_key is not None:
            sql += " AND record_key = ?"
            params = (table_name, record_key)
        sql += " ORDER BY created_at DESC, dc_history_id DESC"

        entries = []
        for row in self._fetchall(sql, params):
            created_at = _from_db_datetime(row["created_at"])
            entries.append(
                {
                    "_id": str(row["dc_history_id"]),
                    "record_key": row["record_key"],
                    "record_label": row["record_label"],
                    "change_type": row["change_type"],
                    "changed_by": row["changed_by"],
                    "changes": json.loads(row["changes"]) if row["changes"] else {},
                    "created_at": created_at.isoformat() if isinstance(created_at, datetime) else created_at,
                }
            )
        return entries

    def apply_schema(self, script_path: str | os.PathLike) -> None:
        """Run an idempotent T-SQL script (batches separated by ``GO`` lines)."""
        sql_text = Path(script_path).read_text(encoding="utf-8")
        for batch in re.split(r"^\s*GO\s*$", sql_text, flags=re.MULTILINE | re.IGNORECASE):
            if batch.strip():
                self._execute(batch)
        self.conn.commit()

    def _load_cache(self) -> None:
        self._cache["unit_costs"] = self._load_unit_costs_cache()
        self._cache["standee_static_costs"] = self._load_standee_cache()
        self._cache["print_blank_ratio"] = self._fetchall("SELECT print_forms, blank_forms FROM print_blank_ratio")
        self._cache["overs"] = self._load_overs_cache()
        self._cache["suppliers"] = self._load_suppliers_cache()
        self._cache["packout"] = self._load_packout_cache()

    def _load_unit_costs_cache(self) -> list[dict[str, Any]]:
        rows = self._fetchall(
            "SELECT unit_cost_id, name, [type], display_name, cost, unit, "
            "setup_time, throughput, throughput_unit, last_updated FROM unit_costs"
        )
        records = []
        for row in rows:
            record = {
                "_id": row["unit_cost_id"],
                "name": row["name"],
                "type": row["type"],
                "display_name": row["display_name"],
                "cost": row["cost"],
                "unit": row["unit"],
                "last_updated": _from_db_datetime(row["last_updated"]),
            }
            # Machine-only fields: keep them off non-machine records entirely.
            for key in _UNIT_COST_OPTIONAL_COLUMNS:
                if row[key] is not None:
                    record[key] = row[key]
            records.append(record)
        return records

    def _load_standee_cache(self) -> list[dict[str, Any]]:
        rows = self._fetchall("SELECT * FROM standee_static_costs")
        records = []
        for row in rows:
            record = dict(row)
            record["_id"] = record.pop("standee_static_cost_id")
            records.append(record)
        return records

    def _load_overs_cache(self) -> list[dict[str, Any]]:
        rows = self._fetchall("SELECT overs_id, lower_bound, upper_bound, overs, last_updated FROM overs")
        for row in rows:
            row["_id"] = row.pop("overs_id")
            row["last_updated"] = _from_db_datetime(row["last_updated"])
        return rows

    def _load_packout_cache(self) -> list[dict[str, Any]]:
        rows = self._fetchall(
            "SELECT packout_id, standees_lower_bound, standees_upper_bound, "
            "complexity, packout, last_updated FROM packout"
        )
        for row in rows:
            row["_id"] = row.pop("packout_id")
            row["last_updated"] = _from_db_datetime(row["last_updated"])
        return rows

    def _load_suppliers_cache(self) -> list[dict[str, Any]]:
        materials = self._fetchall(
            "SELECT supplier_material_id, supplier, material, material_display_name, material_type, "
            "unit, curve_a, curve_b, curve_c, curve_r_squared, last_updated FROM supplier_materials"
        )
        breaks = self._fetchall(
            "SELECT supplier_material_id, amount, cost FROM supplier_price_breaks ORDER BY amount"
        )
        breaks_by_material: dict[int, list[dict[str, float]]] = {}
        for row in breaks:
            breaks_by_material.setdefault(row["supplier_material_id"], []).append(
                {"amount": row["amount"], "cost": row["cost"]}
            )

        docs = []
        for mat in materials:
            material_id = mat["supplier_material_id"]
            curve_params = None
            if mat["curve_a"] is not None:
                curve_params = {
                    "a": mat["curve_a"],
                    "b": mat["curve_b"],
                    "c": mat["curve_c"],
                    "r_squared": mat["curve_r_squared"],
                }
            docs.append(
                {
                    "_id": material_id,
                    "supplier": mat["supplier"],
                    "material": mat["material"],
                    "material_display_name": mat["material_display_name"],
                    "type": mat["material_type"],
                    "unit": mat["unit"],
                    "price_breaks": breaks_by_material.get(material_id, []),
                    "curve_params": curve_params,
                    "last_updated": _from_db_datetime(mat["last_updated"]),
                }
            )
        return docs

    # ------------------------------------------------------------------
    # Users
    # ------------------------------------------------------------------

    def check_username_exists(self, username: str) -> bool:
        """Check if a username already exists in the users table."""
        return self._fetchone("SELECT 1 AS present FROM users WHERE username = ?", (username,)) is not None

    def create_user(self, username: str, password: str) -> bool:
        """Create a new user if the username doesn't already exist. Always starts as role 'user'."""
        if self.check_username_exists(username):
            return False

        self._execute(
            "INSERT INTO users (username, password_hash, role) VALUES (?, ?, N'user')",
            (username, _hash_password(password)),
        )
        self.conn.commit()
        return True

    def get_user(self, username: str):
        """Retrieve a user row by username."""
        return self._fetchone(
            "SELECT user_id, username, password_hash, role FROM users WHERE username = ?", (username,)
        )

    def get_user_role(self, username: str) -> str | None:
        """Return 'admin' or 'user' for a known username, or None if the username doesn't exist."""
        row = self._fetchone("SELECT role FROM users WHERE username = ?", (username,))
        return row["role"] if row is not None else None

    def list_users(self) -> list[dict[str, Any]]:
        """Return every user's username, role, and creation date, newest first."""
        rows = self._fetchall("SELECT username, role, created_at FROM users ORDER BY created_at DESC")
        for row in rows:
            row["created_at"] = _from_db_datetime(row["created_at"])
        return rows

    def count_admins(self) -> int:
        """Number of accounts currently holding the admin role."""
        row = self._fetchone("SELECT COUNT(*) AS n FROM users WHERE role = N'admin'")
        return row["n"] if row is not None else 0

    def set_user_role(self, username: str, role: str) -> bool:
        """Set a user's role to 'admin' or 'user'. Returns False if the username doesn't exist."""
        updated = self._execute("UPDATE users SET role = ? WHERE username = ?", (role, username))
        if updated > 0:
            self.conn.commit()
        return updated > 0

    # ------------------------------------------------------------------
    # History
    # ------------------------------------------------------------------

    def _latest_history_snapshot(
        self, project_id: int, entity_type: str, quote_id: int | None
    ) -> dict[str, Any] | None:
        """Snapshot of the newest history entry for one entity, or None if it has none."""
        # quote_id needs IS NULL rather than "= ?" for project entries, which have no quote.
        quote_clause = "quote_id = ?" if quote_id is not None else "quote_id IS NULL"
        params: tuple = (project_id, entity_type) + ((quote_id,) if quote_id is not None else ())
        row = self._fetchone(
            "SELECT TOP 1 CAST(snapshot AS NVARCHAR(MAX)) AS snapshot FROM history "
            f"WHERE project_id = ? AND entity_type = ? AND {quote_clause} "
            "ORDER BY created_at DESC, history_id DESC",
            params,
        )
        if row is None:
            return None
        return json.loads(row["snapshot"]) if row["snapshot"] else {}

    def _record_history(
        self,
        *,
        project_id: str,
        owner: str,
        entity_type: str,
        change_type: str,
        changed_by: str,
        label: str,
        snapshot: dict[str, Any],
        quote_id: str | None = None,
        scenario: int | None = None,
        reverted_from_history_id: str | None = None,
    ) -> None:
        """Append one history entry (no commit — runs inside the caller's transaction).

        ``changed_by`` is the ``changed_by`` query param on the write request — writes are
        scoped to ``(id, owner)`` for authorization, but anyone can edit another user's
        project, so the person who made the edit is tracked separately from the owner.

        Skips writing when nothing significant changed since the immediately-preceding
        entry for the same entity (the project itself, or one specific quote) — these are
        no-op saves (Save/Continue clicked with nothing to save, an autosave heartbeat that
        landed on identical content, etc.) and would otherwise clutter the timeline with
        entries showing no real difference. ``create``/``revert`` are always recorded:
        ``create`` never has a predecessor to compare against, and ``revert`` is an explicit,
        meaningful user action even on the rare occasion it restores an identical state.
        """
        row_project_id = int(project_id)
        row_quote_id = int(quote_id) if quote_id else None

        if change_type not in ("create", "revert"):
            latest = self._latest_history_snapshot(row_project_id, entity_type, row_quote_id)
            if latest is not None and _history_fingerprint(latest, entity_type) == _history_fingerprint(
                snapshot, entity_type
            ):
                return

        self._execute(
            "INSERT INTO history (project_id, owner, entity_type, quote_id, scenario, change_type, "
            "changed_by, label, snapshot, reverted_from_history_id, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS NVARCHAR(MAX)), ?, ?)",
            (
                row_project_id,
                owner,
                entity_type,
                row_quote_id,
                scenario,
                change_type,
                changed_by,
                label,
                json.dumps(snapshot, default=str),
                int(reverted_from_history_id) if reverted_from_history_id else None,
                _to_db_datetime(datetime.now(UTC)),
            ),
        )

    # ------------------------------------------------------------------
    # Elements (shared by projects and quotes)
    # ------------------------------------------------------------------

    def _replace_elements(self, table: str, fk_column: str, parent_id: int, elements: list[Any]) -> None:
        """Replace all element rows for one parent, preserving list order via ``position``."""
        self._execute(f"DELETE FROM {table} WHERE {fk_column} = ?", (parent_id,))
        for position, element in enumerate(elements):
            el = dict(element)
            self._execute(
                f"INSERT INTO {table} ({fk_column}, position, name, length, width, linear_inches, "
                "complexity, description, mask_b64) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    parent_id,
                    position,
                    el.get("name", ""),
                    el["length"],
                    el["width"],
                    el.get("linear_inches"),
                    el.get("complexity", "Simple"),
                    el.get("description", ""),
                    el.get("mask_b64"),
                ),
            )

    def _elements_by_parent(self, table: str, fk_column: str, parent_ids: list[int]) -> dict[int, list[dict]]:
        """Load ordered element dicts for a set of parent rows in one query."""
        if not parent_ids:
            return {}
        placeholders = ",".join("?" * len(parent_ids))
        rows = self._fetchall(
            f"SELECT {fk_column} AS parent_id, name, length, width, linear_inches, complexity, "
            f"description, mask_b64 FROM {table} WHERE {fk_column} IN ({placeholders}) "
            f"ORDER BY {fk_column}, position",
            tuple(parent_ids),
        )
        out: dict[int, list[dict]] = {}
        for row in rows:
            parent_id = row.pop("parent_id")
            out.setdefault(parent_id, []).append(row)
        return out

    # ------------------------------------------------------------------
    # Projects
    # ------------------------------------------------------------------

    def _project_rows_to_docs(self, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
        elements = self._elements_by_parent("project_elements", "project_id", [r["project_id"] for r in rows])
        docs = []
        for row in rows:
            project_id = row["project_id"]
            docs.append(
                {
                    "_id": str(project_id),
                    "schema_version": row["schema_version"],
                    "owner": row["owner"],
                    "project_name": row["project_name"],
                    "num_standees": row["num_standees"],
                    "standee_counts": json.loads(row["standee_counts"]) if row.get("standee_counts") else [],
                    "standee_type": row["standee_type"],
                    "short_id": row["short_id"].strip() if isinstance(row["short_id"], str) else row["short_id"],
                    "elements": elements.get(project_id, []),
                }
            )
        return docs

    def insert_persisted_project(self, doc: dict[str, Any], changed_by: str | None = None) -> tuple[str, str]:
        """Insert a canonical v1 project row; returns ``(project_id, short_id)``.

        ``changed_by`` defaults to the row's own ``owner`` (true for normal creation,
        where you can only create your own projects) but can be overridden — e.g. duplicating
        someone else's project creates a row owned by the duplicator, which already matches.
        """
        short_id = self._allocate_project_short_id()
        new_id = self._insert_returning_id(
            "INSERT INTO projects "
            "(owner, schema_version, project_name, num_standees, standee_counts, standee_type, short_id) "
            "OUTPUT INSERTED.project_id VALUES (?, ?, ?, ?, CAST(? AS NVARCHAR(MAX)), ?, ?)",
            (
                doc["owner"],
                doc.get("schema_version", 1),
                doc.get("project_name", "Untitled project"),
                doc["num_standees"],
                json.dumps(doc.get("standee_counts") or []),
                doc["standee_type"],
                short_id,
            ),
        )
        project_id = str(new_id)
        self._replace_elements("project_elements", "project_id", new_id, doc.get("elements", []))
        # Snapshot the row back out rather than the caller's input dict, so a "create"
        # snapshot has exactly the shape an "update" one does. Otherwise fields the caller
        # left to their column defaults are absent here but present on the next update,
        # and that difference alone makes the first save after a create look like an edit.
        persisted = self.get_project_by_owner(project_id, doc["owner"]) or doc
        self._record_history(
            project_id=project_id,
            owner=doc["owner"],
            entity_type="project",
            change_type="create",
            changed_by=changed_by or doc["owner"],
            label=doc.get("project_name", "Untitled project"),
            snapshot={k: persisted[k] for k in _PROJECT_UPDATE_ALLOWED_FIELDS if k in persisted},
        )
        self.conn.commit()
        return project_id, short_id

    def _ensure_project_short_id(self, doc: dict[str, Any]) -> dict[str, Any]:
        """Backfill ``short_id`` on legacy project rows (``doc['_id']`` must already be a str)."""
        if not doc.get("short_id"):
            doc["short_id"] = self._allocate_project_short_id()
            self._execute(
                "UPDATE projects SET short_id = ? WHERE project_id = ?", (doc["short_id"], int(doc["_id"]))
            )
            self.conn.commit()
        return doc

    def list_projects_by_owner(self, owner: str) -> list[dict[str, Any]]:
        """Return all project rows for an owner, newest ``_id`` first."""
        rows = self._fetchall(
            "SELECT project_id, owner, schema_version, project_name, num_standees, "
            "CAST(standee_counts AS NVARCHAR(MAX)) AS standee_counts, standee_type, short_id "
            "FROM projects WHERE owner = ? ORDER BY project_id DESC",
            (owner,),
        )
        return [self._ensure_project_short_id(doc) for doc in self._project_rows_to_docs(rows)]

    def list_all_projects(self) -> list[dict[str, Any]]:
        """Return every project row across all owners, newest ``_id`` first."""
        rows = self._fetchall(
            "SELECT project_id, owner, schema_version, project_name, num_standees, "
            "CAST(standee_counts AS NVARCHAR(MAX)) AS standee_counts, standee_type, short_id "
            "FROM projects ORDER BY project_id DESC"
        )
        return [self._ensure_project_short_id(doc) for doc in self._project_rows_to_docs(rows)]

    def get_project_by_owner(self, project_id: str, owner: str) -> dict[str, Any] | None:
        """Return one project row if it exists and belongs to ``owner``."""
        row_id = _parse_id(project_id)
        if row_id is None:
            return None
        row = self._fetchone(
            "SELECT project_id, owner, schema_version, project_name, num_standees, "
            "CAST(standee_counts AS NVARCHAR(MAX)) AS standee_counts, standee_type, short_id "
            "FROM projects WHERE project_id = ? AND owner = ?",
            (row_id, owner),
        )
        if row is None:
            return None
        return self._ensure_project_short_id(self._project_rows_to_docs([row])[0])

    def _apply_project_fields(self, row_id: int, fields: dict[str, Any]) -> None:
        """Write allowed project fields (scalars + elements) without recording history."""
        scalars = {k: fields[k] for k in _PROJECT_SCALAR_FIELDS if k in fields}
        if scalars:
            set_clause = ", ".join(f"{col} = ?" for col in scalars)
            self._execute(
                f"UPDATE projects SET {set_clause} WHERE project_id = ?", (*scalars.values(), row_id)
            )
        for col in _PROJECT_JSON_FIELDS:
            if col in fields:
                self._execute(
                    f"UPDATE projects SET {col} = CAST(? AS NVARCHAR(MAX)) WHERE project_id = ?",
                    (json.dumps(fields[col] or []), row_id),
                )
        if "elements" in fields:
            self._replace_elements("project_elements", "project_id", row_id, fields["elements"])

    def update_persisted_project(
        self,
        project_id: str,
        owner: str,
        fields: dict[str, Any],
        changed_by: str | None = None,
        change_type: str = "update",
    ) -> bool:
        """Update an existing project row."""
        row_id = _parse_id(project_id)
        if row_id is None:
            return False
        update_doc = {k: v for k, v in fields.items() if k in _PROJECT_UPDATE_ALLOWED_FIELDS}
        if not update_doc:
            return False
        exists = self._fetchone(
            "SELECT 1 AS present FROM projects WHERE project_id = ? AND owner = ?", (row_id, owner)
        )
        if exists is None:
            return False
        self._apply_project_fields(row_id, update_doc)
        full_doc = self.get_project_by_owner(project_id, owner)
        if full_doc is not None:
            self._record_history(
                project_id=project_id,
                owner=owner,
                entity_type="project",
                change_type=change_type,
                changed_by=changed_by or owner,
                label=full_doc.get("project_name", "Untitled project"),
                snapshot={k: full_doc[k] for k in _PROJECT_UPDATE_ALLOWED_FIELDS if k in full_doc},
            )
        self.conn.commit()
        return True

    def delete_persisted_project(self, project_id: str, owner: str) -> bool:
        """Delete a project if it exists and belongs to the owner asking to delete it.

        Elements, quotes, and history rows are removed by ``ON DELETE CASCADE``.
        """
        row_id = _parse_id(project_id)
        if row_id is None:
            return False
        deleted = self._execute("DELETE FROM projects WHERE project_id = ? AND owner = ?", (row_id, owner))
        self.conn.commit()
        return deleted > 0

    # ------------------------------------------------------------------
    # Quotes
    # ------------------------------------------------------------------

    _QUOTE_SELECT = (
        "SELECT quote_id, project_id, owner, schema_version, quote_name, scenario, num_standees, "
        "contribution_margin, standee_type, cost_tables_version, "
        "CAST(quantity_variants AS NVARCHAR(MAX)) AS quantity_variants, "
        "CAST(scenarios AS NVARCHAR(MAX)) AS scenarios, "
        "CAST(universal AS NVARCHAR(MAX)) AS universal, CAST(params AS NVARCHAR(MAX)) AS params, "
        "CAST(breakdown AS NVARCHAR(MAX)) AS breakdown, created_at, updated_at FROM quotes"
    )

    def _quote_rows_to_docs(self, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
        elements = self._elements_by_parent("quote_elements", "quote_id", [r["quote_id"] for r in rows])
        docs = []
        for row in rows:
            quote_id = row["quote_id"]
            doc = {
                "_id": str(quote_id),
                "schema_version": row["schema_version"],
                "owner": row["owner"],
                "project_id": str(row["project_id"]),
                "quote_name": row["quote_name"],
                "scenario": row["scenario"],
                "num_standees": row["num_standees"],
                "contribution_margin": row["contribution_margin"],
                "standee_type": row["standee_type"],
                "elements": elements.get(quote_id, []),
            }
            # Key omitted (not None) when unstamped, mirroring the pydantic models' exclude_none.
            if row["cost_tables_version"] is not None:
                doc["cost_tables_version"] = row["cost_tables_version"]
            for key in _QUOTE_JSON_FIELDS:
                doc[key] = json.loads(row[key]) if row[key] else {}
            for key in ("created_at", "updated_at"):
                value = _from_db_datetime(row[key])
                doc[key] = value.isoformat() if isinstance(value, datetime) else value
            docs.append(doc)
        return docs

    def insert_persisted_quote(self, doc: dict[str, Any], changed_by: str | None = None) -> str:
        """Insert a quote row.

        Caller supplies a plain dict (no ``Form`` objects); ``project_id`` is the parent
        project id as a string. Returns the new row id as a string. ``changed_by`` defaults
        to the row's own ``owner`` but can be overridden — e.g. auto-saving the first quote
        on someone else's project should attribute "Created" to the person who actually
        triggered it, not the project owner.
        """
        created_at = _to_db_datetime(doc.get("created_at") or datetime.now(UTC))
        updated_at = _to_db_datetime(doc.get("updated_at") or datetime.now(UTC))
        new_id = self._insert_returning_id(
            "INSERT INTO quotes (project_id, owner, schema_version, quote_name, scenario, num_standees, "
            "contribution_margin, standee_type, cost_tables_version, quantity_variants, scenarios, universal, params, "
            "breakdown, created_at, updated_at) "
            "OUTPUT INSERTED.quote_id VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, "
            "CAST(? AS NVARCHAR(MAX)), CAST(? AS NVARCHAR(MAX)), CAST(? AS NVARCHAR(MAX)), "
            "CAST(? AS NVARCHAR(MAX)), CAST(? AS NVARCHAR(MAX)), ?, ?)",
            (
                int(doc["project_id"]),
                doc["owner"],
                doc.get("schema_version", 2),
                doc.get("quote_name") or "Untitled quote",
                doc["scenario"],
                doc["num_standees"],
                doc.get("contribution_margin", 0),
                doc["standee_type"],
                doc.get("cost_tables_version"),
                json.dumps(doc.get("quantity_variants") or {}),
                json.dumps(doc.get("scenarios") or {}),
                json.dumps(doc.get("universal") or {}),
                json.dumps(doc.get("params") or {}),
                json.dumps(doc.get("breakdown") or {}),
                created_at,
                updated_at,
            ),
        )
        quote_id = str(new_id)
        self._replace_elements("quote_elements", "quote_id", new_id, doc.get("elements", []))
        # Snapshot the row back out rather than the caller's input dict — see the same note
        # in insert_persisted_project. It matters more here: a new quote is usually created
        # with no scenarios/universal/params and a defaulted contribution_margin, so those
        # four fields alone would otherwise turn the first real save into a phantom edit.
        persisted = self.get_quote_by_owner(quote_id, doc["owner"]) or doc
        self._record_history(
            project_id=str(doc["project_id"]),
            owner=doc["owner"],
            entity_type="quote",
            change_type="create",
            changed_by=changed_by or doc["owner"],
            # No "— Scenario N" suffix here: the history row already shows a "Quote · Scenario N" badge.
            label=doc.get("quote_name") or "Untitled quote",
            snapshot={k: persisted[k] for k in _QUOTE_UPDATE_ALLOWED_FIELDS if k in persisted},
            quote_id=quote_id,
            scenario=doc.get("scenario"),
        )
        self.conn.commit()
        return quote_id

    def get_quote_by_owner(self, quote_id: str, owner: str) -> dict[str, Any] | None:
        """Return one quote row if it exists and belongs to ``owner``."""
        row_id = _parse_id(quote_id)
        if row_id is None:
            return None
        row = self._fetchone(f"{self._QUOTE_SELECT} WHERE quote_id = ? AND owner = ?", (row_id, owner))
        if row is None:
            return None
        return self._quote_rows_to_docs([row])[0]

    def list_quotes_for_project(self, project_id: str, owner: str) -> list[dict[str, Any]]:
        """Return all quote rows for ``project_id`` that belong to ``owner``, newest ``_id`` first."""
        row_id = _parse_id(project_id)
        if row_id is None:
            return []
        rows = self._fetchall(
            f"{self._QUOTE_SELECT} WHERE project_id = ? AND owner = ? ORDER BY quote_id DESC",
            (row_id, owner),
        )
        return self._quote_rows_to_docs(rows)

    def list_all_quotes(self) -> list[dict[str, Any]]:
        """Return every quote row across all owners, newest ``_id`` first."""
        rows = self._fetchall(f"{self._QUOTE_SELECT} ORDER BY quote_id DESC")
        return self._quote_rows_to_docs(rows)

    def list_quote_notes(self, quote_id: str, owner: str) -> list[dict[str, Any]] | None:
        """Return a quote's notes oldest-first, or ``None`` when the owned quote does not exist."""
        row_id = _parse_id(quote_id)
        if row_id is None:
            return None
        exists = self._fetchone(
            "SELECT 1 AS present FROM quotes WHERE quote_id = ? AND owner = ?", (row_id, owner)
        )
        if exists is None:
            return None
        rows = self._fetchall(
            "SELECT note_id, author, body, created_at FROM quote_notes "
            "WHERE quote_id = ? ORDER BY created_at ASC, note_id ASC",
            (row_id,),
        )
        notes: list[dict[str, Any]] = []
        for row in rows:
            created_at = _from_db_datetime(row["created_at"])
            notes.append(
                {
                    "note_id": str(row["note_id"]),
                    "author": row["author"],
                    "body": row["body"],
                    "created_at": created_at.isoformat() if isinstance(created_at, datetime) else created_at,
                }
            )
        return notes

    def insert_quote_note(self, quote_id: str, owner: str, author: str, body: str) -> dict[str, Any] | None:
        """Append a note to an owned quote, returning it or ``None`` when the quote is absent."""
        row_id = _parse_id(quote_id)
        if row_id is None:
            return None
        exists = self._fetchone(
            "SELECT 1 AS present FROM quotes WHERE quote_id = ? AND owner = ?", (row_id, owner)
        )
        if exists is None:
            return None
        created_at = datetime.now(UTC)
        note_id = self._insert_returning_id(
            "INSERT INTO quote_notes (quote_id, author, body, created_at) "
            "OUTPUT INSERTED.note_id VALUES (?, ?, ?, ?)",
            (row_id, author, body, _to_db_datetime(created_at)),
        )
        self.conn.commit()
        return {
            "note_id": str(note_id),
            "author": author,
            "body": body,
            "created_at": created_at.isoformat(),
        }

    def _apply_quote_fields(self, row_id: int, fields: dict[str, Any], updated_at: datetime) -> None:
        """Write allowed quote fields (scalars + JSON blobs + elements) without recording history."""
        assignments: list[str] = []
        values: list[Any] = []
        for col in _QUOTE_SCALAR_FIELDS:
            if col in fields:
                assignments.append(f"{col} = ?")
                values.append(fields[col])
        for col in _QUOTE_JSON_FIELDS:
            if col in fields:
                assignments.append(f"{col} = CAST(? AS NVARCHAR(MAX))")
                values.append(json.dumps(fields[col] or {}))
        assignments.append("updated_at = ?")
        values.append(_to_db_datetime(updated_at))
        self._execute(f"UPDATE quotes SET {', '.join(assignments)} WHERE quote_id = ?", (*values, row_id))
        if "elements" in fields:
            self._replace_elements("quote_elements", "quote_id", row_id, fields["elements"])

    def update_persisted_quote(
        self,
        quote_id: str,
        owner: str,
        fields: dict[str, Any],
        changed_by: str | None = None,
        change_type: str = "update",
    ) -> bool:
        """Update allowed fields on a quote owned by ``owner``."""
        row_id = _parse_id(quote_id)
        if row_id is None:
            return False
        update_doc_final = {k: v for k, v in fields.items() if k in _QUOTE_UPDATE_ALLOWED_FIELDS}
        if not update_doc_final:
            return False
        exists = self._fetchone(
            "SELECT 1 AS present FROM quotes WHERE quote_id = ? AND owner = ?", (row_id, owner)
        )
        if exists is None:
            return False
        self._apply_quote_fields(row_id, update_doc_final, datetime.now(UTC))
        full_doc = self.get_quote_by_owner(quote_id, owner)
        if full_doc is not None:
            self._record_history(
                project_id=full_doc["project_id"],
                owner=owner,
                entity_type="quote",
                change_type=change_type,
                changed_by=changed_by or owner,
                # No "— Scenario N" suffix here: the history row already shows a "Quote · Scenario N" badge.
                label=full_doc.get("quote_name") or "Untitled quote",
                snapshot={k: full_doc[k] for k in _QUOTE_UPDATE_ALLOWED_FIELDS if k in full_doc},
                quote_id=quote_id,
                scenario=full_doc.get("scenario"),
            )
        self.conn.commit()
        return True

    def delete_persisted_quote(self, quote_id: str, owner: str) -> bool:
        """Delete one quote if it exists and belongs to ``owner``."""
        row_id = _parse_id(quote_id)
        if row_id is None:
            return False
        deleted = self._execute("DELETE FROM quotes WHERE quote_id = ? AND owner = ?", (row_id, owner))
        self.conn.commit()
        return deleted > 0

    def delete_quotes_for_project(self, project_id: str, owner: str) -> int:
        """Remove all quotes linked to ``project_id`` for ``owner``. Returns deleted count."""
        row_id = _parse_id(project_id)
        if row_id is None:
            return 0
        deleted = self._execute("DELETE FROM quotes WHERE project_id = ? AND owner = ?", (row_id, owner))
        self.conn.commit()
        return deleted

    # ------------------------------------------------------------------
    # History queries
    # ------------------------------------------------------------------

    @staticmethod
    def _history_row_to_doc(row: dict[str, Any]) -> dict[str, Any]:
        doc = {
            "_id": str(row["history_id"]),
            "project_id": str(row["project_id"]),
            "owner": row["owner"],
            "entity_type": row["entity_type"],
            "quote_id": str(row["quote_id"]) if row["quote_id"] else None,
            "scenario": row["scenario"],
            "change_type": row["change_type"],
            "changed_by": row["changed_by"],
            "label": row["label"],
            "reverted_from_history_id": (
                str(row["reverted_from_history_id"]) if row["reverted_from_history_id"] else None
            ),
        }
        created_at = _from_db_datetime(row["created_at"])
        doc["created_at"] = created_at.isoformat() if isinstance(created_at, datetime) else created_at
        if "snapshot" in row:
            doc["snapshot"] = json.loads(row["snapshot"]) if row["snapshot"] else {}
        return doc

    def list_project_history(self, project_id: str, owner: str) -> list[dict[str, Any]]:
        """Combined project+quote history for a project, metadata only (no ``snapshot``), newest first.

        Drops entries with nothing significant changed from the immediately-preceding entry
        for the same entity (the project itself, or one specific quote) — legacy no-op saves
        that predate the write-time skip in ``_record_history`` would otherwise still clutter
        the timeline. Each entity's first ("create") entry, and any ``revert``, always survives.
        """
        row_id = _parse_id(project_id)
        if row_id is None:
            return []
        # history_id is a tiebreak: identity values are monotonically increasing even when
        # two entries share the same ``created_at`` timestamp, so this keeps "which one is
        # newest" deterministic (load-bearing for picking the single "current version").
        rows = self._fetchall(
            "SELECT history_id, project_id, owner, entity_type, quote_id, scenario, change_type, "
            "changed_by, label, CAST(snapshot AS NVARCHAR(MAX)) AS snapshot, reverted_from_history_id, "
            "created_at FROM history WHERE project_id = ? AND owner = ? "
            "ORDER BY created_at DESC, history_id DESC",
            (row_id, owner),
        )

        # Group by entity (the project itself, or one specific quote), preserving the
        # newest-first order so each entry can be compared to the next OLDER one sharing
        # its entity key.
        groups: dict[tuple[str, str | None], list[dict[str, Any]]] = {}
        for row in rows:
            key = (row["entity_type"], str(row["quote_id"]) if row["quote_id"] else None)
            groups.setdefault(key, []).append(row)

        excluded_ids = set()
        for group in groups.values():
            for newer, older in zip(group, group[1:]):
                if newer["change_type"] in ("create", "revert"):
                    continue
                newer_snapshot = json.loads(newer["snapshot"]) if newer["snapshot"] else {}
                older_snapshot = json.loads(older["snapshot"]) if older["snapshot"] else {}
                if _history_fingerprint(newer_snapshot, newer["entity_type"]) == _history_fingerprint(
                    older_snapshot, older["entity_type"]
                ):
                    excluded_ids.add(newer["history_id"])

        out: list[dict[str, Any]] = []
        for row in rows:
            if row["history_id"] in excluded_ids:
                continue
            doc = self._history_row_to_doc(row)
            doc.pop("snapshot", None)
            out.append(doc)
        return out

    def get_history_entry(self, project_id: str, history_id: str, owner: str) -> dict[str, Any] | None:
        """Return one history entry including its full ``snapshot``, for the preview pane."""
        pid = _parse_id(project_id)
        hid = _parse_id(history_id)
        if pid is None or hid is None:
            return None
        row = self._fetchone(
            "SELECT history_id, project_id, owner, entity_type, quote_id, scenario, change_type, "
            "changed_by, label, CAST(snapshot AS NVARCHAR(MAX)) AS snapshot, reverted_from_history_id, "
            "created_at FROM history WHERE history_id = ? AND project_id = ? AND owner = ?",
            (hid, pid, owner),
        )
        if row is None:
            return None
        return self._history_row_to_doc(row)

    def revert_history_entry(
        self, project_id: str, history_id: str, owner: str, changed_by: str
    ) -> dict[str, Any] | None:
        """Restore a past snapshot as the current state of its project or quote.

        Records a new ``"revert"`` history entry rather than mutating or removing
        the entry being reverted to — the audit trail is append-only.
        """
        entry = self.get_history_entry(project_id, history_id, owner)
        if entry is None:
            return None
        pid = _parse_id(project_id)

        if entry["entity_type"] == "project":
            restorable = {k: v for k, v in entry["snapshot"].items() if k in _PROJECT_UPDATE_ALLOWED_FIELDS}
            exists = self._fetchone(
                "SELECT 1 AS present FROM projects WHERE project_id = ? AND owner = ?", (pid, owner)
            )
            if exists is None:
                return None
            self._apply_project_fields(pid, restorable)
            full_doc = self.get_project_by_owner(project_id, owner)
            if full_doc is None:
                return None
            self._record_history(
                project_id=project_id,
                owner=owner,
                entity_type="project",
                change_type="revert",
                changed_by=changed_by,
                label=full_doc.get("project_name", "Untitled project"),
                snapshot={k: full_doc[k] for k in _PROJECT_UPDATE_ALLOWED_FIELDS if k in full_doc},
                reverted_from_history_id=history_id,
            )
            self.conn.commit()
            return {"entity_type": "project", "quote_id": None, "doc": full_doc}

        quote_id = entry["quote_id"]
        qid = _parse_id(quote_id)
        restorable = {k: v for k, v in entry["snapshot"].items() if k in _QUOTE_UPDATE_ALLOWED_FIELDS}
        exists = self._fetchone(
            "SELECT 1 AS present FROM quotes WHERE quote_id = ? AND owner = ?", (qid, owner)
        )
        if exists is None:
            return None
        self._apply_quote_fields(qid, restorable, datetime.now(UTC))
        full_doc = self.get_quote_by_owner(quote_id, owner)
        if full_doc is None:
            return None
        self._record_history(
            project_id=project_id,
            owner=owner,
            entity_type="quote",
            change_type="revert",
            changed_by=changed_by,
            # No "— Scenario N" suffix here: the history row already shows a "Quote · Scenario N" badge.
            label=full_doc.get("quote_name") or "Untitled quote",
            snapshot={k: full_doc[k] for k in _QUOTE_UPDATE_ALLOWED_FIELDS if k in full_doc},
            quote_id=quote_id,
            scenario=full_doc.get("scenario"),
            reverted_from_history_id=history_id,
        )
        self.conn.commit()
        return {"entity_type": "quote", "quote_id": quote_id, "doc": full_doc}

    # ------------------------------------------------------------------
    # Unit costs
    # ------------------------------------------------------------------

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
        for cached in sorted(self._cache["unit_costs"], key=lambda x: (x["type"], x["display_name"])):
            r = dict(cached)
            r["_id"] = str(r["_id"])
            if "last_updated" in r and hasattr(r["last_updated"], "isoformat"):
                r["last_updated"] = r["last_updated"].isoformat()
            records.append(r)
        return records

    def get_units_by_type(self, cost_type: str) -> list[dict[str, float]]:
        """Return the unit cost for a given cost name and type."""
        return [entry for entry in self._cache["unit_costs"] if entry["type"] == cost_type]

    def update_unit_cost_entry(self, cost_name: str, updates: dict, changed_by: str) -> None:
        """Update arbitrary fields on a unit cost record, stamping last_updated."""
        if not updates:
            return
        try:
            before = next((r for r in self._cache["unit_costs"] if r["name"] == cost_name), None)
            assignments = []
            values = []
            for key, value in updates.items():
                if key not in _UNIT_COST_COLUMNS:
                    raise ValueError(f"Unknown unit cost field '{key}'")
                assignments.append(f"[{key}] = ?")
                values.append(value)
            assignments.append("last_updated = ?")
            values.append(_to_db_datetime(datetime.now(UTC)))
            self._execute(
                f"UPDATE unit_costs SET {', '.join(assignments)} WHERE name = ?", (*values, cost_name)
            )
            if before is not None:
                diff = self._diff_fields(before, updates, list(updates.keys()))
                self._log_data_collector_change(
                    "unit_costs", cost_name, before.get("display_name") or cost_name, "update", changed_by, diff
                )
            self.conn.commit()
            self._load_cache()
        except ValueError:
            raise
        except Exception as e:
            raise ValueError(f"Failed to update entry for '{cost_name}': {str(e)}")

    def insert_unit_cost_entry(self, cost_name: str, cost_type: str, display_name: str, cost: float, **kwargs) -> None:
        """Insert a new unit cost entry."""
        try:
            extras = {k: v for k, v in kwargs.items() if k in _UNIT_COST_OPTIONAL_COLUMNS or k == "unit"}
            columns = ["name", "[type]", "display_name", "cost", "unit", "last_updated"]
            values = [
                cost_name,
                cost_type,
                display_name,
                cost,
                extras.pop("unit", "each"),
                _to_db_datetime(datetime.now(UTC)),
            ]
            for key, value in extras.items():
                columns.append(f"[{key}]")
                values.append(value)
            placeholders = ", ".join("?" * len(values))
            self._execute(
                f"INSERT INTO unit_costs ({', '.join(columns)}) VALUES ({placeholders})", tuple(values)
            )
            self.conn.commit()
            self._load_cache()
        except Exception as e:
            raise ValueError(f"Failed to insert entry for '{cost_name}': {str(e)}")

    # ------------------------------------------------------------------
    # Standee static costs
    # ------------------------------------------------------------------

    def get_standee_record(self, standee_category: str) -> dict:
        """Return the full standee static cost record for a given category."""
        record = next(
            (entry for entry in self._cache["standee_static_costs"] if entry["standee_type"] == standee_category), None
        )
        if record:
            record = dict(record)
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

    def update_standee_record(self, standee_category: str, updates: dict, changed_by: str) -> None:
        """Update arbitrary numeric fields on a standee static cost record."""
        if not updates:
            return
        try:
            before = next(
                (r for r in self._cache["standee_static_costs"] if r["standee_type"] == standee_category), None
            )
            assignments = []
            values = []
            for key, value in updates.items():
                if key not in _STANDEE_COLUMNS:
                    raise ValueError(f"Unknown standee field '{key}'")
                assignments.append(f"{key} = ?")
                values.append(value)
            self._execute(
                f"UPDATE standee_static_costs SET {', '.join(assignments)} WHERE standee_type = ?",
                (*values, standee_category),
            )
            if before is not None:
                diff = self._diff_fields(before, updates, list(updates.keys()))
                self._log_data_collector_change(
                    "standee_static_costs", standee_category, standee_category, "update", changed_by, diff
                )
            self.conn.commit()
            self._load_cache()
        except ValueError:
            raise
        except Exception as e:
            raise ValueError(f"Failed to update standee record for '{standee_category}': {str(e)}")

    # ------------------------------------------------------------------
    # Print blank ratio
    # ------------------------------------------------------------------

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
        """Set the current print blank ratio (inserts the row when the ratio is new)."""
        try:
            updated = self._execute(
                "UPDATE print_blank_ratio SET blank_forms = ? WHERE print_forms = ?",
                (blank_forms, print_forms),
            )
            if updated == 0:
                self._execute(
                    "INSERT INTO print_blank_ratio (print_forms, blank_forms) VALUES (?, ?)",
                    (print_forms, blank_forms),
                )
            self.conn.commit()
            self._load_cache()
        except Exception as e:
            raise ValueError(f"Failed to set print blank ratio: {str(e)}")

    # ------------------------------------------------------------------
    # Suppliers
    # ------------------------------------------------------------------

    def get_distinct_suppliers(self) -> list[str]:
        """Return all distinct supplier names."""
        return sorted({r["supplier"] for r in self._cache["suppliers"]})

    def get_distinct_materials(self, supplier: str) -> list[dict]:
        """Return distinct materials for a supplier, deduplicated by material key."""
        seen: dict[str, dict] = {}
        for r in self._cache["suppliers"]:
            if r["supplier"] == supplier and r["material"] not in seen:
                seen[r["material"]] = {
                    "material": r["material"],
                    "display_name": r["material_display_name"],
                }
        return sorted(seen.values(), key=lambda x: x["material"])

    def _get_supplier_doc(self, supplier: str, material: str, material_type: str = "") -> dict[str, Any] | None:
        """Return one supplier/material record from cache, optionally filtered by type."""
        matches = [
            r for r in self._cache["suppliers"] if r["supplier"] == supplier and r["material"] == material
        ]
        if not matches:
            return None
        if material_type:
            for r in matches:
                if r.get("type", "") == material_type:
                    return r
            return None
        # Untyped lookup: prefer records with no ``type`` value, else first match.
        for r in matches:
            if not r.get("type", ""):
                return r
        return matches[0]

    def get_supplier_material_records(self, supplier: str, material: str, material_type: str = "") -> dict[str, Any]:
        """Return one supplier/material record with serialized price_breaks."""
        doc = self._get_supplier_doc(supplier, material, material_type)
        if doc is None:
            raise ValueError(
                f"Supplier material not found for supplier={supplier!r} material={material!r} type={material_type!r}"
            )

        last_updated = doc.get("last_updated")
        if last_updated is not None and hasattr(last_updated, "isoformat"):
            last_updated = last_updated.isoformat()

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
            "material_type": doc.get("type", ""),
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
        changed_by: str,
        material_type: str = "",
    ) -> None:
        """Insert or replace a supplier/material record and precompute curve parameters."""
        ordered_breaks = sorted(price_breaks, key=lambda row: row["amount"])

        amounts = [row["amount"] for row in ordered_breaks]
        costs = [row["cost"] for row in ordered_breaks]
        curve_params = _fit_supplier_curve(amounts, costs)

        record_key = f"{supplier}|{material}|{material_type}"
        label = f"{supplier} · {material}" + (f" ({material_type})" if material_type else "")
        before = self._get_supplier_doc(supplier, material, material_type)

        now = _to_db_datetime(datetime.now(UTC))
        existing = self._fetchone(
            "SELECT supplier_material_id FROM supplier_materials "
            "WHERE supplier = ? AND material = ? AND material_type = ?",
            (supplier, material, material_type),
        )
        if existing:
            material_id = existing["supplier_material_id"]
            self._execute(
                "UPDATE supplier_materials SET material_display_name = ?, unit = ?, curve_a = ?, "
                "curve_b = ?, curve_c = ?, curve_r_squared = ?, last_updated = ? "
                "WHERE supplier_material_id = ?",
                (
                    material_display_name,
                    unit,
                    curve_params["a"],
                    curve_params["b"],
                    curve_params["c"],
                    curve_params["r_squared"],
                    now,
                    material_id,
                ),
            )
            self._execute(
                "DELETE FROM supplier_price_breaks WHERE supplier_material_id = ?", (material_id,)
            )
        else:
            material_id = self._insert_returning_id(
                "INSERT INTO supplier_materials (supplier, material, material_display_name, material_type, "
                "unit, curve_a, curve_b, curve_c, curve_r_squared, last_updated) "
                "OUTPUT INSERTED.supplier_material_id VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    supplier,
                    material,
                    material_display_name,
                    material_type,
                    unit,
                    curve_params["a"],
                    curve_params["b"],
                    curve_params["c"],
                    curve_params["r_squared"],
                    now,
                ),
            )
        for price_break in ordered_breaks:
            self._execute(
                "INSERT INTO supplier_price_breaks (supplier_material_id, amount, cost) VALUES (?, ?, ?)",
                (material_id, price_break["amount"], price_break["cost"]),
            )

        new_price_breaks = [{"amount": b["amount"], "cost": b["cost"]} for b in ordered_breaks]
        diff: dict[str, Any] = {}
        if before is None:
            diff["display_name"] = {"old": None, "new": material_display_name}
            diff["unit"] = {"old": None, "new": unit}
            diff["price_breaks"] = {"old": None, "new": new_price_breaks}
        else:
            if before.get("material_display_name") != material_display_name:
                diff["display_name"] = {"old": before.get("material_display_name"), "new": material_display_name}
            if before.get("unit") != unit:
                diff["unit"] = {"old": before.get("unit"), "new": unit}
            old_breaks = sorted(
                ({"amount": b.get("amount"), "cost": b.get("cost")} for b in before.get("price_breaks", [])),
                key=lambda b: b["amount"],
            )
            if old_breaks != new_price_breaks:
                diff["price_breaks"] = {"old": old_breaks, "new": new_price_breaks}
        self._log_data_collector_change(
            "suppliers", record_key, label, "update" if before is not None else "create", changed_by, diff
        )

        self.conn.commit()
        self._load_cache()

    def get_curve_params(self, supplier: str, material: str, material_type: str = "") -> dict[str, float] | None:
        """Return precomputed curve params for a supplier/material pair."""
        doc = self._get_supplier_doc(supplier, material, material_type)
        return doc.get("curve_params") if doc else None

    # ------------------------------------------------------------------
    # Overs
    # ------------------------------------------------------------------

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
        for cached in sorted(self._cache["overs"], key=lambda x: x["lower_bound"]):
            r = dict(cached)
            r["_id"] = str(r["_id"])
            if "last_updated" in r and hasattr(r["last_updated"], "isoformat"):
                r["last_updated"] = r["last_updated"].isoformat()
            records.append(r)
        return records

    @staticmethod
    def _overs_label(lower_bound: int, upper_bound: int | None) -> str:
        return f"{lower_bound}–{upper_bound if upper_bound is not None else '∞'}"

    def upsert_overs(
        self, record_id: str | None, lower_bound: int, upper_bound: int | None, overs: int, changed_by: str
    ) -> str:
        """Upsert an overs tier record. Inserts a new row when record_id is None."""
        now = _to_db_datetime(datetime.now(UTC))
        new_fields = {"lower_bound": lower_bound, "upper_bound": upper_bound, "overs": overs}
        if record_id is not None:
            row_id = _parse_id(record_id)
            if row_id is None:
                raise ValueError(f"Invalid overs record id '{record_id}'")
            before = next((r for r in self._cache["overs"] if str(r["_id"]) == str(row_id)), None)
            updated = self._execute(
                "UPDATE overs SET lower_bound = ?, upper_bound = ?, overs = ?, last_updated = ? "
                "WHERE overs_id = ?",
                (lower_bound, upper_bound, overs, now, row_id),
            )
            if updated == 0:
                raise ValueError(f"Overs record not found for id '{record_id}'")
            if before is not None:
                diff = self._diff_fields(before, new_fields, list(new_fields.keys()))
                self._log_data_collector_change(
                    "overs", str(row_id), self._overs_label(lower_bound, upper_bound), "update", changed_by, diff
                )
        else:
            row_id = self._insert_returning_id(
                "INSERT INTO overs (lower_bound, upper_bound, overs, last_updated) "
                "OUTPUT INSERTED.overs_id VALUES (?, ?, ?, ?)",
                (lower_bound, upper_bound, overs, now),
            )
            diff = {k: {"old": None, "new": v} for k, v in new_fields.items()}
            self._log_data_collector_change(
                "overs", str(row_id), self._overs_label(lower_bound, upper_bound), "create", changed_by, diff
            )
        self.conn.commit()
        self._load_cache()
        return str(row_id)

    def delete_overs(self, record_id: str, changed_by: str) -> None:
        """Delete an overs tier record by id."""
        row_id = _parse_id(record_id)
        if row_id is None:
            raise ValueError(f"Invalid overs record id '{record_id}'")
        before = next((r for r in self._cache["overs"] if str(r["_id"]) == str(row_id)), None)
        deleted = self._execute("DELETE FROM overs WHERE overs_id = ?", (row_id,))
        if deleted > 0 and before is not None:
            diff = {k: {"old": before.get(k), "new": None} for k in ("lower_bound", "upper_bound", "overs")}
            self._log_data_collector_change(
                "overs", str(row_id), self._overs_label(before["lower_bound"], before["upper_bound"]),
                "delete", changed_by, diff,
            )
        self.conn.commit()
        if deleted == 0:
            raise ValueError(f"Overs record not found for id '{record_id}'")
        self._load_cache()

    # ------------------------------------------------------------------
    # Packout
    # ------------------------------------------------------------------

    def get_packout(self, standees: int, complexity: str) -> float:
        """Return the exact packout tier, or the nearest tier across a quantity gap."""
        row = self._fetchone(
            "SELECT TOP 1 packout FROM packout "
            "WHERE standees_lower_bound <= ? AND (standees_upper_bound IS NULL OR standees_upper_bound >= ?) "
            "AND UPPER(complexity) = UPPER(?)",
            (standees, standees, complexity),
        )
        if row is None:
            # The migrated reference data has quantity gaps for some complexities
            # (for example, Moderate starts at 11). Use the tier whose range edge
            # is closest instead of making otherwise valid quote quantities fail.
            row = self._fetchone(
                "SELECT TOP 1 packout FROM packout "
                "WHERE UPPER(complexity) = UPPER(?) "
                "ORDER BY CASE "
                "WHEN ? < standees_lower_bound THEN standees_lower_bound - ? "
                "WHEN standees_upper_bound IS NOT NULL AND ? > standees_upper_bound THEN ? - standees_upper_bound "
                "ELSE 0 END, standees_lower_bound",
                (complexity, standees, standees, standees, standees),
            )
        if row is None:
            raise ValueError(f"Packout not found for standees {standees} and complexity {complexity}")
        return float(row["packout"])

    def get_all_packout(self) -> list[dict]:
        """Return all packout costs sorted by lower_bound."""
        records = []
        for cached in sorted(self._cache["packout"], key=lambda x: x["standees_lower_bound"]):
            r = dict(cached)
            r["_id"] = str(r["_id"])
            if "last_updated" in r and hasattr(r["last_updated"], "isoformat"):
                r["last_updated"] = r["last_updated"].isoformat()
            records.append(r)
        return records

    @staticmethod
    def _packout_label(standees_lower_bound: int, standees_upper_bound: int | None, complexity: str) -> str:
        standees = f"{standees_lower_bound}-{standees_upper_bound if standees_upper_bound is not None else '∞'}"
        return f"{complexity} · {standees} standees"

    def upsert_packout(
        self,
        record_id: str | None,
        standees_lower_bound: int,
        standees_upper_bound: int | None,
        complexity: str,
        packout: int,
        changed_by: str,
    ) -> str:
        """Upsert a packout tier record. Inserts a new row when record_id is None."""
        now = _to_db_datetime(datetime.now(UTC))
        new_fields = {
            "standees_lower_bound": standees_lower_bound,
            "standees_upper_bound": standees_upper_bound,
            "complexity": complexity,
            "packout": packout,
        }
        label = self._packout_label(standees_lower_bound, standees_upper_bound, complexity)
        if record_id is not None:
            row_id = _parse_id(record_id)
            if row_id is None:
                raise ValueError(f"Invalid packout record id '{record_id}'")
            before = next((r for r in self._cache["packout"] if str(r["_id"]) == str(row_id)), None)
            updated = self._execute(
                "UPDATE packout SET standees_lower_bound = ?, standees_upper_bound = ?, "
                "complexity = ?, packout = ?, last_updated = ? WHERE packout_id = ?",
                (
                    standees_lower_bound,
                    standees_upper_bound,
                    complexity,
                    packout,
                    now,
                    row_id,
                ),
            )
            if updated == 0:
                raise ValueError(f"Packout record not found for id '{record_id}'")
            if before is not None:
                diff = self._diff_fields(before, new_fields, list(new_fields.keys()))
                self._log_data_collector_change("packout", str(row_id), label, "update", changed_by, diff)
        else:
            row_id = self._insert_returning_id(
                "INSERT INTO packout (standees_lower_bound, standees_upper_bound, complexity, packout, last_updated) "
                "OUTPUT INSERTED.packout_id VALUES (?, ?, ?, ?, ?)",
                (
                    standees_lower_bound,
                    standees_upper_bound,
                    complexity,
                    packout,
                    now,
                ),
            )
            diff = {k: {"old": None, "new": v} for k, v in new_fields.items()}
            self._log_data_collector_change("packout", str(row_id), label, "create", changed_by, diff)
        self.conn.commit()
        self._load_cache()
        return str(row_id)

    def delete_packout(self, record_id: str, changed_by: str) -> None:
        """Delete a packout tier record by id."""
        row_id = _parse_id(record_id)
        if row_id is None:
            raise ValueError(f"Invalid packout record id '{record_id}'")

        before = next((r for r in self._cache["packout"] if str(r["_id"]) == str(row_id)), None)
        deleted = self._execute("DELETE FROM packout WHERE packout_id = ?", (row_id,))
        if deleted > 0 and before is not None:
            fields = ("standees_lower_bound", "standees_upper_bound", "complexity", "packout")
            diff = {k: {"old": before.get(k), "new": None} for k in fields}
            label = self._packout_label(
                before["standees_lower_bound"], before["standees_upper_bound"], before["complexity"],
            )
            self._log_data_collector_change("packout", str(row_id), label, "delete", changed_by, diff)
        self.conn.commit()

        if deleted == 0:
            raise ValueError(f"Packout record not found for id '{record_id}'")
        self._load_cache()


def _hash_password(password: str) -> str:
    """Hash a password using PBKDF2-HMAC-SHA256 with random salt."""
    iterations = 120_000
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return f"pbkdf2_sha256${iterations}${salt.hex()}${digest.hex()}"
