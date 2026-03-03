"""enforce policy traceability invariants on axion_decisions

Revision ID: 0084_axion_decision_policy_invariants
Revises: 0083_axion_decisions_correlation_id
Create Date: 2026-02-26
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0084_axion_decision_policy_invariants"
down_revision: str | None = "0083_axion_decisions_correlation_id"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Normalize legacy rows before adding strict checks.
    op.execute(
        sa.text(
            """
            UPDATE axion_decisions
            SET decision_mode = 'level4',
                policy_version = NULL,
                exploration_flag = false
            WHERE decision_mode = 'policy'
              AND (policy_version IS NULL OR policy_state NOT IN ('CANARY', 'ACTIVE'))
            """
        )
    )
    op.execute(
        sa.text(
            """
            UPDATE axion_decisions
            SET decision_mode = 'level4',
                policy_version = NULL,
                exploration_flag = false
            WHERE decision_mode = 'policy'
              AND policy_state IN ('SHADOW', 'ROLLED_BACK')
            """
        )
    )

    op.create_check_constraint(
        "ck_axion_decisions_policy_mode_requires_version_state",
        "axion_decisions",
        "(decision_mode <> 'policy') OR (policy_version IS NOT NULL AND policy_state IN ('CANARY','ACTIVE'))",
    )
    op.create_check_constraint(
        "ck_axion_decisions_shadow_rolled_back_not_policy",
        "axion_decisions",
        "(policy_state NOT IN ('SHADOW','ROLLED_BACK')) OR (decision_mode <> 'policy')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_axion_decisions_shadow_rolled_back_not_policy", "axion_decisions", type_="check")
    op.drop_constraint("ck_axion_decisions_policy_mode_requires_version_state", "axion_decisions", type_="check")

