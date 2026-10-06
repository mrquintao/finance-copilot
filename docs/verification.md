# Verificação

Como conferir que o Finance Copilot está funcionando, do backend ao app iOS. A parte automatizada roda no GitHub Actions; o restante é um roteiro manual curto.

## Automatizado (CI)

| Workflow | O que verifica |
| --- | --- |
| **Backend CI** | `ruff check`, `ruff format --check`, migrations do zero, `alembic check` (modelos x migrations) e a suíte `pytest` contra PostgreSQL 18 |
| **iOS Tests** | Build do app e testes XCTest no simulador |
| **iOS UI Screenshot** | Sobe um backend mock e captura a interface no simulador |

Os testes do backend rodam contra PostgreSQL real, sem SQLite. Cada execução cria um schema isolado e o remove ao final. Cobrem:

- listagem, detalhe e paginação estável de transações;
- filtros de período (limites inclusivos, períodos abertos e vazios);
- débitos, créditos e transferências separados corretamente;
- dinheiro: centavos exatos, valores grandes e rejeição de float, NaN, infinito e frações de centavo;
- constraints, chaves estrangeiras e unicidade;
- migrations reversíveis (downgrade e upgrade) e seed idempotente;
- contrato OpenAPI;
- erros e logs sem vazamento de dados financeiros.

## Rodando localmente

Com `.env` configurado (veja o README) e o banco disponível, na raiz do repositório:

```sh
python scripts/dev.py migrate
python scripts/dev.py seed
python -m alembic -c backend/alembic.ini check
python scripts/dev.py lint
python -m ruff format --check backend scripts
python scripts/dev.py test
python scripts/dev.py api
```

Rodar o seed duas vezes deve inserir 126 transações na primeira e nenhuma na segunda.

Com a API no ar, confira manualmente:

- `GET /health` responde e indica o banco disponível;
- `/docs` abre a documentação interativa;
- setembro/2026 no seed: gastos de **R$ 3.649,94**, receitas de **R$ 8.150,00** e 21 transações; a soma por categoria fecha exatamente com o total de gastos;
- UUID inexistente retorna `404`; paginação ou período inválido retorna `422`.

## App iOS (macOS)

1. Abra `ios/FinanceCopilot.xcodeproj` no Xcode 16+ e configure a URL do backend conforme o README.
2. Rode **Product → Test** no scheme `FinanceCopilot`. As fixtures são respostas reais do backend com dados fictícios.
3. Rode o app e confira o resumo de setembro, o gráfico por categoria, a lista e o detalhe.
4. Selecione todo o período para testar a paginação e depois um período vazio.
5. Desligue o backend para conferir a tela de erro e o retry. Troque de período rapidamente para garantir que respostas antigas não sobrescrevem a seleção atual.
6. Em um iPhone físico, confirme a permissão de rede local. HTTP só é permitido na configuração Debug; Release exige HTTPS.

## Open Finance (Pluggy)

Requer `PLUGGY_CLIENT_ID` e `PLUGGY_CLIENT_SECRET` no `.env` do backend.

1. No app, abra **Conexões** e conecte uma instituição.
2. Confira que contas e transações aparecem e que `GET /sync/runs` registra a execução com as contagens.
3. Sincronize de novo: nenhuma transação deve ser duplicada.

## Limitações conhecidas

- `docker compose` não é exercitado no CI; o CI usa o PostgreSQL como serviço do GitHub Actions.
- Escopo de uso pessoal: um usuário, apenas BRL e API de leitura (sem autenticação, edição ou importação CSV).
- A paginação usa offset, o que é adequado ao volume atual. Se o banco mudar durante a navegação, recarregue a lista.
