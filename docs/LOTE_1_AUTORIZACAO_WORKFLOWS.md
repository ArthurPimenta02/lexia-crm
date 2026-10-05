# Lote 1 - Autorizacao, Workflows Privados e Callbacks

> Estado em 05/10/2026: implementado apenas na branch
> `codex/lote-1-autorizacao-workflows`. Nao aplicado ao banco, nao publicado e
> nao mesclado na `main`.

Este documento e o runbook do primeiro lote de seguranca. Ele descreve o
contrato implementado, os arquivos alterados, os testes, a ordem segura de
implantacao e a recuperacao. A aplicacao em producao depende de nova aprovacao
explicita.

## 1. Escopo fechado

O lote cobre somente:

- autorizacao centralizada para perfis e empresas;
- protecao de todas as operacoes privilegiadas feitas com `service_role` nas
  superficies alteradas;
- destino privado dos workflows de teste;
- cadastro e edicao de workflows exclusivos do administrador Lexia;
- dispatch server-side validando usuario, tenant, sessao, workflow e destino;
- envio com origem `painel_admin` reservado ao admin Lexia, inclusive quando
  um cliente conhece uma sessao administrativa do proprio tenant;
- bloqueio de acesso direto de `authenticated` a `webhook_url`;
- registro recuperavel quando um usuario Auth e criado e seu vinculo falha;
- endurecimento das policies do Analista e de `lexia_ajustes_agente` para
  empresas inativas;
- finalizacao transacional e idempotente dos callbacks do Analista;
- bloqueio atomico de novas ferramentas depois que uma execucao termina;
- unicidade de uma associacao em `lexia_usuarios_clientes` por `user_id`.

Ficam deliberadamente fora deste lote Redis, canais, ingestao de mensagens,
workflows externos do n8n, metricas, `site_feedback` e a regra interna do
agente consumida por `lexia_buscar_ajustes_agente`.

## 2. Regra de acesso

| Situacao | Cliente | Lexia admin |
| --- | --- | --- |
| Empresa ativa, leitura do proprio tenant | Permitido | Permitido |
| Empresa ativa, leitura de outro tenant | Negado | Permitido |
| Empresa inativa, painel do cliente/RLS direto | Negado | Nao se aplica |
| Empresa inativa, leitura administrativa historica | Negado | Permitido |
| Nova operacao, dispatch, retomada ou nova analise em empresa inativa | Negado | Negado |
| Pausar/cancelar/conter operacao ainda ativa de empresa inativa | Negado | Permitido |
| Resultado tardio de execucao registrada antes da inativacao | Somente callback autenticado | Pode finalizar, sem nova ferramenta nem nova consulta de fonte |
| Criar/editar destino de workflow | Negado | Permitido no servidor |

Regras adicionais:

- O cliente nunca escolhe empresa. O slug vem do unico perfil autenticado.
- O admin escolhe um slug, mas o servidor valida novamente cliente e operacao.
- Perfil inativo e sempre bloqueado.
- Para clientes, perfil e `lexia_clientes.status` precisam estar `ativo`.
- O admin ativo continua com leitura global, inclusive historico de empresa
  inativa, mas nao pode iniciar operacao nessa empresa.
- A pausa administrativa e uma acao de contencao e permanece disponivel para
  uma empresa inativa. Retomar o agente e uma nova operacao e fica bloqueado.
- O lote nao implementa uma nova operacao de cancelamento porque o produto nao
  possui hoje esse comando. Quando existir, cancelamento de algo ja iniciado
  deve seguir a regra de contencao; criar ou retomar deve exigir empresa ativa.

## 3. Autorizacao da aplicacao

`lib/auth/access-context.ts` e a fronteira central:

- `requireActiveProfile()`: usuario autenticado e perfil ativo;
- `requireLexiaAdmin()`: administrador Lexia ativo;
- `requireClientPanelAccess()`: papel cliente, tenant proprio e empresa ativa;
- `requireAdministrativeClientAccess()`: admin e cliente existente; permite
  leitura historica de empresa inativa por padrao;
- `requireActiveAdministrativeClientAccess()`: admin Lexia e empresa ativa;
  obrigatorio para dispatch com origem `painel_admin`;
- `requireOperationalClientAccess()`: operacao nova exige empresa ativa;
- `requireReadableClientAccess()`: leitura cliente ativa ou leitura global do
  admin;
- `requireContainmentClientAccess()`: admin pode conter empresa inativa.

Layouts, login, Server Actions e escopo do Analista usam essa camada. Modulos
com `service_role` sao `server-only` e validam a autorizacao antes de consultar
ou alterar recursos privilegiados.

## 4. Workflows privados

`lib/workflows/private-config.ts` e o unico caminho da aplicacao para ler o
destino, criar, editar e disparar workflows.

### Cadastro e edicao

- Exigem `requireLexiaAdmin()` no servidor.
- Validam novamente o `cliente_slug`.
- Aceitam apenas `ativo`, `inativo` ou `teste`.
- Validam URL HTTPS e host exato presente em
  `LEXIA_WORKFLOW_ALLOWED_HOSTS`.
- Credenciais embutidas na URL sao rejeitadas.
- Portas personalizadas sao rejeitadas fora do desenvolvimento local.
- Em ambiente nao produtivo, somente `localhost` e `127.0.0.1` podem usar
  HTTP.
- Na edicao, URL vazia preserva o destino existente.
- DTOs enviados para UI nunca contem `webhook_url`; o admin recebe apenas
  `webhookConfigured`.

### Dispatch operacional

- Cliente usa somente seu tenant e apenas a origem `painel_cliente`.
- A origem `painel_admin` exige admin Lexia e empresa ativa na Server Action e
  novamente no DAL privado. Conhecer `session_id` e `workflow_id` nao concede
  acesso.
- A autorizacao ocorre antes de consultar sessao, workflow ou chamar webhook.
- Admin precisa informar o tenant e o servidor o valida novamente.
- A empresa precisa estar ativa.
- A sessao precisa existir com o mesmo `cliente_slug`, `session_id` e `origem`.
- O workflow precisa existir, pertencer ao mesmo tenant e estar ativo.
- O servidor carrega e valida o destino privado.
- `run_id` e payload sao gerados no servidor.
- Redirect HTTP e recusado e o timeout e de 12 segundos.
- O acesso cliente permite apenas esse dispatch validado; nunca cria, edita ou
  le destinos.

Variavel nova, somente de servidor:

```text
LEXIA_WORKFLOW_ALLOWED_HOSTS=host-n8n-exato.example.com,outro-host.example.com
```

Nao usar esquema, caminho, wildcard ou URL completa. A lista contem apenas
nomes exatos de host separados por virgula.

## 5. Empresa inativa no banco

A migration atualiza `lexia_user_can_access_cliente(text)` para exigir:

- perfil ativo;
- papel cliente valido;
- vinculo com o mesmo slug;
- linha correspondente em `lexia_clientes` com status `ativo`.

O administrador Lexia ativo continua global por `lexia_is_admin()`.

As policies proprias das quatro tabelas do Analista e de
`lexia_ajustes_agente` tambem sao recriadas. As condicoes anteriores de dono,
sessao e tenant sao preservadas; a empresa ativa e uma condicao adicional no
caminho do cliente. A insercao direta em `lexia_ai_mensagens` por
`authenticated` aceita apenas `papel = 'usuario'`; respostas continuam sendo
gravadas pelo backend privilegiado.

## 6. Callbacks e ferramentas do Analista

Um callback so pode referir uma execucao `chat` existente que tenha:

- ID registrado;
- `sessao_id`, `cliente_slug` e `criado_por` coerentes com uma sessao real;
- periodo persistido valido e limitado a 366 dias;
- assinatura Bearer valida do n8n.

`lexia_finalizar_execucao_analista(...)` bloqueia a linha com `FOR UPDATE` e
faz mensagem, execucao e timestamp da sessao numa unica transacao:

- primeira conclusao valida retorna `finalizada`;
- retry identico retorna `repetida`;
- tentativa de mudar um resultado final retorna `conflito`;
- execucao inexistente ou contrato inconsistente nao e finalizado;
- um callback tardio pode concluir uma execucao ja registrada mesmo se perfil
  ou empresa foram desativados durante o processamento;
- nesse caso nao ha nova resolucao de fontes, consulta analitica ou ferramenta;
- callbacks recebidos depois do estado final tambem nao resolvem fontes de
  novo e nao alteram o resultado.
- as ferramentas ja reivindicadas na linha bloqueada sao unidas, sem
  duplicatas, as ferramentas validas do callback; a execucao e a metadata da
  mensagem recebem exatamente a mesma lista;
- se um claim concorrer com a finalizacao, ou ele vence antes do lock e fica na
  auditoria, ou perde depois da mudanca de status e retorna `false`.

`lexia_reivindicar_ferramenta_analista(...)` faz o claim atomico somente se a
execucao ainda estiver `iniciada`. Uma chamada que chega depois da finalizacao
recebe conflito e nao inicia a ferramenta.

As duas funcoes sao executaveis somente por `service_role`.

## 7. Vinculo recuperavel de usuario

O fluxo de cadastro ainda cria o usuario Auth antes do vinculo, mas nao apaga,
nao reassocia e nao escolhe um perfil arbitrariamente quando o vinculo falha.
Ele grava uma linha pendente em `lexia_user_link_pendencias` para revisao.

O retry administrativo:

- conclui idempotentemente se o vinculo desejado ja existe;
- cria o vinculo se nao existe nenhum;
- preserva a pendencia se existe qualquer vinculo diferente;
- nunca move o usuario para outra empresa;
- nunca chama `deleteUser` no fluxo de producao.

A exclusao de usuarios presente no teste isolado e limitada aos usuarios
sinteticos criados pelo proprio teste em um projeto descartavel.

## 8. Arquivos afetados

### Aplicacao

- `lib/auth/access-context.ts`
- `lib/auth/profile.ts`
- `lib/auth/user-link-contracts.ts`
- `lib/auth/user-link-pending.ts`
- `lib/supabase/admin.ts`
- `lib/workflows/contracts.ts`
- `lib/workflows/admin-test-message.ts`
- `lib/workflows/dispatch-service.ts`
- `lib/workflows/private-config.ts`
- `lib/workflows/settings-refresh.ts`
- `lib/analyst/callback-handler.ts`
- `lib/analyst/scope.ts`
- `lib/analyst/n8n.ts`
- `lib/analyst/webhook-auth.ts`
- layouts, login, Server Actions e rotas do Analista sob `app/`
- paginas/formularios de testes e configuracao de cliente

### Banco e operacao

- `supabase/checks/202610030001_lote1_preflight.sql`
- `supabase/operations/202610030001_create_profile_unique_index.sql`
- `supabase/operations/202610030001_drop_invalid_profile_unique_index.sql`
- `supabase/migrations/202610030002_lote1_authorization_and_private_workflows.sql`
- `supabase/migrations/202610030003_lote1_restrict_workflow_destinations.sql`
- `supabase/checks/202610030002_lote1_verify.sql`
- `scripts/apply-profile-unique-index.mjs`
- `scripts/lib/target-identity.mjs`
- `scripts/lib/runtime-app-proxy.mjs`
- `scripts/lib/runtime-harness-contracts.mjs`
- `scripts/lib/runtime-response-audit.mjs`
- `scripts/apply-lote1-runtime-harness.mjs`
- `scripts/test-lote1-runtime-next.mjs`
- `scripts/test-lote1-isolated.mjs`
- `supabase/isolated/000000000000_lote1_test_baseline.sql`
- `supabase/isolated/after_202610030002_lote1_test_client_policy.sql`
- `supabase/isolated/202610040001_lote1_runtime_next_schema.sql`
- `supabase/isolated/202610040002_lote1_runtime_next_verify.sql`
- `supabase/isolated/README.md`

### Testes e documentacao

- `tests/workflow-contracts.test.ts`
- `tests/lote1-security-contract.test.ts`
- `tests/admin-workflow-dispatch.test.ts`
- `tests/analyst-callback-behavior.test.ts`
- `tests/target-identity.test.ts`
- `tests/psql-output.test.ts`
- `tests/runtime-harness-security.test.ts`
- `tests/settings-refresh.test.ts`
- `.github/workflows/ci.yml`
- `package.json` e `package-lock.json`
- `Agent.MD`, `PLAN.MD` e este documento

## 9. Migrations e ordem obrigatoria

Nao usar `supabase db push` de forma cega neste lote. O indice concorrente nao
pode rodar dentro de uma transacao, e a migration `003` e um corte de
permissoes que so pode ocorrer depois de a versao compativel do servidor estar
ativa no ambiente alvo.

### Fase 0 - bloqueios de producao

Antes de qualquer producao:

1. Criar backup do banco central.
2. Restaurar esse backup em outro ambiente.
3. Executar consultas minimas e confirmar que a restauracao funciona.
4. Obter nova aprovacao explicita para producao.

Um backup existente sem restauracao verificada nao satisfaz este bloqueio.

Para o ensaio descartavel existe ainda um gate anterior a qualquer SQL,
inclusive ao baseline: criar um projeto novo, informar somente seu
`project_ref` para revisao e confirmar que URL, ref esperado e listas de refs
protegidos apontam para esse mesmo projeto. Chaves, senhas e URLs de conexao
nao devem ser enviadas por chat. Sem essa confirmacao, o ensaio para aqui.

### Fase 1 - preflight somente leitura

Executar `supabase/checks/202610030001_lote1_preflight.sql` no ambiente alvo.
Os dois primeiros resultados precisam retornar zero linhas. Registrar estado
do indice e das constraints.

Se houver duplicidade ou conflito, parar. Nao excluir, mesclar, reassociar nem
escolher perfil automaticamente.

### Fase 2 - indice concorrente fora de transacao

Suspender operacionalmente novos cadastros e retries de vinculo durante esta
etapa. O indice e concorrente e nao bloqueia as escritas normais; uma nova
duplicidade criada entre as varreduras pode invalidar a operacao.

Em staging e producao, manter a conexao direta adequada ao Postgres e `psql`:

```bash
LEXIA_DB_OPERATION_URL='postgresql://...' \
LEXIA_DB_OPERATION_ENVIRONMENT='staging' \
LEXIA_DB_OPERATION_EXPECTED_PROJECT_REF='refstaging1234567890' \
LEXIA_PRODUCTION_SUPABASE_PROJECT_REF='refproducao123456789' \
LEXIA_DB_OPERATION_CONFIRM='CREATE_PROFILE_UNIQUE_INDEX:staging:refstaging1234567890' \
npm run db:lote1:index
```

O script:

- recusa executar sem `project_ref` esperado e sem confirmacao vinculada ao
  ambiente e a esse ref;
- protege o ref de producao independentemente do ambiente apontado pela
  aplicacao; refs extras podem ser protegidos em
  `LEXIA_PROTECTED_SUPABASE_PROJECT_REFS`;
- confere se o ref codificado na URL Postgres e o banco/servidor realmente
  conectado correspondem ao destino declarado, antes de qualquer escrita;
- exige uma segunda aprovacao vinculada ao ref para um destino de producao;
- passa a URL ao `psql` por `PGDATABASE`, sem expo-la na linha de comando;
- para se houver mais de um vinculo por `user_id`;
- detecta constraint ja anexada;
- aceita indice existente somente se for unico, valido, pronto e tiver a
  definicao esperada;
- executa `CREATE UNIQUE INDEX CONCURRENTLY` numa invocacao autonoma de
  `psql`, portanto fora de transacao;
- verifica o indice ao final;
- nunca remove automaticamente um indice invalido.

No projeto exclusivamente descartavel, a conexao direta IPv6 pode ser
substituida pelo **Session pooler** exibido no painel do proprio projeto. Essa
excecao e aceita apenas com
`LEXIA_DB_OPERATION_ENVIRONMENT=isolated_test`, host oficial exato gravado em
`LEXIA_DB_OPERATION_EXPECTED_HOST`, usuario `postgres.<project_ref>` e porta
`5432`. O Transaction pooler da porta `6543` e recusado. TLS usa
`verify-full` com a CA publica baixada de **Database settings > SSL
configuration > Download certificate**. O caminho fica em
`LEXIA_DB_OPERATION_SSL_ROOT_CERT`, e o script confere subject e fingerprint
da `Supabase Root 2021 CA`. O indice so prossegue depois de conferir no banco o
marcador `lexia_environment_identity` do mesmo projeto descartavel. Essas
validacoes nao sao removidas para contornar indisponibilidade de IPv6.

Antes de qualquer SQL, a conectividade e autenticacao podem ser verificadas
separadamente:

```bash
npm run db:lote1:connectivity
```

Esse comando usa `psql` somente para abrir a conexao e encerrar com `\q`; nao
envia statements SQL. No macOS, ele encontra automaticamente o cliente da
formula Homebrew `libpq`, sem instalar ou iniciar servidor PostgreSQL.

Para um alvo de producao, alem de trocar ambiente/ref/confirmacao, e obrigatorio
definir exatamente
`LEXIA_DB_OPERATION_PRODUCTION_APPROVAL=I_APPROVE_PRODUCTION_PROFILE_INDEX:<ref-de-producao>`.
Essa possibilidade nao autoriza a execucao deste lote: backup restaurado e nova
aprovacao humana continuam bloqueios separados.

Se uma execucao parcial deixar o indice invalido:

1. Consultar `pg_index` pelo preflight e confirmar `indisvalid = false` ou
   `indisready = false`.
2. Confirmar que o indice nao esta anexado a uma constraint.
3. Executar manualmente, fora de transacao,
   `supabase/operations/202610030001_drop_invalid_profile_unique_index.sql`.
4. Repetir o preflight.
5. Reexecutar `npm run db:lote1:index`.

Referencia operacional: a documentacao oficial do PostgreSQL explica que
`CREATE INDEX CONCURRENTLY` nao pode rodar em bloco transacional e que uma
falha pode deixar um indice invalido que precisa ser removido ou reconstruido:
<https://www.postgresql.org/docs/current/sql-createindex.html>.

### Fase 3 - expansao transacional

Aplicar `202610030002_lote1_authorization_and_private_workflows.sql` em
staging. Ela anexa o indice como constraint, valida role/slug, cria pendencias,
helpers, policies e RPCs atomicas. A migration falha e faz rollback integral se
o indice valido nao existir.

### Fase 4 - versao compativel da aplicacao

Configurar `LEXIA_WORKFLOW_ALLOWED_HOSTS`, publicar esta branch apenas em
preview/staging e executar somente os testes de compatibilidade da aplicacao:
`npm test`, lint, typecheck e build. Os testes comportamentais locais devem
confirmar autorizacao antes de efeitos e que URL vazia preserva o destino.

O baseline minimo continua separado do schema adicional do runtime Next. O
schema adicional e instalado e verificado somente por comandos explicitos do
harness, depois do corte, e nao transforma o baseline minimo em copia de
producao. Tambem nao usar o resultado da suite de banco como condicao
pre-corte: ela verifica a ausencia de acesso direto a `webhook_url`, garantia
que so passa a existir depois da migration `003`.

### Fase 5 - corte de privilegios

Somente depois da Fase 4, aplicar
`202610030003_lote1_restrict_workflow_destinations.sql`. Ela revoga todos os
privilegios de tabela de `PUBLIC`, `anon` e `authenticated` em
`lexia_workflows` e devolve a `authenticated` apenas `SELECT` por coluna, sem
`webhook_url`. Isso afeta inclusive o JWT do admin; por isso toda configuracao
privada e escrita ja precisa estar no DAL server-side. A mesma migration
habilita RLS explicitamente e recria as policies conhecidas
`workflows_admin_all` e `workflows_select`, preservando administracao global e
isolamento por tenant pelo helper endurecido.

### Fase 6 - verificacao

Depois do corte, executar `supabase/checks/202610030002_lote1_verify.sql`, a
suite minima de contratos de banco no Supabase descartavel ja cortado e os
checks locais. Nao antecipar a migration `003` apenas para fazer a suite
passar.

O trilho de runtime Next usa schema adicional descartavel, usuarios sinteticos,
receptor HTTPS falso em loopback e certificado confiado apenas pelos processos
do teste. Ele nao usa preview, Redis, workflows ou destinos reais. Em
05/10/2026, o diagnostico confirmou que `revalidatePath` dentro da Server
Action podia deixar o `useActionState` preso e que sua remocao pura deixava o
detalhe no Router Cache ao voltar pelo historico. A correcao aplicada separa
os ciclos: cada sucesso recebe um `refreshToken` novo e o formulario chama
`router.refresh()` uma unica vez para esse token; erros preservam o token e nao
atualizam a rota. O ensaio confirmou zero refresh no erro, um refresh e um POST
por sucesso, duas edicoes consecutivas, mensagem e botao preservados e dados
atuais ao voltar/avancar. Em seguida, os 13 cenarios completos de runtime
passaram, inclusive dispatch admin/cliente, callbacks e auditoria de exposicao.

## 10. Testes de regressao

Comandos locais:

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

Suite minima de banco, exclusivamente em projeto descartavel ja migrado:

```bash
npm run test:lote1:db:isolated
```

Harness adicional do runtime, somente depois de instalar e verificar seu
schema descartavel:

```bash
npm run db:lote1:runtime:verify
npm run test:lote1:runtime:isolated
```

`LEXIA_RUNTIME_USE_APP_PROXY=1` e exclusivo do diagnostico contratual: um
proxy HTTP em loopback copia os chunks da resposta `next-action` sem usar
`Network.getResponseBody`. O criterio de ciclo visual roda por padrao sem esse
proxy e nunca usa `networkidle`. O proxy nao substitui a exigencia de mensagem
visivel, botao novamente habilitado e persistencia no banco.

As variaveis reais ficam apenas em `.env.lote1.test.local`, ignorado pelo Git.
O arquivo deve conter as variaveis `LEXIA_TEST_*`, os refs de producao e
protegidos e as variaveis `LEXIA_DB_OPERATION_*` documentadas em
`supabase/isolated/README.md`. Nao colar seus valores em chat, issue, commit ou
captura de tela. Os dois scripts carregam esse arquivo por padrao; outro
caminho pode ser indicado em `LEXIA_LOTE1_ENV_FILE`.

Para Session pooler, a URL local deve ser copiada literalmente de **Connect >
Direct > Session pooler** e ter sua senha preenchida apenas no arquivo local.
`LEXIA_DB_OPERATION_EXPECTED_HOST` repete o host nao secreto exibido no painel.
`LEXIA_DB_OPERATION_SSL_ROOT_CERT` aponta para a CA publica oficial salva fora
do repositorio; o arquivo nao contem chave privada.

O script protege explicitamente o ref de producao, independentemente da URL
da aplicacao. Antes de qualquer escrita de dados sinteticos, ele exige que
URL, refs, eventuais refs protegidos e chaves JWT identificaveis sejam
coerentes e le a linha de identidade remota `lexia_environment_identity`, que
precisa declarar o mesmo ref, `environment = 'isolated_test'` e
`disposable = true`. Ele tambem consulta, por uma RPC exclusiva do harness e
restrita a `service_role`, a definicao da policy remota de `lexia_clientes` e
recusa continuar se ela nao delegar a
`lexia_user_can_access_cliente(text)`.

### Reconstrucao do schema isolado

O banco atual ainda nao possui baseline completo de producao. Para a suite de
banco, reconstruir somente o harness descartavel documentado em
`supabase/isolated/README.md`, nesta ordem:

1. Criar um projeto Supabase novo e exclusivamente descartavel.
2. Informar somente o `project_ref` e obter confirmacao explicita do destino.
   Nenhum SQL pode ser executado antes dessa confirmacao.
3. Validar configuracao, conectividade e autenticacao sem SQL com
   `npm run db:lote1:connectivity`, apresentar o resultado e obter autorizacao
   separada para iniciar o banco.
4. Aplicar `supabase/isolated/000000000000_lote1_test_baseline.sql`.
5. Inserir manualmente a unica linha de `lexia_environment_identity` com o ref
   real do projeto, `isolated_test` e `disposable = true`.
6. Aplicar `202609220001_lexia_ai_analyst.sql`.
7. Criar o indice concorrente com o script e confirmacao vinculados ao ref
   descartavel.
8. Aplicar a migration `002`.
9. Aplicar o SQL exclusivo do harness
   `supabase/isolated/after_202610030002_lote1_test_client_policy.sql`. Ele
   recria a
   policy de leitura de `lexia_clientes` usando diretamente
   `lexia_user_can_access_cliente(slug)`.
10. Rodar os testes locais de compatibilidade.
11. Aplicar a migration `003`, o SQL de verificacao e somente entao
    `npm run test:lote1:db:isolated`.

Esse baseline e propositalmente minimo e nao pode ser usado para staging ou
producao. Os workflows sinteticos usam apenas destinos `*.invalid`; nenhum
webhook externo real e chamado. A suite remove somente os slugs e usuarios que
ela mesma cria. Falha funcional e falha de limpeza sao relatadas separadamente;
qualquer falha de limpeza deixa exit code diferente de zero e exige revisao do
projeto descartavel.

Cobertura prevista da suite minima de banco:

- o helper permite o proprio tenant ativo, nega outro tenant e nega empresa
  inativa para cliente;
- a policy de `lexia_clientes` delega ao helper e acompanha a inativacao,
  enquanto o admin preserva leitura historica;
- cliente e admin autenticados nao leem `webhook_url` diretamente;
- mensagem de assistente nao pode ser forjada por `authenticated`;
- callback finaliza uma vez, repete idempotentemente e rejeita conflito;
- claim persistido entre a leitura do callback e o lock final permanece na
  execucao e na metadata; a corrida real tambem valida os dois ordenamentos;
- resultado tardio finaliza execucao registrada apos inativacao;
- execucao final nao aceita claim de ferramenta;
- segundo perfil para o mesmo `user_id` falha com unicidade;
- conflito de vinculo pode ser registrado como pendencia;
- `site_feedback` nao e alterada pelo teste.

Cobertura dos testes comportamentais locais, sem banco remoto:

- cliente com IDs validos de sessao e workflow administrativo e negado antes
  de qualquer consulta privilegiada ou chamada de webhook;
- callback HTTP sem Bearer valido nao resolve execucao, fonte ou finalizacao;
- repeticao, conflito e ausencia de efeitos sao exercitados com dependencias
  controladas;
- destinos usados nos testes sao falsos e nenhuma chamada externa e feita.

Ficam fora da suite minima de banco e nao podem ser aprovados pelo trilho A
isoladamente:

- cadastro de cliente por Server Action contra banco remoto;
- criacao de sessao administrativa real;
- dispatch HTTP bem-sucedido por admin ou cliente;
- callback HTTP passando pelo runtime Next em preview;
- navegacao autenticada e RLS de todas as tabelas do produto.

O trilho B de runtime local cobriu os quatro primeiros pontos com Next em modo
de producao, Supabase descartavel e receptor HTTPS falso. Ele nao substitui um
preview de staging nem valida navegacao/RLS de todas as tabelas do produto.

O projeto isolado `ghwinxmpwqkvqpfkmyve` foi criado e confirmado em
04/10/2026. O Session pooler exato do painel e a CA publica oficial foram
validados sem SQL: rede IPv4, TLS `verify-full` e autenticacao chegaram ao
destino correto. Com autorizacao explicita, o baseline minimo, o marcador, a
migration original do Analista, o indice concorrente, as migrations `002` e
`003`, a policy exclusiva do harness e a verificacao pos-corte foram aplicados
somente nesse projeto. A suite minima passou e removeu todos os usuarios e
registros sinteticos. Producao nao foi usada como substituta.

Resultados locais atualizados em 05/10/2026:

- `npm test`: 45/45 testes aprovados;
- `npm run lint`: aprovado em aproximadamente 5 segundos numa copia limpa em
  `/Users/arthurpimenta/Developer/lexia-crm`; a origem tinha dependencias
  `dataless` e permanecia aguardando I/O;
- `npm run typecheck`: aprovado sem erros;
- `npm run build`: aprovado; compilou e gerou as 29 rotas com Next.js 16.2.9;
- `npm run db:lote1:connectivity`: alvo/ref/host/porta/CA, TLS e autenticacao
  aprovados para `ghwinxmpwqkvqpfkmyve`, com zero statements SQL;
- `npm run test:lote1:db:isolated`: aprovado contra
  `ghwinxmpwqkvqpfkmyve`, incluindo isolamento, empresa inativa, grants,
  callbacks idempotentes, concorrencia, unicidade e pendencia recuperavel;
- `npm run test:lote1:isolated`: alias compativel da suite minima de banco;
- `npm run db:lote1:runtime:verify`: identidade, inventario, schema adicional,
  zero usuarios Auth e zero linhas de produto confirmados;
- diagnostico da edicao corrigida: erro fez um POST e zero refresh; cada uma
  das duas edicoes validas fez um POST e um refresh RSC, mostrou sucesso,
  liberou o botao, atualizou os dois nomes e preservou a URL vazia;
- navegacao sem reload manual: Dashboard, voltar, avancar e voltar novamente
  mostraram os dados novos do cliente e do workflow;
- `npm run test:lote1:runtime:isolated`: 13 cenarios aprovados, incluindo
  cadastro, troca privada de destino, dispatch admin/cliente, negacao ao
  cliente na rota admin, callback invalido/valido/repetido/conflitante,
  bloqueio de ferramenta final e auditoria das respostas do navegador;
- limpeza independente pos-suite: zero usuarios/identidades Auth, clientes,
  perfis, workflows, mensagens, execucoes, sessoes, insights e pendencias
  sinteticas; marcador do ambiente e estado pos-`003` preservados;
- limpeza independente apos o runtime completo: zero usuarios Auth e zero
  linhas de produto; apenas schema e marcadores descartaveis preservados;
- cliente `psql` 18.6 instalado via formula Homebrew `libpq`, sem servidor ou
  servico PostgreSQL local;
- migrations/checks: baseline minimo, migration do Analista, indice
  concorrente, `002`, policy do harness, `003` e verificacao pos-corte
  executados somente no projeto descartavel; producao nao foi alterada.

## 11. Recuperacao sem reabrir acesso inseguro

- Falha no indice concorrente: usar apenas a operacao explicita de remocao do
  indice invalido, depois de confirmar que nao esta anexado; corrigir e repetir.
- Falha na migration `002`: a transacao faz rollback. O indice concorrente
  valido pode permanecer e ser reutilizado.
- Falha da aplicacao depois da `002`, antes da `003`: corrigir ou reverter a
  aplicacao; nao e necessario afrouxar grants porque o corte ainda nao ocorreu.
- Falha depois da `003`: fazer forward-fix ou voltar para uma revisao da
  aplicacao que use o DAL server-side compativel. Nao restaurar `SELECT *`,
  escrita de `authenticated` ou leitura de `webhook_url`.
- Nao existe rollback automatico que remova pendencias, apague usuarios Auth
  ou descarte historico do Analista.
- Uma reversao estrutural das constraints/RPCs exige migration nova, backup
  verificado e aprovacao; nao executar SQL destrutivo improvisado.

## 12. Pendencias explicitas

Impedem producao deste lote:

- backup do Supabase central com restauracao verificada;
- configurar e validar `LEXIA_WORKFLOW_ALLOWED_HOSTS` por ambiente;
- executar preflight e indice concorrente em staging;
- nova aprovacao do responsavel depois dos resultados de staging.

Nao impedem preparar/revisar o lote, mas permanecem abertas:

- identificar o consumidor externo de `lexia_buscar_ajustes_agente` antes de
  alterar `search_path`, grants ou comportamento dessa funcao `SECURITY
  INVOKER`;
- identificar o consumidor de `site_feedback` antes de restringir seus grants
  ou policies; submissao publica existente deve continuar funcionando;
- exportar baseline completo do schema/RLS central;
- Redis, canais e workflows externos, todos fora deste lote.
