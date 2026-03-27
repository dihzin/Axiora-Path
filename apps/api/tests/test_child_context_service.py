from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException

from app.services.child_context import resolve_child_context


def _membership(role: str):
    return SimpleNamespace(role=SimpleNamespace(value=role))


def _child(child_id: int, *, tenant_id: int = 1, user_id: int | None = None):
    return SimpleNamespace(id=child_id, tenant_id=tenant_id, user_id=user_id, deleted_at=None)


def test_returns_requested_child_when_valid() -> None:
    db = MagicMock()
    db.scalar.return_value = _child(7, tenant_id=1, user_id=None)

    resolved = resolve_child_context(
        db,
        tenant_id=1,
        user=SimpleNamespace(id=99),
        membership=_membership("PARENT"),
        requested_child_id=7,
    )

    assert resolved.id == 7


def test_blocks_child_user_from_other_child_profile() -> None:
    db = MagicMock()
    db.scalar.return_value = _child(7, tenant_id=1, user_id=55)

    with pytest.raises(HTTPException) as exc_info:
        resolve_child_context(
            db,
            tenant_id=1,
            user=SimpleNamespace(id=99),
            membership=_membership("CHILD"),
            requested_child_id=7,
        )

    assert exc_info.value.status_code == 403


def test_returns_direct_child_when_user_is_linked() -> None:
    db = MagicMock()
    db.scalar.return_value = _child(12, tenant_id=1, user_id=42)

    resolved = resolve_child_context(
        db,
        tenant_id=1,
        user=SimpleNamespace(id=42),
        membership=_membership("CHILD"),
        requested_child_id=None,
    )

    assert resolved.id == 12


def test_returns_single_tenant_child_when_only_one_exists() -> None:
    db = MagicMock()
    db.scalar.return_value = None
    scalars_result = MagicMock()
    scalars_result.all.return_value = [_child(14, tenant_id=1)]
    db.scalars.return_value = scalars_result

    resolved = resolve_child_context(
        db,
        tenant_id=1,
        user=SimpleNamespace(id=42),
        membership=_membership("PARENT"),
        requested_child_id=None,
    )

    assert resolved.id == 14


def test_blocks_teacher_from_unassigned_child_profile() -> None:
    db = MagicMock()
    requested_child = _child(21, tenant_id=1, user_id=210)
    db.scalar.side_effect = [requested_child, None]

    with pytest.raises(HTTPException) as exc_info:
        resolve_child_context(
            db,
            tenant_id=1,
            user=SimpleNamespace(id=77),
            membership=_membership("TEACHER"),
            requested_child_id=21,
        )

    assert exc_info.value.status_code == 403


def test_allows_teacher_for_assigned_child_profile() -> None:
    db = MagicMock()
    requested_child = _child(21, tenant_id=1, user_id=210)
    db.scalar.side_effect = [requested_child, 21]

    resolved = resolve_child_context(
        db,
        tenant_id=1,
        user=SimpleNamespace(id=77),
        membership=_membership("TEACHER"),
        requested_child_id=21,
    )

    assert resolved.id == 21


def test_requires_explicit_child_when_multiple_children_exist() -> None:
    db = MagicMock()
    db.scalar.return_value = None
    scalars_result = MagicMock()
    scalars_result.all.return_value = [_child(14, tenant_id=1), _child(15, tenant_id=1)]
    db.scalars.return_value = scalars_result

    with pytest.raises(HTTPException) as exc_info:
        resolve_child_context(
            db,
            tenant_id=1,
            user=SimpleNamespace(id=42),
            membership=_membership("PARENT"),
            requested_child_id=None,
        )

    assert exc_info.value.status_code == 409
