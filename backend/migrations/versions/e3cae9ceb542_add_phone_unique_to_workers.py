"""add_phone_unique_to_workers

Revision ID: e3cae9ceb542
Revises: 224ef70a4f1d
Create Date: 2026-11-25 15:16:56.947225

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'e3cae9ceb542'
down_revision = '224ef70a4f1d'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('workers', schema=None) as batch_op:
        batch_op.create_unique_constraint('uq_workers_phone', ['phone'])


def downgrade():
    with op.batch_alter_table('workers', schema=None) as batch_op:
        batch_op.drop_constraint('uq_workers_phone', type_='unique')
