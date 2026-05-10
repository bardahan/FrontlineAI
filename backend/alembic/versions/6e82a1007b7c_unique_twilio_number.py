"""unique twilio_number

Revision ID: 6e82a1007b7c
Revises: e7b1065343de
Create Date: 2026-03-10 20:32:41.308001

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '6e82a1007b7c'
down_revision: Union[str, Sequence[str], None] = 'e7b1065343de'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Partial unique index: only enforces uniqueness for non-empty twilio_number values
    op.create_index(
        'uix_settings_twilio_number',
        'settings',
        ['twilio_number'],
        unique=True,
        postgresql_where=sa.text("twilio_number != ''"),
    )


def downgrade() -> None:
    op.drop_index('uix_settings_twilio_number', table_name='settings')
