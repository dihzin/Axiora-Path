from __future__ import annotations

import os

from sqlalchemy import select

from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models import Membership, MembershipRole, Tenant, TenantType, User

DEFAULT_ADMIN_EMAIL = "admin@local.com"
DEFAULT_ADMIN_PASSWORD = "Axion@123"
DEFAULT_ADMIN_NAME = "Admin"
DEFAULT_TENANT_NAME = "Platform Admin"
DEFAULT_TENANT_SLUG = "platform-admin"


def run_seed() -> None:
    admin_email = os.getenv("AXIORA_LOCAL_PLATFORM_ADMIN_EMAIL", DEFAULT_ADMIN_EMAIL).strip().lower()
    admin_password = os.getenv("AXIORA_LOCAL_PLATFORM_ADMIN_PASSWORD", DEFAULT_ADMIN_PASSWORD)
    admin_name = os.getenv("AXIORA_LOCAL_PLATFORM_ADMIN_NAME", DEFAULT_ADMIN_NAME).strip() or DEFAULT_ADMIN_NAME

    with SessionLocal() as db:
        tenant = db.scalar(select(Tenant).where(Tenant.slug == DEFAULT_TENANT_SLUG))
        if tenant is None:
            tenant = Tenant(
                type=TenantType.SCHOOL,
                name=DEFAULT_TENANT_NAME,
                slug=DEFAULT_TENANT_SLUG,
                onboarding_completed=True,
            )
            db.add(tenant)
            db.flush()
            print("created_tenant: platform-admin")
        else:
            tenant.deleted_at = None
            if tenant.type != TenantType.SCHOOL:
                tenant.type = TenantType.SCHOOL
            if tenant.name != DEFAULT_TENANT_NAME:
                tenant.name = DEFAULT_TENANT_NAME
            print("reused_tenant: platform-admin")

        user = db.scalar(select(User).where(User.email == admin_email))
        password_hash = hash_password(admin_password)
        if user is None:
            user = User(
                email=admin_email,
                name=admin_name,
                password_hash=password_hash,
                failed_login_attempts=0,
            )
            db.add(user)
            db.flush()
            print(f"created_user: {admin_email}")
        else:
            user.name = admin_name
            user.password_hash = password_hash
            user.failed_login_attempts = 0
            user.locked_until = None
            print(f"updated_user: {admin_email}")

        membership = db.scalar(
            select(Membership).where(
                Membership.user_id == user.id,
                Membership.tenant_id == tenant.id,
            )
        )
        if membership is None:
            membership = Membership(
                user_id=user.id,
                tenant_id=tenant.id,
                role=MembershipRole.PLATFORM_ADMIN,
            )
            db.add(membership)
            print("created_membership: PLATFORM_ADMIN")
        else:
            membership.role = MembershipRole.PLATFORM_ADMIN
            print("updated_membership: PLATFORM_ADMIN")

        db.commit()
        print(f"platform_admin_login_email: {admin_email}")
        print("platform_admin_login_password: [configured]")


if __name__ == "__main__":
    run_seed()
