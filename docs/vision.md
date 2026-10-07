# Finance Copilot

Aplicativo pessoal de finanças, com cliente web, que consolida transações, categoriza gastos, gera análises e permite conversar com um assistente baseado em LLM sobre o próprio histórico financeiro.

> Status: **MVP 0.2 concluído** — em andamento: MVP 0.3 (Produção)
>
> Escopo inicial: **uso pessoal**

---

## Visão

O Finance Copilot tem como objetivo responder, de forma simples, perguntas como:

- Quanto gastei este mês?
- Em quais categorias estou gastando mais?
- Quais despesas aumentaram em relação aos meses anteriores?
- Quais pagamentos parecem recorrentes?
- Quanto gastei em um determinado estabelecimento?
- Como meus gastos mudaram ao longo do tempo?
- Existem padrões ou anomalias relevantes no meu comportamento financeiro?

A aplicação será dividida em três camadas principais:

1. **Dados financeiros** — ingestão e normalização de transações.
2. **Analytics** — cálculos determinísticos sobre o histórico financeiro.
3. **Assistente com LLM** — interface conversacional sobre os dados e análises existentes.

O LLM não será a fonte de verdade para cálculos financeiros. Operações como soma, comparação de períodos, agrupamentos e métricas serão executadas pelo backend.

---

## Objetivos

### Objetivos do projeto

- Consolidar transações financeiras em uma base única.
- Permitir categorização e normalização de gastos.
- Visualizar gastos por período, categoria e estabelecimento.
- Identificar despesas recorrentes.
- Comparar comportamento financeiro entre períodos.
- Integrar dados via Open Finance.
- Disponibilizar uma interface conversacional baseada em LLM.
- Manter dados e credenciais sensíveis fora do cliente web.
- Construir uma arquitetura simples, modular e evolutiva.

### Fora do escopo inicial

- Plataforma multiusuário.
- Recomendação de investimentos.
- Compra ou venda de ativos.
- Execução de pagamentos.
- Microservices.
- Kubernetes.
- Fine-tuning de modelos.
- Vector database para histórico de transações.
- Event sourcing / CQRS.
- Integração com múltiplos provedores Open Finance no MVP.

---

# Roadmap

## MVP 0.1 — Core financeiro com dados locais

Objetivo:

> Abrir o aplicativo e visualizar gastos por categoria e período usando transações fake ou importadas por CSV.

### Entregas

- [x] Backend FastAPI.
- [x] PostgreSQL local.
- [x] Modelo de transações.
- [x] Dataset fake (seed determinístico com 126 transações).
- [ ] Importação CSV.
- [x] API de transações.
- [x] Gastos agregados por categoria.
- [ ] Gastos agregados por mês (série mensal; hoje há resumo por período).
- [x] Aplicativo cliente (SwiftUI na época; substituído pelo cliente web no MVP 0.3).
- [x] Dashboard inicial.
- [x] Lista de transações.
- [x] Filtro por período.

---

## MVP 0.2 — Open Finance

Objetivo:

> Substituir a origem local por sincronização automática de dados financeiros.

### Entregas

- [x] Criar abstração `FinancialDataProvider`.
- [x] Implementar adapter do provedor Open Finance.
- [x] Importar contas.
- [x] Importar transações.
- [x] Normalizar dados recebidos.
- [x] Deduplicar transações.
- [x] Registrar histórico de sincronizações.
- [x] Tratar erros e retries de integração.

---

## MVP 0.3 — Produção

Objetivo:

> Usar o Finance Copilot no dia a dia, com dados reais, de qualquer dispositivo e com segurança.

### Entregas

- [x] Cliente web (React + TypeScript) com paridade funcional com o app iOS, que foi removido (tag `ios-mvp-0.2`).
- [ ] Autenticação com cookie `httpOnly` e proteção CSRF.
- [ ] Deploy HTTPS com web e API no mesmo domínio.
- [ ] Sync automático por webhooks do Pluggy.
- [ ] Operação: backups, logs e monitoramento.

---

## MVP 0.4 — Analytics

Objetivo:

> Gerar insights úteis sem depender de LLM.

### Entregas

- [x] Gastos por categoria.
- [ ] Gastos por estabelecimento.
- [ ] Comparação entre períodos.
- [ ] Fluxo de caixa mensal.
- [ ] Identificação de despesas recorrentes.
- [ ] Maiores transações do período.
- [ ] Tendência de gastos.
- [ ] Detecção básica de anomalias.

---

## MVP 0.5 — AI Assistant

Objetivo:

> Permitir consultas em linguagem natural sobre os próprios dados financeiros.

### Exemplos

- "Quanto gastei com restaurantes nos últimos 3 meses?"
- "Quais categorias mais aumentaram este mês?"
- "Quanto gasto por mês com assinaturas?"
- "Quais foram minhas maiores compras em agosto?"
- "Compare meus gastos deste mês com a média dos últimos 6 meses."

### Entregas

- [ ] Endpoint de chat.
- [ ] Integração com LLM via API.
- [ ] Tool calling.
- [ ] Ferramentas de analytics para o LLM.
- [ ] Histórico de conversa.
- [ ] Controles de privacidade.
- [ ] Respostas explicáveis e baseadas em dados retornados pelas tools.

---

## MVP 0.6 — Insights proativos

Entregue: endpoint `GET /analytics/insights`, com regras determinísticas sobre a comparação de períodos (sem LLM). Falta a exibição no cliente web.

Possíveis exemplos:

> Seus gastos com restaurantes estão 28% acima da média dos últimos seis meses.

> Você possui aproximadamente R$ 420/mês em despesas recorrentes.

> Seus gastos com transporte aumentaram por três meses consecutivos.

---

# Arquitetura

A aplicação seguirá inicialmente um modelo de **monólito modular**.

```text
                         ┌──────────────────┐
                         │  Navegador / PWA │
                         │ React + Recharts │
                         └────────┬─────────┘
                                  │
                                HTTPS
                                  │
                         ┌────────▼─────────┐
                         │     FastAPI      │
                         │                  │
                         │ transactions     │
                         │ analytics        │
                         │ categories       │
                         │ sync             │
                         │ ai               │
                         └────────┬─────────┘
                                  │
                    ┌─────────────┼─────────────┐
                    │             │             │
                    ▼             ▼             ▼
               PostgreSQL    Open Finance     LLM API
                                Provider
```

## Princípios

- O cliente web nunca acessa diretamente o banco de dados.
- O cliente web nunca recebe secrets do provedor Open Finance.
- O cliente web nunca recebe a API key do LLM.
- Web e API ficam no mesmo domínio; o cliente chama a API em `/api`.
- O backend é responsável por autenticação, regras de negócio e analytics.
- O banco de dados é a fonte de verdade para transações normalizadas.
- O LLM acessa dados através de tools controladas pelo backend.
- Cálculos financeiros devem ser determinísticos e testáveis.

---

# Stack

## Web

- TypeScript (strict)
- React
- Vite
- React Router
- TanStack Query
- Recharts
- Tailwind CSS
- ESLint
- Vitest / Testing Library / MSW

## Backend

- Python
- FastAPI
- Pydantic
- SQLAlchemy
- Alembic
- httpx
- pytest

## Banco

- PostgreSQL

## AI

- LLM via API
- Function / Tool Calling

## Infra

- Docker
- Docker Compose para desenvolvimento
- GitHub Actions
- PostgreSQL gerenciado em produção
- Container hosting para o backend

---

# Estrutura do repositório

O projeto começa como monorepo.

```text
finance-copilot/
│
├── backend/
│   ├── app/
│   │   ├── api/
│   │   ├── domain/
│   │   ├── models/
│   │   ├── schemas/
│   │   ├── repositories/
│   │   ├── services/
│   │   ├── analytics/
│   │   ├── integrations/
│   │   │   ├── open_finance/
│   │   │   └── llm/
│   │   └── main.py
│   │
│   ├── tests/
│   ├── alembic/
│   ├── pyproject.toml
│   └── Dockerfile
│
├── web/
│   ├── public/
│   └── src/
│       ├── api/
│       ├── components/
│       ├── hooks/
│       ├── lib/
│       ├── pages/
│       └── test/
│
├── data/
│   └── samples/
│
├── docs/
│   └── adr/
│
├── .github/
│   └── workflows/
│
├── docker-compose.yml
├── .env.example
├── .gitignore
└── README.md
```

---

# Domínio

## Transaction

Campos mínimos planejados:

```text
id
external_id
account_id

date
description
merchant

amount
currency
type

category
subcategory

is_recurring

created_at
updated_at
```

### Exemplo

```json
{
  "id": "tx_123",
  "external_id": "provider_456",
  "account_id": "acc_001",
  "date": "2026-09-07",
  "description": "UBER *TRIP",
  "merchant": "Uber",
  "amount": "37.90",
  "currency": "BRL",
  "type": "debit",
  "category": "transport",
  "subcategory": "ride_hailing",
  "is_recurring": false
}
```

> Valores monetários devem usar `Decimal` no backend e `NUMERIC` no PostgreSQL. Evitar `float` para dinheiro.

---

# Modelo de dados inicial

```text
User
 │
 ├── Account
 │     │
 │     └── Transaction
 │
 ├── Merchant
 │
 ├── Category
 │
 └── SyncRun
```

Tabelas iniciais:

```text
users
accounts
transactions
merchants
categories
sync_runs
```

Tabelas futuras:

```text
recurring_transactions
budgets
financial_insights
chat_sessions
chat_messages
```

---

# API

Endpoints iniciais planejados:

```http
GET /health

GET /transactions
GET /transactions/{id}

GET /analytics/summary
GET /analytics/spending-by-category
GET /analytics/spending-by-merchant
GET /analytics/monthly
GET /analytics/compare-periods

POST /sync
GET  /sync/runs
```

Futuramente:

```http
POST /chat
```

---

# Analytics

O backend deverá ser capaz de responder perguntas financeiras sem depender do LLM.

Exemplos de funções:

```text
get_spending_summary
get_spending_by_category
get_spending_by_merchant
compare_periods
get_monthly_cashflow
get_recurring_expenses
get_largest_transactions
```

Fluxo:

```text
PostgreSQL
    ↓
analytics service
    ↓
dados estruturados
    ↓
API / LLM tools
```

---

# Categorização

A categorização deve seguir uma estratégia em camadas.

```text
categoria do provider
        ↓
normalização de merchant
        ↓
regras determinísticas
        ↓
regras definidas pelo usuário
        ↓
LLM como fallback
```

Exemplo:

```text
UBER *TRIP
UBER DO BRASIL
UBER* PENDING

        ↓

merchant = Uber
category = Transport
```

O resultado de classificações desconhecidas poderá ser persistido para evitar novas chamadas ao LLM para o mesmo estabelecimento.

---

# Integração Open Finance

A aplicação não deve depender diretamente de um fornecedor.

Interface conceitual:

```python
class FinancialDataProvider:
    async def get_accounts(self):
        ...

    async def get_transactions(self):
        ...

    async def get_balances(self):
        ...
```

Implementação inicial:

```text
FinancialDataProvider
        │
        └── OpenFinanceProvider
```

Isso permite substituir ou adicionar fornecedores no futuro sem alterar o domínio da aplicação.

---

# Sincronização

Fluxo esperado:

```text
Open Finance
     ↓
Sync Service
     ↓
normalize
     ↓
deduplicate
     ↓
categorize
     ↓
PostgreSQL
```

Cada execução deverá gerar um registro em `sync_runs`.

Exemplo:

```text
id
provider
started_at
finished_at
status
transactions_received
transactions_created
transactions_updated
error
```

---

# LLM

O histórico completo de transações não será enviado ao modelo.

O LLM funcionará como uma camada de interpretação e orquestração:

```text
Usuário
   ↓
  LLM
   ↓
Tool Calling
   ↓
Analytics Service
   ↓
PostgreSQL
   ↓
resultado agregado
   ↓
  LLM
   ↓
resposta
```

Exemplo:

```text
Usuário:

"Quanto gastei com restaurantes nos últimos 3 meses?"

        ↓

LLM chama:

get_spending_by_category(
    category="restaurant",
    start_date="...",
    end_date="..."
)

        ↓

Backend retorna:

{
  "month_1": 620.00,
  "month_2": 780.00,
  "month_3": 1100.00
}

        ↓

LLM interpreta os dados.
```

## Tools planejadas

```text
get_transactions
get_spending_summary
get_spending_by_category
get_spending_by_merchant
compare_periods
get_recurring_expenses
get_largest_transactions
get_monthly_cashflow
```

Futuramente:

```text
detect_anomalies
forecast_month
simulate_budget
```

---

# Visualizações

Gráficos são gerados pelo cliente web com dados estruturados retornados pelo backend.

Exemplos:

- Gastos por categoria.
- Evolução mensal.
- Gastos por estabelecimento.
- Fluxo de caixa.
- Comparação entre períodos.

O LLM poderá solicitar uma determinada análise, mas não será responsável por gerar a representação visual final.

---

# Segurança

Este projeto manipula dados financeiros e deve tratar segurança como requisito de primeira classe.

## Regras

- Secrets nunca devem ser commitados.
- Chaves do provedor Open Finance ficam somente no backend.
- Chaves do LLM ficam somente no backend.
- No web, a sessão usa cookie `httpOnly`, `Secure` e `SameSite`; nada de token em `localStorage`/`sessionStorage`.
- Toda comunicação em produção deve usar HTTPS.
- Logs não devem conter dados financeiros sensíveis.
- Credenciais devem ser fornecidas por variáveis de ambiente ou secret manager.
- Backups do banco devem ser protegidos.
- Dados enviados ao LLM devem ser minimizados.

Fluxo esperado:

```text
Navegador
  │
 HTTPS
  │
  ▼
Backend
  ├── Open Finance credentials
  ├── LLM API key
  └── Database credentials
```

---

# Requisitos funcionais

## RF-01 — Transações

O sistema deve armazenar e consultar transações financeiras.

## RF-02 — Filtros

O usuário deve conseguir filtrar transações por período, categoria e estabelecimento.

## RF-03 — Categorias

O sistema deve classificar transações em categorias.

## RF-04 — Dashboard

O aplicativo deve apresentar um resumo financeiro do período selecionado.

## RF-05 — Analytics

O backend deve fornecer métricas agregadas sobre gastos.

## RF-06 — Sincronização

O sistema deve ser capaz de sincronizar dados de um provedor financeiro.

## RF-07 — Deduplicação

A sincronização não deve criar transações duplicadas.

## RF-08 — Histórico de sync

Cada sincronização deve possuir status e informações suficientes para troubleshooting.

## RF-09 — Assistente

O usuário poderá realizar perguntas em linguagem natural sobre os dados disponíveis.

## RF-10 — Tool Calling

O LLM deverá consultar os dados através de ferramentas controladas pelo backend.

---

# Requisitos não funcionais

## Segurança

Nenhum segredo sensível deve existir no bundle do cliente web.

## Privacidade

A quantidade de dados financeiros enviados ao LLM deve ser minimizada.

## Confiabilidade

A aplicação deve evitar duplicação e corrupção de transações.

## Precisão

Cálculos financeiros devem utilizar tipos adequados para valores monetários.

## Observabilidade

Falhas de sincronização e integrações devem gerar logs úteis sem expor dados sensíveis.

## Testabilidade

Regras de normalização, categorização e analytics devem possuir testes automatizados.

## Manutenibilidade

Integrações externas devem estar isoladas do domínio da aplicação.

## Performance

Consultas comuns do dashboard devem ser executadas de forma rápida e sem depender do LLM.

---

# Desenvolvimento local

## Requisitos

- Python
- Docker
- Docker Compose
- PostgreSQL
- Node.js LTS

## Backend

Fluxo planejado:

```bash
cd backend

cp ../.env.example .env

docker compose up -d

# instalar dependências
# executar migrations
# iniciar FastAPI
```

A configuração exata será adicionada quando o bootstrap do backend estiver implementado.

---

# Variáveis de ambiente

Exemplo futuro de `.env.example`:

```env
DATABASE_URL=

OPEN_FINANCE_CLIENT_ID=
OPEN_FINANCE_CLIENT_SECRET=

LLM_API_KEY=
LLM_MODEL=
```

Nunca adicionar valores reais ao repositório.

---

# Testes

Prioridade de testes:

1. Normalização de transações.
2. Deduplicação.
3. Categorização.
4. Analytics.
5. Datas e períodos.
6. Valores monetários.
7. Integração com providers.
8. Endpoints críticos.

Backend:

```bash
pytest
```

---

# CI/CD

Fluxo esperado:

```text
Pull Request
     ↓
GitHub Actions
     ↓
lint
     ↓
tests
     ↓
build
     ↓
merge
```

Futuramente:

```text
main
 ↓
CI
 ↓
Docker image
 ↓
deploy
```

O deploy do cliente web e da API será manual inicialmente.

---

# GitHub Project

O desenvolvimento será organizado usando GitHub Projects em formato Kanban.

Status:

```text
Backlog
   ↓
Ready
   ↓
In Progress
   ↓
Done
```

Campos adicionais:

```text
Priority
- P0
- P1
- P2

Area
- Foundation
- Database
- Backend
- Web
- Analytics
- Open Finance
- AI
- Security
- Infrastructure
```

Regra recomendada:

> Manter no máximo 1 ou 2 issues em `In Progress`.

---

# Áreas do projeto

Parent issues / áreas planejadas:

```text
🏗 Foundation
🗄 Database
🔌 Backend API
🌐 Web
📊 Analytics
🏦 Open Finance
🤖 AI Assistant
🔐 Security
🚀 Infrastructure
```

Ordem inicial de execução:

```text
Foundation
    ↓
Database
    ↓
Backend
    ↓
Web
    ↓
Analytics
    ↓
Open Finance
    ↓
AI Assistant
```

---

# Decisões arquiteturais

Decisões importantes deverão ser documentadas em:

```text
docs/adr/
```

Exemplos:

```text
ADR-001 — Monorepo
ADR-002 — FastAPI
ADR-003 — PostgreSQL
ADR-004 — Monólito modular
ADR-005 — Cliente web (React) no lugar do SwiftUI
ADR-006 — Tool calling para acesso do LLM aos dados
ADR-007 — Adapter para integração Open Finance
```

---

# Princípios de engenharia

1. Começar simples.
2. Construir vertical slices pequenos.
3. Evitar dependências sem necessidade real.
4. Não usar LLM para problemas determinísticos.
5. Separar domínio de integrações externas.
6. Tratar dinheiro com tipos numéricos adequados.
7. Segurança e privacidade desde o início.
8. Preferir código testável a abstrações prematuras.
9. Não otimizar para escala que ainda não existe.
10. Cada MVP deve produzir algo utilizável.

---

# Aviso

Este projeto é desenvolvido inicialmente para organização e análise financeira pessoal.

O assistente de IA não deve ser tratado como consultor de investimentos e suas respostas não substituem orientação profissional especializada.

---

# Licença

MIT — veja [LICENSE](../LICENSE).
