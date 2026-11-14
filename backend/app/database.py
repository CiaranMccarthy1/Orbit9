from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app import config


class Base(DeclarativeBase):
    pass


engine = create_engine(config.DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)


def init_db():
    Base.metadata.create_all(engine)
    # No migration tool here: add columns introduced after the first release.
    columns = {c["name"] for c in inspect(engine).get_columns("discoveries")}
    if "classification" not in columns:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE discoveries ADD COLUMN classification JSON"))
