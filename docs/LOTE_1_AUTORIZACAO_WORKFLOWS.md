# Lote 1 - Autorizacao, Workflows Privados e Callbacks

> Estado em 04/10/2026: implementado apenas na branch
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
- `scripts/test-lote1-isolated.mjs`
- `supabase/isolated/000000000000_lote1_test_baseline.sql`
- `supabase/isolated/README.md`

### Testes e documentacao

- `tests/workflow-contracts.test.ts`
- `tests/lote1-security-contract.test.ts`
- `tests/admin-workflow-dispatch.test.ts`
- `tests/analyst-callback-behavior.test.ts`
- `tests/target-identity.test.ts`
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

Usar uma conexao direta adequada ao Postgres e `psql`:

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
`npm test`, lint, typecheck, build e smoke tests de cadastro/edicao admin e
dispatch admin/cliente. Confirmar tambem que URL vazia preserva o destino.

Nao executar nem usar o resultado da suite integrada completa como condicao
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
suite integrada completa no Supabase descartavel ja cortado e os smoke tests
manuais. So entao considerar uma aprovacao separada para producao. Nao
antecipar a migration `003` apenas para fazer a suite passar.

## 10. Testes de regressao

Comandos locais:

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

Suite de banco, exclusivamente em projeto descartavel ja migrado:

```bash
LEXIA_TEST_SUPABASE_URL='https://refdescartavel123456.supabase.co' \
LEXIA_TEST_SUPABASE_ANON_KEY='...' \
LEXIA_TEST_SUPABASE_SERVICE_ROLE_KEY='...' \
LEXIA_TEST_SUPABASE_PROJECT_REF='refdescartavel123456' \
LEXIA_PRODUCTION_SUPABASE_PROJECT_REF='refproducao123456789' \
LEXIA_PROTECTED_SUPABASE_PROJECT_REFS='refstaging1234567890' \
LEXIA_TEST_CONFIRM_ISOLATED='I_UNDERSTAND_THIS_IS_DISPOSABLE:refdescartavel123456' \
npm run test:lote1:isolated
```

O script protege explicitamente o ref de producao, independentemente de
`NEXT_PUBLIC_SUPABASE_URL`. Antes de qualquer escrita, ele exige que URL, refs,
eventuais refs protegidos e chaves JWT identificaveis sejam coerentes e le a
linha de identidade remota `lexia_environment_identity`, que precisa declarar
o mesmo ref, `environment = 'isolated_test'` e `disposable = true`. A URL da
aplicacao, quando presente, e apenas uma trava adicional.

### Reconstrucao do schema isolado

O banco atual ainda nao possui baseline completo de producao. Para esta suite,
reconstruir somente o harness descartavel documentado em
`supabase/isolated/README.md`, nesta ordem:

1. Criar um projeto Supabase novo e exclusivamente descartavel.
2. Aplicar `supabase/isolated/000000000000_lote1_test_baseline.sql`.
3. Inserir manualmente a unica linha de `lexia_environment_identity` com o ref
   real do projeto, `isolated_test` e `disposable = true`.
4. Aplicar `202609220001_lexia_ai_analyst.sql`.
5. Criar o indice concorrente com o script e confirmacao vinculados ao ref
   descartavel.
6. Aplicar a migration `002` e rodar os testes de compatibilidade.
7. Aplicar a migration `003`, o SQL de verificacao e somente entao a suite
   integrada completa.

Esse baseline e propositalmente minimo e nao pode ser usado para staging ou
producao. Os workflows sinteticos usam apenas destinos `*.invalid`; nenhum
webhook externo real e chamado. A suite remove somente os slugs e usuarios que
ela mesma cria. Falha funcional e falha de limpeza sao relatadas separadamente;
qualquer falha de limpeza deixa exit code diferente de zero e exige revisao do
projeto descartavel.

Cobertura prevista:

- cliente A nao enxerga cliente B;
- cliente inativo nao enxerga a propria empresa;
- cliente com IDs validos de sessao e workflow administrativo e negado antes
  de qualquer consulta privilegiada ou chamada de webhook;
- cliente e admin autenticados nao leem `webhook_url` diretamente;
- mensagem de assistente nao pode ser forjada por `authenticated`;
- callback HTTP sem Bearer valido nao resolve execucao, fonte ou finalizacao;
- callback finaliza uma vez, repete idempotentemente e rejeita conflito;
- claim persistido entre a leitura do callback e o lock final permanece na
  execucao e na metadata; a corrida real tambem valida os dois ordenamentos;
- resultado tardio finaliza execucao registrada apos inativacao;
- execucao final nao aceita claim de ferramenta;
- segundo perfil para o mesmo `user_id` falha com unicidade;
- conflito de vinculo pode ser registrado como pendencia;
- `site_feedback` nao e alterada pelo teste.

O ambiente isolado nao esta configurado neste computador em 04/10/2026. A
suite esta pronta, mas sua execucao integrada permanece bloqueada. Producao nao
deve ser usada como substituta.

Resultados locais em 04/10/2026:

- `npm test`: 28/28 testes aprovados;
- `npm run lint`: aprovado sem erros;
- `npm run typecheck`: aprovado sem erros;
- `npm run build`: aprovado; compilou e gerou as 29 rotas com Next.js 16.2.9;
- `npm run test:lote1:isolated`: recusou com exit code 2 por ausencia das
  identidades e credenciais exclusivas do ambiente descartavel, como esperado;
- migrations/checks: nao executados, pois nao existe conexao isolada nem
  `psql` instalado; producao nao foi usada como alternativa.

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
- ambiente Supabase isolado para executar a suite integrada;
- identidade remota descartavel preenchida e conferida nesse ambiente;
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
