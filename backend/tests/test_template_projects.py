import asyncio
from pathlib import Path
import sys

import pytest
from pydantic import ValidationError

sys.path.insert(0, str(Path(__file__).parents[1]))

import main
from lib.persisted_project import PROJECT_SCHEMA_VERSION, PersistedProjectCreate
from lib.persisted_quote import PersistedQuoteCreateBody


ELEMENT = {
    "name": "front",
    "length": 10,
    "width": 10,
    "complexity": "Simple",
}


def test_custom_project_payload_remains_compatible():
    project = PersistedProjectCreate(
        owner="user",
        project_name="Legacy shape",
        num_standees=25,
        standee_type="Simple",
        elements=[ELEMENT],
    )
    assert project.project_type == "custom"
    assert project.schema_version == PROJECT_SCHEMA_VERSION == 3


def test_template_project_requires_template_and_rejects_custom_inputs():
    project = PersistedProjectCreate(
        owner="user",
        project_name="Template estimate",
        project_type="template",
        project_description="Customer-specific notes",
        template_key="flat_card",
    )
    assert project.num_standees is None
    assert project.elements == []

    with pytest.raises(ValidationError):
        PersistedProjectCreate(
            owner="user",
            project_name="Invalid template",
            project_type="template",
        )
    with pytest.raises(ValidationError):
        PersistedProjectCreate(
            owner="user",
            project_name="Invalid template",
            project_type="template",
            template_id=1,
            elements=[ELEMENT],
        )


def test_custom_project_cannot_reference_template():
    with pytest.raises(ValidationError):
        PersistedProjectCreate(
            owner="user",
            project_name="Invalid custom",
            template_key="box",
            num_standees=25,
            standee_type="Simple",
            elements=[ELEMENT],
        )


class _TemplateProjectDB:
    def check_username_exists(self, username):
        return True

    def get_project_by_owner(self, project_id, owner):
        return {"_id": project_id, "owner": owner, "project_type": "template"}

    def insert_persisted_quote(self, doc, changed_by=None):
        raise AssertionError("quote insert must not run")


def test_project_quote_endpoint_rejects_template_projects():
    payload = PersistedQuoteCreateBody(
        owner="user",
        quote_name="Not allowed",
        scenario=1,
        num_standees=25,
        contribution_margin=30,
        standee_type="Simple",
        elements=[ELEMENT],
    )
    original = main.db
    main.db = _TemplateProjectDB()
    try:
        response = asyncio.run(main.create_project_quote("1", payload))
    finally:
        main.db = original
    assert response.status_code == 400
    assert b"cannot be attached" in response.body


def test_schema_seeds_are_insert_only_and_complete():
    sql = (Path(__file__).parents[2] / "sql" / "create_tables.sql").read_text(encoding="utf-8")
    for key in (
        "flat_card",
        "box",
        "totem",
        "double_wide_lug",
        "photo_op_bench",
        "bells_whistles",
    ):
        assert f"IF NOT EXISTS (SELECT 1 FROM dbo.standee_templates WHERE template_key = N'{key}')" in sql
    assert "567.8266666666667" in sql
    assert "UPDATE dbo.standee_templates" not in sql
