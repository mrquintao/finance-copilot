from datetime import date
from typing import Annotated

from fastapi import Depends, HTTPException, Query
from sqlalchemy import ColumnElement
from sqlalchemy.orm import InstrumentedAttribute


class Period:
    def __init__(
        self,
        start_date: Annotated[date | None, Query(description="Inclusive YYYY-MM-DD")] = None,
        end_date: Annotated[date | None, Query(description="Inclusive YYYY-MM-DD")] = None,
    ) -> None:
        if start_date and end_date and start_date > end_date:
            raise HTTPException(422, "start_date must be on or before end_date.")
        self.start_date = start_date
        self.end_date = end_date

    def conditions(self, column: InstrumentedAttribute[date]) -> list[ColumnElement[bool]]:
        conditions = []
        if self.start_date:
            conditions.append(column >= self.start_date)
        if self.end_date:
            conditions.append(column <= self.end_date)
        return conditions


PeriodDep = Annotated[Period, Depends()]
