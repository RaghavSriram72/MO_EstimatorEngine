""" JSON object for  MongoDB ``projects`` collection
**Stored fields** (only these belong on the document):
 1. schema_version
 2. owener
 3. project_name
 4. num_standees
 5. standee_type
 6. elements list
**Notes**  
- ``length`` / ``width``: inches; same as ``Element.length`` / ``Element.width``.  
- ``schema_version``: currently ``1``; bump when the shape changes and migrate loaders.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

from lib.classes import Complexity, Element

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
    """Turn runtime ``Element`` instances into persisted rows."""
    return [
        PersistedElement(
            name=el.name or "",
            length=float(el.length),
            width=float(el.width),
            linear_inches=None if el.linear_inches is None else float(el.linear_inches),
            complexity=complexity_to_str(el.complexity),
        )
        for el in rows
    ]


class PersistedElement(BaseModel):

    name: str = Field(default="", max_length=512)
    length: float = Field(..., gt=0)
    width: float = Field(..., gt=0)
    linear_inches: float | None = None
    complexity: ComplexityStr


class PersistedProjectCreate(BaseModel):
    """Information that gets inserted into one row in the projects collection"""

    schema_version: int = Field(default=PROJECT_SCHEMA_VERSION, ge=1)
    owner: str = Field(..., min_length=1, max_length=256, description="Username of the account that owns this project")
    project_name: str = Field(..., min_length=1, max_length=512)
    num_standees: int = Field(..., ge=1)
    standee_type: ComplexityStr
    elements: list[PersistedElement] = Field(..., min_length=1)


def persisted_create_to_mongo_document(data: PersistedProjectCreate) -> dict[str, Any]:
    return data.model_dump()


def elements_from_persisted_project(rows: list[PersistedElement]) -> list[Element]:
    return [
        Element(
            name=e.name,
            length=e.length,
            width=e.width,
            linear_inches=e.linear_inches,
            complexity=_COMPLEXITY_PARSE[e.complexity],
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
        },
    ],
}

PersistedProjectCreate.model_validate(EXAMPLE_PROJECT_DOCUMENT)
