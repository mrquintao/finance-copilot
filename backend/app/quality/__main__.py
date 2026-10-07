"""python -m app.quality: print the read-only data quality report for the configured database."""

from sqlalchemy.orm import Session

from app.core.config import database_url
from app.db.session import make_engine
from app.quality.checks import render, run_checks


def main() -> None:
    engine = make_engine(database_url())
    try:
        with Session(engine) as session:
            print(render(run_checks(session)))
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
