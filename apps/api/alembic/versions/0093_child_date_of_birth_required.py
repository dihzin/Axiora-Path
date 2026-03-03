"""require child date_of_birth and enforce age range

Revision ID: 0093_child_date_of_birth_required
Revises: 0092_required_subject_catalog
Create Date: 2026-02-28 00:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "0093_child_date_of_birth_required"
down_revision: str | None = "0092_required_subject_catalog"
branch_labels: tuple[str, ...] | None = None
depends_on: tuple[str, ...] | None = None


def upgrade() -> None:
    op.add_column("child_profiles", sa.Column("date_of_birth", sa.Date(), nullable=True))
    op.add_column(
        "child_profiles",
        sa.Column("needs_profile_completion", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )

    op.execute(
        sa.text(
            """
            UPDATE child_profiles
            SET
                date_of_birth = CASE
                    WHEN birth_year IS NULL THEN (CURRENT_DATE - INTERVAL '4 years')::date
                    ELSE make_date(
                        LEAST(
                            GREATEST(
                                birth_year,
                                EXTRACT(YEAR FROM CURRENT_DATE)::int - 18
                            ),
                            EXTRACT(YEAR FROM CURRENT_DATE)::int - 4
                        ),
                        6,
                        30
                    )
                END,
                needs_profile_completion = CASE
                    WHEN birth_year IS NULL THEN true
                    WHEN birth_year < EXTRACT(YEAR FROM CURRENT_DATE)::int - 18 THEN true
                    WHEN birth_year > EXTRACT(YEAR FROM CURRENT_DATE)::int - 4 THEN true
                    ELSE false
                END
            """
        )
    )

    op.alter_column("child_profiles", "date_of_birth", nullable=False)
    op.create_check_constraint(
        "ck_child_profiles_date_of_birth_min_age_4",
        "child_profiles",
        "date_of_birth <= (CURRENT_DATE - INTERVAL '4 years')::date",
    )
    op.create_check_constraint(
        "ck_child_profiles_date_of_birth_max_age_18",
        "child_profiles",
        "date_of_birth >= (CURRENT_DATE - INTERVAL '18 years')::date",
    )


def downgrade() -> None:
    op.drop_constraint("ck_child_profiles_date_of_birth_max_age_18", "child_profiles", type_="check")
    op.drop_constraint("ck_child_profiles_date_of_birth_min_age_4", "child_profiles", type_="check")
    op.drop_column("child_profiles", "needs_profile_completion")
    op.drop_column("child_profiles", "date_of_birth")
