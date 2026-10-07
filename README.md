# Finance Copilot

Aplicativo pessoal de finanças com cliente web (React, instalável no iPhone como PWA) e backend FastAPI + PostgreSQL. O **MVP 0.2** entregou o core financeiro e a sincronização Open Finance via Pluggy. O **MVP 0.3 — Produção**, em andamento, começa pelo cliente web em `web/`, que substitui o app iOS.

O roadmap completo está em [docs/vision.md](docs/vision.md).

## Arquitetura

```text
Navegador / PWA: React + TypeScript (web/)
        |
        | REST/JSON em /api (mesma origem)
        v
      FastAPI
        |
        +-- transactions / categories / analytics
        +-- sync / sync_runs
        |
        +-- PostgreSQL
        |
        +-- FinancialDataProvider
                 |
                 +-- PluggyProvider -> Pluggy API -> conector MeuPluggy (200) -> bancos
```

As credenciais do Pluggy ficam **somente no backend**. O cliente web recebe apenas um Connect Token de curta duração, gerado pelo backend, e abre o widget do Pluggy com ele. O banco continua sendo a fonte de verdade para contas e transações normalizadas.

O cliente web chama a API sempre em `/api`, na própria origem. Em desenvolvimento, o Vite faz o proxy para o backend, então o backend não habilita CORS.

## Escopo implementado

### MVP 0.1 — Core financeiro

- FastAPI + PostgreSQL + Alembic.
- Contas, categorias e transações em BRL.
- Dinheiro com `Decimal`/`NUMERIC(18,2)`, nunca `float`.
- API de transações, filtros, paginação e detalhe.
- Analytics de gastos/receitas e gastos por categoria.
- Dashboard, lista de transações e detalhe no cliente.
- Seed determinístico com 126 transações de abril a setembro de 2026.

### MVP 0.2 — Open Finance

- Abstração `FinancialDataProvider`.
- Adapter `PluggyProvider` com autenticação server-side.
- Connect Token gerado pelo backend.
- Conexão pelo widget Pluggy Connect, aberto pelo cliente web.
- Importação de contas BRL.
- Importação paginada de transações POSTED via `/v2/transactions`.
- Normalização de débito/crédito, data, merchant e categorias.
- Deduplicação de contas por `(provider, provider_account_id)`.
- Deduplicação/upsert de transações por `(account_id, external_id)`.
- Histórico em `sync_runs`, incluindo contagens e falhas.
- Retry de erros transitórios/429/5xx e renovação de API key após 401.
- Tela **Conexões** para conectar instituição e sincronizar novamente.

### MVP 0.3 — Produção (em andamento)

- Cliente web em `web/`: React + TypeScript (strict) + Vite, React Router, TanStack Query, Recharts e Tailwind.
- Dashboard com filtro de período (mês atual, mês anterior, últimos 3 meses e personalizado), cards e gráfico por categoria.
- Transações paginadas e detalhe em rota própria (link compartilhável).
- Conexões com a conta MeuPluggy pelo widget Pluggy Connect, "Sincronizar novamente" e histórico de sincronizações.
- Manifest de PWA e ícones para "Adicionar à tela de início" (sem service worker por enquanto).
- Tela **Copilot**: pergunta em linguagem natural, texto do modelo separado dos dados calculados, período e fonte de cada cálculo e links para as transações que sustentam a resposta.
- Ainda **sem autenticação**: ela é a próxima entrega deste marco.

## Requisitos

- Python **3.12+**.
- PostgreSQL **18** ou Docker + Docker Compose v2.
- Node.js **LTS** e npm, para o cliente web.
- Para dados reais: aplicação criada na Pluggy (`PLUGGY_CLIENT_ID`/`PLUGGY_CLIENT_SECRET`) e uma conta MeuPluggy com as suas instituições já conectadas.

## Configuração

Copie `.env.example` para `.env` e ajuste a senha do PostgreSQL. Para Open Finance, preencha também:

```env
PLUGGY_CLIENT_ID=seu_client_id
PLUGGY_CLIENT_SECRET=seu_client_secret
PLUGGY_BASE_URL=https://api.pluggy.ai
```

Nunca coloque essas credenciais no cliente web, no Git ou em screenshots/logs.

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
| `ANTHROPIC_API_KEY` | Chave da API do modelo usado pelo Copilot, backend only. Sem ela, só o Copilot fica indisponível |
| `COPILOT_MODEL` | Modelo do Copilot; padrão `claude-opus-5-5` |

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
| `GET /transactions` | Lista paginada; filtros combináveis por período, `q` (texto em descrição ou estabelecimento), `account_id`, `category_id` e `type` |
| `GET /transactions/{id}` | Detalhe da transação |
| `GET /categories` | Categorias |
| `GET /accounts` | Contas agrupadas por instituição, com estado da sincronização e contagem de transações |
| `GET /analytics/spending-summary` | Gastos, receitas e contagens |
| `GET /analytics/spending-by-category` | Gastos por categoria |
| `GET /analytics/period-comparison` | Gastos, receitas, contagem e categorias contra o período anterior equivalente |
| `GET /analytics/insights` | Insights por regras fixas sobre a comparação de períodos, sem LLM |

Open Finance:

| Método/rota | Função |
| --- | --- |
| `POST /sync/connect-token` | Gera Connect Token usando credenciais server-side |
| `POST /sync` | Sincroniza um `item_id` específico |
| `POST /sync/refresh` | Sincroniza de novo todos os Items já conhecidos; a falha de um não interrompe os outros |
| `GET /sync/runs` | Últimas 50 execuções, com contas do Item e tipo da falha; filtros `status` e `item_id` |

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

Copilot:

| Método/rota | Função |
| --- | --- |
| `POST /copilot/ask` | Responde a uma pergunta em linguagem natural usando ferramentas determinísticas, somente leitura |

```http
POST /copilot/ask
Content-Type: application/json

{ "question": "Quanto gastei com alimentação no mês passado?", "today": "2026-10-07" }
```

`today` é a data local do usuário: o backend não decide o que é "hoje" nem "mês passado".

## Copilot

O Copilot responde perguntas sobre as finanças do usuário **sem que o modelo calcule nada**. O modelo só escolhe quais consultas rodar e redige a resposta; os números vêm das mesmas queries determinísticas das telas.

```text
pergunta + data de hoje
        ↓
modelo escolhe ferramentas ──► get_spending_summary / get_spending_by_category /
        ↑                      get_period_comparison / search_transactions / list_categories
        └── resultados (JSON, dinheiro como string decimal)
        ↓
texto da resposta ──► checagem: todo valor em reais do texto existe em algum resultado?
        ↓                       não → a resposta é retida (status "ungrounded")
resposta + períodos consultados + evidências
```

- **Somente leitura:** só existem as cinco ferramentas acima, todas de consulta. Não há ferramenta que escreva, apague, categorize ou sincronize.
- **Guardrail contra valores inventados:** além das instruções ao modelo, o backend extrai os valores em reais do texto da resposta e os compara, como decimais exatos, com os valores devolvidos pelas ferramentas na mesma pergunta. Um valor que nenhuma ferramenta devolveu (inventado, ou somado pelo próprio modelo) faz a resposta ser retida; as evidências continuam sendo devolvidas.
- **Período:** as ferramentas aceitam os presets `current_month`, `previous_month` e `last_3_months`, resolvidos no backend a partir de `today`, ou datas explícitas. A resposta traz em `periods` os períodos realmente consultados.
- **Evidências:** `evidence` lista as consultas que de fato rodaram. Cada uma traz um título, a **fonte do cálculo** em palavras, o período (e o período de comparação, quando há), os **fatos calculados** (`facts`, com valor e tipo), um link com os mesmos filtros para a tela de Transações e, nas buscas, as transações encontradas. Tudo isso é montado pelo backend a partir do resultado das consultas, nunca a partir do texto do modelo: uma fonte, um valor ou uma transação só aparecem se uma consulta determinística os produziu.
- **Fato x interpretação:** `answer` é o texto escrito pelo modelo (redação e interpretação); os fatos ficam em `evidence`. Na tela, as duas coisas aparecem separadas e rotuladas.
- **Ausência de dados:** cada evidência tem `has_data`, e a resposta tem `no_data` quando as consultas rodaram e nenhuma encontrou dados.
- **O que vai para o modelo:** a pergunta, a data e os resultados das ferramentas chamadas (totais, categorias e, em `search_transactions`, até 20 transações com data, descrição, estabelecimento, valor, tipo e categoria). Nunca vão: credenciais, tokens, ids da Pluggy, ids ou nomes de contas e instituições.
- **Logs:** perguntas, respostas e resultados não são registrados; só o status e a quantidade de consultas.
- **Limites:** uma pergunta por requisição, sem histórico de conversa; no máximo 6 rodadas do modelo por pergunta.
- **Status da resposta:** `answered`, `ungrounded` (resposta retida pelo guardrail), `refused` (o modelo se recusou) e `incomplete` (não chegou a uma resposta). Falha do modelo vira 502; falta ou recusa da chave, 503.
- **Recusas do modelo:** as requisições usam `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`), que reexecuta no servidor, em outro modelo, uma requisição recusada pelos classificadores de segurança.

## Fluxo Open Finance

```text
1. Web -> Conexões -> Conectar com MeuPluggy
2. Web chama POST /sync/connect-token
3. Backend gera Connect Token no Pluggy
4. Widget Pluggy Connect abre direto no MeuPluggy (conector 200) e o usuário faz login nele
5. onSuccess retorna o item
6. Web chama POST /sync com o item_id
7. backend busca contas
8. backend busca transações por conta
9. normalize -> deduplicate/upsert -> PostgreSQL
10. Dashboard/Transações passam a ler os dados sincronizados normalmente
```

O Finance Copilot é de uso pessoal e não tem acesso comercial ao Open Finance: ele não se conecta diretamente aos bancos. As instituições são conectadas pelo usuário no **MeuPluggy**, o agregador pessoal gratuito da Pluggy, e o app importa o que esse único Item expõe. O widget só oferece o conector MeuPluggy; isso fica no cliente (`web/src/lib/pluggyConnect.ts`), e o backend continua falando apenas com a API da Pluggy por meio do `PluggyProvider`. Contas importadas aparecem com a instituição que a Pluggy informa para o Item (MeuPluggy).

Um Item do MeuPluggy pode trazer várias contas, de instituições diferentes; todas as contas em BRL são importadas, cada uma identificada por `(provider, provider_account_id)`.

**Sincronizar novamente** não abre o widget nem cria outro Item: o backend relê os `item_id` distintos já gravados em `sync_runs` (inclusive os de execuções que falharam) e importa de novo o que a Pluggy tem para cada um. Ele não pede à Pluggy que atualize o Item nos bancos; a atualização dos dados na origem fica por conta do MeuPluggy/Pluggy.

O backend não espera nem faz polling do Item depois da conexão. Pela documentação do SDK instalado, o `onSuccess` do widget só dispara quando o Item foi criado ou atualizado com sucesso, e uma importação que pegue dados incompletos é corrigida pela seguinte, porque tudo é upsert.

Falhas da Pluggy viram mensagens montadas pelo próprio adapter a partir do status HTTP, como `Pluggy rate limit exceeded (429).` ou `Pluggy resource not found (404, ITEM_NOT_FOUND).`. O corpo da resposta nunca é copiado para a resposta da API, para `sync_runs.error` ou para os logs; só entra o código de erro quando ele é uma constante simples.

A sincronização aceita apenas contas/transações em BRL no MVP 0.2. Transações `PENDING` são ignoradas; apenas `POSTED` entram no banco. O valor é persistido como magnitude positiva, com `type = debit` ou `credit`, preservando a semântica utilizada pelos analytics existentes.

## Cliente web

Com o backend rodando (`scripts/dev.py api`, porta 8000), em outro terminal:

```sh
cd web
npm install
npm run dev
```

Abra `http://localhost:5173`. O Vite repassa `/api/*` para `http://127.0.0.1:8000`; para apontar para outro endereço, copie `web/.env.example` para `web/.env` e ajuste `API_PROXY_TARGET`.

| Script | Função |
| --- | --- |
| `npm run dev` | Servidor de desenvolvimento com proxy para a API |
| `npm run build` | Typecheck + build de produção em `web/dist` |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript em modo strict |
| `npm run test` | Vitest + Testing Library, com a API mockada (MSW) |

Regras do cliente:

- dinheiro chega como string decimal e é formatado em BRL sem virar `number`; a única conversão fica no componente do gráfico, só para a escala;
- datas `YYYY-MM-DD` são tratadas como datas locais, nunca com `new Date("YYYY-MM-DD")`;
- o período selecionado fica na URL (`?period=previous-month` ou `?start=…&end=…`);
- o tema (claro ou escuro) segue o sistema até o usuário escolher pelo botão de sol/lua; a escolha fica em `localStorage`;
- o seed cobre abril a setembro de 2026: use **Mês anterior**, **Últimos 3 meses** ou **Personalizado** se o mês atual estiver vazio.

Para testar em um iPhone na mesma LAN confiável, rode `npm run dev -- --host` e abra `http://<IP do computador>:5173`. O backend continua em `127.0.0.1`, porque só o Vite fala com ele. No Safari, **Compartilhar → Adicionar à Tela de Início** instala o app.

## Código do app iOS

O cliente SwiftUI foi removido da `main` quando o cliente web atingiu a paridade. O último estado dele está na tag [`ios-mvp-0.2`](https://github.com/mrquintao/finance-copilot/tree/ios-mvp-0.2):

```sh
git checkout ios-mvp-0.2
```

## Regras financeiras

- `amount` é não negativo.
- `debit` = despesa.
- `credit` = receita.
- `transfer` = movimentação interna e não entra em gastos/receitas.
- Dinheiro usa `Decimal`, `NUMERIC(18,2)` e strings JSON com duas casas.
- Não há conversão cambial no MVP 0.2; somente BRL é persistido.
- Categorias do provider passam por uma normalização determinística simples antes de serem persistidas.
- O LLM não faz cálculos: no Copilot ele só escolhe consultas e redige; todo valor exibido é conferido contra o resultado das ferramentas.
- Insights (`GET /analytics/insights`) são regras fixas sobre a comparação com o período anterior: uma variação é relevante quando tem pelo menos R$ 50,00 e, havendo valor anterior, pelo menos 20%. Os tipos são variação relevante de gasto por categoria (alta ou queda), a categoria que mais variou, variação relevante do total de gastos e de receitas, e crescimento relevante dos gastos marcados como recorrentes. Cada insight traz os valores comparados, e a resposta traz os dois períodos e os limiares.

## Segurança e limites

O Finance Copilot continua sendo um projeto **single-person e sem autenticação própria da API**. Com dados reais, não exponha o backend nem o servidor do Vite à internet até existir autenticação/autorização adequada. Para testar em um iPhone, use apenas LAN confiável; o deploy do MVP 0.3 usará HTTPS, com web e API no mesmo domínio, e autenticação por cookie `httpOnly`.

Segredos ficam no `.env`/secret manager e nunca no cliente web, que não guarda tokens nem dados financeiros em `localStorage`/`sessionStorage` (só a preferência de tema). O adapter não registra bodies da Pluggy nem credenciais. Erros persistidos em `sync_runs` são sanitizados. Respostas continuam com `Cache-Control: no-store`.

Ainda não implementado: autenticação, deploy e webhooks de atualização automática (os três fazem parte do MVP 0.3), além de multiusuário, pagamentos, LLM/chat, analytics avançados, recorrência avançada e insights proativos.
