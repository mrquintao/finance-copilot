from decimal import Decimal
from typing import Annotated

from pydantic import BeforeValidator, Field, PlainSerializer
from sqlalchemy import Numeric
from sqlalchemy.types import TypeDecorator

CENT = Decimal("0.01")
MAX_AMOUNT = Decimal("9999999999999999.99")


def exact_decimal(value: object) -> Decimal:
    if not isinstance(value, (str, Decimal, int)) or isinstance(value, bool):
        raise ValueError("Money must be a decimal string, integer, or Decimal.")
    try:
        amount = Decimal(value)
        if not amount.is_finite() or amount < 0 or amount != amount.quantize(CENT):
            raise ValueError("Money must be finite, nonnegative, and have at most two decimals.")
    except ArithmeticError:
        raise ValueError("Invalid money value.") from None
    return amount if amount else Decimal("0.00")


Money = Annotated[
    Decimal,
    BeforeValidator(exact_decimal),
    Field(ge=0, decimal_places=2),
    PlainSerializer(lambda value: format(value, ".2f"), return_type=str),
]


class MoneyColumn(TypeDecorator[Decimal]):
    """Reject lossy inputs before PostgreSQL NUMERIC can round them."""

    impl = Numeric(18, 2)
    cache_ok = True

    def process_bind_param(self, value: object, dialect: object) -> Decimal | None:
        if value is None:
            return None
        amount = exact_decimal(value)
        if amount > MAX_AMOUNT:
            raise ValueError("Amount exceeds NUMERIC(18, 2).")
        return amount
