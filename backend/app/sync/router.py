from fastapi import APIRouter, HTTPException
from fastapi.responses import HTMLResponse
from sqlalchemy import select

from app.core.config import pluggy_settings
from app.db.models import Account, SyncRun
from app.db.session import SessionDep
from app.integrations.open_finance.pluggy import PluggyProvider
from app.integrations.open_finance.provider import ProviderError
from app.sync.schemas import (
    ConnectTokenRequest,
    ConnectTokenResponse,
    SyncList,
    SyncRequest,
    SyncRunRead,
)
from app.sync.service import SyncService

router = APIRouter(prefix="/sync", tags=["sync"])


def provider() -> PluggyProvider:
    try:
        settings = pluggy_settings()
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail="Open Finance provider is not configured.") from exc
    return PluggyProvider(
        client_id=settings.client_id,
        client_secret=settings.client_secret,
        base_url=settings.base_url,
    )


@router.get("/connect", response_class=HTMLResponse, include_in_schema=False)
def connect_page() -> str:
    """Small same-origin mobile page that launches Pluggy Connect and syncs on success."""
    return """<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <title>Conectar banco · Finance Copilot</title>
  <style>
    body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;margin:0;padding:32px;background:#f6f7f8;color:#111}
    main{max-width:560px;margin:10vh auto;background:white;padding:28px;border-radius:20px;box-shadow:0 8px 32px #0001}
    button{width:100%;border:0;border-radius:12px;padding:14px;font-size:17px;background:#00a9a5;color:white;font-weight:600}
    p{line-height:1.45;color:#555} #status{font-size:14px;margin-top:18px}
  </style>
</head>
<body>
<main>
  <h1>Finance Copilot</h1>
  <p>Conecte sua instituição pelo Open Finance. Suas credenciais bancárias não passam pelo Finance Copilot.</p>
  <button id="connect">Conectar instituição</button>
  <div id="status"></div>
</main>
<script src="https://cdn.pluggy.ai/pluggy-connect/v2.8.2/pluggy-connect.js"></script>
<script>
const button = document.getElementById('connect');
const statusBox = document.getElementById('status');
const status = (text) => { statusBox.textContent = text; };
button.addEventListener('click', async () => {
  button.disabled = true;
  status('Gerando sessão segura…');
  try {
    const tokenResponse = await fetch('/sync/connect-token', {
      method: 'POST', headers: {'Content-Type':'application/json'}, body: '{}'
    });
    if (!tokenResponse.ok) throw new Error('Não foi possível iniciar a conexão.');
    const {connect_token: connectToken} = await tokenResponse.json();
    const widget = new PluggyConnect({
      connectToken,
      includeSandbox: true,
      onSuccess: async (data) => {
        const itemId = data?.item?.id || data?.itemId || data?.id;
        if (!itemId) { status('Conexão criada, mas o identificador não foi retornado.'); return; }
        status('Conta conectada. Importando transações…');
        const syncResponse = await fetch('/sync', {
          method: 'POST', headers: {'Content-Type':'application/json'},
          body: JSON.stringify({item_id: itemId})
        });
        if (!syncResponse.ok) { status('Conta conectada. A sincronização poderá ser repetida no app.'); return; }
        const run = await syncResponse.json();
        status(`Pronto: ${run.transactions_created} novas e ${run.transactions_updated} atualizadas.`);
      },
      onError: () => status('A conexão não foi concluída. Tente novamente.'),
      onClose: () => { button.disabled = false; }
    });
    widget.init();
  } catch (_) {
    status('Não foi possível iniciar o Open Finance. Verifique o backend.');
    button.disabled = false;
  }
});
</script>
</body>
</html>"""


@router.post("/connect-token", response_model=ConnectTokenResponse)
async def create_connect_token(payload: ConnectTokenRequest) -> ConnectTokenResponse:
    try:
        token = await provider().create_connect_token(item_id=payload.item_id)
    except ProviderError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return ConnectTokenResponse(connect_token=token)


@router.post("", response_model=SyncRunRead)
async def synchronize(payload: SyncRequest, session: SessionDep) -> SyncRunRead:
    try:
        run = await SyncService(provider()).synchronize(
            session,
            item_id=payload.item_id,
            start_date=payload.start_date,
            end_date=payload.end_date,
        )
    except ProviderError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return SyncRunRead.model_validate(run)


@router.post("/refresh", response_model=SyncList)
async def refresh_connected_accounts(session: SessionDep) -> SyncList:
    item_ids = list(
        session.scalars(
            select(Account.provider_item_id)
            .where(Account.provider == "pluggy", Account.provider_item_id.is_not(None))
            .distinct()
        )
    )
    runs: list[SyncRunRead] = []
    service = SyncService(provider())
    for item_id in item_ids:
        if item_id is None:
            continue
        try:
            run = await service.synchronize(session, item_id=item_id)
        except ProviderError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc
        runs.append(SyncRunRead.model_validate(run))
    return SyncList(items=runs)


@router.get("/runs", response_model=SyncList)
def list_sync_runs(session: SessionDep) -> SyncList:
    runs = session.scalars(select(SyncRun).order_by(SyncRun.started_at.desc()).limit(50))
    return SyncList(items=[SyncRunRead.model_validate(run) for run in runs])
