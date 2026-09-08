# Finance Copilot

Aplicativo pessoal de finanças para iPhone. O **MVP 0.1** permite consultar transações fictícias em BRL, filtrar períodos e visualizar gastos por categoria com um backend real e PostgreSQL.

O [documento original de visão e roadmap](docs/vision.md) foi preservado. Open Finance, sincronização, chat/LLM, insights e analytics avançados continuam fora deste MVP. A especificação da implementação está em [mvp-prompt.txt](mvp-prompt.txt).

## Arquitetura e escopo implementado

```text
iPhone: SwiftUI + Swift Charts + URLSession
                    |
                 REST/JSON
                    |
FastAPI: transactions / categories / analytics
                    |
          SQLAlchemy + PostgreSQL
               Alembic migrations
```

Monólito modular, uso pessoal, API somente de leitura e dataset determinístico. São **126 transações de abril a setembro de 2026**, com salário, mercado, transporte, assinaturas, moradia, transferências e despesas sem categoria. O aplicativo abre em setembro de 2026 para mostrar dados mesmo quando o mês atual estiver fora do dataset.

```text
backend/app/                 API, modelos, cálculos e seed
backend/alembic/             Migration inicial reversível
backend/tests/               Testes reais com PostgreSQL
ios/FinanceCopilot.xcodeproj Projeto Xcode e scheme compartilhado
ios/FinanceCopilot/          Models, Networking, Services, ViewModels, Views
ios/FinanceCopilotTests/     XCTest e fixtures reais da API fictícia
scripts/dev.py              Comandos de desenvolvimento
compose.yaml                PostgreSQL, migration e backend
```

## Requisitos

- Docker Engine/Desktop com Docker Compose v2 para a opção em containers.
- Python **3.12+** para executar o backend e os testes no host.
- PostgreSQL **18** para a opção nativa. Os testes também exigem PostgreSQL; não usam SQLite.
- macOS com **Xcode 16+** e destino iOS **16+** para compilar/executar o aplicativo. Windows permite desenvolver/verificar o backend, mas não compilar SwiftUI ou usar o simulador iOS.

## Configuração

Na raiz, copie `.env.example` para `.env` e substitua `replace_with_local_password` nos dois URLs e em `POSTGRES_PASSWORD`. Use letras/dígitos na senha local para simplificar a interpolação do Compose. URLs configurados manualmente precisam de percent-encoding para caracteres especiais na senha.

```powershell
Copy-Item .env.example .env
```

No macOS/Linux, use `cp .env.example .env`. Não sobrescreva um `.env` já configurado. As variáveis de processo têm prioridade sobre o arquivo. Nenhum segredo vai no aplicativo iOS.

| Variável | Uso |
| --- | --- |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | Inicialização do PostgreSQL no Compose |
| `POSTGRES_PORT` | Porta publicada no host; padrão 5432 |
| `DATABASE_URL` | Backend no host; driver obrigatório `postgresql+psycopg` |
| `TEST_DATABASE_URL` | Conexão explícita dos testes; exige permissão para criar schemas |
| `BACKEND_BIND` | `127.0.0.1` por padrão; `0.0.0.0` para desenvolvimento em LAN confiável |
| `BACKEND_PORT` | Porta HTTP do backend; padrão 8000 |

Se 5432 já estiver ocupada, altere `POSTGRES_PORT` e a porta dos URLs no `.env`. Dentro do Compose, o backend usa o hostname `db` e a porta 5432 automaticamente. O arquivo `DATABASE_URL` do host não precisa usar esse hostname.

## Executar tudo com Docker

```sh
docker compose up -d --build
docker compose exec backend python -m app.db.seed
docker compose ps
docker compose run --rm --no-deps backend python -m pytest -q
```

O serviço `migrate` aguarda o banco saudável, executa `alembic upgrade head` e termina antes do backend iniciar. Para repetir manualmente: `docker compose run --rm migrate`. O seed é explícito, transacional e pode ser repetido sem duplicar os exemplos.

A API estará em <http://127.0.0.1:8000>, com [Swagger /docs](http://127.0.0.1:8000/docs), [OpenAPI JSON](http://127.0.0.1:8000/openapi.json) e [health check](http://127.0.0.1:8000/health). Ajuste a porta dos links se necessário.

`docker compose down` para os containers e preserva o volume `postgres_data`. Alterar a senha do `.env` não altera a senha de um volume já inicializado. O volume é montado em `/var/lib/postgresql`, conforme o [layout oficial do PostgreSQL 18 no Docker](https://docs.docker.com/guides/postgresql/).

## Backend e testes no host

Na raiz, em PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend/requirements.lock
.\.venv\Scripts\python.exe -m pip install --no-deps -e backend
docker compose up -d db
.\.venv\Scripts\python.exe scripts/dev.py migrate
.\.venv\Scripts\python.exe scripts/dev.py seed
.\.venv\Scripts\python.exe scripts/dev.py test
.\.venv\Scripts\python.exe scripts/dev.py lint
.\.venv\Scripts\python.exe scripts/dev.py api
```

No macOS/Linux, use `python3 -m venv .venv` e substitua `.\.venv\Scripts\python.exe` por `.venv/bin/python`. Não é necessário ativar o ambiente virtual. O lock registra as versões verificadas, incluindo ferramentas de teste do ambiente local.

Com PostgreSQL nativo, dispense `docker compose up -d db`: crie um banco vazio e um usuário local com senha, configure `DATABASE_URL`/`TEST_DATABASE_URL` e execute os mesmos comandos de migration/seed/teste/API. Não use o banco de produção. Os testes criam um schema aleatório `test_<uuid>`, aplicam a migration, isolam cada caso por transação/savepoint e removem apenas esse schema ao terminar.

O task runner oferece `db`, `up`, `down`, `migrate`, `seed`, `api`, `test`, `lint` e `docker-test`. Equivalentes diretos, a partir da raiz:

```sh
python -m alembic -c backend/alembic.ini upgrade head
python -m app.db.seed
python -m pytest backend/tests -q
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --no-access-log
```

## API e regras financeiras

| Método/rota | Resposta |
| --- | --- |
| `GET /health` | Readiness com consulta real ao banco; 503 se indisponível |
| `GET /transactions` | `{items, total, limit, offset}` |
| `GET /transactions/{id}` | Transação com conta/categoria; 404 se ausente |
| `GET /categories` | IDs e nomes para o filtro de categoria |
| `GET /analytics/spending-summary` | Gastos, receitas e contagens por tipo |
| `GET /analytics/spending-by-category` | `{currency, period_start, period_end, items}` |

Transações e analytics aceitam `start_date=YYYY-MM-DD` e `end_date=YYYY-MM-DD`, **ambos inclusivos**. Um limite omitido fica aberto; os campos de período retornam os limites solicitados, com `null` onde não foram informados. Intervalos invertidos ou datas inválidas retornam 422.

Lista: `limit` padrão 50, entre 1 e 100; `offset` padrão 0, entre 0 e 1.000.000. Ordenação por data decrescente e UUID decrescente para estabilidade. `category_id` é opcional; um UUID válido sem correspondência retorna lista vazia. Offset além do fim também retorna lista vazia.

Exemplo:

```http
GET /analytics/spending-summary?start_date=2026-09-01&end_date=2026-09-30
```

```json
{
  "currency": "BRL",
  "period_start": "2026-09-01",
  "period_end": "2026-09-30",
  "total_spending": "3649.94",
  "total_income": "8150.00",
  "transaction_count": 21,
  "expense_count": 18,
  "income_count": 2,
  "transfer_count": 1
}
```

- `amount` é sempre não negativo: `debit` = despesa bruta; `credit` = receita; `transfer` = movimentação interna excluída dos dois totais. Contagem total inclui os três tipos. Estornos não têm tratamento específico neste MVP.
- Dinheiro usa `Decimal`, `NUMERIC(18,2)` e strings JSON com duas casas. Entradas binárias, não finitas, negativas ou com frações de centavo são rejeitadas antes da gravação pelo SQLAlchemy. Não há conversão cambial; banco e API permitem somente BRL.
- Gastos por categoria incluem apenas débitos. Categoria nula aparece como `Sem categoria`, com `category_id: null`. Períodos vazios retornam `"0.00"`, contagens zero e lista de categorias vazia.
- Tabelas: `accounts`, `categories`, `transactions`; UUIDs, FKs, unicidade `(account_id, external_id)` e timestamps com fuso. Os índices atendem período/ordenação e categoria/período; a unicidade composta também cobre conta. `updated_at` é atualizado nos writes SQLAlchemy. User, Merchant e SyncRun ficam para quando houver um requisito real.

## Aplicativo iOS

No Mac, abra `ios/FinanceCopilot.xcodeproj`, escolha o scheme **FinanceCopilot**, um iPhone Simulator e execute **Run**. Não precisa gerar projeto nem instalar dependências Swift. **Product → Test** executa o target XCTest incluído.

Para alterar a URL, copie `ios/Config/Local.xcconfig.example` para `ios/Config/Local.xcconfig` e ajuste `API_BASE_URL`. Esse arquivo é ignorado pelo Git. Use `http:$(SLASH)$(SLASH)localhost:8000` quando o backend estiver no mesmo Mac do simulador. A sintaxe evita que `//` seja interpretado como comentário de xcconfig.

Para um **iPhone físico**, ou um simulador no Mac acessando este backend Windows:

1. Use o endereço LAN do computador do backend, por exemplo `http:$(SLASH)$(SLASH)192.168.1.10:8000`.
2. Defina `BACKEND_BIND=0.0.0.0` e reinicie o backend/Compose. Mantenha o PostgreSQL em loopback.
3. Conecte os dispositivos à mesma rede confiável e permita a porta HTTP no firewall dessa rede.
4. No dispositivo, aceite a permissão de rede local. Para iPhone físico, selecione sua equipe em **Signing & Capabilities** e um bundle ID disponível.

A configuração **Debug** permite HTTP para desenvolvimento local. **Release** não contém exceção ATS e o cliente exige HTTPS. Isso não implementa autenticação ou torna o MVP adequado para exposição pública.

Dashboard e lista compartilham o período. Há atalhos para setembro/2026, todo o dataset e mês atual, além de datas personalizadas. As telas incluem carregamento, vazio, erro com retry e atualização. A lista pagina em blocos de 50. O detalhe consulta o endpoint por UUID. O Swift Charts recebe centavos inteiros e exibe BRL; valores fora de `Int64` continuam na lista exata e não são desenhados no gráfico.

## Segurança, verificação e limites

Este MVP é **local, sem autenticação e com dados fictícios**. Não o exponha à internet nem carregue dados reais antes de adicionar autenticação e controles de acesso. `.env`, arquivos locais, banco de teste e configurações pessoais são ignorados. Nenhuma chave de LLM/Open Finance ou credencial de banco existe no iOS. Respostas usam `no-store`; acesso HTTP detalhado e logging SQL com dados são desativados nos comandos fornecidos. Erros retornam mensagens genéricas, sem SQL, parâmetros ou corpos de requisição.

Consulte [a verificação do MVP](docs/verification.md) para os comandos executados, resultados e limites desta máquina. O backend foi testado com PostgreSQL nativo. **Docker não estava instalado; a imagem/Compose não foram executados. O app iOS e XCTest não foram compilados ou executados em Windows.** A próxima validação é abrir o projeto no Xcode, executar os testes e percorrer as três telas com o backend ativo.

MVP 0.1 usa apenas seed determinístico: não inclui CSV, edição/importação de dados, multiusuário, autenticação, Open Finance, LLM, comparação de períodos ou análises avançadas.
