# Ambiente isolado do Lote 1

Este diretório reconstrói somente o contrato mínimo de banco necessário para
testar migrations, helpers, RLS, grants, RPCs e unicidade do Lote 1. Ele não é
um baseline de produção e nunca deve ser aplicado em staging ou produção.

## Dois trilhos de homologação

### A. Contratos mínimos de banco

Este é o único trilho suportado pelo baseline deste diretório. Ele valida:

- isolamento de tenant e empresa inativa;
- a ligação real da policy de `lexia_clientes` com
  `lexia_user_can_access_cliente(text)`;
- policies das tabelas do Analista;
- grants privados de `lexia_workflows`;
- finalização e concorrência dos callbacks;
- unicidade de perfil e registro de vínculo pendente.

O comando desse trilho é:

```bash
npm run test:lote1:db:isolated
```

### B. Runtime Next descartável

Este trilho continua separado do harness mínimo. O schema adicional
`202610040001_lote1_runtime_next_schema.sql` fornece somente os contratos
necessários para o ensaio selecionado de cadastro, edição, dispatch e callback,
com dados sintéticos. Ele inclui, no mínimo:

- todos os campos de `lexia_clientes` usados pela aplicação, incluindo
  `cor_principal`;
- `lexia_testes_sessoes` e suas policies;
- `lexia_testes_execucoes` e suas policies;
- `lexia_mensagens`, `lexia_contactos` e `lexia_feedbacks`;
- contratos de Auth/RLS consumidos pelas Server Actions;
- uma cópia temporária local da aplicação apontada exclusivamente para esse
  banco;
- um receptor HTTPS falso em loopback, incluído temporariamente em
  `LEXIA_WORKFLOW_ALLOWED_HOSTS`, para comprovar o dispatch sem atingir n8n ou
  qualquer cliente real.

Comandos deste trilho:

```bash
npm run db:lote1:runtime:verify
npm run test:lote1:runtime:isolated
```

O runner não usa `networkidle`. Ele correlaciona a resposta à requisição com
`next-action`, exige mensagem visível e botão pronto e confere a persistência
no banco. Para edicoes, ele tambem conta os POSTs de Server Action e os GETs
RSC do `router.refresh()`, testa erro sem refresh, duas atualizacoes seguidas e
navegacao voltar/avancar sem reload manual. `LEXIA_RUNTIME_USE_APP_PROXY=1`
habilita somente a captura contratual dos chunks por um proxy HTTP em loopback;
não é o modo usado para aprovar o ciclo visual.

Em 05/10/2026, o trilho B passou 13 cenarios no projeto descartavel. A
correcao removeu `revalidatePath` da edicao e usa um token novo por sucesso para
acionar exatamente um `router.refresh()` no cliente; erros nao acionam refresh.
Foram aprovados cadastro, duas edicoes com URL vazia preservada, troca de
destino privado, dispatch admin/cliente, negacao da superficie admin ao
cliente, callbacks e auditoria de exposicao. A limpeza final deixou zero
usuarios Auth e zero linhas de produto. Isso nao transforma o harness em
staging nem autoriza producao.

## Configuração local sem versionar segredos

Use o arquivo ignorado pelo Git na raiz do repositório:

```text
.env.lote1.test.local
```

Preencha localmente, sem enviar valores por chat e sem capturas de tela, estas
variáveis:

```text
LEXIA_TEST_SUPABASE_URL
LEXIA_TEST_SUPABASE_ANON_KEY
LEXIA_TEST_SUPABASE_SERVICE_ROLE_KEY
LEXIA_TEST_SUPABASE_PROJECT_REF
LEXIA_PRODUCTION_SUPABASE_PROJECT_REF
LEXIA_PROTECTED_SUPABASE_PROJECT_REFS
LEXIA_TEST_CONFIRM_ISOLATED
LEXIA_DB_OPERATION_URL
LEXIA_DB_OPERATION_ENVIRONMENT
LEXIA_DB_OPERATION_EXPECTED_HOST
LEXIA_DB_OPERATION_EXPECTED_PROJECT_REF
LEXIA_DB_OPERATION_CONFIRM
LEXIA_DB_OPERATION_SSL_ROOT_CERT
```

`LEXIA_DB_OPERATION_URL` contém a senha do banco e deve permanecer somente
nesse arquivo local. Para o projeto descartável em uma rede IPv4, copie do
painel do Supabase a URI exibida em **Connect > Direct > Session pooler**. Ela
deve usar a porta `5432`, o usuário `postgres.<project_ref>` e o host exato
mostrado pelo painel. Grave esse host também em
`LEXIA_DB_OPERATION_EXPECTED_HOST`. Não use o Transaction pooler da porta
`6543`.

Baixe o certificado público pelo botão **Database settings > SSL
configuration > Download certificate**. O Dashboard oficial aponta esse botão
para `prod-ca-2021.crt`; salve-o fora do repositório e informe o caminho
absoluto em `LEXIA_DB_OPERATION_SSL_ROOT_CERT`. O script confere o subject e a
impressão digital SHA-256 esperados da `Supabase Root 2021 CA` antes de chamar
`psql`. Não use um certificado capturado apenas da conexão sem compará-lo com
a origem oficial.

Para esse ensaio, use:

```text
LEXIA_DB_OPERATION_ENVIRONMENT=isolated_test
LEXIA_DB_OPERATION_CONFIRM=CREATE_PROFILE_UNIQUE_INDEX:isolated_test:<project_ref>
```

Os scripts carregam esse arquivo por padrão. Para usar outro caminho, defina
`LEXIA_LOTE1_ENV_FILE` antes do comando. O cliente `psql` pode ser indicado em
`LEXIA_PSQL_BIN`; no macOS, o script também encontra automaticamente a fórmula
Homebrew `libpq` sem instalar ou iniciar um servidor PostgreSQL.

## Gate de conectividade sem SQL

Antes de qualquer baseline, migration ou teste de banco, execute:

```bash
npm run db:lote1:connectivity
```

Esse comando valida ambiente, confirmação, ref, host, usuário, porta, refs
protegidos, a CA oficial e TLS `verify-full`. Em seguida abre a conexão com
`psql`, autentica e encerra com o metacomando `\q`; nenhum statement SQL é
enviado. O comando recusa conexão direta, Transaction pooler, host não oficial,
ref divergente, CA inesperada e qualquer pooler apontado para ambiente
diferente de `isolated_test`.

## Gate obrigatório antes de qualquer SQL

1. Crie um projeto Supabase novo, vazio e exclusivo para este ensaio.
2. Copie apenas o `project_ref`, que não é uma chave nem uma senha.
3. Pare antes de abrir o SQL Editor ou executar `psql`.
4. Confirme o ref com o responsável pela revisão.
5. Compare o ref confirmado com a URL, com
   `LEXIA_TEST_SUPABASE_PROJECT_REF` e com
   `LEXIA_DB_OPERATION_EXPECTED_PROJECT_REF`.
6. Confirme que ele não consta em `LEXIA_PRODUCTION_SUPABASE_PROJECT_REF` nem
   em `LEXIA_PROTECTED_SUPABASE_PROJECT_REFS`.

Nenhum SQL, inclusive o baseline, deve ser executado antes desse gate. Não
usar produção como alternativa se a confirmação falhar.

## Ordem do trilho A

Somente depois da confirmação explícita do destino:

1. Confirme que o projeto pode ser apagado integralmente.
2. Aplique `000000000000_lote1_test_baseline.sql` usando o Session pooler já
   validado.
3. Grave a única identidade remota do projeto:

   ```sql
   insert into public.lexia_environment_identity (
     id,
     project_ref,
     environment,
     disposable
   ) values (
     true,
     '<PROJECT_REF_DESCARTAVEL_CONFIRMADO>',
     'isolated_test',
     true
   );
   ```

4. Aplique `supabase/migrations/202609220001_lexia_ai_analyst.sql`.
5. Crie o índice concorrente fora de transação com
   `npm run db:lote1:index`. O script valida o ref declarado, o host exato da
   URL, o banco e o marcador remoto descartável antes da escrita. A porta
   `6543` e destinos protegidos continuam recusados.
6. Aplique
   `supabase/migrations/202610030002_lote1_authorization_and_private_workflows.sql`.
7. Aplique `after_202610030002_lote1_test_client_policy.sql`. Esse arquivo é
   exclusivo do harness e instala a policy de `lexia_clientes` chamando o
   helper criado na etapa anterior.
8. Execute os testes locais de compatibilidade: `npm test`, `npm run lint`,
   `npm run typecheck` e `npm run build`.
9. Aplique
   `supabase/migrations/202610030003_lote1_restrict_workflow_destinations.sql`.
10. Execute `supabase/checks/202610030002_lote1_verify.sql`.
11. Execute `npm run test:lote1:db:isolated`.

O script do passo 11 confere URL, refs, chaves JWT identificáveis, a linha
remota de identidade e a definição instalada da policy de `lexia_clientes`
antes da primeira escrita de dados de teste. Ele cria somente usuários e slugs
sintéticos. Os workflows usam destinos `*.invalid` e nenhum webhook é chamado.

## Evidência e limpeza

Registre separadamente:

- checks locais executados;
- SQLs aplicados e respectivos resultados;
- testes de banco executados e aprovados;
- testes do runtime Next executados e os cenarios ainda fora do harness;
- resultado da limpeza dos dados sintéticos.

Falhas funcionais e falhas da limpeza são relatadas separadamente. Qualquer
falha de limpeza deixa o processo com código diferente de zero e lista apenas
o recurso e o código do erro, sem imprimir credenciais ou dados. O projeto
descartável deve permanecer isolado para inspeção até a limpeza ser resolvida.
