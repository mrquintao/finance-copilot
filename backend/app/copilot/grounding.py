"""Guardrail: every amount of money in an answer must be a value a tool actually returned.

The model is told to quote tool values and never to calculate. This module checks it without
trusting the model: it extracts the amounts written in the answer and compares them, as exact
decimals, with the amounts present in the tool results of the same request. An answer with an
amount that no tool produced (invented, or added up by the model) is not shown to the user.
"""

from __future__ import annotations

import re
from collections.abc import Iterable
from decimal import Decimal, InvalidOperation
from typing import Any

# "R$ 1.234,56", "1.234,56", "R$ 1234,56", "R$ 1.234" (percentages such as "7,45%" excluded).
WITH_CENTS = re.compile(r"(?<![\d.,])(\d{1,3}(?:\.\d{3})+|\d+),(\d{2})(?![\d%])")
WHOLE_REAIS = re.compile(r"R\$\s*(\d{1,3}(?:\.\d{3})+|\d+)(?![\d.,])")
RESULT_MONEY = re.compile(r"-?\d+\.\d{2}")


def amounts_in_text(text: str) -> set[Decimal]:
    found = {
        Decimal(f"{whole.replace('.', '')}.{cents}") for whole, cents in WITH_CENTS.findall(text)
    }
    found.update(Decimal(whole.replace(".", "")) for whole in WHOLE_REAIS.findall(text))
    return found


def amounts_in_results(results: Iterable[Any]) -> set[Decimal]:
    """Every decimal string with two places anywhere in the tool results, as a magnitude."""
    found: set[Decimal] = set()

    def walk(value: Any) -> None:
        if isinstance(value, dict):
            for item in value.values():
                walk(item)
        elif isinstance(value, list):
            for item in value:
                walk(item)
        elif isinstance(value, str) and RESULT_MONEY.fullmatch(value):
            try:
                found.add(abs(Decimal(value)))
            except InvalidOperation:
                pass

    for result in results:
        walk(result)
    return found


def ungrounded_amounts(answer: str, results: Iterable[Any]) -> list[str]:
    """Amounts written in the answer that no tool result contains, smallest first."""
    known = amounts_in_results(results)
    return [format(amount, ".2f") for amount in sorted(amounts_in_text(answer) - known)]
