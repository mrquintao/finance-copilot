# Verificação

Como conferir que o Finance Copilot está funcionando, do backend ao cliente web. A parte automatizada roda no GitHub Actions; o restante é um roteiro manual curto.

## Automatizado (CI)

| Workflow | O que verifica |
| --- | --- |
| **Backend CI** | `ruff check`, `ruff format --check`, migrations do zero, `alembic check` (modelos x migrations) e a suíte `pytest` contra PostgreSQL 18 |
| **Web CI** | `npm ci`, ESLint, typecheck (TypeScript strict), Vitest e build de produção do `web/`, em Node LTS |

Os testes do backend rodam contra PostgreSQL real, sem SQLite. Cada execução cria um schema isolado e o remove ao final. Cobrem:

- listagem, detalhe e paginação estável de transações;
- filtros de período (limites inclusivos, períodos abertos e vazios);
- busca e filtros de transações: texto literal sem distinção de maiúsculas, conta, categoria e tipo, combinados entre si e com a paginação;
- débitos, créditos e transferências separados corretamente;
- comparação com o período anterior equivalente: meses inteiros contra meses inteiros, demais intervalos contra o mesmo número de dias, variação absoluta exata e percentual nulo quando a base é zero;
- dinheiro: centavos exatos, valores grandes e rejeição de float, NaN, infinito e frações de centavo;
- constraints, chaves estrangeiras e unicidade;
- migrations reversíveis (downgrade e upgrade) e seed idempotente;
- contrato OpenAPI;
- visão de contas: agrupamento por instituição, estado derivado da última sincronização do Item e nenhum identificador do provedor na resposta;
- erros e logs sem vazamento de dados financeiros;
- sincronização com a Pluggy contra um servidor falso (sem rede): connect token, um Item com várias contas, paginação, deduplicação, refresh dos Items conhecidos, renovação da API key após 401, retry limitado em 429/5xx e mensagens de erro sem segredos.

Os testes do web rodam com a API mockada (MSW), sem backend. Cobrem:

- formatação de dinheiro em BRL a partir da string decimal, inclusive valores que um float não representa;
- datas locais `YYYY-MM-DD`, sem deslocamento de dia;
- filtro de período: presets, virada de ano, fevereiro bissexto, intervalo invertido e leitura da URL;
- estados de carregamento, vazio e erro com retry em Dashboard, Transações, Detalhe e Conexões;
- troca de período: uma resposta atrasada do período anterior nunca aparece na tela;
- paginação sem duplicar linhas e fluxo de conexão com o widget do Pluggy mockado;
- alternância de tema claro/escuro, com a escolha salva e a preferência do sistema como padrão.

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

## Cliente web

Checagens automatizadas, em `web/`:

```sh
npm ci
npm run lint
npm run typecheck
npm run test
npm run build
```

Roteiro manual, com a API no ar e o seed aplicado (`npm run dev` e `http://localhost:5173`):

1. **Resumo:** selecione **Personalizado** de 01/09/2026 a 30/09/2026. Devem aparecer gastos de **R$ 3.649,94**, receitas de **R$ 8.150,00**, 21 transações e o gráfico por categoria com a lista de valores exatos abaixo.
2. **Período:** passe por **Mês atual**, **Mês anterior** e **Últimos 3 meses** e confira as datas exibidas e a URL (`?period=…`). Um intervalo personalizado invertido deve bloquear o botão **Aplicar**.
3. **Transações:** com 01/04/2026 a 30/09/2026, a lista mostra "126 transações" e **Carregar mais** leva a 50, 100 e 126 linhas, sem repetição. Abra uma transação, copie a URL e abra-a em outra aba: o detalhe carrega direto.
4. **Vazio:** escolha um período sem dados (por exemplo, janeiro de 2020) em Resumo e em Transações.
5. **Erro:** pare o backend e recarregue: cada tela mostra o erro com **Tentar novamente**. Suba o backend e use o botão.
6. **Troca rápida:** alterne os períodos em sequência rápida (se quiser, com a rede limitada no DevTools). Os números exibidos devem ser sempre os do período selecionado.
7. **Tema:** clique no sol para ir ao tema escuro (o ícone vira lua) e na lua para voltar ao claro. Recarregue a página: o tema escolhido continua, sem piscar no tema errado.
8. **Celular:** em 390 px de largura (DevTools ou iPhone na LAN, com `npm run dev -- --host`), não pode haver rolagem horizontal e a barra de abas fica acima da área segura. No Safari do iPhone, **Adicionar à Tela de Início** deve instalar o app com ícone e nome.

## MeuPluggy (Pluggy)

Requer `PLUGGY_CLIENT_ID` e `PLUGGY_CLIENT_SECRET` no `.env` do backend e uma conta MeuPluggy com pelo menos uma instituição conectada.

1. No web, abra **Conexões** e clique em **Conectar com MeuPluggy**. O widget abre sem lista de bancos: depois do aviso de consentimento, vai direto para o login do MeuPluggy. Conclua o login.
2. Ao terminar, a importação começa sozinha, a tela mostra "MeuPluggy conectado e dados sincronizados" e o histórico mostra a execução com status e contagens (as mesmas de `GET /sync/runs`). Todas as contas em BRL do MeuPluggy devem aparecer nas transações.
3. Clique em **Sincronizar novamente**: a execução nova deve trazer 0 transações novas, sem duplicar nada.
4. Sem as credenciais da Pluggy, os dois botões devem informar que a integração não está configurada.
5. Feche o widget sem fazer login: a tela deve dizer que a conexão não foi concluída, sem tratar isso como erro.

## Limitações conhecidas

- `docker compose` não é exercitado no CI; o CI usa o PostgreSQL como serviço do GitHub Actions.
- Escopo de uso pessoal: um usuário, apenas BRL e API de leitura (sem autenticação, edição ou importação CSV).
- O fluxo real do Pluggy Connect não é automatizado: nos testes o widget é mockado, e a conexão com uma instituição só é conferida manualmente.
- O web ainda não tem service worker: não funciona offline.
- A paginação usa offset, o que é adequado ao volume atual. Se o banco mudar durante a navegação, recarregue a lista.
