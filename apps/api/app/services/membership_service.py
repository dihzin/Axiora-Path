from __future__ import annotations

from fastapi import HTTPException, status

from app.models import Membership, MembershipRole, Tenant, TenantType


def assert_can_remove_membership(
    *,
    actor_membership: Membership,
    target_membership: Membership,
    tenant: Tenant,
) -> None:
    if tenant.type != TenantType.FAMILY:
        return

    actor_role = actor_membership.role
    target_role = target_membership.role

    if target_role == MembershipRole.PARENT:
        if actor_role == MembershipRole.GUARDIAN:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Guardians cannot remove parents",
            )
        if actor_role == MembershipRole.PARENT and actor_membership.user_id != target_membership.user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Parents cannot remove other parents",
            )

    if target_role == MembershipRole.GUARDIAN and actor_role != MembershipRole.PARENT:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only parents can remove guardians",
        )
