"""Month-end spending projection. Deterministic arithmetic on Decimal; an estimate, not a fact.

Method ("linear_daily_average"), for the calendar month that contains `as_of`:

1. Spending so far = debits from the 1st up to `as_of`, inclusive. Transfers and income are out.
2. Recurring so far = the part of it flagged as recurring. Variable so far = the rest.
3. Projected variable = variable so far x days in month / days elapsed, i.e. the variable
   spending keeps its daily average for the remaining days.
4. Recurring expected = debits flagged as recurring in the whole previous month. What has not
   shown up yet this month (never negative) is added as recurring remaining.
5. Projected total = recurring so far + recurring remaining + projected variable.

When nothing is flagged as recurring, steps 2 and 4 are zero and the projection is the plain
daily average. Early in the month the average rests on very few days; `days_elapsed` says so.
"""

from calendar import monthrange
from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.analytics.schemas import DateRange, MonthProjection
from app.db.models import Transaction

ZERO = Decimal("0.00")
CENT = Decimal("0.01")


def _spending(session: Session, start: date, end: date, *, recurring_only: bool = False) -> Decimal:
    conditions = [Transaction.type == "debit", Transaction.date >= start, Transaction.date <= end]
    if recurring_only:
        conditions.append(Transaction.is_recurring.is_(True))
    total = session.scalar(select(func.sum(Transaction.amount)).where(*conditions))
    return total if total is not None else ZERO


def get_month_projection(session: Session, as_of: date) -> MonthProjection:
    month_start = as_of.replace(day=1)
    days_in_month = monthrange(as_of.year, as_of.month)[1]
    month_end = as_of.replace(day=days_in_month)
    days_elapsed = as_of.day

    spent = _spending(session, month_start, as_of)
    recurring = _spending(session, month_start, as_of, recurring_only=True)
    variable = spent - recurring
    # One rounding, at the end: multiply first, then divide.
    projected_variable = (variable * days_in_month / days_elapsed).quantize(CENT, ROUND_HALF_UP)
    daily_average = (variable / days_elapsed).quantize(CENT, ROUND_HALF_UP)

    recurring_basis = None
    recurring_expected = ZERO
    if month_start > date.min:
        previous_end = month_start - timedelta(days=1)
        previous_start = previous_end.replace(day=1)
        recurring_expected = _spending(session, previous_start, previous_end, recurring_only=True)
        if recurring_expected > 0:
            recurring_basis = DateRange(start_date=previous_start, end_date=previous_end)
    recurring_remaining = max(recurring_expected - recurring, ZERO)

    return MonthProjection(
        as_of=as_of,
        month=DateRange(start_date=month_start, end_date=month_end),
        days_elapsed=days_elapsed,
        days_in_month=days_in_month,
        days_remaining=days_in_month - days_elapsed,
        spent_so_far=spent,
        recurring_so_far=recurring,
        variable_so_far=variable,
        variable_daily_average=daily_average,
        recurring_basis=recurring_basis,
        recurring_expected=recurring_expected,
        recurring_remaining=recurring_remaining,
        projected_variable=projected_variable,
        projected_total=recurring + recurring_remaining + projected_variable,
    )
