"""SQL Server ``quotes`` table — record shape for API / validation.

**Stored fields** (v2 — quote object with five scenario children):

- ``schema_version`` — int, see ``QUOTE_SCHEMA_VERSION``
- ``owner`` — username str
- ``project_id`` — BIGINT foreign key in SQL Server (str in request models; the DB layer converts)
- ``quote_name`` — str
- ``scenario`` — int (1–5), the scenario tab that was active when saved
- ``num_standees`` — int
- ``contribution_margin`` — float
- ``standee_type`` — ``Simple`` / ``Moderate`` / ``Complex`` (same as projects)
- ``elements`` — list of persisted elements (one ``quote_elements`` row each; see
  ``PersistedElement`` in ``persisted_project``)
- ``scenarios`` — JSON column: the five scenario children, keyed ``"1"`` … ``"5"``. Each child holds:

  - ``defaults`` — the raw backend ``to_serializable_dict()`` blob for that scenario, i.e. the
    engine-computed values *before* any manual edits. Used to show "default: X" hints in the UI.
  - ``line_edits`` — only the cost rows the user manually changed:
    ``{"<cost_key>": {"qty": float, "unit_cost": float}}``.
  - ``subtotal_override`` — str; manual scenario-subtotal override ("" when unset).

- ``universal`` — JSON column: shared (cross-scenario) breakdown state:

  - ``line_edits`` — same shape as scenario ``line_edits`` for universal cost rows.
  - ``subtotal_override`` — str.

- ``params`` — JSON column: the spec fields above the breakdown table:

  - ``current`` — ``{num_standees, print_forms_per_standee, structure_forms_per_standee, overs}``
  - ``defaults`` — same keys; engine-computed values from the last recalculate, so the UI can
    display what a manually-edited field "was before".

- ``cost_tables_version`` — str fingerprint of data-collector cost tables when engine defaults
  were last refreshed. Used to highlight projects whose saved quotes may be out of date.
  Reverting cost edits restores the previous fingerprint so quotes are no longer stale.
- ``breakdown`` — legacy v1 blob (``scenario_1`` … ``scenario_5`` + ``_breakdown_ui``). Kept for
  old documents; new writes leave this empty.
- ``created_at`` / ``updated_at`` — timezone-aware datetimes (set in ``main`` / insert path, not on Pydantic create body)

Callers building insert documents merge timestamps first; ``project_id`` stays a str and the DB
layer converts it to the integer foreign key on insert.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from lib.persisted_project import ComplexityStr, PersistedElement

QUOTE_SCHEMA_VERSION = 2


class PersistedQuoteCreate(BaseModel):
    """Body for creating a quote row (``project_id`` still a str; stored as an integer key)."""

    schema_version: int = Field(default=QUOTE_SCHEMA_VERSION, ge=1)
    owner: str = Field(..., min_length=1, max_length=256, description="Username that owns the quote")
    project_id: str = Field(
        ...,
        min_length=1,
        description="Parent project id as a string; the DB layer converts it on insert",
    )
    quote_name: str = Field(..., min_length=1, max_length=512)
    scenario: int = Field(..., ge=1, le=5)
    num_standees: int = Field(..., ge=1)
    contribution_margin: float = Field(..., ge=0, le=99.99)
    standee_type: ComplexityStr
    elements: list[PersistedElement] = Field(..., min_length=1)
    scenarios: dict[str, Any] = Field(default_factory=dict, description='Five scenario children keyed "1"…"5"')
    universal: dict[str, Any] = Field(default_factory=dict, description="Shared cost-line edits + subtotal override")
    params: dict[str, Any] = Field(default_factory=dict, description="Spec fields: current + defaults")
    breakdown: dict[str, Any] = Field(default_factory=dict, description="Legacy v1 blob; empty on new writes")
    cost_tables_version: str | None = Field(
        default=None,
        min_length=1,
        max_length=64,
        description="Cost-table fingerprint when engine defaults were last refreshed",
    )


class PersistedQuoteCreateBody(BaseModel):
    """JSON body for ``POST /projects/{project_id}/quotes`` (parent project comes from the URL)."""

    schema_version: int = Field(default=QUOTE_SCHEMA_VERSION, ge=1)
    owner: str = Field(..., min_length=1, max_length=256, description="Username that owns the quote")
    changed_by: str | None = Field(
        default=None,
        max_length=256,
        description=(
            "Username of the person actually creating this quote — used for history "
            "attribution; defaults to `owner` when omitted (not a stored quote column)"
        ),
    )
    quote_name: str = Field(..., min_length=1, max_length=512)
    scenario: int = Field(..., ge=1, le=5)
    num_standees: int = Field(..., ge=1)
    contribution_margin: float = Field(..., ge=0, le=99.99)
    standee_type: ComplexityStr
    elements: list[PersistedElement] = Field(..., min_length=1)
    scenarios: dict[str, Any] = Field(default_factory=dict, description='Five scenario children keyed "1"…"5"')
    universal: dict[str, Any] = Field(default_factory=dict, description="Shared cost-line edits + subtotal override")
    params: dict[str, Any] = Field(default_factory=dict, description="Spec fields: current + defaults")
    breakdown: dict[str, Any] = Field(default_factory=dict, description="Legacy v1 blob; empty on new writes")
    cost_tables_version: str | None = Field(
        default=None,
        min_length=1,
        max_length=64,
        description="Cost-table fingerprint when engine defaults were last refreshed",
    )


def persisted_quote_create_from_path(project_id: str, body: PersistedQuoteCreateBody) -> PersistedQuoteCreate:
    # `changed_by` is history-attribution metadata, not part of the stored quote record.
    return PersistedQuoteCreate(project_id=project_id, **body.model_dump(exclude={"changed_by"}))


def persisted_quote_create_to_document(data: PersistedQuoteCreate) -> dict[str, Any]:
    """Insert-ready dict except ``project_id`` (still str) and without ``created_at`` / ``updated_at``."""
    return data.model_dump(exclude_none=True)


class PersistedQuoteUpdateBody(BaseModel):
    """Full snapshot of editable quote fields (same idea as ``PersistedProjectUpdateBody``)."""

    quote_name: str = Field(..., min_length=1, max_length=512)
    num_standees: int = Field(..., ge=1)
    contribution_margin: float = Field(..., ge=0, le=99.99)
    scenario: int = Field(..., ge=1, le=5)
    standee_type: ComplexityStr
    elements: list[PersistedElement] = Field(..., min_length=1)
    scenarios: dict[str, Any] = Field(default_factory=dict, description='Five scenario children keyed "1"…"5"')
    universal: dict[str, Any] = Field(default_factory=dict, description="Shared cost-line edits + subtotal override")
    params: dict[str, Any] = Field(default_factory=dict, description="Spec fields: current + defaults")
    breakdown: dict[str, Any] = Field(default_factory=dict, description="Legacy v1 blob; empty on new writes")
    cost_tables_version: str | None = Field(
        default=None,
        min_length=1,
        max_length=64,
        description="Cost-table fingerprint when engine defaults were last refreshed",
    )


def persisted_quote_update_to_set(data: PersistedQuoteUpdateBody) -> dict[str, Any]:
    """Fields allowed by ``MidnightOilDB.update_persisted_quote``."""
    # Omit unset cost_tables_version so a plain Save (manual line edits) does not clear the stamp.
    return data.model_dump(exclude_none=True)


def persisted_quote_insert_document(
    data: PersistedQuoteCreate,
    *,
    created_at: datetime,
    updated_at: datetime,
) -> dict[str, Any]:
    """Insert payload with timestamps; ``project_id`` is still a str — the DB layer converts it."""
    doc = persisted_quote_create_to_document(data)
    doc["created_at"] = created_at
    doc["updated_at"] = updated_at
    return doc
