from __future__ import annotations

import asyncio
import json
from datetime import date, datetime
from decimal import Decimal
from typing import Any
from urllib.parse import parse_qs, urlparse
from zoneinfo import ZoneInfo

import httpx

from app.integrations.open_finance.provider import (
    FinancialDataProvider,
    ProviderAccount,
    ProviderError,
    ProviderTransaction,
)

BRAZIL_TZ = ZoneInfo("America/Sao_Paulo")


class PluggyProvider(FinancialDataProvider):
    name = "pluggy"

    def __init__(
        self,
        *,
        client_id: str,
        client_secret: str,
        base_url: str = "https://api.pluggy.ai",
        timeout_seconds: float = 20,
    ) -> None:
        if not client_id or not client_secret:
            raise ProviderError("Open Finance provider is not configured.")
        self._client_id = client_id
        self._client_secret = client_secret
        self._base_url = base_url.rstrip("/")
        self._timeout = httpx.Timeout(timeout_seconds)
        self._api_key: str | None = None

    async def create_connect_token(self, *, item_id: str | None = None) -> str:
        body: dict[str, Any] = {"options": {"avoidDuplicates": True}}
        if item_id:
            body["itemId"] = item_id
        payload = await self._request_json("POST", "/connect_token", json_body=body)
        if not isinstance(payload, dict):
            raise ProviderError("Provider returned an invalid connect token response.")
        token = payload.get("connectToken") or payload.get("accessToken")
        if not isinstance(token, str) or not token:
            raise ProviderError("Provider returned an invalid connect token.")
        return token

    async def get_accounts(self, *, item_id: str) -> list[ProviderAccount]:
        item = await self._request_json("GET", f"/items/{item_id}")
        if not isinstance(item, dict):
            raise ProviderError("Provider returned an invalid item response.")
        institution = self._institution_name(item)

        payload = await self._request_json("GET", "/accounts", params={"itemId": item_id})
        if isinstance(payload, dict):
            rows = payload.get("results", [])
        elif isinstance(payload, list):
            rows = payload
        else:
            rows = []
        if not isinstance(rows, list):
            raise ProviderError("Provider returned an invalid accounts response.")

        accounts: list[ProviderAccount] = []
        for row in rows:
            if not isinstance(row, dict):
                continue
            source_id = row.get("id")
            stable_id = row.get("providerId") or source_id
            currency = row.get("currencyCode")
            if not isinstance(source_id, str) or not isinstance(stable_id, str):
                continue
            if not isinstance(currency, str):
                continue
            name = row.get("marketingName") or row.get("name") or "Conta"
            accounts.append(
                ProviderAccount(
                    external_id=stable_id[:100],
                    source_id=source_id[:100],
                    item_id=item_id,
                    name=str(name)[:100],
                    institution=institution[:100],
                    currency=currency.upper(),
                )
            )
        return accounts

    async def get_transactions(
        self,
        *,
        account_id: str,
        start_date: date | None = None,
        end_date: date | None = None,
    ) -> list[ProviderTransaction]:
        params: dict[str, str] = {"accountId": account_id}
        if start_date:
            params["dateFrom"] = start_date.isoformat()
        if end_date:
            params["dateTo"] = end_date.isoformat()

        transactions: list[ProviderTransaction] = []
        while True:
            payload = await self._request_json("GET", "/v2/transactions", params=params)
            if not isinstance(payload, dict):
                raise ProviderError("Provider returned an invalid transactions response.")
            rows = payload.get("results")
            if not isinstance(rows, list):
                raise ProviderError("Provider returned an invalid transactions response.")
            for row in rows:
                normalized = self._transaction(row, account_id)
                if normalized is not None:
                    transactions.append(normalized)

            next_query = payload.get("next")
            if not isinstance(next_query, str) or not next_query:
                break
            query = parse_qs(urlparse(next_query).query)
            after_values = query.get("after")
            if not after_values:
                raise ProviderError("Provider returned an invalid pagination cursor.")
            params["after"] = after_values[0]

        return transactions

    async def _api_key_value(self) -> str:
        if self._api_key:
            return self._api_key
        payload = await self._request_json(
            "POST",
            "/auth",
            json_body={"clientId": self._client_id, "clientSecret": self._client_secret},
            authenticated=False,
        )
        if not isinstance(payload, dict):
            raise ProviderError("Provider authentication returned an invalid response.")
        key = payload.get("apiKey") or payload.get("accessToken")
        if not isinstance(key, str) or not key:
            raise ProviderError("Provider authentication returned an invalid response.")
        self._api_key = key
        return key

    async def _request_json(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, str] | None = None,
        json_body: dict[str, Any] | None = None,
        authenticated: bool = True,
    ) -> Any:
        for attempt in range(3):
            headers = {"Accept": "application/json", "Content-Type": "application/json"}
            if authenticated:
                headers["X-API-KEY"] = await self._api_key_value()
            try:
                async with httpx.AsyncClient(timeout=self._timeout) as client:
                    response = await client.request(
                        method,
                        f"{self._base_url}{path}",
                        headers=headers,
                        params=params,
                        json=json_body,
                    )
            except httpx.TransportError as exc:
                if attempt == 2:
                    raise ProviderError("Open Finance provider is unreachable.") from exc
                await asyncio.sleep(0.5 * (2**attempt))
                continue

            if response.status_code == 401 and authenticated and attempt < 2:
                self._api_key = None
                await asyncio.sleep(0.25)
                continue
            if response.status_code in {429, 500, 502, 503, 504} and attempt < 2:
                await asyncio.sleep(0.5 * (2**attempt))
                continue
            if response.status_code >= 400:
                raise ProviderError(
                    f"Open Finance provider request failed ({response.status_code})."
                )
            try:
                return json.loads(response.text, parse_float=Decimal)
            except (json.JSONDecodeError, TypeError) as exc:
                raise ProviderError("Provider returned invalid JSON.") from exc

        raise ProviderError("Open Finance provider request failed.")

    @staticmethod
    def _institution_name(item: dict[str, Any]) -> str:
        connector = item.get("connector")
        if isinstance(connector, dict) and connector.get("name"):
            return str(connector["name"])
        for key in ("connectorName", "institutionName", "name"):
            value = item.get(key)
            if isinstance(value, str) and value:
                return value
        return "Open Finance"

    @staticmethod
    def _transaction(row: Any, account_id: str) -> ProviderTransaction | None:
        if not isinstance(row, dict):
            return None
        if str(row.get("status", "POSTED")).upper() != "POSTED":
            return None
        external_id = row.get("providerId") or row.get("id")
        raw_date = row.get("date")
        raw_amount = row.get("amount")
        raw_type = str(row.get("type", "")).upper()
        currency = str(row.get("currencyCode", "")).upper()
        if not external_id or not raw_date or raw_amount is None or currency != "BRL":
            return None
        if raw_type not in {"DEBIT", "CREDIT"}:
            return None

        amount = Decimal(str(raw_amount)).copy_abs()
        if not amount.is_finite() or amount != amount.quantize(Decimal("0.01")):
            raise ProviderError("Provider returned unsupported monetary precision.")
        try:
            posted_at = datetime.fromisoformat(str(raw_date).replace("Z", "+00:00"))
        except ValueError as exc:
            raise ProviderError("Provider returned an invalid transaction date.") from exc
        if posted_at.tzinfo is not None:
            transaction_date = posted_at.astimezone(BRAZIL_TZ).date()
        else:
            transaction_date = posted_at.date()

        merchant_value = row.get("merchant")
        if isinstance(merchant_value, dict):
            merchant = merchant_value.get("name") or merchant_value.get("businessName")
        elif isinstance(merchant_value, str):
            merchant = merchant_value
        else:
            merchant = None

        description = row.get("description") or row.get("descriptionRaw") or merchant or "Transação"
        category = row.get("category")
        return ProviderTransaction(
            external_id=str(external_id)[:150],
            account_external_id=account_id,
            date=transaction_date,
            description=str(description)[:300],
            merchant=str(merchant)[:150] if merchant else None,
            amount=amount,
            currency="BRL",
            type="debit" if raw_type == "DEBIT" else "credit",
            category=str(category)[:100] if category else None,
            subcategory=None,
        )
