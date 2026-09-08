from fastapi import APIRouter
from sqlalchemy import select

from app.categories.schemas import CategoryRead
from app.db.models import Category
from app.db.session import SessionDep

router = APIRouter(prefix="/categories", tags=["categories"])


@router.get("", response_model=list[CategoryRead])
def list_categories(session: SessionDep) -> list[CategoryRead]:
    return [
        CategoryRead.model_validate(category)
        for category in session.scalars(select(Category).order_by(Category.name))
    ]
