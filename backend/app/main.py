import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Literal

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from starlette.middleware.base import RequestResponseEndpoint

from app.analytics.router import router as analytics_router
from app.categories.router import router as categories_router
from app.core.config import database_url
from app.db.session import SessionDep, make_engine
from app.transactions.router import router as transactions_router

logger = logging.getLogger("finance_copilot")


class Health(BaseModel):
    status: Literal["ok"] = "ok"
    database: Literal["ok"] = "ok"


def create_app() -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        app.state.engine = make_engine(database_url())
        try:
            yield
        finally:
            app.state.engine.dispose()

    app = FastAPI(
        title="Finance Copilot",
        version="0.1.0",
        lifespan=lifespan,
        description=(
            "Local single-person demo with fake BRL data. Money is serialized as decimal "
            "strings. Amounts are nonnegative; debit = expense, credit = income, transfer = "
            "internal movement excluded from spending/income. Date bounds are inclusive; "
            "omitted bounds are open. No authentication: use only on a trusted local network."
        ),
    )

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
        # Do not echo financial values, request bodies, or arbitrary user input.
        return JSONResponse(
            status_code=422,
            content={
                "detail": "Invalid request parameters.",
                "errors": [
                    {"loc": list(error["loc"]), "type": error["type"]} for error in exc.errors()
                ],
            },
        )

    @app.exception_handler(SQLAlchemyError)
    async def database_error(request: Request, exc: SQLAlchemyError) -> JSONResponse:
        logger.error("Database operation failed (%s).", type(exc).__name__)
        return JSONResponse(status_code=503, content={"detail": "Database unavailable."})

    @app.middleware("http")
    async def private_responses(request: Request, call_next: RequestResponseEndpoint) -> Response:
        try:
            response = await call_next(request)
        except Exception as exc:
            logger.error("Request failed (%s).", type(exc).__name__)
            response = JSONResponse(status_code=500, content={"detail": "Internal server error."})
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        return response

    @app.get("/health", response_model=Health, tags=["health"])
    def health(session: SessionDep) -> Health:
        """Readiness check, including a round trip to PostgreSQL."""
        session.execute(text("SELECT 1"))
        return Health()

    app.include_router(transactions_router)
    app.include_router(analytics_router)
    app.include_router(categories_router)
    return app


app = create_app()
