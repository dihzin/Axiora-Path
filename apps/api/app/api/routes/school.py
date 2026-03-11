from __future__ import annotations

from datetime import UTC, datetime, timedelta
from secrets import token_urlsafe
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select

from app.api.deps import DBSession, EventSvc, get_current_tenant, get_current_user, require_role
from app.core.config import settings
from app.core.security import hash_password, validate_password_strength
from app.models import (
    ChildProfile,
    Membership,
    MembershipRole,
    SchoolFamilyLinkRequest,
    StudentFamilyLink,
    StudentProfile,
    TeacherStudent,
    Tenant,
    TenantType,
    User,
)
from app.schemas.school import (
    SchoolEnableStudentLoginRequest,
    SchoolMemberOut,
    SchoolStudentCreateRequest,
    SchoolStudentFamilyLinkAcceptRequest,
    SchoolStudentFamilyLinkRequest,
    SchoolStudentFamilyLinkStatusOut,
    SchoolStudentProfileOut,
    SchoolTeacherListItemOut,
    SchoolTeacherStudentListItemOut,
    SchoolTeacherCreateRequest,
)

router = APIRouter(prefix="/school", tags=["school"])


def _ensure_school_tenant(tenant: Tenant) -> None:
    if tenant.type != TenantType.SCHOOL:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="School hierarchy is only allowed for school tenants")


def _to_school_member_out(user: User, role: MembershipRole) -> SchoolMemberOut:
    return SchoolMemberOut(
        user_id=user.id,
        name=user.name,
        email=user.email,
        role=role.value,
    )


def _resolve_family_link_base_url() -> str:
    origin = settings.cors_allowed_origins.split(",")[0].strip()
    return origin.rstrip("/") if origin else "http://localhost:3000"


def _to_school_student_profile_out(
    student_profile: StudentProfile,
    *,
    family_link_exists: bool,
) -> SchoolStudentProfileOut:
    created_at = student_profile.created_at or datetime.now(UTC)
    return SchoolStudentProfileOut(
        id=student_profile.id,
        organization_id=student_profile.tenant_id,
        name=student_profile.display_name,
        birth_date=student_profile.date_of_birth,
        child_profile_id=student_profile.child_profile_id,
        user_id=student_profile.user_id,
        created_at=created_at,
        family_link_exists=family_link_exists,
    )


def _to_school_family_link_status_out(
    link_request: SchoolFamilyLinkRequest,
    *,
    confirmation_link: str | None = None,
) -> SchoolStudentFamilyLinkStatusOut:
    return SchoolStudentFamilyLinkStatusOut(
        student_profile_id=link_request.student_profile_id,
        child_profile_id=link_request.child_profile_id,
        status=link_request.status,  # type: ignore[arg-type]
        token=link_request.token,
        expires_at=link_request.expires_at,
        confirmation_link=confirmation_link,
    )


def _to_school_teacher_student_out(student_profile: StudentProfile) -> SchoolTeacherStudentListItemOut:
    return SchoolTeacherStudentListItemOut(
        id=student_profile.id,
        name=student_profile.display_name,
        birth_date=student_profile.date_of_birth,
        child_profile_id=student_profile.child_profile_id,
        login_enabled=student_profile.user_id is not None,
    )


@router.get("/teachers", response_model=list[SchoolTeacherListItemOut])
def list_teachers(
    db: DBSession,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    _: Annotated[User, Depends(get_current_user)],
    __: Annotated[Membership, Depends(require_role(["DIRECTOR"]))],
) -> list[SchoolTeacherListItemOut]:
    _ensure_school_tenant(tenant)

    teachers = db.scalars(
        select(User)
        .join(Membership, Membership.user_id == User.id)
        .where(
            Membership.tenant_id == tenant.id,
            Membership.role == MembershipRole.TEACHER,
        )
        .order_by(User.created_at.desc(), User.id.desc())
    ).all()

    return [
        SchoolTeacherListItemOut(
            id=teacher.id,
            name=teacher.name,
            email=teacher.email,
            created_at=teacher.created_at,
        )
        for teacher in teachers
    ]


@router.get("/me/students", response_model=list[SchoolTeacherStudentListItemOut])
def list_my_students(
    db: DBSession,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    user: Annotated[User, Depends(get_current_user)],
    __: Annotated[Membership, Depends(require_role(["TEACHER"]))],
) -> list[SchoolTeacherStudentListItemOut]:
    _ensure_school_tenant(tenant)

    student_profiles = db.scalars(
        select(StudentProfile)
        .join(TeacherStudent, TeacherStudent.student_profile_id == StudentProfile.id)
        .where(
            StudentProfile.tenant_id == tenant.id,
            TeacherStudent.teacher_user_id == user.id,
        )
        .order_by(StudentProfile.created_at.desc(), StudentProfile.id.desc())
    ).all()

    return [_to_school_teacher_student_out(student_profile) for student_profile in student_profiles]


@router.post("/students/{student_id}/request-family-link", response_model=SchoolStudentFamilyLinkStatusOut, status_code=status.HTTP_201_CREATED)
def request_family_link(
    student_id: int,
    payload: SchoolStudentFamilyLinkRequest,
    db: DBSession,
    events: EventSvc,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    user: Annotated[User, Depends(get_current_user)],
    __: Annotated[Membership, Depends(require_role(["DIRECTOR"]))],
) -> SchoolStudentFamilyLinkStatusOut:
    _ensure_school_tenant(tenant)

    student_profile = db.scalar(
        select(StudentProfile).where(
            StudentProfile.id == student_id,
            StudentProfile.tenant_id == tenant.id,
        )
    )
    if student_profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student profile not found")

    child_profile = db.get(ChildProfile, payload.child_profile_id)
    if child_profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Child profile not found")
    family_tenant = db.get(Tenant, child_profile.tenant_id)
    if family_tenant is None or family_tenant.type != TenantType.FAMILY:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Child profile must belong to a family tenant")

    existing_link = db.scalar(
        select(StudentFamilyLink).where(
            StudentFamilyLink.student_profile_id == student_profile.id,
            StudentFamilyLink.child_profile_id == child_profile.id,
        )
    )
    if existing_link is not None:
        synthetic_status = SchoolFamilyLinkRequest(
            student_profile_id=student_profile.id,
            child_profile_id=child_profile.id,
            requested_by_user_id=user.id,
            token="already-linked",
            status="accepted",
            expires_at=datetime.now(UTC) + timedelta(days=7),
        )
        return _to_school_family_link_status_out(synthetic_status)

    existing_request = db.scalar(
        select(SchoolFamilyLinkRequest).where(
            SchoolFamilyLinkRequest.student_profile_id == student_profile.id,
            SchoolFamilyLinkRequest.child_profile_id == child_profile.id,
            SchoolFamilyLinkRequest.status == "pending",
        )
    )
    if existing_request is not None and existing_request.expires_at >= datetime.now(UTC):
        confirmation_link = f"{_resolve_family_link_base_url()}/accept-school-family-link?token={existing_request.token}"
        return _to_school_family_link_status_out(existing_request, confirmation_link=confirmation_link)

    token = token_urlsafe(32)
    expires_at = datetime.now(UTC) + timedelta(days=7)
    link_request = SchoolFamilyLinkRequest(
        student_profile_id=student_profile.id,
        child_profile_id=child_profile.id,
        requested_by_user_id=user.id,
        token=token,
        status="pending",
        expires_at=expires_at,
    )
    db.add(link_request)
    db.flush()

    confirmation_link = f"{_resolve_family_link_base_url()}/accept-school-family-link?token={token}"
    events.emit(
        type="school.family_link.requested",
        tenant_id=tenant.id,
        actor_user_id=user.id,
        payload={
            "student_profile_id": student_profile.id,
            "child_profile_id": child_profile.id,
            "family_tenant_id": family_tenant.id,
            "token": token,
            "confirmation_link": confirmation_link,
        },
    )
    db.commit()
    return _to_school_family_link_status_out(link_request, confirmation_link=confirmation_link)


@router.get("/students", response_model=list[SchoolStudentProfileOut])
def list_students(
    db: DBSession,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    user: Annotated[User, Depends(get_current_user)],
    membership: Annotated[Membership, Depends(require_role(["TEACHER"]))],
) -> list[SchoolStudentProfileOut]:
    _ensure_school_tenant(tenant)

    if membership.role == MembershipRole.DIRECTOR:
        student_profiles = db.scalars(
            select(StudentProfile)
            .where(StudentProfile.tenant_id == tenant.id)
            .order_by(StudentProfile.created_at.desc(), StudentProfile.id.desc())
        ).all()
    else:
        student_profiles = db.scalars(
            select(StudentProfile)
            .join(TeacherStudent, TeacherStudent.student_profile_id == StudentProfile.id)
            .where(
                StudentProfile.tenant_id == tenant.id,
                TeacherStudent.teacher_user_id == user.id,
            )
            .order_by(StudentProfile.created_at.desc(), StudentProfile.id.desc())
        ).all()

    linked_student_ids = {
        student_id
        for student_id in db.scalars(
            select(StudentFamilyLink.student_profile_id).where(
                StudentFamilyLink.student_profile_id.in_([item.id for item in student_profiles])
            )
        ).all()
    }

    return [
        _to_school_student_profile_out(
            student_profile,
            family_link_exists=student_profile.id in linked_student_ids,
        )
        for student_profile in student_profiles
    ]


@router.post("/teachers", response_model=SchoolMemberOut, status_code=status.HTTP_201_CREATED)
def create_teacher(
    payload: SchoolTeacherCreateRequest,
    db: DBSession,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    _: Annotated[User, Depends(get_current_user)],
    __: Annotated[Membership, Depends(require_role(["DIRECTOR"]))],
) -> SchoolMemberOut:
    _ensure_school_tenant(tenant)

    existing_user = db.scalar(select(User).where(User.email == payload.email.strip().lower()))
    if existing_user is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already in use")

    password_error = validate_password_strength(payload.password)
    if password_error is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=password_error)

    teacher = User(
        email=payload.email.strip().lower(),
        name=payload.name.strip(),
        password_hash=hash_password(payload.password),
    )
    db.add(teacher)
    db.flush()

    membership = Membership(
        tenant_id=tenant.id,
        user_id=teacher.id,
        role=MembershipRole.TEACHER,
    )
    db.add(membership)
    db.commit()
    return _to_school_member_out(teacher, membership.role)


@router.post("/students", response_model=SchoolStudentProfileOut, status_code=status.HTTP_201_CREATED)
def create_student(
    payload: SchoolStudentCreateRequest,
    db: DBSession,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    user: Annotated[User, Depends(get_current_user)],
    membership: Annotated[Membership, Depends(require_role(["TEACHER"]))],
) -> SchoolStudentProfileOut:
    _ensure_school_tenant(tenant)

    child_profile: ChildProfile | None = None
    if payload.child_profile_id is not None:
        child_profile = db.get(ChildProfile, payload.child_profile_id)
        if child_profile is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Child profile not found")

    student_profile = StudentProfile(
        tenant_id=tenant.id,
        display_name=payload.name.strip(),
        date_of_birth=payload.birth_date,
        created_by_user_id=user.id,
        child_profile_id=payload.child_profile_id,
    )
    db.add(student_profile)
    db.flush()

    if membership.role == MembershipRole.TEACHER:
        db.add(
            TeacherStudent(
                teacher_user_id=user.id,
                student_profile_id=student_profile.id,
            )
        )

    if child_profile is not None:
        db.add(
            StudentFamilyLink(
                student_profile_id=student_profile.id,
                child_profile_id=child_profile.id,
                linked_by_user_id=user.id,
            )
        )

    db.commit()
    return _to_school_student_profile_out(
        student_profile,
        family_link_exists=child_profile is not None,
    )


@router.post("/students/{student_id}/link-family-child", response_model=SchoolStudentProfileOut)
def link_family_child(
    student_id: int,
    payload: SchoolStudentFamilyLinkRequest,
    db: DBSession,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    user: Annotated[User, Depends(get_current_user)],
    __: Annotated[Membership, Depends(require_role(["DIRECTOR"]))],
) -> SchoolStudentProfileOut:
    _ensure_school_tenant(tenant)

    student_profile = db.scalar(
        select(StudentProfile).where(
            StudentProfile.id == student_id,
            StudentProfile.tenant_id == tenant.id,
        )
    )
    if student_profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student profile not found")

    child_profile = db.get(ChildProfile, payload.child_profile_id)
    if child_profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Child profile not found")
    child_tenant = db.get(Tenant, child_profile.tenant_id)
    if child_tenant is None or child_tenant.type != TenantType.FAMILY:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Child profile must belong to a family tenant")

    existing_link = db.scalar(
        select(StudentFamilyLink).where(
            StudentFamilyLink.student_profile_id == student_profile.id,
            StudentFamilyLink.child_profile_id == child_profile.id,
        )
    )
    if existing_link is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Student is already linked to this family child")

    if existing_link is None:
        existing_link = db.scalar(
            select(StudentFamilyLink).where(StudentFamilyLink.student_profile_id == student_profile.id)
        )
        if existing_link is None:
            db.add(
                StudentFamilyLink(
                    student_profile_id=student_profile.id,
                    child_profile_id=child_profile.id,
                    linked_by_user_id=user.id,
                )
            )
        else:
            existing_link.child_profile_id = child_profile.id
            existing_link.linked_by_user_id = user.id

    student_profile.child_profile_id = child_profile.id
    db.commit()
    return _to_school_student_profile_out(student_profile, family_link_exists=True)


@router.post("/family-link/accept", response_model=SchoolStudentFamilyLinkStatusOut)
def accept_family_link(
    payload: SchoolStudentFamilyLinkAcceptRequest,
    db: DBSession,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    user: Annotated[User, Depends(get_current_user)],
    __: Annotated[Membership, Depends(require_role(["PARENT", "GUARDIAN"]))],
) -> SchoolStudentFamilyLinkStatusOut:
    if tenant.type != TenantType.FAMILY:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Family link acceptance is only allowed for family tenants")

    link_request = db.scalar(select(SchoolFamilyLinkRequest).where(SchoolFamilyLinkRequest.token == payload.token))
    if link_request is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Family link request not found")
    if link_request.status == "accepted":
        return _to_school_family_link_status_out(link_request)
    if link_request.status == "rejected":
        return _to_school_family_link_status_out(link_request)
    if link_request.expires_at < datetime.now(UTC):
        link_request.status = "expired"
        link_request.decided_at = datetime.now(UTC)
        db.commit()
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="Family link request expired")

    child_profile = db.get(ChildProfile, link_request.child_profile_id)
    if child_profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Child profile not found")
    if child_profile.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the target family can accept this link")

    student_profile = db.get(StudentProfile, link_request.student_profile_id)
    if student_profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student profile not found")

    existing_link = db.scalar(
        select(StudentFamilyLink).where(
            StudentFamilyLink.student_profile_id == student_profile.id,
            StudentFamilyLink.child_profile_id == child_profile.id,
        )
    )
    if existing_link is None:
        existing_link = db.scalar(
            select(StudentFamilyLink).where(StudentFamilyLink.student_profile_id == student_profile.id)
        )
        if existing_link is None:
            db.add(
                StudentFamilyLink(
                    student_profile_id=student_profile.id,
                    child_profile_id=child_profile.id,
                    linked_by_user_id=user.id,
                )
            )
        else:
            existing_link.child_profile_id = child_profile.id
            existing_link.linked_by_user_id = user.id

    student_profile.child_profile_id = child_profile.id
    link_request.status = "accepted"
    link_request.accepted_by_user_id = user.id
    link_request.decided_at = datetime.now(UTC)
    db.commit()
    return _to_school_family_link_status_out(link_request)


@router.post("/students/{student_id}/enable-login", response_model=SchoolStudentProfileOut)
def enable_student_login(
    student_id: int,
    payload: SchoolEnableStudentLoginRequest,
    db: DBSession,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    _: Annotated[User, Depends(get_current_user)],
    __: Annotated[Membership, Depends(require_role(["DIRECTOR"]))],
) -> SchoolStudentProfileOut:
    _ensure_school_tenant(tenant)

    student_profile = db.scalar(
        select(StudentProfile).where(
            StudentProfile.id == student_id,
            StudentProfile.tenant_id == tenant.id,
        )
    )
    if student_profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student profile not found")
    if student_profile.user_id is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Student login is already enabled")

    normalized_email = payload.email.strip().lower()
    if not normalized_email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email is required")
    existing_user = db.scalar(select(User).where(User.email == normalized_email))
    if existing_user is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already in use")

    password_error = validate_password_strength(payload.password)
    if password_error is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=password_error)

    student_user = User(
        email=normalized_email,
        name=(payload.name or student_profile.display_name).strip(),
        password_hash=hash_password(payload.password),
    )
    db.add(student_user)
    db.flush()

    student_profile.user_id = student_user.id
    membership = db.scalar(
        select(Membership).where(
            Membership.user_id == student_user.id,
            Membership.tenant_id == tenant.id,
        )
    )
    if membership is None:
        db.add(
            Membership(
                tenant_id=tenant.id,
                user_id=student_user.id,
                role=MembershipRole.STUDENT,
            )
        )

    db.commit()
    return _to_school_student_profile_out(
        student_profile,
        family_link_exists=student_profile.child_profile_id is not None,
    )
