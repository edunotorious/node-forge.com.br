"""add price to Node Vault listings

Revision ID: 0009
Revises: 0008
Create Date: 2026-10-13

Turns the Vault into a marketplace: a listing is free (price_cents = 0,
the default every existing row gets) or paid. Paid listings show a
preview only and cannot be cloned until checkout lands, so the schema
stays gateway-agnostic — no payment/purchase tables yet.

Additive with server defaults, so the running backend keeps working
while this migration is applied ahead of the new code.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0009"
down_revision: str | None = "0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "vault_listings",
        sa.Column("price_cents", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "vault_listings",
        sa.Column("currency", sa.String(length=3), nullable=False, server_default="BRL"),
    )
    op.create_check_constraint(
        "ck_vault_listings_price_non_negative", "vault_listings", "price_cents >= 0"
    )


def downgrade() -> None:
    op.drop_constraint("ck_vault_listings_price_non_negative", "vault_listings", type_="check")
    op.drop_column("vault_listings", "currency")
    op.drop_column("vault_listings", "price_cents")
