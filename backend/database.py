"""Async SQLAlchemy database setup for PostgreSQL."""

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from config import settings


engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    pool_size=20,
    max_overflow=10,
    pool_pre_ping=True,
)

async_session = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    """Base declarative model class."""


async def get_db() -> AsyncSession:
    """FastAPI dependency that yields a database session."""

    async with async_session() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def create_tables():
    """Create tables and apply lightweight schema adjustments."""

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.execute(
            text(
                """
                DO $$
                BEGIN
                    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'questiontype') THEN
                        ALTER TYPE questiontype ADD VALUE IF NOT EXISTS 'MATRIX';
                    END IF;
                END
                $$;
                """
            )
        )
        await conn.execute(
            text(
                """
                ALTER TABLE questions
                ADD COLUMN IF NOT EXISTS branch_only BOOLEAN DEFAULT FALSE
                """
            )
        )
        await conn.execute(
            text(
                """
                UPDATE questions
                SET branch_only = FALSE
                WHERE branch_only IS NULL
                """
            )
        )


async def drop_tables():
    """Drop all tables."""

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
