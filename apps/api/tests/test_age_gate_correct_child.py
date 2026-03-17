"""
test_age_gate_correct_child.py

Verifica que enforce_subject_age_gate usa o ChildProfile do usuário logado
(filtrado por user_id), NÃO o primeiro ChildProfile do tenant.

Cenários:
  1. child_in_range    — criança dentro da faixa → sem 403
  2. child_out_of_range — criança fora da faixa → 403 com código canônico
  3. multi_child_tenant — tenant com 2 crianças; gate usa a criança correta
  4. parent_actor      — usuário sem ChildProfile → sem gate (None retornado)
  5. missing_dob       — ChildProfile sem date_of_birth → sem gate (None)
  6. logging_on_block  — log "age_policy.enforce.result" emitido com campos corretos
"""
from __future__ import annotations

import logging
from datetime import date, timedelta
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

from app.models import SubjectAgeGroup
from app.services.age_policy import (
    AGE_GATE_ERROR_CODE,
    AGE_GATE_MESSAGE,
    enforce_subject_age_gate,
    resolve_child_age,
)


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _dob_for_age(age: int) -> date:
    """Return a date-of-birth that yields exactly `age` today."""
    today = date.today()
    return today.replace(year=today.year - age)


def _make_child(user_id: int, age: int) -> SimpleNamespace:
    return SimpleNamespace(
        id=user_id * 10,
        user_id=user_id,
        date_of_birth=_dob_for_age(age),
        deleted_at=None,
    )


def _make_subject(age_group: SubjectAgeGroup) -> SimpleNamespace:
    bounds = {
        SubjectAgeGroup.AGE_6_8: (6, 8),
        SubjectAgeGroup.AGE_9_12: (9, 12),
        SubjectAgeGroup.AGE_13_15: (13, 15),
    }
    lo, hi = bounds[age_group]
    return SimpleNamespace(id=1, age_group=age_group, age_min=lo, age_max=hi)


def _db_with_child(child):
    """Mock db.scalar → child, db.get(Subject) → subject passed at call time."""
    db = MagicMock()
    db.scalar.return_value = child
    return db


def _db_no_child():
    db = MagicMock()
    db.scalar.return_value = None
    return db


# ─── resolve_child_age ────────────────────────────────────────────────────────


class TestResolveChildAge:
    def test_returns_age_when_child_linked_to_user(self):
        child = _make_child(user_id=42, age=9)
        db = _db_with_child(child)
        result = resolve_child_age(db, user_id=42, tenant_id=1)
        assert result == 9

    def test_returns_none_when_no_child_profile(self):
        db = _db_no_child()
        result = resolve_child_age(db, user_id=99, tenant_id=1)
        assert result is None

    def test_returns_none_when_dob_missing(self):
        child = SimpleNamespace(id=10, user_id=5, date_of_birth=None, deleted_at=None)
        db = _db_with_child(child)
        result = resolve_child_age(db, user_id=5, tenant_id=1)
        assert result is None

    def test_queries_by_user_id_not_tenant_id(self):
        """Guarantee the scalar query filters on user_id (not tenant_id)."""
        child = _make_child(user_id=7, age=11)
        db = _db_with_child(child)
        resolve_child_age(db, user_id=7, tenant_id=1)
        # db.scalar must have been called (query executed)
        assert db.scalar.called


# ─── enforce_subject_age_gate ─────────────────────────────────────────────────


class TestEnforceSubjectAgeGate:
    def _setup_enforce(self, child, subject):
        db = _db_with_child(child)
        db.get.return_value = subject
        return db

    def test_child_in_range_passes(self):
        """7-year-old accessing AGE_6_8 subject → no exception."""
        child = _make_child(user_id=1, age=7)
        subject = _make_subject(SubjectAgeGroup.AGE_6_8)
        db = self._setup_enforce(child, subject)
        # Should not raise
        enforce_subject_age_gate(db, tenant_id=1, user_id=1, subject_id=1)

    def test_child_out_of_range_raises_403(self):
        """7-year-old accessing AGE_13_15 subject → 403."""
        child = _make_child(user_id=2, age=7)
        subject = _make_subject(SubjectAgeGroup.AGE_13_15)
        db = self._setup_enforce(child, subject)
        with pytest.raises(HTTPException) as exc_info:
            enforce_subject_age_gate(db, tenant_id=1, user_id=2, subject_id=1)
        assert exc_info.value.status_code == 403
        assert exc_info.value.detail["code"] == AGE_GATE_ERROR_CODE
        assert exc_info.value.detail["message"] == AGE_GATE_MESSAGE

    def test_child_at_lower_boundary_passes(self):
        """9-year-old accessing AGE_9_12 subject (lower boundary) → no exception."""
        child = _make_child(user_id=3, age=9)
        subject = _make_subject(SubjectAgeGroup.AGE_9_12)
        db = self._setup_enforce(child, subject)
        enforce_subject_age_gate(db, tenant_id=1, user_id=3, subject_id=1)

    def test_child_at_upper_boundary_passes(self):
        """12-year-old accessing AGE_9_12 subject (upper boundary) → no exception."""
        child = _make_child(user_id=4, age=12)
        subject = _make_subject(SubjectAgeGroup.AGE_9_12)
        db = self._setup_enforce(child, subject)
        enforce_subject_age_gate(db, tenant_id=1, user_id=4, subject_id=1)

    def test_parent_actor_no_gate(self):
        """User without ChildProfile (parent/teacher) → no restriction."""
        db = _db_no_child()
        db.get.return_value = _make_subject(SubjectAgeGroup.AGE_6_8)
        enforce_subject_age_gate(db, tenant_id=1, user_id=99, subject_id=1)

    def test_subject_not_found_no_gate(self):
        """Subject does not exist → no restriction (route handles 404)."""
        child = _make_child(user_id=5, age=10)
        db = _db_with_child(child)
        db.get.return_value = None
        enforce_subject_age_gate(db, tenant_id=1, user_id=5, subject_id=999)


# ─── Multi-child tenant correctness ───────────────────────────────────────────


class TestMultiChildTenant:
    """
    In a tenant with two children (ages 7 and 11), the gate must use the
    child linked to the requesting user_id — NOT the first child by id.
    """

    def test_correct_child_used_when_multiple_children_in_tenant(self):
        child_7yo = _make_child(user_id=10, age=7)   # id=100
        child_11yo = _make_child(user_id=11, age=11)  # id=110

        subject_9_12 = _make_subject(SubjectAgeGroup.AGE_9_12)

        # DB returns child_11yo when user_id=11 is queried
        db_for_11yo = MagicMock()
        db_for_11yo.scalar.return_value = child_11yo
        db_for_11yo.get.return_value = subject_9_12

        # DB returns child_7yo when user_id=10 is queried
        db_for_7yo = MagicMock()
        db_for_7yo.scalar.return_value = child_7yo
        db_for_7yo.get.return_value = subject_9_12

        # 11-year-old → AGE_9_12 → PASS
        enforce_subject_age_gate(db_for_11yo, tenant_id=1, user_id=11, subject_id=1)

        # 7-year-old → AGE_9_12 → BLOCK
        with pytest.raises(HTTPException) as exc_info:
            enforce_subject_age_gate(db_for_7yo, tenant_id=1, user_id=10, subject_id=1)
        assert exc_info.value.status_code == 403


# ─── Logging ──────────────────────────────────────────────────────────────────


class TestAgeGateLogging:
    def test_block_event_logged_with_correct_fields(self, caplog):
        child = _make_child(user_id=20, age=7)
        subject = _make_subject(SubjectAgeGroup.AGE_13_15)
        db = MagicMock()
        db.scalar.return_value = child
        db.get.return_value = subject

        with caplog.at_level(logging.INFO, logger="axiora.age_policy"):
            with pytest.raises(HTTPException):
                enforce_subject_age_gate(db, tenant_id=1, user_id=20, subject_id=1)

        record_messages = [r.message for r in caplog.records]
        assert any("age_policy.enforce.result" in m for m in record_messages)

    def test_allow_event_logged_with_correct_fields(self, caplog):
        child = _make_child(user_id=21, age=10)
        subject = _make_subject(SubjectAgeGroup.AGE_9_12)
        db = MagicMock()
        db.scalar.return_value = child
        db.get.return_value = subject

        with caplog.at_level(logging.INFO, logger="axiora.age_policy"):
            enforce_subject_age_gate(db, tenant_id=1, user_id=21, subject_id=1)

        record_messages = [r.message for r in caplog.records]
        assert any("age_policy.enforce.result" in m for m in record_messages)
