"""API/validation models for the SQL Server ``projects`` table.
**Stored fields** (scalar columns on ``projects``; elements live in ``project_elements``):
 1. schema_version
 2. owner
 3. project_name
 4. num_standees
 5. standee_type
 6. elements list (one ``project_elements`` row per element, ordered by ``position``)
 7. short_id — 8-digit hash ID shown in the UI, derived from the row id
    (see ``project_short_id``); set on insert and lazily backfilled on read.
**Notes**
- ``length`` / ``width``: inches; same as ``Element.length`` / ``Element.width``.
- ``schema_version``: currently ``1``; bump when the shape changes and migrate loaders.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

from lib.classes import Complexity, Element

# Canonical impl lives in lib.globals (avoids an import cycle with lib.classes.db); re-exported here.
from lib.globals import project_short_id as project_short_id

PROJECT_SCHEMA_VERSION = 1

ComplexityStr = Literal["Simple", "Moderate", "Complex"]

_COMPLEXITY_PARSE: dict[ComplexityStr, Complexity] = {
    "Simple": Complexity.SIMPLE,
    "Moderate": Complexity.MODERATE,
    "Complex": Complexity.COMPLEX,
}


def complexity_to_str(c: Complexity) -> ComplexityStr:
    for label, value in _COMPLEXITY_PARSE.items():
        if value == c:
            return label
    return "Simple"


def elements_to_persisted(rows: list[Element]) -> list[PersistedElement]:
    """Turns elements associated with a project into a persisted object"""
    return [
        PersistedElement(
            name=el.name or "",
            length=float(el.length),
            width=float(el.width),
            linear_inches=None if el.linear_inches is None else float(el.linear_inches),
            complexity=complexity_to_str(el.complexity),
            description= "" if el.description is None else el.description
        )
        for el in rows
    ]


class PersistedElement(BaseModel):

    name: str = Field(default="", max_length=512)
    length: float = Field(..., gt=0)
    width: float = Field(..., gt=0)
    linear_inches: float | None = None
    complexity: ComplexityStr
    description: str = Field(default="")
    mask_b64: str | None = None


class PersistedProjectCreate(BaseModel):
    """Information that gets inserted into one row in the projects table"""

    schema_version: int = Field(default=PROJECT_SCHEMA_VERSION, ge=1)
    owner: str = Field(..., min_length=1, max_length=256, description="Username of the account that owns this project")
    project_name: str = Field(..., min_length=1, max_length=512)
    num_standees: int = Field(..., ge=1)
    standee_type: ComplexityStr
    elements: list[PersistedElement] = Field(..., min_length=1)


def persisted_create_to_document(data: PersistedProjectCreate) -> dict[str, Any]:
    return data.model_dump()


class PersistedProjectUpdateBody(BaseModel):
    # allows you to edit fields when updating an existing project record

    project_name: str = Field(..., min_length=1, max_length=512)
    num_standees: int = Field(..., ge=1)
    standee_type: ComplexityStr
    elements: list[PersistedElement] = Field(..., min_length=1)


def persisted_update_to_set(data: PersistedProjectUpdateBody) -> dict[str, Any]:
    return data.model_dump()


def elements_from_persisted_project(rows: list[PersistedElement]) -> list[Element]:
    return [
        Element(
            name=e.name,
            length=e.length,
            width=e.width,
            linear_inches=e.linear_inches,
            complexity=_COMPLEXITY_PARSE[e.complexity],
            description = "" if e.description is None else e.description
        )
        for e in rows
    ]


def standee_type_from_str(label: ComplexityStr) -> Complexity:
    return _COMPLEXITY_PARSE[label]


EXAMPLE_PROJECT_DOCUMENT: dict[str, Any] = {
    "schema_version": 1,
    "owner": "jdoe",
    "project_name": "DA-3 Primate retail standee",
    "num_standees": 18,
    "standee_type": "Moderate",
    "elements": [
        {
            "name": "monkey",
            "length": 80.1012,
            "width": 74.9667,
            "linear_inches": None,
            "complexity": "Complex",
            "description": "Monkey cutout on front of standee",
        },
    ],
}

PersistedProjectCreate.model_validate(EXAMPLE_PROJECT_DOCUMENT)
