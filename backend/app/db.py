"""Database connection. Works with Postgres (Neon) or a local SQLite file."""
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from .config import DATABASE_URL


def _normalize(url: str) -> str:
    # Neon gives "postgresql://..."; SQLAlchemy needs to be told to use the psycopg 3 driver.
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://"):]
    if url.startswith("postgresql://"):
        url = "postgresql+psycopg://" + url[len("postgresql://"):]
    return url


DB_URL = _normalize(DATABASE_URL)
_connect_args = {"check_same_thread": False} if DB_URL.startswith("sqlite") else {}

engine = create_engine(DB_URL, connect_args=_connect_args, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def add_missing_columns() -> list[str]:
    """create_all() makes missing tables but never changes existing ones, so a database made before a
    model gained a column breaks with "no such column". This adds those columns (empty) on startup.
    It never removes or renames anything. For a real launch, use Alembic migrations instead."""
    quote = engine.dialect.identifier_preparer.quote
    db_tables = inspect(engine)
    added = []
    with engine.begin() as conn:
        for table in Base.metadata.sorted_tables:
            if not db_tables.has_table(table.name):
                continue
            existing = {c["name"] for c in db_tables.get_columns(table.name)}
            for col in table.columns:
                if col.name not in existing:
                    col_type = col.type.compile(dialect=engine.dialect)
                    conn.execute(text(f"ALTER TABLE {quote(table.name)} ADD COLUMN {quote(col.name)} {col_type}"))
                    added.append(f"{table.name}.{col.name}")
    return added


def add_missing_indexes() -> list[str]:
    """Indexes for columns added by add_missing_columns() (e.g. unique emails). Skips ones that exist."""
    db_tables = inspect(engine)
    added = []
    for table in Base.metadata.sorted_tables:
        if not db_tables.has_table(table.name):
            continue
        existing = {i["name"] for i in db_tables.get_indexes(table.name)}
        for index in table.indexes:
            if index.name not in existing:
                index.create(bind=engine, checkfirst=True)
                added.append(index.name)
    return added


def get_db():
    """FastAPI dependency: one database session per request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
