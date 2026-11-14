from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app import config


class Base(DeclarativeBase):
    pass


engine = create_engine(config.DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)


def init_db():
    with engine.begin() as conn:
        if conn.dialect.name == "sqlite":
            conn.execute(text("BEGIN IMMEDIATE"))
        elif conn.dialect.name == "postgresql":
            conn.execute(text("SELECT pg_advisory_xact_lock(73918420)"))
        Base.metadata.create_all(conn)
        columns = {c["name"] for c in inspect(conn).get_columns("discoveries")}
        for name, sql_type in (("classification", "JSON"), ("epochs", "JSON"),
                               ("retry_at", "TIMESTAMP WITH TIME ZONE")):
            if name not in columns:
                conn.execute(text(f"ALTER TABLE discoveries ADD COLUMN {name} {sql_type}"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_discoveries_position ON discoveries (dec, ra)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_discoveries_retry ON discoveries (retry_at)"))
