from __future__ import annotations

from datetime import UTC, datetime

import pytest
from fastapi import HTTPException

from app.api.routes import tools_templates
from app.models import ToolTemplate, User
from app.schemas.tools_templates import ToolTemplateCreateRequest


class _FakeResult:
    def __init__(self, rows: list[object]) -> None:
        self._rows = rows

    def all(self) -> list[object]:
        return self._rows


class _FakeDB:
    def __init__(self, *, scalar_values: list[object] | None = None, scalars_values: list[list[object]] | None = None) -> None:
        self.scalar_values = list(scalar_values or [])
        self.scalars_values = list(scalars_values or [])
        self.scalar_statements: list[object] = []
        self.scalars_statements: list[object] = []
        self.added: list[object] = []
        self.deleted: list[object] = []

    def scalar(self, stmt, *_args, **_kwargs):
        self.scalar_statements.append(stmt)
        if not self.scalar_values:
            return None
        return self.scalar_values.pop(0)

    def scalars(self, stmt, *_args, **_kwargs) -> _FakeResult:
        self.scalars_statements.append(stmt)
        rows = self.scalars_values.pop(0) if self.scalars_values else []
        return _FakeResult(rows)

    def add(self, obj: object) -> None:
        self.added.append(obj)

    def delete(self, obj: object) -> None:
        self.deleted.append(obj)

    def commit(self) -> None:
        return

    def refresh(self, obj: object) -> None:
        if getattr(obj, "created_at", None) is None:
            setattr(obj, "created_at", datetime.now(UTC))


def _mk_user(user_id: int = 7) -> User:
    return User(id=user_id, email=f"user{user_id}@axiora.local", name="User", password_hash="hashed")


def _mk_template(*, template_id: str, user_id: int, is_public: bool = False, name: str = "Template") -> ToolTemplate:
    return ToolTemplate(
        id=template_id,
        user_id=user_id,
        name=name,
        config={"title": "Folha"},
        blocks=[{"id": 1}],
        is_public=is_public,
        created_at=datetime.now(UTC),
    )


def test_create_template_generates_uuid_and_sets_owner() -> None:
    db = _FakeDB()
    user = _mk_user(11)

    result = tools_templates.create_template(
        ToolTemplateCreateRequest(name="Meu template", config={"a": 1}, blocks=[{"id": 1}], is_public=False),
        db,  # type: ignore[arg-type]
        user,
    )

    created = db.added[0]
    assert created.user_id == user.id
    assert isinstance(created.id, str)
    assert len(created.id) == 36
    assert result.id == created.id
    assert result.user_id == user.id


def test_list_templates_builds_user_scoped_query() -> None:
    db = _FakeDB(
        scalars_values=[[_mk_template(template_id="d7be5bfa-b173-403f-af90-257164f9f3dd", user_id=10)]],
    )
    user = _mk_user(10)

    rows = tools_templates.list_templates(db, user)  # type: ignore[arg-type]

    assert len(rows) == 1
    sql = str(db.scalars_statements[0]).lower()
    assert "tool_templates.user_id" in sql


def test_delete_template_enforces_owner_scope_and_404_for_missing() -> None:
    db = _FakeDB(scalar_values=[None])
    user = _mk_user(99)

    with pytest.raises(HTTPException) as exc:
        tools_templates.delete_template("ccf89e49-2264-431f-a83d-b4eb4f8b26a0", db, user)  # type: ignore[arg-type]

    assert exc.value.status_code == 404
    sql = str(db.scalar_statements[0]).lower()
    assert "tool_templates.id" in sql
    assert "tool_templates.user_id" in sql


def test_duplicate_template_creates_new_id_for_same_owner() -> None:
    source = _mk_template(
        template_id="5a89f08d-b759-44fb-9871-90f16a5da355",
        user_id=15,
        is_public=True,
        name="Original",
    )
    db = _FakeDB(scalar_values=[source])
    user = _mk_user(15)

    duplicated = tools_templates.duplicate_template(source.id, db, user)  # type: ignore[arg-type]

    created = db.added[0]
    assert created.id != source.id
    assert created.user_id == user.id
    assert created.is_public is False
    assert duplicated.id == created.id


def test_list_public_templates_filters_by_public_flag() -> None:
    db = _FakeDB(
        scalars_values=[[_mk_template(template_id="4e764deb-f753-4f76-bcd4-c888d71f1360", user_id=22, is_public=True)]],
    )

    rows = tools_templates.list_public_templates(db)  # type: ignore[arg-type]

    assert len(rows) == 1
    assert rows[0].is_public is True
    sql = str(db.scalars_statements[0]).lower()
    assert "tool_templates.is_public" in sql
