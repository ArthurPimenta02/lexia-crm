# Ambiente isolado do Lote 2

Este diretório prepara somente o banco mínimo necessário para provar a
migration do plano de controle omnichannel. Ele não é um baseline de produção,
não contém dados da Miranda ou da Detail e não conecta n8n, Frappe, modelos ou
provedores. O runner integrado usa somente o Redis descartável dedicado.

O destino pretendido para o primeiro ensaio é o projeto descartável
`gaofupndxgitonfmvpzi`. Esse ref não autoriza escrita por si só: URL da API,
Session pooler, chaves, refs protegidos, certificado, confirmação e estado
remoto precisam concordar antes de qualquer aplicação.

## Arquivos

- `bootstrap_preflight.sql`: leitura estrita antes da primeira escrita; exige
  zero tabelas públicas, zero usuários Auth e zero objetos/buckets Storage.
- `000000000000_lote2_test_baseline.sql`: contratos legados mínimos, helpers
  de acesso endurecidos e marcador remoto descartável.
- `000000000001_lote2_test_fixtures.sql`: duas empresas, contas e configurações
  inteiramente sintéticas, com provider `fake` e `observe_only`.
- `000000000002_lote2_test_verify.sql`: verificação somente leitura logo após
  a instalação.
- `000000000003_lote2_test_cleanup.sql`: remove apenas recursos associados às
  duas empresas e ao `run_id` do manifesto; preserva o schema para inspeção.
- `000000000004_lote2_runtime_cleanup.sql`: remove somente conversas, eventos
  e recursos runtime registrados no manifesto, preservando as configurações.
- `manifest.json`: IDs, slugs e prefixos Redis permitidos no ensaio.

## Configuração privada

Use `.env.lote2.test.local` na raiz. O arquivo é ignorado pelo Git. Não envie
seus valores por chat, commit, issue ou captura de tela.

```text
LEXIA_LOTE2_ENVIRONMENT=isolated_test
LEXIA_LOTE2_SUPABASE_PROJECT_REF=gaofupndxgitonfmvpzi
LEXIA_LOTE2_SUPABASE_URL=https://gaofupndxgitonfmvpzi.supabase.co
LEXIA_LOTE2_SUPABASE_ANON_KEY=
LEXIA_LOTE2_SUPABASE_SERVICE_ROLE_KEY=
LEXIA_LOTE2_SUPABASE_CONFIRM=I_UNDERSTAND_THIS_IS_DISPOSABLE_LOTE2:gaofupndxgitonfmvpzi

LEXIA_LOTE2_DB_URL=
LEXIA_LOTE2_DB_EXPECTED_HOST=aws-0-us-east-2.pooler.supabase.com
LEXIA_LOTE2_DB_SSL_ROOT_CERT=
LEXIA_PRODUCTION_SUPABASE_PROJECT_REF=
LEXIA_PROTECTED_SUPABASE_PROJECT_REFS=

LEXIA_LOTE2_UPSTASH_REDIS_REST_URL=
LEXIA_LOTE2_UPSTASH_REDIS_REST_TOKEN=
LEXIA_LOTE2_REDIS_EXPECTED_HOST=
LEXIA_LOTE2_REDIS_CONFIRM=
LEXIA_LOTE2_REDIS_REQUIRE_EMPTY=true
LEXIA_PRODUCTION_REDIS_REST_URL=
LEXIA_PROTECTED_REDIS_REST_URLS=

LEXIA_LOTE2_APPLY_CONFIRM=
LEXIA_LOTE2_RUNTIME_CONFIRM=
```

`LEXIA_LOTE2_DB_URL` deve ser exatamente a URI de **Session pooler** mostrada
pelo Supabase: porta `5432`, usuário `postgres.<project_ref>`, banco `postgres`
e host igual a `LEXIA_LOTE2_DB_EXPECTED_HOST`. Transaction pooler (`6543`) é
recusado. O certificado deve ser a `Supabase Root 2021 CA`, validada por
impressão digital antes da conexão.

Para Redis, copie na aba REST do Upstash o endpoint HTTPS e o token normal. O
script de conectividade executa somente `PING` e `DBSIZE`, embora receba a
credencial de escrita. A conexão TCP da porta `6379` será usada apenas na
credencial futura do n8n, com SSL; ela não substitui o endpoint REST deste
harness.

## Ordem e autorizações

1. `npm run db:lote2:connectivity` abre e fecha o Session pooler com `psql \q`.
   Nenhum statement SQL é enviado.
2. `npm run db:lote2:redis:connectivity` executa somente `PING` e `DBSIZE`; com
   `LEXIA_LOTE2_REDIS_REQUIRE_EMPTY=true`, qualquer chave bloqueia o avanço.
3. Apresente os resultados e obtenha autorização explícita para SQL no ref
   confirmado.
4. `npm run db:lote2:preflight` executa apenas o preflight transacional
   `READ ONLY`. Qualquer tabela, usuário ou objeto inesperado interrompe.
5. Somente após nova confirmação local, defina
   `LEXIA_LOTE2_APPLY_CONFIRM=APPLY_LOTE2_ISOLATED:<project_ref>` e execute
   `npm run db:lote2:apply:isolated`.
6. Para o runtime sintético, defina temporariamente
   `LEXIA_LOTE2_RUNTIME_CONFIRM=RUN_LOTE2_ISOLATED:<project_ref>:<redis_host>`
   e execute `npm run test:lote2:runtime:isolated`.

O comando de aplicação para na primeira falha e respeita esta ordem:

1. preflight do projeto vazio;
2. baseline mínimo e marcador de identidade;
3. preflight da migration do Lote 2;
4. migration do plano de controle;
5. follow-up dos tipos do log de estado;
6. fixtures sintéticas;
7. verificação pós-migration;
8. verificação do harness.

Não há seed da Miranda/Detail, destino externo ou conta capaz de entregar.
O runner remoto projeta somente chaves registradas, testa `observe_only` e usa
`DEL` apenas nessas chaves; nunca usa `FLUSHDB`/`FLUSHALL`. Integração n8n/Frappe
continua como etapa posterior.

## Limpeza

O SQL de limpeza exige na mesma sessão:

```text
lexia.target_project_ref=<project_ref>
lexia.target_environment=isolated_test
lexia.lote2_cleanup_confirm=CLEAN_LOTE2_SYNTHETIC_DATA:<project_ref>
```

Ele não apaga schema, migration, marcador ou recursos fora dos dois slugs do
manifesto. Usuários Auth que venham a ser criados por um runner futuro deverão
ser registrados no manifesto e removidos pela Admin API com seus IDs exatos;
este pacote ainda não cria usuários.
