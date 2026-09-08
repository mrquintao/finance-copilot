# Finance Copilot

Aplicativo pessoal de finanças para iPhone com backend FastAPI e PostgreSQL. O **MVP 0.2** mantém o core financeiro do MVP 0.1 e adiciona sincronização Open Finance via Pluggy: conexão de instituição, importação de contas e transações, normalização, deduplicação e histórico de sincronizações.

O roadmap completo está em [docs/vision.md](docs/vision.md).

## Arquitetura

```text
iPhone: SwiftUI + Swift Charts
        |              |
        | REST/JSON    | abre fluxo de conexão
        v              v
      FastAPI <---- /sync/connect
        |
        +-- transactions / categories / analytics
        +-- sync / sync_runs
        |
        +-- PostgreSQL
        |
        +-- FinancialDataProvider
                 |
                 +-- PluggyProvider -> Pluggy / Open Finance
```

As credenciais do Pluggy ficam **somente no backend**. O iOS recebe apenas a URL do próprio Finance Copilot e abre o fluxo de conexão servido pelo backend. O banco continua sendo a fonte de verdade para contas e transações normalizadas.

## Escopo implementado

### MVP 0.1 — Core financeiro

- FastAPI + PostgreSQL + Alembic.
- Contas, categorias e transações em BRL.
- Dinheiro com `Decimal`/`NUMERIC(18,2)`, nunca `float`.
- API de transações, filtros, paginação e detalhe.
- Analytics de gastos/receitas e gastos por categoria.
- SwiftUI + Swift Charts com dashboard, transações e detalhe.
- Seed determinístico com 126 transações de abril a setembro de 2026.

### MVP 0.2 — Open Finance

- Abstração `FinancialDataProvider`.
- Adapter `PluggyProvider` com autenticação server-side.
- Connect Token gerado pelo backend.
- Fluxo `/sync/connect` para conectar uma instituição pelo Pluggy Connect.
- Importação de contas BRL.
- Importação paginada de transações POSTED via `/v2/transactions`.
- Normalização de débito/crédito, data, merchant e categorias.
- Deduplicação de contas por `(provider, provider_account_id)`.
- Deduplicação/upsert de transações por `(account_id, external_id)`.
- Histórico em `sync_runs`, incluindo contagens e falhas.
- Retry de erros transitórios/429/5xx e renovação de API key após 401.
- Tela **Conexões** no iOS para conectar instituição e sincronizar novamente.

## Requisitos

- Python **3.12+**.
- PostgreSQL **18** ou Docker + Docker Compose v2.
- Para executar o app iOS: macOS/Xcode ou CI macOS. O backend pode ser desenvolvido no Windows.
- Para Open Finance real: aplicação criada no Pluggy e `PLUGGY_CLIENT_ID`/`PLUGGY_CLIENT_SECRET`.

## Configuração

Copie `.env.example` para `.env` e ajuste a senha do PostgreSQL. Para Open Finance, preencha também:

```env
PLUGGY_CLIENT_ID=seu_client_id
PLUGGY_CLIENT_SECRET=seu_client_secret
PLUGGY_BASE_URL=https://api.pluggy.ai
```

Nunca coloque essas credenciais no projeto iOS, no Git ou em screenshots/logs.

Variáveis principais:

| Variável | Uso |
| --- | --- |
| `DATABASE_URL` | Conexão PostgreSQL do backend |
| `TEST_DATABASE_URL` | Banco utilizado pelos testes locais |
| `BACKEND_BIND` | `127.0.0.1` por padrão; `0.0.0.0` apenas em LAN confiável |
| `BACKEND_PORT` | Porta HTTP; padrão 8000 |
| `PLUGGY_CLIENT_ID` | Identificador da aplicação Pluggy, backend only |
| `PLUGGY_CLIENT_SECRET` | Secret da aplicação Pluggy, backend only |
| `PLUGGY_BASE_URL` | API Pluggy; padrão `https://api.pluggy.ai` |

## Banco e migrations

A migration `0001` cria o core financeiro. A `0002` adiciona metadados do provedor às contas e a tabela `sync_runs`.

No host:

```sh
python -m alembic -c backend/alembic.ini upgrade head
```

Com os comandos do projeto:

```powershell
.\.venv\Scripts\python.exe scripts/dev.py migrate
.\.venv\Scripts\python.exe scripts/dev.py seed
.\.venv\Scripts\python.exe scripts/dev.py api
```

Com Docker:

```sh
docker compose up -d --build
docker compose exec backend python -m app.db.seed
```

## API

Core financeiro:

| Método/rota | Função |
| --- | --- |
| `GET /health` | Readiness do backend + PostgreSQL |
| `GET /transactions` | Lista paginada e filtrável |
| `GET /transactions/{id}` | Detalhe da transação |
| `GET /categories` | Categorias |
| `GET /analytics/spending-summary` | Gastos, receitas e contagens |
| `GET /analytics/spending-by-category` | Gastos por categoria |

Open Finance:

| Método/rota | Função |
| --- | --- |
| `GET /sync/connect` | Página mobile para abrir o Pluggy Connect |
| `POST /sync/connect-token` | Gera Connect Token usando credenciais server-side |
| `POST /sync` | Sincroniza um `item_id` específico |
| `POST /sync/refresh` | Sincroniza todos os Items já conhecidos |
| `GET /sync/runs` | Últimas 50 execuções de sincronização |

Exemplo de sincronização direta:

```http
POST /sync
Content-Type: application/json

{
  "item_id": "item-id-retornado-pelo-pluggy",
  "start_date": "2026-01-01",
  "end_date": "2026-09-30"
}
```

As datas são opcionais e inclusivas. Intervalo invertido retorna 422.

## Fluxo Open Finance

```text
1. iOS -> Conexões -> Conectar instituição
2. iOS abre GET /sync/connect
3. Backend gera Connect Token no Pluggy
4. Pluggy Connect coleta autenticação/consentimento
5. onSuccess retorna itemId
6. página chama POST /sync
7. backend busca contas
8. backend busca transações por conta
9. normalize -> deduplicate/upsert -> PostgreSQL
10. Dashboard/Transações passam a ler os dados sincronizados normalmente
```

A sincronização aceita apenas contas/transações em BRL no MVP 0.2. Transações `PENDING` são ignoradas; apenas `POSTED` entram no banco. O valor é persistido como magnitude positiva, com `type = debit` ou `credit`, preservando a semântica utilizada pelos analytics existentes.

## Aplicativo iOS

Configure `ios/Config/Local.xcconfig` com a URL do backend. Para Simulator no mesmo Mac:

```text
API_BASE_URL = http:$(SLASH)$(SLASH)localhost:8000
```

Para um iPhone físico acessando o backend no Windows/Mac da mesma LAN:

1. use o IP LAN do computador, por exemplo `http:$(SLASH)$(SLASH)192.168.1.10:8000`;
2. defina `BACKEND_BIND=0.0.0.0`;
3. permita a porta no firewall apenas na rede confiável;
4. abra a aba **Conexões** no app.

A aba possui **Conectar instituição** e **Sincronizar agora**. Depois da sincronização, o usuário pode voltar ao Resumo e usar pull-to-refresh.

## Regras financeiras

- `amount` é não negativo.
- `debit` = despesa.
- `credit` = receita.
- `transfer` = movimentação interna e não entra em gastos/receitas.
- Dinheiro usa `Decimal`, `NUMERIC(18,2)` e strings JSON com duas casas.
- Não há conversão cambial no MVP 0.2; somente BRL é persistido.
- Categorias do provider passam por uma normalização determinística simples antes de serem persistidas.
- O LLM continua fora do fluxo financeiro e não faz cálculos.

## Segurança e limites

O Finance Copilot continua sendo um projeto **single-person e sem autenticação própria da API**. Com dados reais, não exponha este backend diretamente à internet até existir autenticação/autorização adequada. Para desenvolvimento com iPhone físico, use apenas LAN confiável; para deployment futuro, use HTTPS e autenticação.

Segredos ficam no `.env`/secret manager e nunca no iOS. O adapter não registra bodies da Pluggy nem credenciais. Erros persistidos em `sync_runs` são sanitizados. Respostas continuam com `Cache-Control: no-store`.

Ainda fora do MVP 0.2: multiusuário, pagamentos, webhooks de atualização automática, LLM/chat, analytics avançados, recorrência avançada e insights proativos.
