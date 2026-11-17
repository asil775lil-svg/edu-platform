"""create_vaults_tables

Revision ID: d4f811a9b2c3
Revises: c9e732bd7fee
Create Date: 2026-11-17 14:24:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd4f811a9b2c3'
down_revision: Union[str, Sequence[str], None] = 'c9e732bd7fee'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'vaults',
        sa.Column('id', sa.String(length=32), nullable=False),
        sa.Column('user_id', sa.String(length=32), nullable=False),
        sa.Column('name', sa.String(length=200), nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('icon', sa.String(length=32), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('vaults', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_vaults_user_id'), ['user_id'], unique=False)

    op.create_table(
        'vault_files',
        sa.Column('id', sa.String(length=32), nullable=False),
        sa.Column('vault_id', sa.String(length=32), nullable=False),
        sa.Column('user_id', sa.String(length=32), nullable=False),
        sa.Column('filename', sa.String(length=255), nullable=False),
        sa.Column('original_name', sa.String(length=255), nullable=False),
        sa.Column('ext', sa.String(length=64), nullable=False),
        sa.Column('mime', sa.String(length=120), nullable=False),
        sa.Column('size', sa.Integer(), nullable=False),
        sa.Column('sha256', sa.String(length=64), nullable=False),
        sa.Column('storage_key', sa.String(length=255), nullable=False),
        sa.Column('source_type', sa.String(length=32), nullable=False),
        sa.Column('source_url', sa.Text(), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('metadata_info', sa.JSON(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['vault_id'], ['vaults.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('vault_files', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_vault_files_sha256'), ['sha256'], unique=False)
        batch_op.create_index(batch_op.f('ix_vault_files_user_id'), ['user_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_vault_files_vault_id'), ['vault_id'], unique=False)


def downgrade() -> None:
    with op.batch_alter_table('vault_files', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_vault_files_vault_id'))
        batch_op.drop_index(batch_op.f('ix_vault_files_user_id'))
        batch_op.drop_index(batch_op.f('ix_vault_files_sha256'))
    op.drop_table('vault_files')

    with op.batch_alter_table('vaults', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_vaults_user_id'))
    op.drop_table('vaults')
