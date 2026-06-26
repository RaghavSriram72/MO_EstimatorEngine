"""MongoDB ``quotes`` collection — document shape for API / validation.

**Stored fields** (v1):

- ``schema_version`` — int, see ``QUOTE_SCHEMA_VERSION``
- ``owner`` — username str
- ``project_id`` — ``ObjectId`` in Mongo (str in request models; caller converts on insert)
- ``quote_name`` — str
- ``scenario`` — int (1–5)
- ``num_standees`` — int
- ''contribution_margin'' - float
- ``standee_type`` — ``Simple`` / ``Moderate`` / ``Complex`` (same as projects)
- ``elements`` — list of persisted elements (see ``PersistedElement`` in ``persisted_project``)
- ``breakdown`` — BSON-safe dict containing:

  - ``scenario_1`` … ``scenario_5`` — outputs of ``to_serializable_dict()`` per scenario (cost lines source).
  - Optional ``_breakdown_ui`` — user overrides from the breakdown UI:

    - ``universal_subtotal_override`` — keys ``\"1\"`` … ``\"5\"``; values are override strings (omit empty).
    - ``scenario_subtotal_override`` — same key shape.

- ``created_at`` / ``updated_at`` — timezone-aware datetimes (set in ``main`` / insert path, not on Pydantic create body)

Callers building insert documents should merge timestamps and ``ObjectId`` for ``project_id`` before ``insert_one``.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from lib.persisted_project import ComplexityStr, PersistedElement

QUOTE_SCHEMA_VERSION = 1


class PersistedQuoteCreate(BaseModel):
    """Body for creating a quote row (before ``project_id`` is stored as ``ObjectId`` in Mongo)."""

    schema_version: int = Field(default=QUOTE_SCHEMA_VERSION, ge=1)
    owner: str = Field(..., min_length=1, max_length=256, description="Username that owns the quote")
    project_id: str = Field(
        ...,
        min_length=1,
        description="Parent project id as hex string; convert to ObjectId on insert",
    )
    quote_name: str = Field(..., min_length=1, max_length=512)
    scenario: int = Field(..., ge=1, le=5)
    num_standees: int = Field(..., ge=1)
    contribution_margin: float = Field(..., ge=0, le=99.99)
    standee_type: ComplexityStr
    elements: list[PersistedElement] = Field(..., min_length=1)
    breakdown: dict[str, Any] = Field(default_factory=dict)


class PersistedQuoteCreateBody(BaseModel):
    """JSON body for ``POST /projects/{project_id}/quotes`` (parent project comes from the URL)."""

    schema_version: int = Field(default=QUOTE_SCHEMA_VERSION, ge=1)
    owner: str = Field(..., min_length=1, max_length=256, description="Username that owns the quote")
    quote_name: str = Field(..., min_length=1, max_length=512)
    scenario: int = Field(..., ge=1, le=5)
    num_standees: int = Field(..., ge=1)
    contribution_margin: float = Field(..., ge=0, le=99.99)
    standee_type: ComplexityStr
    elements: list[PersistedElement] = Field(..., min_length=1)
    breakdown: dict[str, Any] = Field(default_factory=dict)


def persisted_quote_create_from_path(project_id: str, body: PersistedQuoteCreateBody) -> PersistedQuoteCreate:
    return PersistedQuoteCreate(project_id=project_id, **body.model_dump())


def persisted_quote_create_to_mongo_document(data: PersistedQuoteCreate) -> dict[str, Any]:
    """BSON-ready dict except ``project_id`` (still str) and without ``created_at`` / ``updated_at``."""
    return data.model_dump()


class PersistedQuoteUpdateBody(BaseModel):
    """Full snapshot of editable quote fields (same idea as ``PersistedProjectUpdateBody``)."""

    quote_name: str = Field(..., min_length=1, max_length=512)
    num_standees: int = Field(..., ge=1)
    contribution_margin: float = Field(..., ge=0, le=99.99)
    scenario: int = Field(..., ge=1, le=5)
    standee_type: ComplexityStr
    elements: list[PersistedElement] = Field(..., min_length=1)
    breakdown: dict[str, Any] = Field(default_factory=dict)


def persisted_quote_update_to_mongo_set(data: PersistedQuoteUpdateBody) -> dict[str, Any]:
    """Fields allowed by ``MidnightOilDB.update_persisted_quote``."""
    return data.model_dump()


def persisted_quote_insert_document(
    data: PersistedQuoteCreate,
    *,
    created_at: datetime,
    updated_at: datetime,
) -> dict[str, Any]:
    """Insert payload with timestamps; ``project_id`` is still a str — replace with ``ObjectId`` in the DB layer."""
    doc = persisted_quote_create_to_mongo_document(data)
    doc["created_at"] = created_at
    doc["updated_at"] = updated_at
    return doc
