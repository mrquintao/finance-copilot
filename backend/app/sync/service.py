from __future__ import annotations

from datetime import UTC, date, datetime

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.db.models import Account, Category, SyncRun, Transaction
from app.integrations.open_finance.provider import (
    FinancialDataProvider,
    ProviderError,
    ProviderTransaction,
)

CATEGORY_RULES: tuple[tuple[tuple[str, ...], str], ...] = (
    (("restaurant", "restaurante", "food", "alimentação", "meal", "delivery"), "Alimentação"),
    (("grocery", "supermarket", "supermercado", "market", "mercado"), "Mercado"),
    (("transport", "transporte", "taxi", "ride", "fuel", "gas", "combustível"), "Transporte"),
    (("health", "saúde", "medical", "pharmacy", "farmácia", "drugstore"), "Saúde"),
    (("subscription", "assinatura", "streaming", "software"), "Assinaturas"),
    (("entertainment", "leisure", "lazer", "travel", "viagem"), "Lazer"),
    (("housing", "moradia", "rent", "aluguel", "utilities", "energia", "home"), "Moradia"),
    (("shopping", "compras", "clothing", "electronics"), "Compras"),
    (("salary", "salário", "income", "receita", "wage"), "Receita"),
)


class SyncService:
    def __init__(self, provider: FinancialDataProvider) -> None:
        self.provider = provider

    async def synchronize(
        self,
        session: Session,
        *,
        item_id: str,
        start_date: date | None = None,
        end_date: date | None = None,
    ) -> SyncRun:
        run, error = await self.attempt(
            session, item_id=item_id, start_date=start_date, end_date=end_date
        )
        if error is not None:
            raise error
        return run

    async def attempt(
        self,
        session: Session,
        *,
        item_id: str,
        start_date: date | None = None,
        end_date: date | None = None,
    ) -> tuple[SyncRun, Exception | None]:
        """Synchronize one item. A failure is recorded on the run and returned, not raised."""
        run = SyncRun(provider=self.provider.name, item_id=item_id, status="running")
        session.add(run)
        session.commit()
        session.refresh(run)

        try:
            accounts = await self.provider.get_accounts(item_id=item_id)
            run.accounts_received = len(accounts)
            account_by_source_id: dict[str, Account] = {}
            for provider_account in accounts:
                if provider_account.currency != "BRL":
                    continue
                account_by_source_id[provider_account.source_id] = self._upsert_account(
                    session, provider_account
                )

            received = created = updated = 0
            for source_id, account in account_by_source_id.items():
                transactions = await self.provider.get_transactions(
                    account_id=source_id, start_date=start_date, end_date=end_date
                )
                received += len(transactions)
                transaction_ids = [transaction.external_id for transaction in transactions]
                existing_ids = (
                    set(
                        session.scalars(
                            select(Transaction.external_id).where(
                                Transaction.account_id == account.id,
                                Transaction.external_id.in_(transaction_ids),
                            )
                        )
                    )
                    if transaction_ids
                    else set()
                )
                for transaction in transactions:
                    category = self._category_for(session, transaction)
                    self._upsert_transaction(session, account, transaction, category)
                    if transaction.external_id in existing_ids:
                        updated += 1
                    else:
                        created += 1

            run.transactions_received = received
            run.transactions_created = created
            run.transactions_updated = updated
            run.status = "succeeded"
            run.finished_at = datetime.now(UTC)
            run.error = None
            session.commit()
            session.refresh(run)
            return run, None
        except Exception as exc:
            session.rollback()
            failed = session.get(SyncRun, run.id)
            if failed is None:
                failed = SyncRun(id=run.id, provider=self.provider.name, item_id=item_id)
                session.add(failed)
            failed.status = "failed"
            failed.finished_at = datetime.now(UTC)
            failed.error = self._safe_error(exc)
            session.commit()
            session.refresh(failed)
            return failed, exc

    def _upsert_account(self, session: Session, provider_account) -> Account:
        statement = (
            insert(Account)
            .values(
                name=provider_account.name,
                institution=provider_account.institution,
                currency=provider_account.currency,
                provider=self.provider.name,
                provider_item_id=provider_account.item_id,
                provider_account_id=provider_account.external_id,
            )
            .on_conflict_do_update(
                constraint="uq_accounts_provider",
                set_={
                    "name": provider_account.name,
                    "institution": provider_account.institution,
                    "currency": provider_account.currency,
                    "provider_item_id": provider_account.item_id,
                },
            )
            .returning(Account.id)
        )
        account_id = session.scalar(statement)
        account = session.get(Account, account_id) if account_id else None
        if account is None:
            raise RuntimeError("Could not persist provider account.")
        return account

    def _upsert_transaction(
        self,
        session: Session,
        account: Account,
        transaction: ProviderTransaction,
        category: Category | None,
    ) -> None:
        statement = insert(Transaction).values(
            external_id=transaction.external_id,
            account_id=account.id,
            date=transaction.date,
            description=transaction.description,
            merchant=transaction.merchant,
            amount=transaction.amount,
            currency=transaction.currency,
            type=transaction.type,
            category_id=category.id if category else None,
            subcategory=transaction.subcategory or transaction.category,
            is_recurring=False,
        )
        session.execute(
            statement.on_conflict_do_update(
                constraint="uq_transactions_account_id",
                set_={
                    "date": transaction.date,
                    "description": transaction.description,
                    "merchant": transaction.merchant,
                    "amount": transaction.amount,
                    "currency": transaction.currency,
                    "type": transaction.type,
                    "category_id": category.id if category else None,
                    "subcategory": transaction.subcategory or transaction.category,
                    "updated_at": datetime.now(UTC),
                },
            )
        )

    def _category_for(self, session: Session, transaction: ProviderTransaction) -> Category | None:
        normalized = self._internal_category(transaction)
        if normalized is None:
            return None
        category = session.scalar(select(Category).where(Category.name == normalized))
        if category is None:
            category = Category(name=normalized)
            session.add(category)
            session.flush()
        return category

    @staticmethod
    def _internal_category(transaction: ProviderTransaction) -> str | None:
        if transaction.type == "credit" and not transaction.category:
            return "Receita"
        text = " ".join(
            part.lower()
            for part in (transaction.category, transaction.description, transaction.merchant)
            if part
        )
        if not text:
            return None
        for keywords, category in CATEGORY_RULES:
            if any(keyword in text for keyword in keywords):
                return category
        return "Outros"

    @staticmethod
    def _safe_error(exc: Exception) -> str:
        if isinstance(exc, ProviderError):
            return str(exc)[:500]
        return f"Synchronization failed ({type(exc).__name__})."
