"""Classify a stored sync failure so it can be filtered and explained without sensitive data.

sync_runs.error only ever holds text written by this application: the provider adapter's
status-based messages, or "Synchronization failed (<ExceptionClass>)." for anything else. The
kind is derived from that text when a run is read, so no extra column is needed and runs
recorded before this existed are classified too.
"""

import re
from typing import Literal

import sqlalchemy.exc

ErrorKind = Literal["provider", "network", "database", "validation", "unknown"]

UNEXPECTED = re.compile(r"Synchronization failed \((\w+)\)\.")
NETWORK_MESSAGES = ("Pluggy is unreachable.", "Open Finance provider is unreachable.")
# The provider answered, but with data this app refuses to import.
REJECTED_DATA_PREFIXES = ("Provider returned", "Provider authentication returned")
PROVIDER_PREFIXES = ("Pluggy ", "Open Finance provider")
VALIDATION_EXCEPTIONS = {"ValueError", "ValidationError", "InvalidOperation", "TypeError"}
NETWORK_EXCEPTIONS = {"ConnectError", "ConnectTimeout", "ReadTimeout", "TimeoutException"}


def _is_database_exception(name: str) -> bool:
    candidate = getattr(sqlalchemy.exc, name, None)
    return isinstance(candidate, type) and issubclass(candidate, sqlalchemy.exc.SQLAlchemyError)


def classify_error(error: str | None) -> ErrorKind | None:
    if not error:
        return None
    if error in NETWORK_MESSAGES:
        return "network"
    if error.startswith(REJECTED_DATA_PREFIXES):
        return "validation"
    if error.startswith(PROVIDER_PREFIXES):
        return "provider"
    unexpected = UNEXPECTED.fullmatch(error)
    if unexpected:
        name = unexpected.group(1)
        if _is_database_exception(name):
            return "database"
        if name in VALIDATION_EXCEPTIONS:
            return "validation"
        if name in NETWORK_EXCEPTIONS:
            return "network"
    return "unknown"
