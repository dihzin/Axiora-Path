from __future__ import annotations

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import pytest
from fastapi import HTTPException, Response
from fastapi.security import HTTPAuthorizationCredentials

from app.api import deps
from app.api.routes import auth
from app.api.routes.axion import _resolve_admin_tenant_scope
from app.api.routes import children
from app.api.routes import family
from app.api.routes import school
from app.models import (
    ChildGuardian,
    ChildProfile,
    FamilyGuardianInvitation,
    Membership,
    MembershipRole,
    SchoolFamilyLinkRequest,
    StudentProfile,
    StudentFamilyLink,
    TENANT_MEMBERSHIP_ROLES,
    TeacherStudent,
    Tenant,
    TenantType,
    User,
    _validate_membership_role_for_tenant,
    _validate_student_profile_school_tenant,
    _validate_student_family_link_tenants,
    _validate_teacher_student_school_membership,
)
from app.services.membership_service import assert_can_remove_membership
from app.schemas.auth import LoginRequest, RefreshRequest, SelectTenantRequest
from app.schemas.children import FamilyChildCreateRequest
from app.schemas.axion_studio import AxionTenantCreateRequest, AxionTenantUpdateRequest
from app.schemas.school import SchoolStudentCreateRequest, SchoolTeacherCreateRequest
from app.schemas.school import SchoolEnableStudentLoginRequest
from app.schemas.school import SchoolStudentFamilyLinkAcceptRequest
from app.schemas.school import SchoolStudentFamilyLinkRequest


class _FakeResult:
    def __init__(self, rows: list[object]) -> None:
        self._rows = rows

    def all(self) -> list[object]:
        return self._rows


class _FakeDB:
    def __init__(self, scalar_values: list[object], *, execute_values: list[object] | None = None) -> None:
        self._scalar_values = list(scalar_values)
        self._execute_values = list(execute_values or [])
        self._added: list[object] = []
        self._next_id = 100

    def scalar(self, *_args, **_kwargs):
        if not self._scalar_values:
            return None
        return self._scalar_values.pop(0)

    def execute(self, *_args, **_kwargs) -> _FakeResult:
        if not self._execute_values:
            return _FakeResult([])
        return _FakeResult(self._execute_values.pop(0))

    def scalars(self, *_args, **_kwargs) -> _FakeResult:
        if not self._execute_values:
            return _FakeResult([])
        return _FakeResult(self._execute_values.pop(0))

    def get(self, *_args, **_kwargs):
        return self.scalar()

    def add(self, obj: object) -> None:
        self._added.append(obj)

    def flush(self) -> None:
        for obj in self._added:
            if getattr(obj, "id", None) is None:
                setattr(obj, "id", self._next_id)
                self._next_id += 1

    def commit(self) -> None:
        return


class _FakeEvents:
    def __init__(self) -> None:
        self.emitted: list[dict[str, object]] = []

    def emit(self, **payload: object) -> None:
        self.emitted.append(payload)


def test_signup_accepts_family_payload_without_tenant_slug(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(auth, "hash_password", lambda *_args, **_kwargs: "hashed")
    monkeypatch.setattr(auth, "_set_auth_cookies", lambda *_args, **_kwargs: None)

    db = _FakeDB([None, None, None])

    result = auth.signup(
        auth.SignupRequest(
            name="Parent",
            email="parent@local.com",
            password="Axion@1234",
            tenant_type="FAMILY",
            tenant_name="Familia Silva",
        ),
        db,  # type: ignore[arg-type]
        Response(),
    )

    tenant = next(item for item in db._added if isinstance(item, Tenant))
    membership = next(item for item in db._added if isinstance(item, Membership))
    claims = auth.decode_token(result.access_token)

    assert tenant.slug == "familia-silva"
    assert membership.tenant_id == tenant.id
    assert claims["tenant_id"] == tenant.id


def test_family_children_creation_stores_creator_and_allows_parent() -> None:
    db = _FakeDB([])
    events = _FakeEvents()
    user = User(id=10, email="parent@local.com", name="Parent", password_hash="hashed")
    tenant = Tenant(id=21, type=TenantType.FAMILY, name="Family", slug="family-beta")

    result = family.create_family_child(
        FamilyChildCreateRequest(name="Ana", birth_date=datetime(2018, 6, 1, tzinfo=UTC).date()),
        db,  # type: ignore[arg-type]
        events,  # type: ignore[arg-type]
        tenant,
        user,
        Membership(user_id=user.id, tenant_id=tenant.id, role=MembershipRole.PARENT),
    )

    child = next(item for item in db._added if item.__class__.__name__ == "ChildProfile")
    child_guardian = next(item for item in db._added if isinstance(item, ChildGuardian))
    assert child.created_by_user_id == user.id
    assert child.display_name == "Ana"
    assert child_guardian.child_id == child.id
    assert child_guardian.user_id == user.id
    assert child_guardian.relationship == "guardian"
    assert result.display_name == "Ana"
    assert events.emitted[0]["type"] == "child.created"


def test_family_children_creation_allows_guardian_role() -> None:
    db = _FakeDB([])
    events = _FakeEvents()
    user = User(id=10, email="guardian@local.com", name="Guardian", password_hash="hashed")
    tenant = Tenant(id=21, type=TenantType.FAMILY, name="Family", slug="family-beta")

    result = family.create_family_child(
        FamilyChildCreateRequest(name="Ana", birth_date=datetime(2018, 6, 1, tzinfo=UTC).date()),
        db,  # type: ignore[arg-type]
        events,  # type: ignore[arg-type]
        tenant,
        user,
        Membership(user_id=user.id, tenant_id=tenant.id, role=MembershipRole.GUARDIAN),
    )

    child = next(item for item in db._added if isinstance(item, ChildProfile))
    child_guardian = next(item for item in db._added if isinstance(item, ChildGuardian))
    assert child.created_by_user_id == user.id
    assert child_guardian.child_id == child.id
    assert child_guardian.user_id == user.id
    assert result.display_name == "Ana"


def test_family_children_creation_rejects_non_family_tenant() -> None:
    db = _FakeDB([])
    events = _FakeEvents()
    user = User(id=10, email="parent@local.com", name="Parent", password_hash="hashed")
    tenant = Tenant(id=21, type=TenantType.SCHOOL, name="School", slug="school-alpha")

    with pytest.raises(HTTPException) as exc_info:
        family.create_family_child(
            FamilyChildCreateRequest(name="Ana", birth_date=datetime(2018, 6, 1, tzinfo=UTC).date()),
            db,  # type: ignore[arg-type]
            events,  # type: ignore[arg-type]
            tenant,
            user,
            Membership(user_id=user.id, tenant_id=tenant.id, role=MembershipRole.PARENT),
        )

    assert exc_info.value.status_code == 403
    assert exc_info.value.detail == "Family child creation is only allowed for family tenants"


def test_list_family_children_includes_guardians() -> None:
    tenant = Tenant(id=21, type=TenantType.FAMILY, name="Family", slug="family-beta")
    child = ChildProfile(id=31, tenant_id=tenant.id, display_name="Ana", date_of_birth=datetime(2018, 6, 1, tzinfo=UTC).date())
    guardian_user = User(id=10, email="parent@local.com", name="Parent", password_hash="hashed")
    guardian = ChildGuardian(id=1, child_id=child.id, user_id=guardian_user.id, relationship="mother")
    db = _FakeDB([], execute_values=[[(child, guardian, guardian_user)]])

    result = family.list_family_children(
        db,  # type: ignore[arg-type]
        tenant,
        Membership(user_id=guardian_user.id, tenant_id=tenant.id, role=MembershipRole.GUARDIAN),
    )

    assert len(result) == 1
    assert result[0].name == "Ana"
    assert result[0].birth_date == child.date_of_birth
    assert len(result[0].guardians) == 1
    assert result[0].guardians[0].email == "parent@local.com"
    assert result[0].guardians[0].relationship == "mother"


def test_list_family_children_rejects_non_family_tenant() -> None:
    db = _FakeDB([])
    tenant = Tenant(id=21, type=TenantType.SCHOOL, name="School", slug="school-alpha")

    with pytest.raises(HTTPException) as exc_info:
        family.list_family_children(
            db,  # type: ignore[arg-type]
            tenant,
            Membership(user_id=10, tenant_id=tenant.id, role=MembershipRole.PARENT),
        )

    assert exc_info.value.status_code == 403
    assert exc_info.value.detail == "Family child listing is only allowed for family tenants"


def test_invite_family_guardian_creates_token_and_emits_link(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(family.settings, "cors_allowed_origins", "http://localhost:3000")
    db = _FakeDB([])
    events = _FakeEvents()
    tenant = Tenant(id=21, type=TenantType.FAMILY, name="Family", slug="family-beta")
    user = User(id=10, email="parent@local.com", name="Parent", password_hash="hashed")

    result = family.invite_family_guardian(
        family.FamilyGuardianInviteRequest(email="guardian@local.com", relationship="mother"),
        db,  # type: ignore[arg-type]
        events,  # type: ignore[arg-type]
        tenant,
        user,
        Membership(user_id=user.id, tenant_id=tenant.id, role=MembershipRole.PARENT),
    )

    invitation = next(item for item in db._added if isinstance(item, FamilyGuardianInvitation))
    assert invitation.email == "guardian@local.com"
    assert invitation.relationship == "mother"
    assert result.invite_token == invitation.token
    assert result.invite_link.endswith(invitation.token)
    assert events.emitted[0]["type"] == "family.guardian.invited"


def test_accept_family_guardian_invite_creates_membership_and_links(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(family, "hash_password", lambda *_args, **_kwargs: "hashed")

    invitation = FamilyGuardianInvitation(
        id=1,
        tenant_id=21,
        email="guardian@local.com",
        relationship="mother",
        token="invite-token",
        invited_by_user_id=10,
        expires_at=datetime.now(UTC) + timedelta(days=1),
    )
    tenant = Tenant(id=21, type=TenantType.FAMILY, name="Family", slug="family-beta")
    child_a = ChildProfile(id=31, tenant_id=tenant.id, display_name="Ana", date_of_birth=datetime(2018, 6, 1, tzinfo=UTC).date())
    child_b = ChildProfile(id=32, tenant_id=tenant.id, display_name="Bia", date_of_birth=datetime(2017, 6, 1, tzinfo=UTC).date())
    db = _FakeDB(
        [invitation, tenant, None, None, None],
        execute_values=[[child_a, child_b]],
    )

    result = family.accept_family_guardian_invite(
        family.FamilyGuardianAcceptInviteRequest(
            token="invite-token",
            name="Guardian",
            password="Axion@1234",
        ),
        db,  # type: ignore[arg-type]
    )

    membership = next(item for item in db._added if isinstance(item, Membership))
    guardian_links = [item for item in db._added if isinstance(item, ChildGuardian)]
    created_user = next(item for item in db._added if isinstance(item, User))

    assert created_user.email == "guardian@local.com"
    assert membership.role == MembershipRole.GUARDIAN
    assert len(guardian_links) == 2
    assert {link.child_id for link in guardian_links} == {31, 32}
    assert all(link.relationship == "mother" for link in guardian_links)
    assert invitation.accepted_by_user_id == created_user.id
    assert invitation.accepted_at is not None
    assert result.tenant_slug == "family-beta"
    assert result.linked_children_count == 2


def test_enable_family_child_login_creates_user_and_links_child(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(family, "hash_password", lambda *_args, **_kwargs: "hashed")

    db = _FakeDB([None, None])
    events = _FakeEvents()
    tenant = Tenant(id=21, type=TenantType.FAMILY, name="Family", slug="family-beta")
    actor = User(id=10, email="parent@local.com", name="Parent", password_hash="hashed")
    child = ChildProfile(id=31, tenant_id=tenant.id, display_name="Ana", date_of_birth=datetime(2018, 6, 1, tzinfo=UTC).date())
    db._scalar_values.insert(0, child)

    result = family.enable_family_child_login(
        31,
        family.FamilyEnableChildLoginRequest(email="ana@local.com", password="Axion@1234"),
        db,  # type: ignore[arg-type]
        events,  # type: ignore[arg-type]
        tenant,
        actor,
        Membership(user_id=actor.id, tenant_id=tenant.id, role=MembershipRole.PARENT),
    )

    created_user = next(item for item in db._added if isinstance(item, User))
    created_membership = next(item for item in db._added if isinstance(item, Membership))
    assert child.user_id == created_user.id
    assert created_user.email == "ana@local.com"
    assert created_membership.role == MembershipRole.CHILD
    assert result.child_id == child.id
    assert result.user_id == created_user.id
    assert events.emitted[0]["type"] == "family.child_login_enabled"


def test_enable_family_child_login_rejects_when_already_enabled() -> None:
    db = _FakeDB([])
    events = _FakeEvents()
    tenant = Tenant(id=21, type=TenantType.FAMILY, name="Family", slug="family-beta")
    actor = User(id=10, email="parent@local.com", name="Parent", password_hash="hashed")
    child = ChildProfile(
        id=31,
        tenant_id=tenant.id,
        user_id=99,
        display_name="Ana",
        date_of_birth=datetime(2018, 6, 1, tzinfo=UTC).date(),
    )
    db._scalar_values.insert(0, child)

    with pytest.raises(HTTPException) as exc_info:
        family.enable_family_child_login(
            31,
            family.FamilyEnableChildLoginRequest(email="ana@local.com", password="Axion@1234"),
            db,  # type: ignore[arg-type]
            events,  # type: ignore[arg-type]
            tenant,
            actor,
            Membership(user_id=actor.id, tenant_id=tenant.id, role=MembershipRole.PARENT),
        )

    assert exc_info.value.status_code == 409
    assert exc_info.value.detail == "Child login is already enabled"


def test_membership_removal_guard_blocks_guardian_removing_parent() -> None:
    tenant = Tenant(id=21, type=TenantType.FAMILY, name="Family", slug="family-beta")
    actor = Membership(user_id=10, tenant_id=tenant.id, role=MembershipRole.GUARDIAN)
    target = Membership(user_id=11, tenant_id=tenant.id, role=MembershipRole.PARENT)

    with pytest.raises(HTTPException) as exc_info:
        assert_can_remove_membership(actor_membership=actor, target_membership=target, tenant=tenant)

    assert exc_info.value.status_code == 403
    assert exc_info.value.detail == "Guardians cannot remove parents"


def test_membership_removal_guard_blocks_parent_removing_other_parent() -> None:
    tenant = Tenant(id=21, type=TenantType.FAMILY, name="Family", slug="family-beta")
    actor = Membership(user_id=10, tenant_id=tenant.id, role=MembershipRole.PARENT)
    target = Membership(user_id=11, tenant_id=tenant.id, role=MembershipRole.PARENT)

    with pytest.raises(HTTPException) as exc_info:
        assert_can_remove_membership(actor_membership=actor, target_membership=target, tenant=tenant)

    assert exc_info.value.status_code == 403
    assert exc_info.value.detail == "Parents cannot remove other parents"


def test_membership_removal_guard_blocks_guardian_removing_guardian() -> None:
    tenant = Tenant(id=21, type=TenantType.FAMILY, name="Family", slug="family-beta")
    actor = Membership(user_id=10, tenant_id=tenant.id, role=MembershipRole.GUARDIAN)
    target = Membership(user_id=11, tenant_id=tenant.id, role=MembershipRole.GUARDIAN)

    with pytest.raises(HTTPException) as exc_info:
        assert_can_remove_membership(actor_membership=actor, target_membership=target, tenant=tenant)

    assert exc_info.value.status_code == 403
    assert exc_info.value.detail == "Only parents can remove guardians"


def test_membership_removal_guard_allows_parent_removing_guardian() -> None:
    tenant = Tenant(id=21, type=TenantType.FAMILY, name="Family", slug="family-beta")
    actor = Membership(user_id=10, tenant_id=tenant.id, role=MembershipRole.PARENT)
    target = Membership(user_id=11, tenant_id=tenant.id, role=MembershipRole.GUARDIAN)

    assert_can_remove_membership(actor_membership=actor, target_membership=target, tenant=tenant)


def test_children_route_rejects_non_family_tenant() -> None:
    db = _FakeDB([])
    tenant = Tenant(id=21, type=TenantType.SCHOOL, name="School", slug="school-alpha")

    with pytest.raises(HTTPException) as exc_info:
        children.list_children(
            db,  # type: ignore[arg-type]
            tenant,
            Membership(user_id=10, tenant_id=tenant.id, role=MembershipRole.TEACHER),
        )

    assert exc_info.value.status_code == 403
    assert exc_info.value.detail == "Child profiles are only available for family tenants"


def test_child_profile_domain_aliases_map_to_existing_columns() -> None:
    child = ChildProfile(
        tenant_id=21,
        display_name="Ana",
        date_of_birth=datetime(2018, 6, 1, tzinfo=UTC).date(),
    )
    child.organization_id = 22
    child.name = "Bia"
    child.birth_date = datetime(2017, 6, 1, tzinfo=UTC).date()

    assert child.tenant_id == 22
    assert child.organization_id == 22
    assert child.display_name == "Bia"
    assert child.name == "Bia"
    assert child.date_of_birth == datetime(2017, 6, 1, tzinfo=UTC).date()


def test_child_guardian_model_supports_relationship_links() -> None:
    guardian = ChildGuardian(child_id=21, user_id=10, relationship="mother")

    assert guardian.child_id == 21
    assert guardian.user_id == 10
    assert guardian.relationship == "mother"


def test_tenant_type_and_membership_role_matrix_is_normalized() -> None:
    assert {item.value for item in TenantType} == {"FAMILY", "SCHOOL", "SYSTEM_ADMIN"}
    assert {item.value for item in MembershipRole} == {
        "PLATFORM_ADMIN",
        "DIRECTOR",
        "TEACHER",
        "STUDENT",
        "PARENT",
        "GUARDIAN",
        "CHILD",
    }
    assert TENANT_MEMBERSHIP_ROLES[TenantType.SCHOOL] == {
        MembershipRole.DIRECTOR,
        MembershipRole.TEACHER,
        MembershipRole.STUDENT,
    }
    assert TENANT_MEMBERSHIP_ROLES[TenantType.FAMILY] == {
        MembershipRole.PARENT,
        MembershipRole.GUARDIAN,
        MembershipRole.CHILD,
    }
    assert TENANT_MEMBERSHIP_ROLES[TenantType.SYSTEM_ADMIN] == {
        MembershipRole.PLATFORM_ADMIN,
    }


def test_student_profile_domain_aliases_map_to_existing_columns() -> None:
    student = StudentProfile(
        tenant_id=31,
        display_name="Aluno",
        date_of_birth=datetime(2013, 6, 1, tzinfo=UTC).date(),
        created_by_user_id=10,
    )
    student.organization_id = 32
    student.name = "Bruno"
    student.birth_date = datetime(2012, 6, 1, tzinfo=UTC).date()

    assert student.tenant_id == 32
    assert student.organization_id == 32
    assert student.display_name == "Bruno"
    assert student.name == "Bruno"
    assert student.date_of_birth == datetime(2012, 6, 1, tzinfo=UTC).date()


def test_teacher_student_model_supports_relationship_links() -> None:
    teacher_student = TeacherStudent(teacher_user_id=10, student_profile_id=21)

    assert teacher_student.teacher_user_id == 10
    assert teacher_student.student_profile_id == 21


def test_student_family_link_model_supports_bridge_fields() -> None:
    link = StudentFamilyLink(student_profile_id=21, child_profile_id=31, linked_by_user_id=10)

    assert link.student_profile_id == 21
    assert link.child_profile_id == 31
    assert link.linked_by_user_id == 10


def test_student_profile_validation_rejects_non_school_tenant() -> None:
    class _ScalarResult:
        def __init__(self, value: object) -> None:
            self._value = value

        def scalar_one_or_none(self) -> object:
            return self._value

    class _Connection:
        def execute(self, *_args, **_kwargs) -> _ScalarResult:
            return _ScalarResult(TenantType.FAMILY.value)

    student = StudentProfile(
        tenant_id=21,
        display_name="Aluno",
        date_of_birth=datetime(2013, 6, 1, tzinfo=UTC).date(),
        created_by_user_id=10,
    )

    with pytest.raises(ValueError, match="student_profiles can only belong to SCHOOL tenants"):
        _validate_student_profile_school_tenant(None, _Connection(), student)


def test_membership_validation_rejects_family_tenant_with_teacher_role() -> None:
    class _ScalarResult:
        def __init__(self, value: object) -> None:
            self._value = value

        def scalar_one_or_none(self) -> object:
            return self._value

    class _Connection:
        def execute(self, *_args, **_kwargs) -> _ScalarResult:
            return _ScalarResult(TenantType.FAMILY.value)

    membership = Membership(user_id=10, tenant_id=21, role=MembershipRole.TEACHER)

    with pytest.raises(ValueError, match="FAMILY tenants only allow membership roles: CHILD, GUARDIAN, PARENT"):
        _validate_membership_role_for_tenant(None, _Connection(), membership)


def test_membership_validation_rejects_system_admin_tenant_with_director_role() -> None:
    class _ScalarResult:
        def __init__(self, value: object) -> None:
            self._value = value

        def scalar_one_or_none(self) -> object:
            return self._value

    class _Connection:
        def execute(self, *_args, **_kwargs) -> _ScalarResult:
            return _ScalarResult(TenantType.SYSTEM_ADMIN.value)

    membership = Membership(user_id=10, tenant_id=21, role=MembershipRole.DIRECTOR)

    with pytest.raises(ValueError, match="SYSTEM_ADMIN tenants only allow membership roles: PLATFORM_ADMIN"):
        _validate_membership_role_for_tenant(None, _Connection(), membership)


def test_teacher_student_validation_rejects_non_teacher_membership() -> None:
    class _RowResult:
        def __init__(self, row: tuple[object, object]) -> None:
            self._row = row

        def first(self) -> tuple[object, object]:
            return self._row

    class _ScalarResult:
        def __init__(self, value: object) -> None:
            self._value = value

        def scalar_one_or_none(self) -> object:
            return self._value

    class _Connection:
        def __init__(self) -> None:
            self.calls = 0

        def execute(self, *_args, **_kwargs):
            self.calls += 1
            if self.calls == 1:
                return _RowResult((21, TenantType.SCHOOL.value))
            return _ScalarResult(MembershipRole.DIRECTOR.value)

    teacher_student = TeacherStudent(teacher_user_id=10, student_profile_id=44)

    with pytest.raises(ValueError, match="teacher_user_id must reference a TEACHER membership in the same SCHOOL tenant"):
        _validate_teacher_student_school_membership(None, _Connection(), teacher_student)


def test_student_family_link_validation_rejects_non_family_child_profile() -> None:
    class _RowResult:
        def __init__(self, row: tuple[object, object]) -> None:
            self._row = row

        def first(self) -> tuple[object, object]:
            return self._row

    class _Connection:
        def __init__(self) -> None:
            self.calls = 0

        def execute(self, *_args, **_kwargs) -> _RowResult:
            self.calls += 1
            if self.calls == 1:
                return _RowResult((21, TenantType.SCHOOL.value))
            return _RowResult((31, TenantType.SCHOOL.value))

    link = StudentFamilyLink(student_profile_id=44, child_profile_id=55, linked_by_user_id=10)

    with pytest.raises(ValueError, match="child_profile_id must belong to a FAMILY tenant"):
        _validate_student_family_link_tenants(None, _Connection(), link)


def test_director_inherits_teacher_permissions() -> None:
    dependency = deps.require_role(["TEACHER"])
    membership = Membership(user_id=10, tenant_id=21, role=MembershipRole.DIRECTOR)

    resolved = dependency(membership)  # type: ignore[arg-type]

    assert resolved.role == MembershipRole.DIRECTOR


def test_school_director_can_create_teacher(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(school, "hash_password", lambda *_args, **_kwargs: "hashed")

    db = _FakeDB([None])
    user = User(id=10, email="director@school.com", name="Director", password_hash="hashed")
    tenant = Tenant(id=21, type=TenantType.SCHOOL, name="School", slug="school-alpha")

    result = school.create_teacher(
        SchoolTeacherCreateRequest(name="Teacher", email="teacher@school.com", password="Axion@1234"),
        db,  # type: ignore[arg-type]
        tenant,
        user,
        Membership(user_id=user.id, tenant_id=tenant.id, role=MembershipRole.DIRECTOR),
    )

    created_user = next(item for item in db._added if isinstance(item, User) and item.email == "teacher@school.com")
    membership = next(item for item in db._added if isinstance(item, Membership) and item.user_id == created_user.id)
    assert membership.role == MembershipRole.TEACHER
    assert result.role == "TEACHER"


def test_school_director_can_list_teachers_from_current_tenant() -> None:
    tenant = Tenant(id=21, type=TenantType.SCHOOL, name="School", slug="school-alpha")
    director = User(id=10, email="director@school.com", name="Director", password_hash="hashed")
    teacher_a = User(id=11, email="teacher-a@school.com", name="Teacher A", password_hash="hashed")
    teacher_a.created_at = datetime(2026, 3, 10, 10, 0, tzinfo=UTC)
    teacher_b = User(id=12, email="teacher-b@school.com", name="Teacher B", password_hash="hashed")
    teacher_b.created_at = datetime(2026, 3, 10, 11, 0, tzinfo=UTC)
    db = _FakeDB([], execute_values=[[teacher_b, teacher_a]])

    result = school.list_teachers(
        db,  # type: ignore[arg-type]
        tenant,
        director,
        Membership(user_id=director.id, tenant_id=tenant.id, role=MembershipRole.DIRECTOR),
    )

    assert [item.id for item in result] == [teacher_b.id, teacher_a.id]
    assert result[0].name == "Teacher B"
    assert result[0].email == "teacher-b@school.com"
    assert result[0].created_at == teacher_b.created_at


@pytest.mark.parametrize("role", [MembershipRole.TEACHER, MembershipRole.STUDENT])
def test_only_director_can_access_teacher_creation_dependency(role: MembershipRole) -> None:
    dependency = deps.require_role(["DIRECTOR"])
    membership = Membership(user_id=10, tenant_id=21, role=role)

    with pytest.raises(HTTPException) as exc_info:
        dependency(membership)  # type: ignore[arg-type]

    assert exc_info.value.status_code == 403
    assert exc_info.value.detail == "Insufficient role"


def test_school_teacher_cannot_create_teacher() -> None:
    dependency = deps.require_role(["DIRECTOR"])

    with pytest.raises(HTTPException) as exc_info:
        dependency(Membership(user_id=10, tenant_id=21, role=MembershipRole.TEACHER))  # type: ignore[arg-type]

    assert exc_info.value.status_code == 403
    assert exc_info.value.detail == "Insufficient role"


def test_school_teacher_can_create_student_without_initial_credentials() -> None:
    db = _FakeDB([])
    user = User(id=10, email="teacher@school.com", name="Teacher", password_hash="hashed")
    tenant = Tenant(id=21, type=TenantType.SCHOOL, name="School", slug="school-alpha")

    result = school.create_student(
        SchoolStudentCreateRequest(
            name="Student",
            birth_date=datetime(2014, 6, 1, tzinfo=UTC).date(),
        ),
        db,  # type: ignore[arg-type]
        tenant,
        user,
        Membership(user_id=user.id, tenant_id=tenant.id, role=MembershipRole.TEACHER),
    )

    student_profile = next(item for item in db._added if isinstance(item, StudentProfile))
    teacher_link = next(item for item in db._added if isinstance(item, TeacherStudent))
    assert student_profile.display_name == "Student"
    assert student_profile.created_by_user_id == user.id
    assert student_profile.user_id is None
    assert teacher_link.teacher_user_id == user.id
    assert teacher_link.student_profile_id == student_profile.id
    assert result.id == student_profile.id
    assert result.name == "Student"
    assert result.birth_date == datetime(2014, 6, 1, tzinfo=UTC).date()
    assert result.user_id is None


def test_school_director_can_create_student_without_teacher_link() -> None:
    db = _FakeDB([])
    user = User(id=10, email="director@school.com", name="Director", password_hash="hashed")
    tenant = Tenant(id=21, type=TenantType.SCHOOL, name="School", slug="school-alpha")

    result = school.create_student(
        SchoolStudentCreateRequest(
            name="Student",
            birth_date=datetime(2014, 6, 1, tzinfo=UTC).date(),
        ),
        db,  # type: ignore[arg-type]
        tenant,
        user,
        Membership(user_id=user.id, tenant_id=tenant.id, role=MembershipRole.DIRECTOR),
    )

    student_profile = next(item for item in db._added if isinstance(item, StudentProfile))
    assert student_profile.display_name == "Student"
    assert all(not isinstance(item, TeacherStudent) for item in db._added)
    assert result.id == student_profile.id
    assert result.family_link_exists is False


def test_school_student_creation_links_family_child_when_provided() -> None:
    tenant = Tenant(id=21, type=TenantType.SCHOOL, name="School", slug="school-alpha")
    teacher = User(id=10, email="teacher@school.com", name="Teacher", password_hash="hashed")
    family_tenant = Tenant(id=31, type=TenantType.FAMILY, name="Family", slug="family-beta")
    child = ChildProfile(
        id=41,
        tenant_id=family_tenant.id,
        display_name="Ana",
        date_of_birth=datetime(2014, 6, 1, tzinfo=UTC).date(),
    )
    db = _FakeDB([child])

    result = school.create_student(
        SchoolStudentCreateRequest(
            name="Student",
            birth_date=datetime(2014, 6, 1, tzinfo=UTC).date(),
            child_profile_id=child.id,
        ),
        db,  # type: ignore[arg-type]
        tenant,
        teacher,
        Membership(user_id=teacher.id, tenant_id=tenant.id, role=MembershipRole.TEACHER),
    )

    student_profile = next(item for item in db._added if isinstance(item, StudentProfile))
    family_link = next(item for item in db._added if isinstance(item, StudentFamilyLink))
    assert student_profile.child_profile_id == child.id
    assert family_link.student_profile_id == student_profile.id
    assert family_link.child_profile_id == child.id
    assert family_link.linked_by_user_id == teacher.id
    assert result.child_profile_id == child.id
    assert result.family_link_exists is True


def test_school_student_creation_rejects_missing_child_profile() -> None:
    db = _FakeDB([None])
    tenant = Tenant(id=21, type=TenantType.SCHOOL, name="School", slug="school-alpha")
    teacher = User(id=10, email="teacher@school.com", name="Teacher", password_hash="hashed")

    with pytest.raises(HTTPException) as exc_info:
        school.create_student(
            SchoolStudentCreateRequest(
                name="Student",
                birth_date=datetime(2014, 6, 1, tzinfo=UTC).date(),
                child_profile_id=999,
            ),
            db,  # type: ignore[arg-type]
            tenant,
            teacher,
            Membership(user_id=teacher.id, tenant_id=tenant.id, role=MembershipRole.TEACHER),
        )

    assert exc_info.value.status_code == 404
    assert exc_info.value.detail == "Child profile not found"


def test_school_director_can_list_all_students_in_tenant() -> None:
    tenant = Tenant(id=21, type=TenantType.SCHOOL, name="School", slug="school-alpha")
    director = User(id=10, email="director@school.com", name="Director", password_hash="hashed")
    student_a = StudentProfile(
        id=101,
        tenant_id=tenant.id,
        display_name="Ana",
        date_of_birth=datetime(2014, 6, 1, tzinfo=UTC).date(),
        created_by_user_id=10,
        child_profile_id=41,
    )
    student_b = StudentProfile(
        id=102,
        tenant_id=tenant.id,
        display_name="Bia",
        date_of_birth=datetime(2013, 6, 1, tzinfo=UTC).date(),
        created_by_user_id=10,
    )
    db = _FakeDB([], execute_values=[[student_b, student_a], [student_a.id]])

    result = school.list_students(
        db,  # type: ignore[arg-type]
        tenant,
        director,
        Membership(user_id=director.id, tenant_id=tenant.id, role=MembershipRole.DIRECTOR),
    )

    assert [item.id for item in result] == [student_b.id, student_a.id]
    assert result[0].family_link_exists is False
    assert result[1].family_link_exists is True
    assert result[1].child_profile_id == 41


def test_school_teacher_can_list_only_linked_students() -> None:
    tenant = Tenant(id=21, type=TenantType.SCHOOL, name="School", slug="school-alpha")
    teacher = User(id=10, email="teacher@school.com", name="Teacher", password_hash="hashed")
    student = StudentProfile(
        id=101,
        tenant_id=tenant.id,
        display_name="Ana",
        date_of_birth=datetime(2014, 6, 1, tzinfo=UTC).date(),
        created_by_user_id=10,
    )
    db = _FakeDB([], execute_values=[[student], []])

    result = school.list_students(
        db,  # type: ignore[arg-type]
        tenant,
        teacher,
        Membership(user_id=teacher.id, tenant_id=tenant.id, role=MembershipRole.TEACHER),
    )

    assert len(result) == 1
    assert result[0].id == student.id
    assert result[0].family_link_exists is False


def test_school_teacher_can_list_my_students_with_login_flag() -> None:
    tenant = Tenant(id=21, type=TenantType.SCHOOL, name="School", slug="school-alpha")
    teacher = User(id=10, email="teacher@school.com", name="Teacher", password_hash="hashed")
    student_with_login = StudentProfile(
        id=101,
        tenant_id=tenant.id,
        display_name="Ana",
        date_of_birth=datetime(2014, 6, 1, tzinfo=UTC).date(),
        created_by_user_id=10,
        child_profile_id=41,
        user_id=501,
    )
    student_without_login = StudentProfile(
        id=102,
        tenant_id=tenant.id,
        display_name="Bia",
        date_of_birth=datetime(2013, 6, 1, tzinfo=UTC).date(),
        created_by_user_id=10,
    )
    db = _FakeDB([], execute_values=[[student_with_login, student_without_login]])

    result = school.list_my_students(
        db,  # type: ignore[arg-type]
        tenant,
        teacher,
        Membership(user_id=teacher.id, tenant_id=tenant.id, role=MembershipRole.TEACHER),
    )

    assert [item.id for item in result] == [student_with_login.id, student_without_login.id]
    assert result[0].child_profile_id == 41
    assert result[0].login_enabled is True
    assert result[1].login_enabled is False


def test_school_director_can_link_student_to_family_child() -> None:
    school_tenant = Tenant(id=21, type=TenantType.SCHOOL, name="School", slug="school-alpha")
    family_tenant = Tenant(id=31, type=TenantType.FAMILY, name="Family", slug="family-beta")
    director = User(id=10, email="director@school.com", name="Director", password_hash="hashed")
    student = StudentProfile(
        id=101,
        tenant_id=school_tenant.id,
        display_name="Ana",
        date_of_birth=datetime(2014, 6, 1, tzinfo=UTC).date(),
        created_by_user_id=director.id,
    )
    child = ChildProfile(
        id=41,
        tenant_id=family_tenant.id,
        display_name="Ana",
        date_of_birth=datetime(2014, 6, 1, tzinfo=UTC).date(),
    )
    db = _FakeDB([student, child, family_tenant, None, None])

    result = school.link_family_child(
        student.id,
        SchoolStudentFamilyLinkRequest(child_profile_id=child.id),
        db,  # type: ignore[arg-type]
        school_tenant,
        director,
        Membership(user_id=director.id, tenant_id=school_tenant.id, role=MembershipRole.DIRECTOR),
    )

    link = next(item for item in db._added if isinstance(item, StudentFamilyLink))
    assert link.student_profile_id == student.id
    assert link.child_profile_id == child.id
    assert link.linked_by_user_id == director.id
    assert student.child_profile_id == child.id
    assert result.child_profile_id == child.id
    assert result.family_link_exists is True


def test_school_director_link_family_child_updates_existing_link() -> None:
    school_tenant = Tenant(id=21, type=TenantType.SCHOOL, name="School", slug="school-alpha")
    family_tenant = Tenant(id=31, type=TenantType.FAMILY, name="Family", slug="family-beta")
    director = User(id=10, email="director@school.com", name="Director", password_hash="hashed")
    student = StudentProfile(
        id=101,
        tenant_id=school_tenant.id,
        display_name="Ana",
        date_of_birth=datetime(2014, 6, 1, tzinfo=UTC).date(),
        created_by_user_id=director.id,
        child_profile_id=40,
    )
    child = ChildProfile(
        id=41,
        tenant_id=family_tenant.id,
        display_name="Ana",
        date_of_birth=datetime(2014, 6, 1, tzinfo=UTC).date(),
    )
    existing_link = StudentFamilyLink(student_profile_id=student.id, child_profile_id=40, linked_by_user_id=99)
    db = _FakeDB([student, child, family_tenant, None, existing_link])

    result = school.link_family_child(
        student.id,
        SchoolStudentFamilyLinkRequest(child_profile_id=child.id),
        db,  # type: ignore[arg-type]
        school_tenant,
        director,
        Membership(user_id=director.id, tenant_id=school_tenant.id, role=MembershipRole.DIRECTOR),
    )

    assert all(not isinstance(item, StudentFamilyLink) for item in db._added)
    assert existing_link.child_profile_id == child.id
    assert existing_link.linked_by_user_id == director.id
    assert student.child_profile_id == child.id
    assert result.child_profile_id == child.id


def test_school_director_link_family_child_reuses_existing_pair_without_duplicate() -> None:
    school_tenant = Tenant(id=21, type=TenantType.SCHOOL, name="School", slug="school-alpha")
    family_tenant = Tenant(id=31, type=TenantType.FAMILY, name="Family", slug="family-beta")
    director = User(id=10, email="director@school.com", name="Director", password_hash="hashed")
    student = StudentProfile(
        id=101,
        tenant_id=school_tenant.id,
        display_name="Ana",
        date_of_birth=datetime(2014, 6, 1, tzinfo=UTC).date(),
        created_by_user_id=director.id,
    )
    child = ChildProfile(
        id=41,
        tenant_id=family_tenant.id,
        display_name="Ana",
        date_of_birth=datetime(2014, 6, 1, tzinfo=UTC).date(),
    )
    existing_link = StudentFamilyLink(student_profile_id=student.id, child_profile_id=child.id, linked_by_user_id=99)
    db = _FakeDB([student, child, family_tenant, existing_link])

    with pytest.raises(HTTPException) as exc_info:
        school.link_family_child(
            student.id,
            SchoolStudentFamilyLinkRequest(child_profile_id=child.id),
            db,  # type: ignore[arg-type]
            school_tenant,
            director,
            Membership(user_id=director.id, tenant_id=school_tenant.id, role=MembershipRole.DIRECTOR),
        )

    assert exc_info.value.status_code == 409
    assert exc_info.value.detail == "Student is already linked to this family child"
    assert all(not isinstance(item, StudentFamilyLink) for item in db._added)
    assert existing_link.child_profile_id == child.id
    assert student.child_profile_id is None


def test_school_director_can_request_family_link(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(school.settings, "cors_allowed_origins", "http://localhost:3000")
    school_tenant = Tenant(id=21, type=TenantType.SCHOOL, name="School", slug="school-alpha")
    family_tenant = Tenant(id=31, type=TenantType.FAMILY, name="Family", slug="family-beta")
    director = User(id=10, email="director@school.com", name="Director", password_hash="hashed")
    student = StudentProfile(
        id=101,
        tenant_id=school_tenant.id,
        display_name="Ana",
        date_of_birth=datetime(2014, 6, 1, tzinfo=UTC).date(),
        created_by_user_id=director.id,
    )
    child = ChildProfile(
        id=41,
        tenant_id=family_tenant.id,
        display_name="Ana",
        date_of_birth=datetime(2014, 6, 1, tzinfo=UTC).date(),
    )
    db = _FakeDB([student, child, family_tenant, None, None])
    events = _FakeEvents()

    result = school.request_family_link(
        student.id,
        SchoolStudentFamilyLinkRequest(child_profile_id=child.id),
        db,  # type: ignore[arg-type]
        events,  # type: ignore[arg-type]
        school_tenant,
        director,
        Membership(user_id=director.id, tenant_id=school_tenant.id, role=MembershipRole.DIRECTOR),
    )

    link_request = next(item for item in db._added if isinstance(item, SchoolFamilyLinkRequest))
    assert link_request.status == "pending"
    assert result.status == "pending"
    assert result.child_profile_id == child.id
    assert result.student_profile_id == student.id
    assert result.confirmation_link is not None
    assert events.emitted[0]["type"] == "school.family_link.requested"


def test_school_request_family_link_does_not_auto_approve(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(school.settings, "cors_allowed_origins", "http://localhost:3000")
    school_tenant = Tenant(id=21, type=TenantType.SCHOOL, name="School", slug="school-alpha")
    family_tenant = Tenant(id=31, type=TenantType.FAMILY, name="Family", slug="family-beta")
    director = User(id=10, email="director@school.com", name="Director", password_hash="hashed")
    student = StudentProfile(
        id=101,
        tenant_id=school_tenant.id,
        display_name="Ana",
        date_of_birth=datetime(2014, 6, 1, tzinfo=UTC).date(),
        created_by_user_id=director.id,
    )
    child = ChildProfile(
        id=41,
        tenant_id=family_tenant.id,
        display_name="Ana",
        date_of_birth=datetime(2014, 6, 1, tzinfo=UTC).date(),
    )
    db = _FakeDB([student, child, family_tenant, None, None])
    events = _FakeEvents()

    result = school.request_family_link(
        student.id,
        SchoolStudentFamilyLinkRequest(child_profile_id=child.id),
        db,  # type: ignore[arg-type]
        events,  # type: ignore[arg-type]
        school_tenant,
        director,
        Membership(user_id=director.id, tenant_id=school_tenant.id, role=MembershipRole.DIRECTOR),
    )

    assert result.status == "pending"
    assert all(not isinstance(item, StudentFamilyLink) for item in db._added)
    assert student.child_profile_id is None


def test_family_parent_can_accept_school_family_link() -> None:
    school_tenant = Tenant(id=21, type=TenantType.SCHOOL, name="School", slug="school-alpha")
    family_tenant = Tenant(id=31, type=TenantType.FAMILY, name="Family", slug="family-beta")
    parent = User(id=10, email="parent@family.com", name="Parent", password_hash="hashed")
    student = StudentProfile(
        id=101,
        tenant_id=school_tenant.id,
        display_name="Ana",
        date_of_birth=datetime(2014, 6, 1, tzinfo=UTC).date(),
        created_by_user_id=99,
    )
    child = ChildProfile(
        id=41,
        tenant_id=family_tenant.id,
        display_name="Ana",
        date_of_birth=datetime(2014, 6, 1, tzinfo=UTC).date(),
    )
    link_request = SchoolFamilyLinkRequest(
        student_profile_id=student.id,
        child_profile_id=child.id,
        requested_by_user_id=77,
        token="request-token",
        status="pending",
        expires_at=datetime.now(UTC) + timedelta(days=1),
    )
    db = _FakeDB([link_request, child, student, None, None])

    result = school.accept_family_link(
        SchoolStudentFamilyLinkAcceptRequest(token="request-token"),
        db,  # type: ignore[arg-type]
        family_tenant,
        parent,
        Membership(user_id=parent.id, tenant_id=family_tenant.id, role=MembershipRole.PARENT),
    )

    link = next(item for item in db._added if isinstance(item, StudentFamilyLink))
    assert link.student_profile_id == student.id
    assert link.child_profile_id == child.id
    assert student.child_profile_id == child.id
    assert link_request.status == "accepted"
    assert link_request.accepted_by_user_id == parent.id
    assert result.status == "accepted"


def test_family_link_accept_marks_request_expired() -> None:
    family_tenant = Tenant(id=31, type=TenantType.FAMILY, name="Family", slug="family-beta")
    parent = User(id=10, email="parent@family.com", name="Parent", password_hash="hashed")
    link_request = SchoolFamilyLinkRequest(
        student_profile_id=101,
        child_profile_id=41,
        requested_by_user_id=77,
        token="expired-token",
        status="pending",
        expires_at=datetime.now(UTC) - timedelta(minutes=1),
    )
    db = _FakeDB([link_request])

    with pytest.raises(HTTPException) as exc_info:
        school.accept_family_link(
            SchoolStudentFamilyLinkAcceptRequest(token="expired-token"),
            db,  # type: ignore[arg-type]
            family_tenant,
            parent,
            Membership(user_id=parent.id, tenant_id=family_tenant.id, role=MembershipRole.GUARDIAN),
        )

    assert exc_info.value.status_code == 410
    assert exc_info.value.detail == "Family link request expired"
    assert link_request.status == "expired"


def test_school_director_can_enable_student_login(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(school, "hash_password", lambda *_args, **_kwargs: "hashed")

    tenant = Tenant(id=21, type=TenantType.SCHOOL, name="School", slug="school-alpha")
    director = User(id=10, email="director@school.com", name="Director", password_hash="hashed")
    student_profile = StudentProfile(
        id=101,
        tenant_id=tenant.id,
        display_name="Ana",
        date_of_birth=datetime(2014, 6, 1, tzinfo=UTC).date(),
        created_by_user_id=director.id,
        child_profile_id=41,
    )
    db = _FakeDB([student_profile, None, None])

    result = school.enable_student_login(
        student_profile.id,
        SchoolEnableStudentLoginRequest(email="ana@school.com", password="Axion@1234"),
        db,  # type: ignore[arg-type]
        tenant,
        director,
        Membership(user_id=director.id, tenant_id=tenant.id, role=MembershipRole.DIRECTOR),
    )

    student_user = next(item for item in db._added if isinstance(item, User) and item.email == "ana@school.com")
    membership = next(item for item in db._added if isinstance(item, Membership) and item.user_id == student_user.id)
    assert student_profile.user_id == student_user.id
    assert membership.role == MembershipRole.STUDENT
    assert result.id == student_profile.id
    assert result.user_id == student_user.id
    assert result.family_link_exists is True


def test_school_enable_student_login_rejects_when_already_enabled() -> None:
    tenant = Tenant(id=21, type=TenantType.SCHOOL, name="School", slug="school-alpha")
    director = User(id=10, email="director@school.com", name="Director", password_hash="hashed")
    student_profile = StudentProfile(
        id=101,
        tenant_id=tenant.id,
        display_name="Ana",
        date_of_birth=datetime(2014, 6, 1, tzinfo=UTC).date(),
        created_by_user_id=director.id,
        user_id=999,
    )
    db = _FakeDB([student_profile])

    with pytest.raises(HTTPException) as exc_info:
        school.enable_student_login(
            student_profile.id,
            SchoolEnableStudentLoginRequest(email="ana@school.com", password="Axion@1234"),
            db,  # type: ignore[arg-type]
            tenant,
            director,
            Membership(user_id=director.id, tenant_id=tenant.id, role=MembershipRole.DIRECTOR),
        )

    assert exc_info.value.status_code == 409
    assert exc_info.value.detail == "Student login is already enabled"


def test_school_routes_reject_non_school_tenant() -> None:
    db = _FakeDB([])
    tenant = Tenant(id=21, type=TenantType.FAMILY, name="Family", slug="family-beta")
    user = User(id=10, email="director@family.com", name="Director", password_hash="hashed")

    with pytest.raises(HTTPException) as exc_info:
        school.create_teacher(
            SchoolTeacherCreateRequest(name="Teacher", email="teacher@school.com", password="Axion@1234"),
            db,  # type: ignore[arg-type]
            tenant,
            user,
            Membership(user_id=user.id, tenant_id=tenant.id, role=MembershipRole.DIRECTOR),
        )

    assert exc_info.value.status_code == 403
    assert exc_info.value.detail == "School hierarchy is only allowed for school tenants"


def test_school_student_creation_rejects_non_school_tenant() -> None:
    db = _FakeDB([])
    tenant = Tenant(id=21, type=TenantType.FAMILY, name="Family", slug="family-beta")
    user = User(id=10, email="teacher@family.com", name="Teacher", password_hash="hashed")

    with pytest.raises(HTTPException) as exc_info:
        school.create_student(
            SchoolStudentCreateRequest(
                name="Student",
                birth_date=datetime(2014, 6, 1, tzinfo=UTC).date(),
            ),
            db,  # type: ignore[arg-type]
            tenant,
            user,
            Membership(user_id=user.id, tenant_id=tenant.id, role=MembershipRole.TEACHER),
        )

    assert exc_info.value.status_code == 403
    assert exc_info.value.detail == "School hierarchy is only allowed for school tenants"


def test_tenant_type_enum_includes_system_admin() -> None:
    assert TenantType.SYSTEM_ADMIN.value == "SYSTEM_ADMIN"


def test_axion_studio_tenant_schemas_accept_system_admin() -> None:
    create_request = AxionTenantCreateRequest(
        name="Platform",
        slug="platform-admin-2",
        type="SYSTEM_ADMIN",
        adminEmail="admin@local.com",
        adminName="Admin",
        adminPassword="Axion@1234",
    )
    update_request = AxionTenantUpdateRequest(
        name="Platform",
        type="SYSTEM_ADMIN",
        adminEmail="admin@local.com",
        adminName="Admin",
        adminPassword=None,
        resetExistingUserPassword=False,
    )

    assert create_request.type == "SYSTEM_ADMIN"
    assert update_request.type == "SYSTEM_ADMIN"


def test_login_primary_returns_memberships_and_non_tenant_token(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(auth, "verify_password", lambda *_args, **_kwargs: True)

    user = User(id=10, email="parent@local.com", name="Parent", password_hash="hashed")
    user.created_at = datetime.now(UTC)
    school = Tenant(id=20, type=TenantType.SCHOOL, name="School", slug="school-alpha")
    family = Tenant(id=21, type=TenantType.FAMILY, name="Family", slug="family-beta")
    memberships = [
        (Membership(user_id=user.id, tenant_id=family.id, role=MembershipRole.PARENT), family),
        (Membership(user_id=user.id, tenant_id=school.id, role=MembershipRole.TEACHER), school),
    ]
    db = _FakeDB([user], execute_values=[memberships])

    result = auth.login_primary(
        LoginRequest(email="parent@local.com", password="Axion@123"),
        db,  # type: ignore[arg-type]
    )

    claims = auth.decode_token(result.access_token)
    assert claims["sub"] == str(user.id)
    assert claims["type"] == "access"
    assert claims["primary_login"] is True
    assert claims["role"] == "PRIMARY_AUTH"
    assert claims["tenant_id"] is None
    assert result.user.email == "parent@local.com"
    assert [item.tenant_slug for item in result.memberships] == ["family-beta", "school-alpha"]
    assert [item.role for item in result.memberships] == ["PARENT", "TEACHER"]


def test_login_keeps_tenant_scoped_token(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(auth, "verify_password", lambda *_args, **_kwargs: True)
    monkeypatch.setattr(auth, "_set_auth_cookies", lambda *_args, **_kwargs: None)

    user = User(id=10, email="parent@local.com", name="Parent", password_hash="hashed")
    user.created_at = datetime.now(UTC)
    tenant = Tenant(id=21, type=TenantType.FAMILY, name="Family", slug="family-beta")
    membership = Membership(user_id=user.id, tenant_id=tenant.id, role=MembershipRole.PARENT)
    db = _FakeDB([user, membership])

    result = auth.login(
        LoginRequest(email="parent@local.com", password="Axion@123"),
        db,  # type: ignore[arg-type]
        Response(),
        tenant,
    )

    claims = auth.decode_token(result.access_token)
    assert claims["tenant_id"] == tenant.id
    assert claims["role"] == "PARENT"


def test_select_tenant_issues_tenant_scoped_tokens(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(auth, "_set_auth_cookies", lambda *_args, **_kwargs: None)

    user = User(id=10, email="parent@local.com", name="Parent", password_hash="hashed")
    user.created_at = datetime.now(UTC)
    tenant = Tenant(id=21, type=TenantType.FAMILY, name="Family", slug="family-beta")
    school = Tenant(id=22, type=TenantType.SCHOOL, name="School", slug="school-alpha")
    db = _FakeDB(
        [user],
        execute_values=[[
            (Membership(user_id=user.id, tenant_id=tenant.id, role=MembershipRole.PARENT), tenant),
            (Membership(user_id=user.id, tenant_id=school.id, role=MembershipRole.TEACHER), school),
        ]],
    )
    request = SimpleNamespace(state=SimpleNamespace(), url=SimpleNamespace(path="/auth/select-tenant"))
    credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=auth.create_primary_access_token(user_id=user.id))
    current_user = deps.get_current_user(
        db,  # type: ignore[arg-type]
        request,  # type: ignore[arg-type]
        credentials,
    )

    result = auth.select_tenant(
        SelectTenantRequest(tenant_slug="school-alpha"),
        db,  # type: ignore[arg-type]
        Response(),
        current_user,
    )

    claims = auth.decode_token(result.access_token)
    assert claims["sub"] == str(user.id)
    assert claims["tenant_id"] == school.id
    assert claims["role"] == "TEACHER"
    assert result.tenant_slug == "school-alpha"
    assert result.role == "TEACHER"


def test_select_tenant_rejects_missing_membership(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(auth, "_set_auth_cookies", lambda *_args, **_kwargs: None)

    user = User(id=10, email="parent@local.com", name="Parent", password_hash="hashed")
    db = _FakeDB(
        [user],
        execute_values=[[
            (
                Membership(user_id=user.id, tenant_id=21, role=MembershipRole.PARENT),
                Tenant(id=21, type=TenantType.FAMILY, name="Family", slug="family-beta"),
            ),
        ]],
    )

    with pytest.raises(HTTPException) as exc_info:
        auth.select_tenant(
            SelectTenantRequest(tenant_slug="school-alpha"),
            db,  # type: ignore[arg-type]
            Response(),
            user,
        )

    assert exc_info.value.status_code == 403
    assert exc_info.value.detail == "User is not in this tenant"


def test_refresh_resolves_tenant_from_token_without_header(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(auth, "_set_auth_cookies", lambda *_args, **_kwargs: None)

    user = User(id=10, email="parent@local.com", name="Parent", password_hash="hashed")
    tenant = Tenant(id=21, type=TenantType.FAMILY, name="Family", slug="family-beta")
    membership = Membership(user_id=user.id, tenant_id=tenant.id, role=MembershipRole.PARENT)
    refresh_token = auth.create_refresh_token(user_id=user.id, tenant_id=tenant.id, role=membership.role.value)
    request = SimpleNamespace(cookies={}, state=SimpleNamespace())
    db = _FakeDB([tenant, user, membership])

    result = auth.refresh(
        RefreshRequest(refresh_token=refresh_token),
        request,  # type: ignore[arg-type]
        Response(),
        db,  # type: ignore[arg-type]
        None,
    )

    claims = auth.decode_token(result.access_token)
    assert claims["tenant_id"] == tenant.id
    assert claims["role"] == "PARENT"


def test_refresh_keeps_header_mismatch_protection(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(auth, "_set_auth_cookies", lambda *_args, **_kwargs: None)

    user = User(id=10, email="parent@local.com", name="Parent", password_hash="hashed")
    tenant_from_header = Tenant(id=21, type=TenantType.FAMILY, name="Family", slug="family-beta")
    tenant_from_token = Tenant(id=22, type=TenantType.SCHOOL, name="School", slug="school-alpha")
    refresh_token = auth.create_refresh_token(user_id=user.id, tenant_id=tenant_from_token.id, role="TEACHER")
    request = SimpleNamespace(cookies={}, state=SimpleNamespace())
    db = _FakeDB([user])

    with pytest.raises(HTTPException) as exc_info:
        auth.refresh(
            RefreshRequest(refresh_token=refresh_token),
            request,  # type: ignore[arg-type]
            Response(),
            db,  # type: ignore[arg-type]
            tenant_from_header,
        )

    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == "Tenant mismatch in refresh token"


def test_platform_login_requires_platform_admin_role(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(auth, "verify_password", lambda *_args, **_kwargs: True)
    monkeypatch.setattr(auth, "_set_auth_cookies", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(auth.settings, "platform_admin_emails", "admin@local.com")

    user = User(id=10, email="admin@local.com", name="Admin", password_hash="hashed")
    tenant = Tenant(id=20, type=TenantType.SCHOOL, name="Platform", slug="platform-admin")
    membership = Membership(user_id=user.id, tenant_id=tenant.id, role=MembershipRole.TEACHER)
    db = _FakeDB([user, tenant, membership])

    with pytest.raises(HTTPException) as exc_info:
        auth.platform_login(
            LoginRequest(email="admin@local.com", password="Axion@123"),
            db,  # type: ignore[arg-type]
            Response(),
        )
    assert exc_info.value.status_code == 403
    assert exc_info.value.detail == "Platform admin role required for platform login"


def test_primary_login_token_requires_tenant_selection_for_other_routes() -> None:
    token = auth.create_primary_access_token(user_id=10)
    user = User(id=10, email="parent@local.com", name="Parent", password_hash="hashed")
    db = _FakeDB([user])
    request = SimpleNamespace(state=SimpleNamespace(), url=SimpleNamespace(path="/auth/change-password"))
    credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)

    with pytest.raises(HTTPException) as exc_info:
        deps.get_current_user(
            db,  # type: ignore[arg-type]
            request,  # type: ignore[arg-type]
            credentials,
        )

    assert exc_info.value.status_code == 403
    assert exc_info.value.detail == "Primary login token requires tenant selection"


def test_admin_scope_rejects_non_platform_admin_role() -> None:
    request = SimpleNamespace(state=SimpleNamespace(auth_role="TEACHER"))
    user = User(id=1, email="admin@local.com", name="Admin", password_hash="hashed")
    tenant = Tenant(id=7, type=TenantType.SCHOOL, name="Platform", slug="platform-admin")

    with pytest.raises(HTTPException) as exc_info:
        _resolve_admin_tenant_scope(
            request=request,  # type: ignore[arg-type]
            endpoint="/admin/experiments/access",
            user=user,
            tenant=tenant,
        )
    assert exc_info.value.status_code == 403
    assert exc_info.value.detail == "Platform admin role required"
