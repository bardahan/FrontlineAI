"""add summary_language to settings

Revision ID: a3f9c2d1e845
Revises: 6e82a1007b7c
Create Date: 2026-03-14 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a3f9c2d1e845'
down_revision: Union[str, Sequence[str], None] = '6e82a1007b7c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('settings', sa.Column('summary_language', sa.String(), nullable=True, server_default=''))


def downgrade() -> None:
    op.drop_column('settings', 'summary_language')
