# Lexia CRM - Mapa Operacional e Técnico

## Memoria Central E Chat CRM Habilitados (12/10/2026)

Decisao autorizada: memoria OPERACIONAL do atendimento no central compartilhado;
catalogo/playbook Miranda consultados apenas por seis GETs nativos no 02.
Nao copiar para essa memoria dados antigos de pacientes, prompts privados ou
tools brutas; a inteligencia do workflow continua preservada no proprio 02.
Schema novo lexia_agent_operational_memories: escopo completo, invocacao vinculada
ao lote, CAS, cache de propostas (nao de efeitos), RLS e RPCs server-only.
Dependencias 001-008 instaladas somente no central gaofupndxgitonfmvpzi, com
backup e dry-run com rollback; ambiente continua isolated_test, recursos
persistentes sem cleanup. Empresa Miranda virtual e conta fake terminada 0003.

Copias 01/02 da pasta CRM MIRANDA SKIN adaptadas e publicadas; nenhum original
de producao alterado. Quatro nodes de memoria agora Postgres central; seis
nodes de catalogo GET apontam ao privado. Nomes/posicoes/grafo preservados.
Frappe HML usa tenant Miranda, alvo novo, modo full_agent_virtual e Google
disabled. Apenas workflow_tests.py atualizado nos backend/workers HML e fonte
persistente; reiniciados somente tres containers Frappe HML, nunca o n8n.
Role Workflow Tester adicionada somente ao operador ficticio existente.

Texto PT e continuidade ES sem reapresentacao passaram pela API real do CRM;
duas mensagens consecutivas formaram um unico lote. Memoria passou de v1 a v2
na conversa continuada; no burst ficou v1 para as duas mensagens. Nenhum
provedor/Google foi chamado. 295 testes Miranda, 193 Lote 2, 9 Python, lint e
typecheck passaram; 41 consultas SQL preparadas e 8 regressoes SQL com rollback.
Nao houve build Next/frontend: nao foram alterados nessa rodada.

Google, canais, notificacoes, schedules, comandos e pipeline continuam fechados.
03-06 nao foram alterados/publicados. Hooks/DocTypes completos do Frappe ainda
pendem para o ensaio de comandos/agenda/pipeline. API text/brain nao comprova
essas etapas nem qualidade clinica/comercial de todas as respostas.
Relatorio atual: docs/MIRANDA_MEMORIA_CENTRAL_CRM_20261012.md.
Os inventarios abaixo documentam a ETAPA ANTERIOR, nao o estado atual.

## Auditoria Central e Frappe HML (12/10/2026)

Conferencia real somente leitura: central gaofupndxgitonfmvpzi possui baseline,
22 tabelas/43 funcoes, mas nao os novos consumidores/calendar/fila/outbox/equipe
nem conta/politica/contexto da nova Miranda. Frappe 0.6.8 ainda usa alvo antigo,
empresa sintética A e agenda readonly; hooks/modulos/DocTypes da migracao pendem.
Plugin encontrou seis novas copias inativas. Apenas rascunho 01 alterado:
credencial de Agent Test no webhook e ID da copia 02. Codigo/conexoes/posicoes
e flags preservados; sem publicar/executar. 02 hoje aponta Supabase central
para catalogo/memoria inexistentes e continua fechado por flags.
Defeito de replacement `$'` do SQL 001 corrigido localmente com callback, sem
regenerar JSONs ou aplicar SQL. Auditorias readonly e config Frappe preparada
em arquivos. Usuario sugeriu memoria por empresa no central: recomendada para
parte OPERACIONAL; alteracao do contrato/fronteira do 02 ainda nao aprovada.
Nao criar memoria privada no central para apenas contornar guards.
Evidencias/passo seguinte: docs/MIRANDA_CRM_AUDITORIA_PREPARACAO_20261012.md.
Producao, n8n containers, SQL instalado, alvo Frappe e Git intocados.

## Layout Dos Seis Workflows (12/10/2026)

Rodada exclusivamente visual em n8n/miranda-migration-review e nos mesmos
seis arquivos de entrega. Restauradas as coordenadas exatas dos 138 nodes
originais mantidos; extensoes em faixas horizontais, sem serpentina, com notas
de secao sanitizadas. Sem alterar conexoes/parametros/credenciais/flags.
285 testes locais passaram, incluindo 31 regressoes de layout; lint/typecheck
passaram. Diagramas locais inspecionados; editor n8n real nao importado/testado.
Gerador e reaplicador usam scripts/lib/miranda-migration-layout.mjs; geometria
segura em tests/fixtures/miranda-layout/production-geometry.json. Dependencias
SQL/Frappe, servicos, producao, checkout Desktop e referencias Git intocados.
Estas alteracoes visuais nao fecham as pendencias de integracao abaixo.

## Fechamento Local Dos Seis Arquivos (12/10/2026)

Mesmos nomes em n8n/miranda-migration-review; nao criar outra familia.
Foram ligados localmente comandos CRM, cancelamento comprovado, projecao Redis
por versao imutavel, manutencao periodica, outbox com claim, notificacoes Z-API /
UAZAPI, fila central de follow-up com o agendamento original e confirmacao
terminal vinculada ao recibo da criacao. Mensagem proposta possui action_id
estavel no CRM; enriquecimento de midia nao altera o evento original.
Fonte Frappe local recebeu dispatcher e hook de pipeline factual, ambos
desligados por configuracao; confirmed_at guarda ocorrencia, nao data de importacao.
Nada foi instalado, aplicado ou publicado. Os seis continuam candidatos locais,
nao homologados no n8n. SQL novo em review/miranda-migration (001-004 e memoria
privada); revisao de schema instalado obrigatoria antes da aplicacao.
Leia o README atualizado para configuracao e limites, inclusive answer_pending,
recovery de lote claimed, Meta e atribuicao duravel ainda pendentes. Nao ativar
canais reais nem reaplicar cleanup do laboratorio nos recursos persistentes.
Trabalho mantido em Developer/lexia-crm; checkout Desktop mais antigo intacto.
Branch/HEAD e referencia invalida preservados, sem commit/push/servicos.

## Nova Base de Migracao: Exports de Producao (12/10/2026)

Usuario forneceu MIRANDA WORKFLOWS ATUALIZADOS.zip como nova referencia.
Seis originais completos: 148/30/28/7/7/24 nodes. Somente cerebro mudou
Preparar Handoff e notificacao em relacao aos exports anteriores.
Novo central Supabase/Redis deve ser persistente e compartilhado; nao limpar
ou recriar como descartavel. Bancos privados por cerebro permanecem.
Intervencao 15 min, retomada por nova mensagem, pausa ate fim do agendamento;
cancelamento Frappe deve cancelar Google com comprovacao, nao inferencia.
Handoff normal apenas notifica; alta/urgente bloqueia ate resolucao e retomada
manual. Esta decisao altera a regra anterior de todos os handoffs bloqueantes;
codigo/schema das rodadas anteriores ainda nao foram adaptados a ela.
Provedores confirmados: Z-API no handoff; UAZAPI nas notificacoes de agendamento
para Samuel/socio. Usuario autorizou preparar dependencias locais de banco e
Frappe, sem aplicar SQL ou publicar workflows. Primeira revisao gerada em
n8n/miranda-migration-review, com seis JSONs inativos derivados dos originais,
sem credenciais reais. NAO e pacote homologado pronto para ativacao. Consumidores
e transporte foram ligados no fechamento local acima; Meta e demais lacunas
ficam no MANIFEST. Instalacao/configuracao/ensaio real ainda sao necessarios.
Leia README dessa pasta e MANIFEST.json.
SQL aditivo somente em supabase/review/miranda-migration; helper de pipeline em
integrations/frappe. Fonte Frappe local: handoff normal/baixo nao cria bloco,
alta preserva bloqueio; Link block torna-se opcional e retomada sem block nao
encerra outros motivos. Nenhuma instalacao/reload/servico/marcador foi alterado.
Referencia e mapa: docs/MIRANDA_MIGRACAO_BASE_PRODUCAO_20261012.md.

## Disponibilidade Pessoal: Somente Leitura (12/10/2026)

Disponibilidade simplificada para 17 nodes na variante readonly, preservando
regras originais e usando SELECT preflight sem ledger/claim de escrita. ID
pessoal exato pode ser lido com consentimento; nenhuma tool de criacao e
conectada ao cerebro dessa variante. Omnichannel preserva buffer/midia/historico
e deriva permissao de test_read_only + controle confiavel; escrita false.
CRM HML atualizado/configurado para test_read_only; criacao recusada no servidor,
retorno vinculado a politica. Backup e fonte persistida; backend e filas HML
reiniciados com zero workers ocupados. N8n/producao nao alterados. Copias locais
para importacao manual em Downloads/LEXIA-AGENDA-SOMENTE-LEITURA.
208 testes combinados, 193 Lote 2, lint/typecheck e 15 testes Frappe HML passaram.
Google/OAuth, preflight SQL real e novo encadeamento n8n nao homologados; memoria
privada HML/credenciais/IDs ainda exigem conferencia. Sem migration/aplicacao
de SQL novo. Imagem Frappe nao reconstruida; incorporar fonte antes de recriar.
Runbook: n8n/miranda-original-crm/AGENDA_SOMENTE_LEITURA.md.

## Tools Originais: Copias Locais (12/10/2026)

Disponibilidade/criacao originais preservadas em
`n8n/miranda-original-crm/availability-original-crm.inactive.json` (26 nodes)
e `create-appointment-original-crm.inactive.json` (55 nodes). Credenciais
nativas, calendario pessoal secundario, protecao do destino original,
claim/ownership duraveis, releitura depois da reserva, gate antes do Google e
recibos `lexia.tool.result.v1`. Cerebro ajustado somente nas fronteiras das
tools; inteligencia original permanece. Notificacao/pausa/follow-up direto
removidos da execucao; campos secretos/configuracao inline nao foram copiados.
Schema adicional em `supabase/isolated/lote2/202610120001_calendar_tools.sql`
somente em arquivo, sem aplicar. Luxon 3.7.2 e dependencia apenas de testes.
CRM/Omnichannel ainda forcam agenda desabilitada; flags, retorno/UI e consumo
de eventos/confirmacao terminal/pausa precisam de integracao posterior.
Nenhum servico ou workflow remoto foi acessado/alterado nesta rodada.
38 regressoes novas, 70 direcionadas, 201/201 combinadas e 193/193 Lote 2
passaram, assim como lint focado e typecheck. Banco/SQL/OAuth/Google/n8n/CRM
reais nao foram executados; os testes usam doubles, nao prova de integracao.
Configuracao e limites: `n8n/miranda-original-crm/TOOLS_AGENDA.md`.

## Cerebro Original: Copia Local (12/10/2026)

`n8n/miranda-original-crm/brain-original-crm.inactive.json` preserva os 30
nomes originais do cerebro Miranda (51 nodes com guards/memoria), prompts,
especialistas, playbook e regras comerciais/agendamento. Melhora continuidade,
historico/autoria, idioma pt/en/es, baloes e validacao de tools; pausa/envio
ficam com o Omnichannel. Inativo, sem credenciais/destinos reais, para importacao
manual pelo usuario; nao foi importado/publicado/executado remotamente.
32/32 regressoes novas, 163/163 combinadas, 193/193 Lote 2, lint sem avisos
e typecheck passaram pelos comandos padrao apos recuperar execucao local.
Modelos/bancos/calendario nao foram chamados. Tabelas privadas de memoria,
credenciais HML, recibos provisorios das tools e consumo dos eventos no
Omnichannel continuam pendentes. Nao e integracao ponta a ponta pronta.
Configuracao, limites e evidencias: `n8n/miranda-original-crm/CEREBRO.md`.

## Auditoria n8n HML (11/10/2026)

Certificado publico Supabase Root 2021 CA aplicado ao servidor e worker apos
aprovacao da interrupcao breve. Recriacao iniciada em 11/10 as 23:19 (Brasil),
mantendo n8n 2.42.6 e mesma imagem. Backup restrito do compose salvo na VPS;
mudanca limitada aos dois mounts da CA. Banco, Redis, proxy e Frappe nao
foram reiniciados. Painel/readiness HTTP 200 e credencial Postgres HML
autenticando via node nativo para ler metadados de schemas, com SSL validado.
SQL operacional, buffer/Redis e IA continuam sem homologacao integrada.
Procedimento, evidencias e rollback: `n8n/miranda-original-crm/TLS_HML.md`.

As tres copias em CRM MIRANDA SKIN foram revisadas remotamente com autorizacao.
As 45 referencias Postgres apontam agora para a nova credencial
`Lexia HML Central Postgres`, criada com confirmacao explicita. O erro inicial
de certificado foi resolvido pela manutencao descrita acima; SSL Require
permanece ligado e Ignore SSL Issues desligado.
Supabase/Redis foram vinculados as credenciais HML existentes, e o webhook
de testes usa a autenticacao Agent Test, nao a API do Frappe.

O task runner real rejeitou exports JavaScript baseados em getters e nao
oferece `structuredClone`. Geradores e copias receberam exports por propriedades
comuns e copia de envelopes JSON validados. 131 testes locais especificos,
193 Lote 2, lint focado e typecheck passaram. Seis ensaios no n8n passaram
com banco, modelos, subworkflows e provedores pinados: bloqueio no Omnichannel,
follow-up bloqueado, lembrete fora do horario, entrega virtual, estado obsoleto
e resultado incerto. Nao equivalem a SQL, IA, Redis ou canais homologados.

Todos os tres workflows continuam inativos; schedules e canais reais desligados.
Nao houve migration, restart da VPS inteira, chamada de modelo/provedor,
publicacao ou edicao dos workflows Miranda em producao. Houve somente a
recriacao autorizada dos dois componentes n8n para carregar a CA.
Cérebro isolado, fila/playbook legado,
mirror de tools e integracao completa com CRM seguem pendentes.
Detalhes, IDs e limites: `n8n/miranda-original-crm/AUDITORIA_HML.md`.

## Lembretes Originais: Entrega Comum Local (11/10/2026)

`n8n/miranda-original-crm/reminder-original-crm.inactive.json` adapta os sete
nodes originais mantendo nomes, intervalo de 1h, pt/en/es, janela de 2h-24h
e 7h-20h Boston inclusive domingo. Importa inativo/preview, schedule desligado.
Fonte agora e evento atestado no central; nao consulta banco privado nem
Google. Enviar Lembrete chama a copia do Omnichannel; marcar exige ledger sent
e mensagem confirmada. Pausa Eterna e pass-through, nao altera bloqueios.
Somente pausa do proprio agendamento admite lembrete; outros motivos bloqueiam.
Omnichannel tambem revalida janela/unicidade sob lock antes de enviar.
30 novas regressoes, 128 especificos combinados, 193 Lote 2, lint e typecheck
passaram; SQL/runtime n8n nao executados. Credenciais, mirror da tool,
UI Agent Test para automacoes, Meta, outbox/recovery seguem pendentes.
Runbook: `n8n/miranda-original-crm/LEMBRETES.md`. Sem acesso remoto/producao.

## Omnichannel: Entrega Comum Local (11/10/2026)

`n8n/miranda-original-crm/omnichannel-shared-delivery.inactive.json` preserva
os 225 nodes do chat original adaptado e acrescenta a faixa ENTREGA (258
nodes totais). Respostas agora chamam o mesmo receptor privado de pedidos
de follow-up/lembrete. Contratos fechados, identidade/escopo, plano imutavel,
source duravel, claim por acao e confirmacao/historico transacional foram
preparados em nodes nativos. Antigos caminhos de envio ficam desligados.
Padrao virtual, somente fake/test:, sem comprovacao falsa de envio real.
33 novas regressoes, 98 testes especificos e 193 Lote 2 passaram; lint focado
e typecheck passaram. SQL e runtime n8n nao foram executados. Adaptador
provider preparado: Z-API de teste; Meta, homologacao do produtor de lembretes, schema
legado, pipeline, outbox/recovery e ensaio real continuam pendentes.
Runbook: `n8n/miranda-original-crm/ENTREGA_COMPARTILHADA.md`. A rodada nao
acessou producao, servicos/modelos nem modificou workflows remotos.

## Follow-up Original: Eventos CRM (11/10/2026)

`n8n/miranda-original-crm/followup-original-crm.inactive.json` adapta o original
de 28 nodes mantendo Juiz, Redator, playbook e regras comerciais. Acrescenta
identidade descartavel, escopo, leitura de pausas antes dos modelos, gate
de snapshot/fila e comprovacao duravel antes de contar envio. Prepara eventos
`automation.updated` e `message.recorded`; nao altera Kanban automaticamente.
Importa inativo e preview, sem tokens/destinos/IDs privados. Nenhum runtime,
SQL ou producao foi acessado. 27 novas regressoes, 65 testes especificos
combinados, 193 testes Lote 2 e lint passaram. Delivery comum de automacoes,
schema legado sintetico, contato salvo, outbox CRM e pipeline seguem pendentes.
O receptor local posterior esta descrito acima; integracao ainda precisa
de homologacao. Runbook e
contratos provisorios em `n8n/miranda-original-crm/FOLLOWUP.md`.

## Omnichannel Original: Contrato Agent Test (11/10/2026)

`n8n/miranda-original-crm/omnichannel-crm-agent-test.inactive.json` corrige a
entrada/saida do chat Frappe sobre o reexport fornecido pelo usuario. Conserva
os 220 nodes anteriores e acrescenta cinco validacoes/preflight. Conferencia
de escopo e identidade descartavel precede escritas; Postgres exige credencial
de teste, nunca a referencia Miranda do arquivo recebido. Webhook exclusivo,
envio real desconectado e canais desabilitados. Contexto/historico/buffer
preservados; filtro de idioma e retorno sanitizado de erro foram integrados.
38 regressoes especificas passaram, incluindo validadores puros do Frappe;
193 testes da suite local Lote 2 e ESLint do gerador/testes tambem passaram.
Credenciais, cerebro isolado e configuracao server-side ainda sao manuais;
nenhum runtime remoto foi acessado ou verificado nesta rodada. Runbook em
`n8n/miranda-original-crm/README.md`. Follow-up/pipeline ficam para depois.

## Alternativa Local: Omnichannel Original (11/10/2026)

`n8n/miranda-original-crm/omnichannel-original-crm.inactive.json` parte do
export Miranda de 148 nodes, preservando nomes e ramos de midia em vez do
mestre compacto. Gerador e limites em `n8n/miranda-original-crm/README.md`.
Registro individual, contexto central versionado, teste virtual e gate por
acao foram adaptados aos contratos/RPCs existentes. Credenciais apenas por
nome; envio real desligado. Os demais workflows privados nao foram alterados.
Esta rodada e local: nao acessa n8n, aplica SQL ou modifica servicos.
14 regressoes locais especificas e 193 testes locais Lote 2 passaram; ESLint
do gerador e testes passou. Execucao real/importacao continuam
pendentes. Nao apresentar este export como integracao pronta para producao.

> Documento canônico do projeto para pessoas e agentes de código.
> Última auditoria: 10/10/2026.
> Leia também `PLAN.MD` antes de alterar arquitetura, banco, autenticação, métricas ou integrações.

## 1. Leia Isto Primeiro

Este repositório contém o painel web da Lexia AI e o export versionado do
workflow do Analista em `n8n/`. Ele não contém os workflows omnichannel de
produção, a configuração dos Redis dos clientes nem um baseline completo e
versionado do schema/RLS remoto. A migration do Analista Lexia está versionada
em `supabase/migrations/`, mas o restante do banco ainda precisa ser exportado.
A aplicação depende desses elementos externos para funcionar corretamente.

Regras inegociáveis:

1. Nunca colocar chaves, senhas, URLs privadas de webhook ou tokens neste repositório.
2. Nunca usar uma `service_role` no navegador ou em variável `NEXT_PUBLIC_*`.
3. Nunca remover o filtro por `cliente_slug` de consultas, ações ou integrações multi-tenant.
4. Nunca alterar o significado de uma métrica sem atualizar este documento e o texto exibido no painel.
5. Nunca tratar `followup_rapido` como sinônimo de todos os leads de anúncio.
6. Nunca considerar o painel uma cópia literal do WhatsApp enquanto o pipeline não persistir um evento por mensagem com ID e timestamp do provedor.
7. Nunca excluir dados de teste com uma consulta que não valide cliente, sessão e origem.
8. Toda mudança de schema precisa de migration, backup, plano de rollback e atualização deste mapa.
9. Antes de escrever código Next.js, ler a documentação correspondente em `node_modules/next/dist/docs/`. Este projeto usa Next.js 16, com diferenças em relação a versões anteriores.

## 2. Estado Executivo

### Produção

- Produto: Lexia AI, painel de operação de agentes de atendimento.
- URL pública: `https://app.uselexia.app`.
- Hospedagem: Vercel.
- Projeto Vercel localmente vinculado: `lexia-crm`.
- Domínio: `app.uselexia.app`, com DNS administrado fora do repositório.
- Verificação em 30/09/2026: deploy Production concluído, `/login` respondeu HTTP 200 e as rotas autenticadas `/app` e `/app/conversas` responderam HTTP 200.
- Referência após aquecimento em 30/09/2026, medida de fora da Vercel: `/app` em aproximadamente 1,2 s e `/app/conversas` em aproximadamente 1,1 s de resposta completa. São valores operacionais, não um SLA.

### Situação do código-fonte

- Repositório remoto: `origin` configurado no GitHub.
- `main`, `origin/main` e o snapshot de produção estavam em `8e13d2b` no
  início da revisão de 03/10/2026.
- O Lote 1 de segurança está isolado na branch
  `codex/lote-1-autorizacao-workflows`.
- O Lote 1 ainda não foi mesclado, publicado ou aplicado ao banco de produção.
- O runbook de revisão, implantação e recuperação está em
  `docs/LOTE_1_AUTORIZACAO_WORKFLOWS.md`.
- O fechamento local do Lote 1 está no commit
  `4bba3d425992af2308c6edce0e1214c40902fe35`. A branch do
  Lote 2, `codex/lote-2-workflow-mestre-omnichannel`, nasceu exatamente desse
  commit; a `main` não foi alterada.
- O Lote 2 possui especificação, implementação local e um harness integrado
  aplicado somente ao Supabase descartável `gaofupndxgitonfmvpzi` e ao Redis
  exclusivo de teste. Contratos, funções puras, fixtures e exports n8n seguem
  inativos; nenhuma mudança de produção, canal, cérebro, push ou deploy foi
  executada. O contrato está em
  `docs/LOTE_2_WORKFLOW_MESTRE_OMNICHANNEL.md`.

O Git já possui uma trilha remota, mas a reconstrução integral ainda depende
do baseline externo de schema/RLS, n8n, Redis e segredos por ambiente.

### Segurança conhecida

- Chaves `service_role` foram compartilhadas anteriormente em mensagens e capturas de tela. Elas devem ser consideradas expostas e rotacionadas.
- A instalação limpa em 03/10/2026 reportou 14 vulnerabilidades no conjunto de
  dependências: 2 moderadas, 11 altas e 1 crítica. Nenhum `audit fix` foi
  aplicado neste lote de autorização.
- O pacote `next` está em `16.2.9`; o audit indicou correção disponível em `16.3.6`.
- Existem migrations incrementais do Analista e do Lote 1, mas ainda não há
  baseline completo do schema/RLS. A branch do Lote 1 adiciona CI localmente
  versionado, testes comportamentais/de contrato e uma suite mínima de banco
  que exige um Supabase descartável. Ela não substitui os E2E da aplicação.
- Não há `proxy.ts`. O cliente SSR menciona um middleware para renovação de cookies, mas Next.js 16 usa a convenção `proxy.ts`. O fluxo de renovação de sessão precisa ser auditado antes de ser considerado robusto.

## 3. O Que a Plataforma Faz

A plataforma possui duas experiências autenticadas:

- Painel administrativo Lexia em `/admin`.
- Painel isolado de cliente em `/app`.

As funções atuais são:

- Login com Supabase Auth.
- Dashboard operacional por período.
- Visualização de conversas de WhatsApp, Instagram e Messenger.
- Filtro de conversas por canal, período e fuso horário.
- Histórico completo da conversa selecionada, com rolagem própria e abertura no fim.
- Métricas de conversas, mensagens, autonomia, follow-ups e tempo de resposta.
- Métricas de agendamentos lidas dos Supabase próprios de alguns clientes.
- Área de testes que chama webhooks de workflows e acompanha a resposta gravada pelo n8n.
- Feedback sobre execuções de teste e mensagens reais.
- Gestão de handoffs.
- Cadastro básico de clientes, workflows e usuários.
- Cadastro administrativo de ajustes de agente.
- Histórico técnico de execuções.
- Analista Lexia em chat, com métricas exatas, análise de objeções, qualidade das respostas, feedbacks e fontes rastreáveis por conversa.
- Navegação interna sem recarga completa nos filtros, feedback imediato de carregamento e bloqueio de envios duplicados em ações administrativas e de clientes.

## 4. Fronteiras do Sistema

```text
Usuário
  |
  v
Next.js na Vercel (este repositório)
  |-- Supabase central
  |     |-- Auth
  |     |-- clientes, perfis e workflows
  |     |-- contactos e mensagens omnichannel
  |     |-- testes, execuções, feedbacks, handoffs e ajustes
  |
  |-- Supabase externo da Miranda
  |     `-- agendamentos_miranda_skin
  |
  |-- Supabase externo da Detail By Cordeiro
  |     `-- marcacoes
  |
  `-- Webhook do workflow ativo
        `-- n8n
              |-- WhatsApp / Instagram / Messenger
              |-- Redis exclusivo do cliente
              |-- ferramentas e calendários do agente
              `-- grava resultados no Supabase central e nos bancos do cliente
```

### O que está neste repositório

- Interface e rotas Next.js.
- Server Actions.
- Regras de leitura e cálculo das métricas.
- Clientes Supabase para navegador, SSR e administração.
- Contrato de envio da Área de Testes.
- Renderização das conversas.

### O que não está neste repositório

- Workflows omnichannel publicados ou ativos do n8n. O repositório contém
  apenas o Analista versionado e o harness inativo do Lote 2.
- Credenciais e configuração dos canais Meta/WhatsApp.
- Configuração dos Redis por cliente.
- Prompts e ferramentas completas dos agentes, salvo o que eventualmente estiver refletido no banco.
- Schema SQL e políticas RLS versionadas.
- Backups dos Supabase.
- Configuração DNS da GoDaddy/Vercel.
- Configuração de calendários ou serviços externos chamados pelos workflows.

### Redis

Cada cliente tem o seu próprio Redis no Upstash, usado pelo n8n para buffer, contexto e travas do agente. Desde 19/09/2026 o painel acede diretamente a esse Redis, apenas no servidor e pela API REST do Upstash, para uma única finalidade: ler as travas do agente e gravar ou remover a pausa manual e a pausa pós-agendamento. O painel não lê buffer, contexto nem eco. O contrato das chaves está na secção 12 e o código em `lib/redis/agent-locks.ts`. Não há dependência npm de Redis; o acesso é feito com `fetch`.

Clientes com a integração ativa: `miranda_skin_experts`. Para os demais, as telas simplesmente não mostram a secção de pausas.

### Lote 2: alvo e implementação local

O Lote 2 substituirá a duplicação dos omnichannel por um workflow mestre e
subworkflows reutilizáveis. O desenho aprovado mantém o Supabase central como
fonte durável de configuração e dados operacionais e usa Redis compartilhado
como projeção reconstruível, isolada por ambiente, empresa, canal, conta e
conversa.

Pausas deixam de ser um único estado sobrescrito: intervenção humana, pausa
manual, handoff e agendamento serão bloqueios independentes. Encerrar um motivo
nunca encerra outro. Toda ação de saída será revalidada contra uma versão da
conversa imediatamente antes da entrega, para suprimir respostas preparadas
antes de uma intervenção humana.

Os cérebros continuam privados. Seus Supabases, prompts, Google Agenda e outras
tools não são acessados diretamente pela plataforma. O mestre recebe apenas um
resultado estruturado e eventos de domínio atestados. A especificação não
escolhe piloto, não inclui Asteric e não autoriza conexão com serviços.

A primeira implementação local está em `contracts/omnichannel/v1/`,
`lib/omnichannel/`, `tests/omnichannel-*.test.ts` e `n8n/omnichannel/`. Ela
simula a busca exata da configuração por tenant, máquina de bloqueios,
normalização de mídia e entrega ordenada. Resultados de contexto são vinculados
ao escopo/chamada/mensagens; respostas do cérebro são vinculadas ao snapshot;
schemas, ações e eventos aninhados falham fechados. Exceções de envio preservam
o progresso e qualquer resultado incerto exige reconciliação. Não usa Supabase,
Redis, n8n, modelo, provider ou tool real e não altera o comportamento da
aplicação. O validador local rejeita datas de calendário e horários impossíveis
sem normalização e separa erro de definição do schema de erro no payload;
referências recursivas não suportadas falham antes dos combinadores. Em
09/10/2026, os checks locais foram repetidos depois da geração dos candidatos
da Miranda; os totais atuais ficam registrados na especificação. A análise do
fluxo atual da Miranda, com lacunas confirmadas e o plano do buffer, está em
`docs/LOTE_2_REFERENCIA_FLUXO_ATUAL_MIRANDA.md`.

Idioma é uma regra de entrega, não apenas uma orientação de prompt. A mensagem
mais recente do lead estabelece português, inglês ou espanhol; uma troca clara
passa a valer no mesmo turno. Pedido explícito como `em espanhol` prevalece
mesmo dentro de uma frase no idioma anterior, enquanto conteúdo curto ou
ambíguo preserva o idioma já
estabelecido. O redator recebe esse idioma como obrigatório e o resultado passa
por um gate determinístico antes do plano de entrega. Uma resposta claramente
incompatível termina como `response_language_mismatch`, sem ação para o
provedor. O gate, a resolução de mensagens ambíguas e as três línguas têm
regressões em `tests/omnichannel-language-policy.test.ts` e
`tests/miranda-v2-candidate-workflows.test.ts`.

Os candidatos funcionais detalhados da Miranda estão em
`n8n/miranda-v2-candidate/` e são regenerados por
`scripts/build-miranda-v2-candidates.ts`. Eles consolidam 16 blocos em seis
papéis e permanecem inativos no Git. O deployment HML hidrata cópias privadas
desses seis candidatos com credenciais exclusivas do laboratório, referências
internas e configuração `observe_only`; ele mantém webhooks de canal e
schedules desligados. Em 10/10/2026, os seis workflows completos foram
publicados em IDs próprios na pasta `CRM MIRANDA SKIN`. O pacote local atual
tem 312 nodes; as cópias HML preservam esses 312 nodes e hidratam somente
credenciais, referências internas e configuração exclusiva do laboratório. O
gateway sintético é um sétimo workflow separado e não entra nessa contagem.
Uma execução sintética direta percorreu buffer real, contexto, cérebro, CRM e
gate até terminar suprimida, sem chamar os três nodes de provedor. Os seis
workflows operacionais originais da Miranda continuam nos IDs e versões
anteriores, sem edição.

O caso de duas mensagens rápidas também foi reproduzido no HML em 10/10/2026.
A Entrada agora aguarda o dono do lote atual, tenta novamente o claim da
sequência mais recente e o Atendimento relê a sequência antes de expor cada
resposta. O resultado preparado com corte antigo terminou como
`superseded_by_new_message`; o lote seguinte reuniu as duas mensagens, manteve
o histórico e o espanhol e não reapresentou Carol nem repetiu a pergunta
anterior. Depois de alinhar esse resultado ao retorno do gateway, as duas
execuções concorrentes da Entrada (`133402` e `133404`) terminaram com sucesso,
sempre com o provider suprimido.

Os runtimes compactos de `n8n/miranda-v2-lab-runtime/` continuam separados e
preservados no Git como fixtures determinísticas. As seis cópias remotas que
antes atendiam o gateway foram despublicadas e arquivadas em 10/10/2026. O
gateway sintético de `/crm/agent-test` agora chama diretamente os seis
workflows HML completos por ID; cada workflow possui uma rota de laboratório
fechada que valida o contrato sintético. O modo `safe_simulation` impede banco,
Redis, modelo, tool, Calendar e provedor; o modo `full_agent_virtual` usa apenas
os recursos HML autorizados e o cérebro real, mantendo Calendar e provedor
bloqueados. Não confundir runtime compacto versionado,
workflows completos HML, candidatos locais e cópias sanitizadas de revisão:
são artefatos com finalidades diferentes.

O contrato reverso provisório do Frappe é
`contracts/omnichannel/v1/crm-command.schema.json`. Ele separa pausa manual,
resolução/retomada de handoff, cancelamento e presença/no-show. O workflow
reconstrói tenant e conta pela integração confiável antes das RPCs. A emissão
dos comandos, claim único por uma identidade técnica separada e confirmação do
resultado foram exercitados por HTTP no laboratório em modo `outbox_only`.
Ainda não existe ligação desses comandos aos workflows n8n nem a canais reais.

Uma extensão local adicional prepara o espelho da Miranda no Frappe CRM. O
contrato está em `contracts/omnichannel/v1/crm-sync-event.schema.json`, a lógica
em `lib/omnichannel/crm-sync.ts` e o mapa inativo dos seis workflows em
`n8n/miranda-crm/`. Essa extensão não está importada no n8n nem conectada ao
Frappe de produção. Provedor, tool, workflow, cérebro e usuário do CRM têm
autoridades separadas; disponibilidade não confirma agendamento e tentativa de
envio não confirma entrega.

No laboratório Frappe, o app `lexia_crm 0.6.4` adiciona as rotas autenticadas
`/crm/conversations` e `/crm/agent-test` ao frontend nativo do CRM 1.86.0. A
primeira é somente leitura: usa as permissões dos DocTypes, mostra mensagens,
autoria, mídia, entrega, bloqueios, agendamento e contexto, mas não envia
mensagens nem altera estado e exclui conversas sintéticas inclusive no acesso
direto. A segunda é uma inbox separada por usuário, com busca e múltiplas
conversas; cria um ensaio sintético, persiste a entrada antes da fila e acompanha
automaticamente o worker. O modo atual é `remote`, restrito ao laboratório, e
aponta todos os alvos para um gateway sintético autenticado no n8n. O gateway
valida o contrato e despacha para um dos seis workflows HML completos. O alvo
omnichannel em `full_agent_virtual` percorre Entrada -> buffer/contexto ->
Atendimento real da Miranda -> CRM -> Saída. Ele usa somente o Supabase e o
Redis descartáveis, além do modelo do cérebro HML; a resposta é correlacionada
e sempre suprimida antes do provedor. Calendar continua desabilitado e nenhum
canal, provider ou tool de agenda é chamado. O
overlay de rotas/menu é compilado na imagem, fixado à versão upstream e falha
se as âncoras mudarem. Foram aprovados 58/58 testes do app, 246/246 testes do
frontend upstream, lint das páginas, build Vite, inspeção visual e smoke
autenticado da separação entre as duas inboxes. Uma única conversa adicional
foi exercitada em português, depois inglês e depois espanhol; cada turno teve
o idioma esperado confirmado pelo gate e `provider_send_attempted = false`.
Isso continua restrito a `crm-hml.localhost` e não comprova a integração real.
Em 10/10/2026, a frase real `Gostaria de ser atendido em espanol` revelou que
o redator já respondia em espanhol, mas o gate final ainda priorizava o idioma
anterior. A versão HML do Atendimento foi corrigida para reconhecer pedidos
explícitos com nomes de idioma misturados, persistir `idioma: es` e dar essa
decisão à validação final. A execução `133270` passou com
`expected_language = es`, dois balões detectados como espanhol e
`provider_send_attempted = false`.
Na versão 0.6.4, a limpeza protegida também reconhece o manifesto
`test:SYNTH-LEXIA-TEST-CHAT-`, sem remover as verificações de ambiente, empresa,
conta, canal e flag sintética.

O app aditivo foi instalado inicialmente no laboratório Frappe
`crm-hml.localhost`, marcado como `isolated_test` e
`empresa_sintetica_a`, na versão `0.4.1`; o harness Frappe + Supabase passou em
09/10/2026. O laboratório agora roda `0.6.4`. Há usuários técnicos distintos
de operação e integração, com chaves fora do Git. Gateway e seis runtimes
compactos foram substituídos no Agent Test pelo gateway e pelos seis workflows
HML completos. Na pasta remota `CRM MIRANDA SKIN` permanecem visíveis somente
esses sete workflows; as cópias compactas foram arquivadas. O ramo
`safe_simulation` não usa Supabase, Redis, modelo, Calendar ou provedor. O ramo
`full_agent_virtual` usa recursos HML autorizados e o cérebro real da Miranda,
mas conserva canal virtual, Calendar desabilitado, schedules/canais desligados
e entrega `observe_only`. Isso valida o caminho HML no laboratório, não
produção.

Regras fixadas: remover a
pausa de um agendamento confirmado mantém seus lembretes até o início da
consulta, sob os demais bloqueios; mensagem nova do lead antes do envio
descarta a resposta não enviada e reprocessa o lote, sem repetir bolhas
enviadas nem efeitos de tools (modelo local em
`lib/omnichannel/inbound-buffer.ts` e `lib/omnichannel/delivery-plan.ts`).
A pausa pós-agendamento é política por empresa no Supabase central
(`lexia_omnichannel_policies`), sem condição fixa por cliente: ligada, cria
bloqueio até o fim do evento e admite uma confirmação única vinculada à tool;
desligada, não cria bloqueio. Vale para todos os canais, só na conversa do
agendamento. Somente o admin Lexia altera, com a regra aplicada também no
banco; o cliente apenas vê. Valores iniciais sintéticos: empresa A ligada e
empresa B desligada. As migrations foram aplicadas somente ao projeto
descartável confirmado, com resumo em `docs/LOTE_2_REVISAO_BANCO.md`; staging e
produção permanecem sem autorização. O mestre executável de teste está em
`n8n/omnichannel-test/` (workflows gerados a partir de
`lib/omnichannel/master-runtime.ts`, inativos, com cérebro e provedor falsos)
e ainda não foi importado. Um artefato separado, `remote-gateway.sdk.mjs`, foi
publicado apenas no n8n de laboratório para validar o transporte HTTP
autenticado. O deployment reproduzível é montado por
`scripts/build-miranda-v2-lab-deployment.mjs`: ele publica primeiro os seis
filhos sintéticos sanitizados e depois o gateway. O deployment dos seis fluxos
completos é separado, gerado por
`scripts/build-miranda-v2-staging-deployment.mjs`; ele não altera o gateway da
plataforma nem os workflows originais.

O harness mínimo de banco do Lote 2 está em `supabase/isolated/lote2/`. Ele
exige projeto vazio, marcador `isolated_test`, duas empresas sintéticas,
provider `fake` e entrega `observe_only`. Em 09/10/2026, conectividade,
preflight, baseline, migration, fixtures e verificações passaram apenas no
projeto descartável `gaofupndxgitonfmvpzi`. O ensaio Supabase + Redis passou
nove cenários integrados e removeu todas as conversas e chaves runtime,
preservando as configurações sintéticas. Durante o ensaio foi corrigida a
constraint de eventos para aceitar `handoff.resolve` e
`appointment.attendance.update`; a correção aditiva está na migration
`202610090001_lote2_state_event_command_types.sql`. A RPC específica para
cancelamento vindo do CRM está em
`202610090002_lote2_crm_appointment_cancellation.sql`: ela preserva a
proveniência da tool e nunca recria ou encerra uma pausa. O ensaio adicional
Frappe + Supabase passou sete cenários e limpeza; o Redis permaneceu vazio.
Nenhum modelo, canal, provider, cérebro ou destino externo foi chamado nesse
ensaio; a conexão n8n posterior limita-se ao gateway sintético descrito acima.

## 5. Stack e Convenções

- Next.js `16.2.9`, App Router.
- React e React DOM `19.2.4`.
- TypeScript 5 em modo `strict`.
- Tailwind CSS 4.
- Supabase JS `2.108.2`.
- Supabase SSR `0.12.0`.
- OpenAI SDK `7.21.0`, mantido para a implementação direta legada do Analista.
- n8n como orquestrador ativo e assíncrono do Analista Lexia.
- Lucide React `1.47.0` para iconografia da interface.
- Node usado na auditoria: `24.14.1`.
- npm usado na auditoria: `11.11.0`.
- Fonte: Geist e Geist Mono via `next/font`.
- Idioma do HTML: `pt-BR`.
- Alias TypeScript: `@/*` aponta para a raiz.

Scripts existentes:

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run typecheck
npm test
npm run test:lote2:local
npm run db:lote2:connectivity
npm run db:lote2:redis:connectivity
npm run db:lote2:preflight
npm run db:lote2:apply:isolated
npm run test:lote1:db:isolated
npm run test:lote1:isolated
npm run test:lote1:runtime:isolated
npm run db:lote1:runtime:verify
npm run db:lote1:index
```

Ainda não existem `test:e2e` geral, seed completo ou geração automática de tipos. A
branch do Lote 1 inclui CI com `npm test`, lint, typecheck e build, mas ainda
não foi mesclada. `test:lote1:db:isolated` valida somente o harness mínimo de
banco; `test:lote1:isolated` é um alias compatível. Ambos só podem usar um
projeto Supabase descartável identificado por marcador remoto.
`db:lote1:index` exige conexão Postgres identificada pelo `project_ref` e
confirmação explícita do destino. Existe um harness Next descartável e
manifestado para cadastro, edição, dispatch e callbacks selecionados. Em
05/10/2026, o trilho passou os 13 cenários no projeto descartável. A edição de
configurações não usa mais `revalidatePath`: cada sucesso devolve um token
novo, e o formulário consome esse token uma única vez com `router.refresh()`.
Erros preservam o token anterior e não atualizam a rota. O runner confirmou
duas edições consecutivas, voltar/avançar entre cliente e Dashboard, URL vazia
preservada, dispatch admin/cliente, callbacks e ausência de segredos no
navegador, com limpeza final independente.

## 6. Mapa de Diretórios

```text
app/
  actions/auth.ts                    login e logout
  actions/agent-pause.ts             pausar, despausar e remover pausa eterna
  admin/                             experiência Lexia admin
    page.tsx                         dashboard agregado
    analista/                        análise conversacional por cliente
    conversas/                       conversas de todos os clientes
    area-testes/                     teste de workflows como admin
    clientes/novo/                   cadastro básico de cliente
    clientes/[slug]/                 detalhe, workflow, usuários e limpeza
    feedbacks/                       triagem de feedbacks
    handoffs/                        handoffs reais e simulados
    ajustes/                         regras/ajustes do agente
    execucoes/                       histórico técnico
    configuracoes/                   placeholder
  app/                               experiência do cliente
    page.tsx                         dashboard do próprio cliente
    analista/                        análise conversacional do próprio tenant
    conversas/                       conversas reais do próprio cliente
    area-testes/                     teste do agente
    feedbacks/                       feedbacks do cliente
    handoffs/                        handoffs do cliente
    execucoes/                       histórico técnico do cliente
    configuracoes/                   leitura de dados básicos
  components/                        UI compartilhada (app-sidebar, handoff-cards, pausa do agente)
    form-submit-button.tsx           estado pendente uniforme para Server Actions e filtros
    app-route-loading.tsx            fallback imediato durante navegação entre páginas
  api/analista/                      fila, status, ferramentas, callback e rotas legadas da IA
  login/                             login
lib/
  analyst/                           escopo, dados, orquestração n8n e implementação OpenAI legada
  auth/access-context.ts             autorização central por perfil, tenant, status e operação
  auth/profile.ts                    resolução de usuário e perfil
  auth/user-link-pending.ts          recuperação de vínculos Auth que falharam
  conversations/message-display.ts  ordenação e expansão visual de mensagens
  dashboard/date-range.ts            períodos e fusos
  dashboard/message-metrics-data.ts  consultas enxutas das métricas por período
  dashboard/operational-metrics.ts   definições das métricas centrais
  metrics/external-client-metrics.ts Supabase externo e agendamentos
  omnichannel/                       contratos e lógica pura local do Lote 2
  redis/agent-locks.ts               travas do agente no Redis (server-only)
  redis/pause-durations.ts           opções de pausa manual (seguro p/ client)
  supabase/                          clientes browser, SSR, admin e paginação concorrente
  workflows/                         contratos públicos e DAL privado de workflows
public/lexia/                        símbolos claro e escuro da Lexia
contracts/omnichannel/v1/            JSON Schemas provisórios e exemplos sintéticos
n8n/omnichannel/                     mestre e subworkflows locais, inativos e sem rede
n8n/miranda-v2-candidate/            referência detalhada e inativa dos seis papéis
n8n/miranda-v2-lab-runtime/          fixtures compactas preservadas do Agent Test
supabase/migrations/                 migrations incrementais versionadas
supabase/checks/                     preflight e verificação pós-migration
supabase/operations/                 operações explícitas fora de transação
tests/                               testes do Lote 1 e contratos locais do Lote 2
```

Arquivos de referência:

- `Agent.MD`: este mapa e os contratos atuais.
- `PLAN.MD`: riscos, prioridades e evolução planejada.
- `AGENTS.md`: regras obrigatórias para agentes de código.
- `app/globals.css`: base visual e fundo das conversas.
- `lib/dashboard/operational-metrics.ts`: fonte de verdade das fórmulas centrais.
- `lib/metrics/external-client-metrics.ts`: mapa atual de integrações de agendamento.
- `lib/conversations/message-display.ts`: comportamento visual das mensagens.
- `docs/LOTE_1_AUTORIZACAO_WORKFLOWS.md`: runbook completo do Lote 1.
- `docs/LOTE_2_WORKFLOW_MESTRE_OMNICHANNEL.md`: especificação, contratos,
  ordem de construção e gates do Lote 2.

## 7. Rotas

### Públicas

| Rota | Função |
| --- | --- |
| `/` | Redireciona para `/login`. |
| `/login` | Login por e-mail e senha. |

### Cliente

| Rota | Função | Navegação lateral |
| --- | --- | --- |
| `/app` | Dashboard do cliente. | Sim |
| `/app/analista` | Chat analítico isolado do próprio cliente. | Sim |
| `/app/conversas` | Conversas reais. | Sim |
| `/app/area-testes` | Simulação do agente. | Sim |
| `/app/handoffs` | Handoffs reais e simulados. | Sim |
| `/app/feedbacks` | Histórico de feedbacks. | Sim |
| `/app/execucoes` | Histórico técnico de testes. | Não |
| `/app/configuracoes` | Dados do cliente, workflows e acesso. | Não |

### Administração

| Rota | Função | Navegação lateral |
| --- | --- | --- |
| `/admin` | Dashboard agregado. | Sim |
| `/admin/analista` | Chat analítico com seleção explícita de cliente. | Sim |
| `/admin/area-testes` | Testes separados por cliente. | Sim |
| `/admin/conversas` | Conversas por cliente. | Sim |
| `/admin/handoffs` | Gestão de handoffs. | Sim |
| `/admin/feedbacks` | Triagem de feedbacks. | Sim |
| `/admin/clientes/novo` | Criação de cliente. | Não |
| `/admin/clientes/[slug]` | Detalhe e gestão do cliente. | Não |
| `/admin/ajustes` | Ajustes/regras do agente. | Não |
| `/admin/execucoes` | Execuções com detalhes brutos. | Não |
| `/admin/configuracoes` | Placeholder. | Não |

### API do Analista Lexia

| Rota | Método | Função |
| --- | --- | --- |
| `/api/analista/chat` | `POST` | Autentica, fixa o escopo, grava a pergunta e despacha uma execução assíncrona para o n8n. Retorna HTTP 202. |
| `/api/analista/status` | `GET` | Permite ao navegador acompanhar exclusivamente uma execução do próprio usuário/tenant. |
| `/api/analista/sessions` | `GET` | Lista ou abre sessões e informa se existe execução pendente. |
| `/api/analista/n8n/tool` | `POST` | API server-to-server assinada com ferramentas somente leitura e escopo reconstruído da execução. |
| `/api/analista/n8n/callback` | `POST` | Recebe resultado assinado, valida fontes, persiste a resposta e encerra a execução. |
| `/api/analista/cron/classificar` | `POST` | Classificação agendada. Sem usuário logado: autoriza por `Authorization: Bearer LEXIA_CRON_SECRET` comparado em tempo constante. Chamada pelo n8n (Schedule Trigger + HTTP Request). |
| `/api/analista/analyze` | `POST` | Legado: classificação direta via OpenAI; não é chamada pela página atual. |
| `/api/analista/coverage` | `GET` | Legado: cobertura dos insights persistidos. |

Corpo aceito por `/api/analista/cron/classificar`, todos opcionais: `cliente_slug`
(restringe a um cliente; o padrão percorre todos os `lexia_clientes` ativos),
`limite` (conversas por cliente, 1–8, padrão 4), `paralelas` (conversas
simultâneas, 1–6, padrão 4), `dias` (janela de histórico,
1–366, padrão 90), `orcamento_ms` (corte de tempo, 5 000–54 000, padrão 50 000)
e `apenas_medir: true` (mede a leitura do histórico e devolve a cobertura sem
chamar a OpenAI, para separar lentidão de banco de lentidão de classificação).

A resposta traz `analyzed`, `failed`, `pending`, `skipped` (conversas que não
couberam no orçamento), `skippedForTime` (clientes não iniciados), `durationMs`
e o mesmo detalhamento por cliente em `clientes[]`. O orçamento é verificado
antes de cada conversa, não só entre clientes: a função devolve resultado
parcial em vez de ser morta pelo `maxDuration` de 60 s da Vercel. Nenhuma
transcrição sai da plataforma — o n8n apenas agenda, e a chamada à OpenAI
continua em `lib/analyst/classifier.ts`.

No `classifyConversation`, modelos de raciocínio (`gpt-5*`, `o1`, `o3`, `o4`)
recebem `reasoning.effort: "low"` e `max_output_tokens: 6000`. Em 22/09/2026 a
classificação falhava com `Unterminated string in JSON`: os tokens de
raciocínio saem do mesmo orçamento do JSON, e com o esforço padrão sobrava
pouco para a resposta do schema. Ao trocar de modelo, conferir os dois valores
juntos. Resposta cortada é detectada por `response.status === "incomplete"` e
reportada com o motivo, em vez de estourar no `JSON.parse`.

Medição em 22/09/2026 no `miranda_skin_experts`: uma conversa levou 20,9 s e
duas levaram 42,1 s. A leitura do histórico é desprezível; o custo é a espera
pela OpenAI, cerca de 21 s por conversa. Por isso o `analyzeConversationBatch`
processa as conversas em ondas paralelas de `concurrency` (padrão 4), e não
uma a uma. Cada requisição tem `timeout` de 40 s, e uma onda nova só começa se
o tempo restante cobrir a onda mais lenta já observada com 30% de folga — as
conversas que não couberem voltam em `skipped`, sem erro. `limite` acima de
`paralelas` gera mais de uma onda e quase sempre estoura o orçamento; manter
os dois valores iguais.

O `orcamento_ms` é uma parede, não um aviso: o `timeout` de cada requisição à
OpenAI é encurtado para o que sobra dele, então nenhuma chamada sobrevive ao
prazo do ciclo. Um cliente novo só começa com pelo menos 20 s de folga, para
não produzir uma rodada inteira de execuções abortadas. Em 23/09/2026 um ciclo
com quatro clientes levou 47,9 s dos 60 s da rota, com a margem vindo dessas
duas regras.

`listActiveClients` embaralha os clientes. Em ordem alfabética fixa, o
orçamento se esgotava sempre nos primeiros e `miranda_skin_experts`, por ser o
último, nunca era classificado. O embaralhamento distribui as vagas ao longo
das execuções sem precisar guardar de quem foi a vez anterior.

As rotas do navegador resolvem novamente usuário, role, status e tenant no servidor. As rotas do n8n validam o Bearer e reconstroem esse mesmo escopo a partir da execução persistida. Para roles de cliente, qualquer `clienteSlug` enviado pelo navegador é ignorado.

Rotas fora da navegação devem ser preservadas. A ausência no menu não significa que estejam obsoletas.

## 8. Autenticação, Perfis e Isolamento

### Login

1. `loginAction` chama `supabase.auth.signInWithPassword`.
2. `getLoggedInUserProfile` chama `auth.getUser()`.
3. O perfil é lido de `lexia_usuarios_clientes` por `user_id`.
4. `getLoggedInUserProfile` usa `React.cache`, portanto layout e página compartilham a mesma leitura somente dentro da requisição atual; não existe cache de sessão entre usuários ou requisições.
5. Sem perfil, a sessão é encerrada.
6. `lexia_admin` entra em `/admin/area-testes`.
7. `cliente_admin` e `cliente_operador` entram em `/app/area-testes`.

### Roles

- `lexia_admin`: visão global e ações administrativas.
- `cliente_admin`: visão do cliente ao qual está vinculado.
- `cliente_operador`: mesma família de acesso cliente; diferenças finas ainda não foram implementadas na interface.

### Status

Na branch do Lote 1, `lib/auth/access-context.ts` centraliza perfil, papel,
tenant, empresa e natureza da operação:

- perfil inativo é bloqueado no login, layouts, ações e APIs alteradas;
- usuário cliente acessa somente o slug do próprio vínculo e apenas quando
  `lexia_clientes.status = 'ativo'`;
- admin Lexia ativo mantém leitura administrativa global, inclusive de
  histórico de empresa inativa;
- novas operações, dispatch, retomada e nova análise exigem empresa ativa;
- dispatch com origem `painel_admin` exige admin Lexia e empresa ativa tanto
  na Server Action quanto no DAL; um cliente não ganha esse acesso por conhecer
  IDs de sessão ou workflow do próprio tenant;
- admin pode pausar/conter uma integração ainda ativa mesmo depois de a
  empresa ser inativada;
- callback assinado pode apenas finalizar uma execução registrada antes da
  inativação, sem iniciar ferramenta ou nova consulta analítica.

Essas regras ainda não estão em produção. Dependem da sequência de migrations
e aplicação descrita em `docs/LOTE_1_AUTORIZACAO_WORKFLOWS.md`.

### Clientes Supabase

- `lib/supabase/server.ts`: anon key + cookies do usuário. Deve obedecer RLS.
- `lib/supabase/client.ts`: cliente de navegador. Usa somente URL e anon key públicas.
- `lib/supabase/admin.ts`: service role central, apenas no servidor, ignora RLS.
- Cliente externo de métricas: service role do Supabase dedicado, apenas no servidor.

### RLS

O repositório ainda não possui um baseline completo das políticas. O Lote 1
versiona apenas as policies que precisa endurecer: quatro tabelas do Analista e
`lexia_ajustes_agente`. `supabase/isolated/` contém somente um baseline mínimo
e descartável para os contratos de banco do lote, nunca um baseline de
produção nem um ambiente de smoke da aplicação completa. Portanto:

- Não é possível reconstruir nem auditar completamente a segurança apenas pelo Git.
- Consultas cliente adicionam `cliente_slug`, mas isso não substitui RLS.
- Ações com service role precisam validar role, cliente, ID, sessão e origem no próprio código.
- Empresa inativa precisa ser bloqueada tanto no DAL quanto nas policies de
  leitura direta do cliente.
- Qualquer mudança no Supabase deve ser exportada como migration antes do próximo deploy.
- `site_feedback` permanece inalterada até seu consumidor externo ser
  identificado.
- `lexia_buscar_ajustes_agente` permanece `SECURITY INVOKER` e sem mudança de
  grants/search path até seu consumidor e papel legítimos serem confirmados.

## 9. Variáveis de Ambiente

### Banco central

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

- As duas primeiras são usadas pelo cliente SSR/browser.
- A anon key pode ser pública, mas as políticas RLS devem protegê-la.
- `SUPABASE_SERVICE_ROLE_KEY` é segredo absoluto e só pode existir no servidor.

### Supabase da Miranda

```text
MIRANDA_SUPABASE_URL
MIRANDA_SUPABASE_SERVICE_ROLE_KEY
```

### Supabase da Detail By Cordeiro

```text
DETAIL_BY_CORDEIRO_SUPABASE_URL
DETAIL_BY_CORDEIRO_SUPABASE_SERVICE_ROLE_KEY
```

### Redis (Upstash) da Miranda

```text
MIRANDA_UPSTASH_REDIS_REST_URL
MIRANDA_UPSTASH_REDIS_REST_TOKEN
```

O prefixo segue o `envPrefix` de `lib/redis/agent-locks.ts`. O token dá leitura e escrita no Redis de produção do cliente: é segredo de servidor e nunca pode ser `NEXT_PUBLIC_*`. Sem estas variáveis a secção de pausas não aparece.

### Destinos privados dos workflows

```text
LEXIA_WORKFLOW_ALLOWED_HOSTS
```

Lista de hosts exatos, separados por vírgula, autorizados para cadastro e
dispatch dos workflows de teste. É server-only. Não aceita wildcard, esquema,
caminho ou credenciais embutidas. Na branch do Lote 1, sem essa variável o
cadastro, a edição de destino e o dispatch falham de forma fechada.

### Operações isoladas do Lote 1

Os scripts destrutivos ou com potencial de escrita não inferem produção pela
URL do preview. Eles exigem refs explícitos e confirmações vinculadas ao alvo:

```text
LEXIA_PRODUCTION_SUPABASE_PROJECT_REF
LEXIA_PROTECTED_SUPABASE_PROJECT_REFS       # opcional, CSV
LEXIA_TEST_SUPABASE_PROJECT_REF
LEXIA_TEST_CONFIRM_ISOLATED
LEXIA_DB_OPERATION_URL
LEXIA_DB_OPERATION_EXPECTED_HOST          # obrigatório para Session pooler
LEXIA_DB_OPERATION_SSL_ROOT_CERT          # CA pública oficial, caminho local
LEXIA_DB_OPERATION_EXPECTED_PROJECT_REF
LEXIA_DB_OPERATION_ENVIRONMENT
LEXIA_DB_OPERATION_CONFIRM
LEXIA_DB_OPERATION_PRODUCTION_APPROVAL      # só para produção
```

Em desenvolvimento, os valores ficam exclusivamente no arquivo ignorado
`.env.lote1.test.local`; os scripts o carregam por padrão. A suite mínima de
banco também exige uma linha coerente em `lexia_environment_identity` antes da
primeira escrita. A reconstrução está em `supabase/isolated/README.md` e exige
confirmação humana do `project_ref` antes de qualquer SQL. Destinos de workflow
usam `*.invalid` e não são chamados.

Em redes sem rota IPv6, somente o projeto descartável pode usar o Session
pooler oficial do Supabase: usuário `postgres.<project_ref>`, host exato
repetido em `LEXIA_DB_OPERATION_EXPECTED_HOST` e porta `5432`. A porta `6543`
do Transaction pooler é recusada, assim como pooler em staging ou produção.
`npm run db:lote1:connectivity` valida alvo, refs protegidos e TLS
`verify-full`, incluindo subject e fingerprint da `Supabase Root 2021 CA`,
autentica com o cliente `psql` e encerra com `\q`, sem executar SQL. O script
de índice ainda exige o marcador remoto descartável antes da primeira escrita.

Esse ambiente mínimo cobre migrations, helper de acesso, policies, grants,
RPCs e constraints. Ele não contém `lexia_testes_sessoes`,
`lexia_testes_execucoes`, `lexia_mensagens`, `lexia_contactos`,
`lexia_feedbacks` nem todos os campos de `lexia_clientes`; por isso não serve
para smoke tests ponta a ponta de cadastro ou dispatch. Esses testes exigem um
segundo harness com schema completo, preview isolado e receptor HTTPS falso.

Em 04/10/2026, o projeto descartável `ghwinxmpwqkvqpfkmyve` recebeu o
baseline mínimo, o marcador de identidade, a migration do Analista, o índice
concorrente e as migrations `002` e `003`. A verificação pós-corte e
`npm run test:lote1:db:isolated` passaram. A conferência final encontrou zero
usuários, identidades e registros sintéticos; somente o schema do harness e o
marcador permanente foram preservados. Isso não autoriza nem substitui staging
ou produção.

Em 05/10/2026, o schema adicional do runtime Next no mesmo projeto também foi
verificado. O ensaio completo usou somente usuários e registros sintéticos e
um receptor HTTPS no loopback. Os 13 cenários passaram; a conferência posterior
encontrou novamente zero usuários Auth e zero linhas de produto. O schema e os
marcadores descartáveis foram preservados para novos ensaios.

### Analista Lexia (n8n ativo)

```text
LEXIA_APP_URL
N8N_ANALYST_WEBHOOK_URL
N8N_ANALYST_WEBHOOK_SECRET
```

As três variáveis são server-only. O segredo precisa ter ao menos 32
caracteres e ser o mesmo da credencial Header Auth do n8n. A URL do webhook
precisa ser a Production URL publicada. O contrato completo está em
`docs/LEXIA_CRM_E_ANALISTA_N8N.md`.

O workflow que cumpre esse contrato está versionado em
`n8n/analista-chat.json`, com o passo a passo de importação e as credenciais
esperadas em `n8n/README.md`. O export não contém segredos: as credenciais são
referenciadas por nome e precisam existir no n8n antes da importação.

### Analista Lexia (OpenAI direto, legado)

```text
OPENAI_API_KEY
OPENAI_ANALYST_MODEL                    # opcional; padrão gpt-5-mini
OPENAI_ANALYST_CLASSIFIER_MODEL         # opcional; herda o modelo principal
```

`OPENAI_API_KEY` não é usada pelo fluxo principal da página. Ela permanece
necessária apenas para as rotas legadas de classificação direta. Deve existir
somente no servidor e nunca usar prefixo `NEXT_PUBLIC_*`. O runtime precisa ser
compatível com o SDK instalado e usar Node 22 ou superior.

Regras:

- `.env.local` está ignorado pelo Git.
- Variáveis precisam existir no ambiente Production da Vercel.
- Alterar uma variável na Vercel exige novo deploy para a função usar o valor.
- Não usar espaço depois de `=` em arquivos `.env`.
- Não documentar valores reais.
- Rotacionar qualquer chave colada em chat, ticket ou captura de tela.

## 10. Supabase Central

O Supabase central é a fonte de verdade do painel para autenticação, clientes, mensagens, testes, feedbacks, handoffs e ajustes.

### `lexia_clientes`

Campos atuais:

- `id uuid`, PK.
- `slug text`, identidade estável usada em todas as relações.
- `nome text`.
- `logo_url text`, opcional e ainda não usada pela UI principal.
- `cor_principal text`, opcional.
- `status text`, padrão `ativo`; UI aceita `ativo`, `inativo`, `suspenso`.
- `modo_teste boolean`, padrão `true`.
- `criado_em timestamptz`.
- `atualizado_em timestamptz`.

Importante: `modo_teste` é hoje majoritariamente informativo na aplicação web. Ele exibe estado/banners, mas não bloqueia produção. A Área de Testes sempre envia `lexia_modo_teste: true` em seu próprio payload.

### `lexia_workflows`

- `id uuid`, PK.
- `cliente_slug text`, FK para `lexia_clientes.slug`.
- `nome text`.
- `tipo text`.
- `webhook_url text`.
- `status text`; UI aceita `ativo`, `inativo`, `teste`.
- `criado_em timestamptz`.
- `atualizado_em timestamptz`.

A Área de Testes lista apenas workflows `ativo`. A tela de detalhe exibe todos,
mas o formulário de configurações edita somente o primeiro workflow ativo, ou
o primeiro da lista. Não existe ainda gestão completa de múltiplos workflows
pela UI.

Na branch do Lote 1:

- a UI nunca recebe `webhook_url`, nem mesmo para o admin;
- a tela recebe apenas `webhookConfigured`;
- criar e editar exige `requireLexiaAdmin()` e usa `service_role` no servidor;
- URL vazia na edição preserva o destino atual;
- cliente pode somente disparar um workflow ativo do próprio tenant;
- o destino precisa usar HTTPS e host presente em
  `LEXIA_WORKFLOW_ALLOWED_HOSTS`;
- a migration de corte revoga leitura ampla e escrita de `authenticated`,
  inclusive para JWT de admin, concede SELECT apenas às colunas públicas,
  habilita RLS explicitamente e preserva as policies de admin e tenant.

O corte de grants só pode acontecer depois de a versão compatível da aplicação
estar ativa no ambiente. Ver `docs/LOTE_1_AUTORIZACAO_WORKFLOWS.md`.

### `lexia_usuarios_clientes`

- `id uuid`, PK.
- `user_id uuid`, corresponde a `auth.users.id`.
- `cliente_slug text`, nulo para admin global.
- `role text`.
- `status text`, padrão `ativo`.
- `criado_em timestamptz`.

O código assume no máximo um perfil por `user_id`, pois usa `maybeSingle()`.
O Lote 1 formaliza essa regra com `UNIQUE(user_id)` e uma constraint de escopo:
admin global usa `cliente_slug` nulo; papéis cliente exigem slug. O índice é
criado concorrentemente fora de transação antes de ser anexado pela migration.

### `lexia_contactos`

- `id uuid`, PK.
- `cliente_slug text`, FK.
- `nome text`, opcional.
- `telefone text`, opcional.
- `canal text`, padrão `whatsapp`.
- `identificador_conversa text`.
- `criado_em timestamptz`.
- `atualizado_em timestamptz`.

Canais de produção esperados: `whatsapp`, `instagram`, `messenger`.
Canais de teste já existentes: `painel_cliente`, `painel_admin`.

Invariante lógica: uma conversa é identificada pelo par `cliente_slug + identificador_conversa`. O painel lateral nasce dos contactos. Mensagens sem um contacto correspondente podem não aparecer na lista, mesmo existindo em `lexia_mensagens`.

### `lexia_mensagens`

- `id uuid`, PK.
- `cliente_slug text`, FK.
- `contacto_id uuid`, FK opcional.
- `identificador_conversa text`.
- `direccao text`.
- `tipo text`, padrão `texto`.
- `conteudo text`.
- `origem text`, padrão `workflow`.
- `criado_em timestamptz`.

Valores reais auditados:

- `direccao`: `recebida`, `enviada`.
- `tipo`: `texto`, `imagem`, `video`, `audio`, `documento`, `outro`.
- `origem`: `workflow`, `humano`, `painel_cliente`, `recebida_na_pausa`, `followup_agente`, `followup_rapido`.

Não renomear `direccao` para a grafia brasileira sem migration coordenada. O nome atual faz parte do contrato com n8n e aplicação.

Conversas de teste usam `identificador_conversa` iniciado por `teste:`. As telas e métricas de produção excluem esse prefixo.

### `lexia_testes_sessoes`

- `id uuid`, PK.
- `cliente_slug text`, FK.
- `session_id text`.
- `nome text`, opcional.
- `origem text`: `painel_cliente` ou `painel_admin`.
- `status text`, atualmente `activa`.
- `criado_em timestamptz`.
- `atualizado_em timestamptz`.

Cliente e admin têm históricos isolados pela coluna `origem`.

### `lexia_testes_execucoes`

- `id uuid`, PK.
- `cliente_slug text`, FK.
- `session_id text`.
- `run_id text`.
- `teste_id text`.
- `origem text`.
- `rota text`.
- `mensagem_teste text`.
- `resposta_obtida text`.
- `mensagens jsonb`.
- `raw_agente text`.
- `raw_contexto text`.
- `raw_handoff text`.
- `erro text`.
- `criado_em timestamptz`.

O `run_id` correlaciona uma chamada da Área de Testes à linha gravada posteriormente pelo workflow.

### `lexia_feedbacks`

- `id uuid`, PK.
- `cliente_slug text`, FK.
- `teste_execucao_id uuid`, FK opcional.
- `origem text`: normalmente `painel_cliente` ou `painel_admin`.
- `avaliacao text`.
- `comentario text`.
- `mensagem_cliente text`.
- `resposta_agente text`.
- `status text`, padrão `pendente`.
- `criado_por uuid`.
- `criado_em timestamptz`.

Avaliações de teste: `boa_resposta`, `precisa_ajuste`, `erro_grave`.
Status administrativos aceitos pela UI: `pendente`, `analisado`, `resolvido`.

Feedback de conversa real não possui colunas próprias para categoria e message ID. Esses dados são serializados em `comentario` no formato:

```text
Categoria: ...
Conversa: ...
Mensagem ID: ...
Origem: app_conversas
Observação: ...
```

Esse formato é contrato temporário e o parser compartilhado depende dele.

### `lexia_handoffs`

- `id uuid`, PK.
- `cliente_slug text`, FK.
- `session_id text`, opcional.
- `telefone text`.
- `nome_contacto text`.
- `motivo text`.
- `prioridade text`, padrão `normal`.
- `resumo text`.
- `status text`, padrão `pendente`.
- `dados jsonb`.
- `origem text`, padrão `workflow`.
- `criado_em timestamptz`.
- `atualizado_em timestamptz`.

Status da UI: `pendente`, `em_atendimento`, `resolvido`, `perdido`.

### `lexia_ajustes_agente`

- Base usada pela UI: `id`, `cliente_slug`, `modulo`, `titulo`, `gatilho`, `comportamento_correto`, `prioridade`, `activo`, `origem_feedback_id`, `criado_por`, `atualizado_por`, timestamps.
- Campos adicionais existentes no banco: `tipo`, `situacao`, `gatilhos text[]`, `exemplo_resposta`, `exigir_tool`, `metadata jsonb`, `aplicar_sempre`, `aprovado`.

A UI atual edita apenas o subconjunto base. O consumo dessas regras pelo agente acontece fora deste repositório e precisa ser confirmado no n8n antes de alterar o contrato.

### Tabelas do Analista Lexia

Criadas por `supabase/migrations/202609220001_lexia_ai_analyst.sql`:

- `lexia_ai_sessoes`: sessão de chat por `cliente_slug + criado_por`, título, status e contexto de período/canal.
- `lexia_ai_mensagens`: perguntas e respostas da sessão, fontes e metadata do modelo/ferramentas.
- `lexia_conversation_insights`: uma classificação incremental por `cliente_slug + identificador_conversa`, com resumo, intenção, etapa, sentimento, objeções, qualidade, evidências, cobertura da fonte, modelo e versão do prompt.
- `lexia_ai_execucoes`: auditoria de chat/classificação, período, canal, ferramentas, fontes, tokens, duração e erro sanitizado.

As quatro tabelas usam RLS. Sessões e mensagens só podem ser vistas pelo autor
autenticado; insights só podem ser lidos por admin ou por perfil ativo do
próprio tenant; escrita de insights e execuções acontece exclusivamente no
backend com service role após autorização. O Lote 1 preserva dono, sessão e
tenant nas policies, acrescenta empresa ativa ao acesso cliente e restringe a
inserção direta de mensagens a `papel = 'usuario'`.

O Lote 1 também cria RPCs somente para `service_role`:

- `lexia_reivindicar_ferramenta_analista`: aceita ferramenta apenas enquanto a
  execução segue `iniciada`;
- `lexia_finalizar_execucao_analista`: trava a execução e finaliza mensagem,
  auditoria e sessão de forma transacional e idempotente. Retry igual não
  altera o resultado; retry divergente retorna conflito. Dentro do mesmo lock,
  une os claims de ferramenta já persistidos às ferramentas válidas do
  callback e grava a mesma lista na execução e na metadata da resposta.

Rollback destrutivo: `supabase/rollbacks/202609220001_lexia_ai_analyst_down.sql`. Fazer export das quatro tabelas antes de executar em ambiente com histórico real.

## 11. Supabase Externos e Agendamentos

As métricas externas são configuradas em código em `lib/metrics/external-client-metrics.ts`. Cadastrar um cliente no banco central não conecta automaticamente seu banco de métricas.

### Miranda Skin Experts

- `cliente_slug`: `miranda_skin_experts`.
- Fuso do dashboard: `America/New_York`.
- Prefixo de ambiente: `MIRANDA`.
- Tabela: `agendamentos_miranda_skin`.
- Data usada para entrar no período: `criado_em`.
- Data usada para dia da semana do agendamento: `inicio`.
- Status válido: `confirmado`.
- Serviço: `servico`.
- Não aplica filtro de slug, pois o banco/tabela são dedicados.

Campos conhecidos da tabela:

`id`, `event_id`, `nome_cliente`, `telefone`, `email`, `servico`, `variante`, `profissional`, `inicio`, `fim`, `status`, `idioma`, `resumo_queixa`, flags de lembrete, `criado_via`, `criado_em`.

Existe no Supabase da Miranda uma tabela `lexia_followups`, mas a aplicação web não a consulta hoje. As métricas de follow-up vêm das mensagens centrais com origem apropriada.

### Detail By Cordeiro

- `cliente_slug`: `detail_by_cordeiro`.
- Fuso do dashboard: `Europe/Lisbon`.
- Prefixo de ambiente: `DETAIL_BY_CORDEIRO`.
- Tabela: `marcacoes`.
- Data usada para entrar no período: `criado_em`.
- Data usada para dia da semana: `data_inicio`.
- Status válidos: `confirmada`, `pendente_sinal`.
- Serviço: `servico`.
- Aplica `cliente_slug = detail_by_cordeiro`.

Campos conhecidos:

`id`, `cliente_slug`, `contacto_id`, `nome_cliente`, `telefone`, `servico`, `tipo`, `viatura`, `categoria_veiculo`, `data_inicio`, `data_fim`, `executor`, `valor_previsto`, `sinal_valor`, `estado`, `event_id_google`, `calendario_id`, `observacoes_cliente`, `criado_em`, `actualizado_em`.

### Semântica importante

Um “agendamento realizado no período” significa agendamento válido cujo registro foi criado no período, usando `criado_em`. Não significa consulta marcada para ocorrer dentro do período.

A “relação com agendamentos” é:

```text
agendamentos válidos criados no período / conversas iniciadas no período
```

Não existe atribuição individual entre conversa e agendamento. O texto da UI já deixa isso explícito.

### Falha da integração externa

- Sem configuração: `appointments = null` e UI mostra `--`.
- Erro de consulta: erro é registrado no servidor e o painel devolve valores vazios/nulos.
- `isConfigured` indica presença das variáveis, não sucesso da consulta.
- As consultas usam service role e paginam em blocos de 1.000.
- A consulta do período seleciona apenas as colunas necessárias para contagem, serviço e dia.
- Desde 01/10/2026, o dashboard não calcula nem exibe clientes recorrentes e não consulta o histórico anterior de agendamentos para essa finalidade.

## 12. Contrato com n8n e Canais

### Produção

Este repositório não recebe webhooks dos canais. O n8n é responsável por:

1. Receber o evento de WhatsApp, Instagram ou Messenger.
2. Determinar `cliente_slug`, canal e conversa.
3. Criar/atualizar `lexia_contactos`.
4. Gravar cada mensagem em `lexia_mensagens`.
5. Executar agente, Redis e ferramentas.
6. Gravar resposta enviada e origem correta.
7. Criar handoff, agendamento ou outros registros quando aplicável.

Mensagens enviadas diretamente pelo WhatsApp, Instagram, Messenger ou Meta
Business Suite só aparecem no painel se o pipeline também consumir o evento de
eco/saída e o inserir em `lexia_mensagens`. A interface não consulta o histórico
dos provedores em tempo real.

Contrato mínimo de contacto:

- Mesmo `cliente_slug` da mensagem.
- Canal normalizado em minúsculas.
- `identificador_conversa` estável e igual ao das mensagens.
- `atualizado_em` atualizado quando a conversa recebe atividade.

Contrato mínimo de mensagem:

- Uma linha por evento de mensagem sempre que possível.
- `direccao` exatamente `recebida` ou `enviada`.
- `tipo` normalizado.
- `conteudo` com texto ou URL/marcação de mídia.
- `origem` semanticamente correta.
- `criado_em` representando o evento real, não o horário tardio de um job.

### Origens

- `workflow`: resposta automática normal.
- `humano`: intervenção humana fora do painel cliente.
- `painel_cliente`: resposta/intervenção humana feita pelo painel.
- `recebida_na_pausa`: mensagem recebida enquanto o agente estava pausado.
- `followup_agente`: follow-up automático normal do agente.
- `followup_rapido`: retomada rápida de um subconjunto de leads de anúncio sem resposta.

`followup_rapido` não identifica todos os leads de anúncio. Leads que respondem antes do disparo não recebem essa origem. Uma futura métrica de anúncios exige marcador próprio gravado pelo n8n.

### Travas do agente no Redis

Contrato partilhado entre o painel e os workflows da Miranda. O namespace é `lexia:novo_cliente:{canal}:v1` e o `identificador_conversa` tem o formato `{canal}:{dígitos}`, igual ao de `lexia_contactos`.

| Trava | Chave | Valor | Validade | Quem grava | Painel |
| --- | --- | --- | --- | --- | --- |
| Pausa manual | `{namespace}:pausa_manual:{identificador_conversa}` | qualquer valor não vazio; o painel grava JSON de auditoria | 10, 30, 60 min ou sem validade | painel | lê, grava e apaga |
| Pausa pós-agendamento | `{namespace}:pausa_eterna:{identificador_conversa}` (só WhatsApp) | `agendado` | sem validade | workflow `criar_agendamento` | lê e apaga |
| Intervenção humana ou handoff | `{namespace}:status:{identificador_conversa}` | `Desativado` | 15 min (intervenção) ou 24 h (handoff alta/urgente) | omnichannel e Cérebro | só leitura |

Regras:

- O omnichannel lê `pausa_manual` antes de `Agente desativado?` e antes de `Samuel Continuou?`. Qualquer valor não vazio pausa; `DEL` despausa.
- Intervenção humana e handoff partilham a mesma chave e o mesmo valor, por isso o painel não os distingue.
- Os detalhes do handoff (motivo, resumo, prioridade) não ficam no Redis nem em `lexia_handoffs`; hoje só vão na notificação de WhatsApp para a equipa.
- Mudar o formato de qualquer chave exige alterar `lib/redis/agent-locks.ts` e este documento no mesmo commit.
- A listagem usa `SCAN` com filtro por namespace e lê `GET` + `TTL` em pipeline. Há limite de 500 travas por consulta.

### Área de Testes

O painel faz `POST` server-side para o destino privado do workflow ativo. Na
branch do Lote 1, o navegador envia apenas o ID público; o servidor valida
perfil, empresa ativa, tenant, sessão, origem, workflow ativo e host permitido,
carrega `webhook_url` com `service_role` e gera o `run_id`:

```json
{
  "lexia_modo_teste": true,
  "lexia_origem": "painel_cliente ou painel_admin",
  "lexia_session_id": "uuid da sessão",
  "lexia_run_id": "uuid da chamada",
  "lexia_teste_id": "",
  "lexia_workflow_id": "uuid do workflow",
  "lexia_workflow_tipo": "tipo cadastrado",
  "message": {
    "type": "text",
    "text": "mensagem digitada"
  }
}
```

O endpoint precisa responder HTTP 2xx. Depois, o workflow deve gravar em `lexia_testes_execucoes` uma linha com o mesmo `cliente_slug`, `session_id`, `run_id` e `origem`.

O POST usa timeout de 12 segundos e recusa redirects. Cliente operacional pode
somente disparar o workflow autorizado do próprio tenant; cadastro, edição e
leitura do destino são exclusivos do admin Lexia no servidor.

`painel_admin` não é apenas um valor de origem: ele exige admin Lexia e empresa
ativa antes de qualquer leitura privilegiada. `painel_cliente` continua preso
ao único tenant do perfil cliente.

A UI consulta a execução a cada 2 segundos, por até 45 tentativas, aproximadamente 90 segundos. Não existe callback HTTP para a aplicação.

O campo `mensagens` pode ser array JSON, objeto, JSON serializado ou texto. O parser procura `text`, `content`, `message` ou `resposta`, com fallback em `resposta_obtida`.

## 13. Conversas

### Lista lateral

- É construída a partir de `lexia_contactos`.
- Exclui `identificador_conversa LIKE 'teste:%'`.
- Pode ser filtrada por WhatsApp, Instagram e Messenger.
- O filtro de período considera conversas que possuem ao menos uma mensagem no intervalo.
- A contagem lateral é de conversas visíveis, não de mensagens.
- A ordenação usa a última mensagem do período; sem mensagem, usa `atualizado_em` e depois `criado_em`.

### Painel da conversa

- Ao selecionar uma conversa, carrega o histórico inteiro, independentemente do filtro lateral.
- Ordena por `criado_em` ascendente e, em empate, por `id` ascendente.
- Tem rolagem própria.
- Abre no fim e reage ao ID da última mensagem.
- Em desktop, o workspace ocupa a altura útil do viewport; filtros, lista lateral, cabeçalho, fuso e metadados dos balões usam uma densidade compacta para priorizar o histórico visível.
- Insere separadores de dia no fuso selecionado.
- Balões recebidos ficam à esquerda; enviados, à direita.
- Cliente e admin usam o mesmo helper de preparação visual.

### Caixa de entrada e filtros

- A lista abre com todos os canais misturados e ordenados pela atividade mais recente, no estilo de uma caixa de entrada única.
- Sem parâmetros na URL, a tela usa `Este Mês`, `Todos os canais` e `Brasil`; o filtro também oferece `Todo o período` para consultar o histórico desde o primeiro registro.
- Busca por nome ou telefone fica sempre visível na barra superior, ignora acentos e maiúsculas e pesquisa todos os contactos do tenant, mesmo quando a última atividade ocorreu fora do período selecionado.
- Canal, período e fuso ficam recolhidos no popover `Filtros`. O resumo do escopo permanece visível na barra sem ocupar a coluna da lista.
- Ao abrir um resultado da busca, o painel continua carregando o histórico completo da conversa.

### Filtros de período

- `Hoje`.
- `Esta Semana`, de segunda a domingo.
- `Este Mês`.
- `Personalizada`, com fim inclusivo na UI e intervalo interno semiaberto.

O período é sempre representado internamente como `[start, end)`: início inclusivo, fim exclusivo.

### Fusos disponíveis na tela de conversas

- Brasil: `America/Sao_Paulo`.
- Lisboa: `Europe/Lisbon`.
- New York: `America/New_York`.

O padrão atual da tela de conversas é Brasil, mesmo para clientes de outro fuso. O usuário pode trocar manualmente. O dashboard, por outro lado, usa o fuso fixo configurado por cliente.

### Renderização de conteúdo

`lib/conversations/message-display.ts`:

- Normaliza sinônimos de imagem, vídeo, áudio e documento.
- Detecta URL HTTP direta para mídia.
- Interpreta blocos legados `<ContextoImagem>` e `<ContextoVideo>`.
- Divide texto recebido em mais de um balão quando uma única linha do banco contém blocos separados por linha em branco.
- Não divide texto enviado, para preservar respostas legítimas com vários parágrafos.

Essa divisão é uma heurística de apresentação. Ela não recupera timestamp, ID ou ordem original de mensagens que o n8n tenha agregado em uma única linha.

### Mobile

- Abaixo de `lg`, a navegação vira barra superior fixa com menu hambúrguer (`app/components/app-sidebar.tsx`).
- Em Conversas, o mobile segue o padrão do WhatsApp: a lista ocupa a tela e, quando a URL tem `conversa`, o chat abre em tela cheia com botão de voltar. Sem o parâmetro, o mobile mostra só a lista; o desktop continua a selecionar a primeira conversa.
- O chat aberto usa `100dvh`, cabeçalho compacto, controles horizontais e espaçamento reduzido entre balões, mantendo o histórico como área dominante da tela.
- A aba de Handoffs usa cartões (`app/components/handoff-cards.tsx`) em vez de tabelas.

### Limitação para ser “espelho do WhatsApp”

O schema atual não possui:

- ID da mensagem do provedor, como `wamid`.
- Timestamp original do provedor separado de `criado_em`.
- Número de sequência.
- Relação de resposta/citação.
- Status enviado, entregue e lido.
- Caption e metadados de mídia estruturados.
- URL de mídia durável controlada pela Lexia.
- Restrição idempotente por evento do provedor.

Alguns eventos históricos foram gravados agrupados. Portanto, a UI atual é uma boa representação do que está salvo, mas não pode garantir uma cópia literal histórica. A correção completa começa no n8n e no schema, conforme `PLAN.MD`.

## 14. Métricas do Dashboard

As definições abaixo são contrato de produto. Não mudar sem aprovação e teste com dados conhecidos.

### Intervalos e fusos

- Cliente: todas as métricas centrais usam o fuso daquele cliente.
- Admin com cliente selecionado: usa o fuso do cliente.
- Admin com todos: cada cliente recebe seu próprio intervalo para a maioria dos cálculos.
- Heatmap admin geral: usa atualmente `America/Sao_Paulo`, não um agregado por fuso.
- Fim de intervalo é exclusivo.
- A data final personalizada é inclusiva para o usuário e convertida para o início do dia seguinte.

### Conversas iniciadas

1. Busca as mensagens do período e separa as conversas que tiveram mensagem `recebida`.
2. Para essas candidatas, consulta somente mensagens recebidas anteriores ao início do período, em lotes de identificadores.
3. Agrupa por `cliente_slug + identificador_conversa` e elimina toda candidata que já possuía entrada anterior.
4. As restantes são exatamente as conversas cuja primeira mensagem recebida caiu no período.

Isso preserva a definição anterior sem transferir todo o histórico de todos os clientes para cada abertura do dashboard. A implementação fica em `lib/dashboard/message-metrics-data.ts`.

### Conversas ativas

Quantidade de conversas distintas com ao menos uma mensagem, recebida ou enviada, dentro do período.

### Mensagens recebidas e enviadas

Contagem de linhas em `lexia_mensagens` no período por `direccao`. Se o n8n juntar várias mensagens reais em uma linha, o dashboard conta uma linha, não todos os balões originais.

### Novos contactos

Contactos distintos cujo `criado_em` está no período.

### Conversas por canal

Usa as conversas iniciadas e encontra o canal no contacto correspondente. Sem contacto, entra como canal não identificado.

### Agendamentos realizados

Quantidade de linhas externas com status válido e `criado_em` dentro do período.

### Relação com agendamentos

`agendamentos / conversas iniciadas * 100`.

É uma relação agregada, não atribuição de conversão por lead.

Quando o admin filtra canal, a métrica de agendamentos fica indisponível porque as tabelas externas não registram o canal de origem de forma confiável.

### Autonomia do agente

- Dado confiável somente a partir de `01/08/2026`.
- Períodos anteriores são truncados para essa data.
- Conversa com intervenção é aquela que contém origem `humano` ou `painel_cliente`.
- Fórmula: `(conversas ativas - conversas com intervenção) / conversas ativas`.

`recebida_na_pausa` não é intervenção de saída. Origens humanas anteriores a agosto não foram historicamente gravadas, por isso não se deve exibir 100% para datas antigas.

### Follow-ups enviados

Contagem de mensagens `enviada` cuja origem é `followup_agente` ou `followup_rapido` dentro do período.

### Recuperação de follow-up rápido

1. Seleciona conversas com ao menos um `followup_rapido` no período.
2. Encontra o primeiro follow-up rápido do período.
3. Considera recuperada se existir mensagem `recebida` posterior a ele no histórico carregado, que atualmente termina no fim do período.
4. Taxa: conversas recuperadas / conversas que receberam follow-up rápido.

Não representa todos os leads de anúncio.

### Atendimento fora do horário

- Considera mensagens `enviada` não humanas.
- Exclui origem `humano` e `painel_cliente`.
- Fora do horário significa sábado, domingo, antes de 09:00 ou a partir de 19:00 no fuso do cliente.
- Percentual sobre todas as mensagens automáticas enviadas consideradas.

### Primeira resposta média

- Considera apenas conversas cuja primeira mensagem recebida caiu no período.
- Procura a primeira mensagem enviada automática posterior.
- Exclui `humano` e `painel_cliente`.
- Descarta amostras negativas e respostas acima de 1 hora.
- Mostra média e número de amostras.

### Serviços mais agendados

Ranking das 6 maiores contagens pelo campo de serviço da tabela externa.

### Agendamentos por dia

Usa a data marcada para atendimento (`inicio` ou `data_inicio`) no fuso do cliente, embora a entrada no período seja definida por `criado_em`.

### Horários de pico

Conta mensagens recebidas por dia da semana e hora no fuso aplicado.

## 15. Área de Testes

Fluxo cliente:

1. Criar sessão com origem `painel_cliente`.
2. Selecionar workflow ativo.
3. Enviar mensagem ao webhook.
4. Fazer polling pela execução com mesmo `run_id`.
5. Renderizar resposta.
6. Permitir avaliação.

Fluxo admin é equivalente, mas usa `painel_admin` e exige selecionar o cliente.

Feedback cliente:

- `boa_resposta`.
- `precisa_ajuste`.
- `erro_grave`.
- Um feedback por execução e usuário é atualizado se já existir.

Falhas comuns:

- Workflow não está `ativo`.
- `webhook_url` ausente/incorreta.
- Webhook não responde 2xx.
- n8n não grava `run_id` recebido.
- n8n grava origem, sessão ou cliente diferentes.
- RLS bloqueia a leitura da execução.
- Resposta demora mais de 90 segundos.

O `fetch` do webhook não tem timeout explícito nem `try/catch` para falha de rede. Isso está no plano de robustez.

## 16. Feedbacks, Handoffs e Ajustes

### Feedback de conversa real

- Só pode marcar mensagem enviada.
- Busca a última mensagem recebida anterior à resposta.
- Salva categoria, conversa e message ID no texto de `comentario`.
- Categorias graves mapeiam para `erro_grave`; demais para `precisa_ajuste`.

Categorias atuais:

- Resposta errada.
- Contexto perdido.
- Tom inadequado.
- Preço/serviço errado.
- Handoff em falta.
- Handoff indevido.
- Outro.

### Handoffs

- Handoffs reais vêm de `lexia_handoffs`.
- Execuções de teste com rota de handoff podem aparecer como simuladas.
- Cliente só atualiza handoffs do próprio slug.
- Exclusão simulada remove feedback relacionado e execução, não um handoff real.

### Pausas do agente

- Secção "Agente pausado" no topo de `/app/handoffs` e `/admin/handoffs`, em cartões, e uma linha compacta com estado e botão no cabeçalho da conversa em `/app/conversas` e `/admin/conversas`.
- "Pausar agente" abre um painel com as durações (bottom sheet no mobile, modal no desktop). "Retomar agente" apaga a pausa manual e, com confirmação, a pausa pós-agendamento. A trava `status` é só leitura.
- Renderizadas dentro de `Suspense`: lentidão ou falha do Redis não bloqueia a página e mostra "indisponível".
- As Server Actions de `app/actions/agent-pause.ts` exigem perfil com `status = ativo`. Para cliente, o slug vem sempre do perfil; para `lexia_admin`, o slug pedido precisa ter integração configurada.
- Pausar exige que a conversa exista em `lexia_contactos` do cliente e não seja `teste:%`.
- A mensagem recebida durante a pausa manual é gravada pelo workflow com origem `recebida_na_pausa`.

### Ajustes

- Apenas admin ativo.
- Módulos permitidos na UI: `geral`, `detailing`, `venda_veiculo`, `indefinido`.
- Prioridade entre 0 e 100.
- Pode vincular um feedback de origem.
- Pode ser ativado/desativado.

## 17. Gestão de Clientes e Usuários

### Criar cliente

`/admin/clientes/novo`:

- Normaliza slug para minúsculas, `_` e `-`.
- Cria `lexia_clientes`.
- Opcionalmente cria um workflow inicial.
- Não configura métricas externas, n8n, Redis, RLS ou DNS.

Se a criação do workflow falhar, o cliente permanece criado. Não há transação distribuída.

### Editar cliente

`/admin/clientes/[slug]`:

- Nome, status, modo teste e cor.
- Primeiro workflow editável.
- Visão de usuários, conversas, testes, feedbacks e handoffs.
- Ação destrutiva para limpar dados de teste.

### Criar usuário

1. Cria usuário no Supabase Auth com e-mail confirmado.
2. Insere vínculo em `lexia_usuarios_clientes`.

Na branch do Lote 1, se o vínculo falhar, o usuário Auth não é excluído nem
reassociado automaticamente. A falha é gravada em
`lexia_user_link_pendencias` para revisão e retry administrativo. O retry só
cria o vínculo quando nenhum outro existe, conclui idempotentemente quando o
vínculo desejado já existe e preserva a pendência diante de conflito. A
interface continua sem redefinição de senha ou troca de role depois da criação;
apenas status do vínculo.

## 18. Ações Destrutivas

### Limpar dados de teste do cliente

`clearClientTestData` usa service role e remove, nesta ordem:

1. Feedbacks ligados às execuções do cliente.
2. Todas as execuções de teste do cliente.
3. Todas as sessões de teste do cliente.
4. Mensagens com conversa `teste:%`.
5. Contactos com conversa `teste:%`.

### Excluir sessão de teste

Valida cliente, `session_id` e `origem`, depois remove feedbacks, execuções, mensagens, contacto e sessão.

### Excluir handoff simulado

Valida execução, cliente e rota esperada, remove feedbacks e a execução simulada.

Antes de alterar essas rotinas:

- Fazer backup.
- Manter filtros de tenant e origem.
- Respeitar dependências/FKs.
- Testar com dois clientes para provar isolamento.

## 19. Identidade Visual

- Marca única: Lexia AI para todos os clientes, incluindo Miranda.
- Paleta base: preto, branco e cinzas neutros.
- Fundo geral claro para legibilidade; sidebar preta.
- Símbolos oficiais em `public/lexia/lexia-symbol-dark.png` e `lexia-symbol-light.png`.
- Tipografia atual: Geist, embora a identidade original cite Satoshi.
- Metadata: título `Lexia`, descrição `Plataforma Lexia`.
- Não reintroduzir identidade Speedy Media ou branding específico de cliente.
- Manter contraste, leitura rápida e hierarquia operacional acima de decoração.

## 20. Snapshot de Dados em 21/09/2026

Este bloco é diagnóstico, não contrato. Os números mudam continuamente.

### Clientes centrais

| Cliente | Slug | Status | Modo teste |
| --- | --- | --- | --- |
| Asteric | `asteric` | ativo | sim |
| Cliente Teste | `cliente_teste` | ativo | sim |
| Clínica Teste | `clinica_teste` | ativo | sim |
| Detail By Cordeiro | `detail_by_cordeiro` | ativo | sim |
| Miranda Skin Experts | `miranda_skin_experts` | ativo | sim |

### Dados centrais

- 12.082 mensagens.
- 1.207 contactos.
- Detail By Cordeiro: 7.625 mensagens e 829 contactos.
- Miranda: 4.453 mensagens e 375 contactos.
- Miranda já possui contactos centrais de Instagram e WhatsApp.
- Intervalo observado de Detail: 01/07/2026 a 19/09/2026.
- Intervalo observado de Miranda: 17/07/2026 a 19/09/2026.

### Workflows ativos registrados

- Asteric: `ASTERIC - OMNICHANNEL TESTE`, tipo `whatsapp`. O cadastro central aponta para o webhook POST compatível com o contrato da Área de Testes, mas o nó `Webhook Meta Omnichannel` correspondente ainda estava desabilitado no n8n em 21/09/2026; enquanto não for habilitado e o workflow publicado, o endpoint retorna HTTP 404.
- Cliente Teste: 1 WhatsApp.
- Clínica Teste: nenhum encontrado.
- Detail By Cordeiro: WhatsApp, Meta e duas variantes de teste omnichannel.
- Miranda: `MIRANDA SKIN EXPERT - OMNICHANNEL`, cadastrado com tipo `instagram`.

O registro de workflow controla principalmente a Área de Testes. A existência de mensagens WhatsApp em produção não depende de haver um segundo workflow cadastrado nessa tabela, desde que o n8n grave os dados centrais.

### Estado do onboarding Asteric

- Slug canônico: `asteric`.
- Fuso declarado no workflow: `America/Sao_Paulo`.
- O export `OMNICHANNEL ASTERIC` permite teste pela plataforma e mantém envio real e notificação de handoff desativados.
- O webhook ativo `wpp-asteric` recebe eventos Z-API, mas o adaptador atual descarta o payload sintético da Área de Testes; ele não deve ser cadastrado como endpoint de teste sem adaptar o normalizador.
- Para testar pelo painel, usar o webhook POST ligado a `Normalizar Entrada Meta Omnichannel`, que possui o ramo `lexia_modo_teste`. Apesar do nome histórico do nó, o ramo de teste aceita `lexia_workflow_tipo = whatsapp`.
- O workflow depende do subworkflow `Cérebro - ASTERIC` e das credenciais n8n `LEXIA CRM`, `POSTGRES LEXIA CRM`, `Redis ASTERIC` e do provedor de IA.
- O export auditado ainda contém referências e credenciais inline herdadas da Miranda em nós de Meta e Z-API. Não importar o arquivo em outro ambiente nem habilitar envio real antes de remover esses valores, migrar segredos para credenciais n8n e rotacionar os tokens expostos no export.
- Não existe usuário cliente da Asteric criado nesta etapa; os testes devem ser feitos pelo admin Lexia até que um acesso seja solicitado explicitamente.

### Perfis

- 1 admin Lexia ativo.
- 1 cliente admin ativo para Clínica Teste.
- 2 clientes admin ativos para Detail By Cordeiro.
- 1 cliente admin ativo para Miranda.

E-mails e senhas não devem ser documentados aqui.

## 21. Desenvolvimento Local

### Preparação

```bash
npm ci
```

Criar `.env.local` com os nomes descritos neste documento. Nunca versionar o arquivo.

Para ativar o Analista Lexia em um ambiente novo:

1. Aplicar `supabase/migrations/202609220001_lexia_ai_analyst.sql` no Supabase central.
2. Construir e publicar o workflow descrito em `docs/LEXIA_CRM_E_ANALISTA_N8N.md`.
3. Configurar `LEXIA_APP_URL`, `N8N_ANALYST_WEBHOOK_URL` e `N8N_ANALYST_WEBHOOK_SECRET` no servidor.
4. Reiniciar o servidor ou fazer novo deploy.

### Executar

```bash
npm run dev
```

Abrir `http://localhost:3000`.

### Validação mínima antes de deploy

```bash
npm run lint
npx tsc --noEmit
npm run build
npm audit
```

Causa identificada em 19/09/2026 para o lint e o `tsc` que não terminavam: o projeto está em `~/Desktop`, sincronizado com o iCloud com "Otimizar armazenamento" ativo. O macOS remove do disco milhares de arquivos de `node_modules` e corrompe o cache `.next/dev`, o que também faz o `next dev` demorar minutos e servir CSS do Tailwind incompleto (por exemplo, balões do chat sem o verde). Numa cópia fora do iCloud, com `npm ci` limpo, lint, typecheck e `next build` passam em segundos. Recomendação: mover o projeto para uma pasta não sincronizada, por exemplo `~/dev/lexia-crm`, e rodar `npm ci`.

## 22. Deploy

Deploy manual atual:

```bash
npx vercel --prod
```

Checklist:

1. Confirmar que o código está commitado e recuperável.
2. Confirmar que o diff não contém `.env`, chaves ou URLs privadas.
3. Rodar lint, typecheck, build e testes.
4. Validar migrations e compatibilidade com n8n.
5. Confirmar variáveis Production na Vercel.
6. Para o Analista Lexia, aplicar a migration, publicar o workflow e confirmar as três variáveis n8n.
7. Fazer deploy.
8. Abrir `https://app.uselexia.app/login`.
9. Testar login admin e um cliente.
10. Testar dashboard em dois períodos.
11. Testar uma conversa de cada canal disponível.
12. Testar uma pergunta quantitativa e uma qualitativa no Analista Lexia.
13. Testar Área de Testes e correlação por `run_id`.
14. Conferir logs da Vercel, Supabase e execuções do n8n sem expor dados sensíveis.

Alterar env sem redeploy não atualiza uma implantação já construída.

## 23. Onboarding de Novo Cliente

1. Definir slug estável. Não mudar depois sem migration completa.
2. Criar cliente central.
3. Criar usuário Auth e vínculo.
4. Criar um workflow por canal necessário e marcar o correto como ativo.
5. Configurar n8n com `cliente_slug` idêntico.
6. Configurar Redis exclusivo no n8n, nunca neste frontend.
7. Garantir escrita de contacto e uma linha por mensagem no Supabase central.
8. Garantir origens e direções padronizadas.
9. Definir fuso IANA do cliente.
10. Se houver agendamentos externos, adicionar configuração no código ou concluir a futura integração orientada a banco.
11. Criar envs de URL e service role na Vercel.
12. Fazer redeploy.
13. Validar RLS com usuário desse cliente e de outro cliente.
14. Validar mensagens de cada canal.
15. Validar dashboard em Hoje, Semana, Mês e personalizado.
16. Validar status aceitos de agendamento.
17. Validar follow-ups pela origem gravada em `lexia_mensagens`.
18. Documentar o cliente neste mapa sem registrar segredos.

## 24. Diagnóstico Rápido

### Conversa não aparece na lista

Verificar:

- Existe `lexia_contactos` para o mesmo slug e identificador?
- O canal está em minúsculas e corresponde ao filtro?
- Existe mensagem dentro do período lateral?
- O identificador começa com `teste:`?
- RLS permite o perfil?
- `atualizado_em` do contacto está correto?

### Histórico aparece vazio ou incompleto

- Conferir `cliente_slug` e `identificador_conversa` exatos.
- Conferir se as mensagens foram gravadas em `lexia_mensagens`.
- Conferir `conteudo`, `tipo`, `direccao` e `criado_em`.
- Conferir se o n8n agregou mensagens em uma linha.
- URLs de mídia Meta podem expirar; isso não é corrigível só na UI.

### Ordem ou balões errados

- O painel ordena por `criado_em`, depois UUID.
- UUID não representa ordem cronológica real em empate.
- Corrigir n8n para gravar timestamp/ID do provedor e uma linha por evento.
- Não dividir mensagens enviadas indiscriminadamente por parágrafo.

### Follow-up não aparece

- A mensagem precisa existir no banco central.
- `direccao` deve ser `enviada`.
- `origem` deve ser `followup_agente` ou `followup_rapido`.
- A tabela externa `lexia_followups` da Miranda não alimenta a conversa nem a métrica atual.
- Ver uma mensagem na Meta Business Suite não prova que o evento de saída foi gravado pelo n8n no Supabase central.

### Agendamento mostra zero ou `--`

- Verificar envs externas na Vercel.
- Verificar se houve redeploy.
- Verificar tabela e status configurados.
- Verificar `criado_em`, não apenas a data marcada.
- Verificar logs de consulta externa.
- Para Detail, `pendente_sinal` conta; para Miranda, apenas `confirmado` conta.

### Área de Testes não responde

- Workflow ativo e URL correta.
- Webhook respondeu 2xx.
- n8n recebeu `lexia_run_id`.
- Execução foi gravada com mesmo cliente, sessão, run e origem.
- Resposta foi gravada em até 90 segundos.

### Usuário autentica, mas vê erro de perfil

- Confirmar linha única em `lexia_usuarios_clientes`.
- Confirmar `user_id`, role, slug e status.
- Confirmar RLS.
- Se Auth foi criado mas vínculo falhou, corrigir o usuário órfão.

## 25. Riscos Atuais

### P0

- Service roles previamente expostas e ainda não confirmadas como rotacionadas.
- Vulnerabilidade crítica no conjunto de dependências atual.
- Schema, constraints e RLS não versionados.
- Backup do Supabase central ainda não possui restauração verificada.

### P1

- O CI do Lote 1 existe na branch e executa testes, lint, typecheck e build,
  mas ainda não foi mesclado. As suites isoladas de banco e runtime Next
  passaram no projeto descartável; ainda não existe E2E geral nem baseline
  completo do produto, e staging continua sem validação.
- O Lote 1 de status/autorização ainda não foi aplicado ou validado em staging.
- Ausência de `proxy.ts`/fluxo documentado de renovação Supabase SSR.
- Métricas ainda são agregadas no servidor Next.js; índices do banco, view/RPC e comportamento com volume dez vezes maior ainda precisam de auditoria.
- Gestão de múltiplos workflows incompleta.
- Pendências recuperáveis de vínculo Auth dependem da migration do Lote 1.
- Dados externos configurados em código.
- Destinos privados e allowlist de workflows dependem do corte faseado do Lote
  1 e de `LEXIA_WORKFLOW_ALLOWED_HOSTS`.
- Sem observabilidade estruturada ou alertas.
- O painel depende do formato das chaves Redis dos workflows; não há teste automatizado desse contrato.
- O token Upstash usado pelo painel tem acesso total ao Redis do cliente, não apenas às chaves de trava.
- Integração de pausas configurada em código (`clientConfigs`), como as métricas externas.
- O código do Analista está pronto para fila assíncrona, mas depende do workflow n8n publicado e das três variáveis novas.
- O segredo compartilhado n8n ainda não usa assinatura HMAC com timestamp.
- O disparo inicial do Analista ainda não possui chave idempotente própria.
- A implementação direta OpenAI e as rotas legadas continuam no repositório até o novo fluxo ser validado em produção.
- Não há orçamento mensal, alerta de custo ou retenção formal definidos para chamadas e histórico da IA.
- O consumidor externo de `lexia_buscar_ajustes_agente` ainda não foi
  identificado; não alterar seus grants/search path antes disso.
- O consumidor de `site_feedback` ainda não foi identificado; não restringir a
  submissão pública sem mapear esse fluxo.

### P2

- Rotas úteis fora da navegação.
- Configuração admin é placeholder.
- Grafia e locale misturam pt-BR e pt-PT.
- Conversas dependem de URLs de mídia potencialmente temporárias.
- Heatmap admin geral usa fuso da plataforma em vez de normalização por cliente.

## 26. Regras para Alterar sem Quebrar

### Antes

- Ler `Agent.MD`, `PLAN.MD` e `AGENTS.md`.
- Verificar `git status` e não apagar mudanças alheias.
- Identificar todas as tabelas e integrações afetadas.
- Confirmar se o dado vem do central, Supabase externo ou n8n.
- Fazer backup para mudanças de dados/schema.

### Durante

- Preservar o isolamento por `cliente_slug`.
- Preservar `[start, end)` para datas.
- Preservar o fuso IANA por cliente.
- Preservar exclusão de `teste:%` nas métricas de produção.
- Usar paginação para PostgREST, cujo limite padrão é 1.000.
- Manter ordenação determinística.
- Usar service role somente em módulo server-only e após autorização explícita.
- Não confiar apenas na UI para autorização.
- Não transformar relação agregada em “conversão atribuída”.

### Depois

- Atualizar testes e estes documentos.
- Rodar lint, typecheck, build e audit.
- Validar pelo menos admin, Miranda e Detail.
- Validar dois fusos.
- Validar ausência de vazamento entre tenants.
- Fazer deploy e smoke test.
- Monitorar logs.

## 27. Definição de Pronto

Uma mudança só está pronta quando:

- Comportamento solicitado está implementado de ponta a ponta.
- Dados de dois clientes continuam isolados.
- Métricas mantêm a definição ou a mudança foi aprovada e documentada.
- Não há segredo no diff.
- Lint, typecheck e build passam.
- Testes relevantes passam.
- Migration e rollback existem se o banco mudou.
- Integração n8n foi atualizada se o contrato mudou.
- Produção foi verificada após deploy.
- `Agent.MD` e `PLAN.MD` refletem o novo estado.

## 28. Fonte de Verdade por Assunto

| Assunto | Fonte principal |
| --- | --- |
| Identidade e perfil | Supabase Auth + `lexia_usuarios_clientes` |
| Clientes | `lexia_clientes` |
| Webhooks de teste | `lexia_workflows` |
| Conversas | `lexia_contactos` + `lexia_mensagens` |
| Agendamentos Miranda | Supabase Miranda, `agendamentos_miranda_skin` |
| Agendamentos Detail | Supabase Detail, `marcacoes` |
| Follow-ups no dashboard | `lexia_mensagens.origem` |
| Handoffs reais | `lexia_handoffs` |
| Testes | `lexia_testes_sessoes` + `lexia_testes_execucoes` |
| Feedbacks | `lexia_feedbacks` |
| Ajustes | `lexia_ajustes_agente` |
| Memória do agente | Redis por cliente no n8n, fora deste repo |
| Travas e pausas do agente | Redis (Upstash) do cliente, via `lib/redis/agent-locks.ts` |
| Fórmulas | `lib/dashboard/operational-metrics.ts` |
| Mapeamento externo | `lib/metrics/external-client-metrics.ts` |
| Apresentação das mensagens | `lib/conversations/message-display.ts` |
| Escopo e autorização da IA | `lib/analyst/scope.ts` |
| Métricas e ferramentas da IA | `lib/analyst/data.ts` |
| Chat e guardrails da IA | `lib/analyst/chat.ts` |
| Classificação qualitativa | `lib/analyst/classifier.ts` |
| Histórico e auditoria da IA | `lexia_ai_sessoes`, `lexia_ai_mensagens`, `lexia_ai_execucoes` |
| Insights por conversa | `lexia_conversation_insights` |

## 29. Glossário

- **Conversa iniciada**: conversa cuja primeira mensagem recebida está no período.
- **Conversa ativa**: conversa com qualquer mensagem no período.
- **Contacto**: registro que identifica uma conversa e seu canal.
- **Handoff**: transferência para atendimento humano.
- **Origem**: causa/processo que gerou uma mensagem.
- **Run ID**: correlação entre envio de teste e execução gravada.
- **Slug**: identificador técnico imutável do cliente.
- **Tenant**: cliente isolado dentro da plataforma multi-tenant.
- **RLS**: Row Level Security do Supabase/Postgres.
- **Service role**: chave privilegiada que ignora RLS.
- **Intervalo semiaberto**: início inclusivo e fim exclusivo, `[start, end)`.
- **Cobertura analítica**: proporção de conversas iniciadas no escopo que têm insight atualizado até a última mensagem disponível naquele mesmo escopo.

## 30. Manutenção Deste Documento

Atualizar este arquivo no mesmo PR/commit quando houver mudança em:

- rota ou navegação;
- tabela, coluna, status ou origem;
- payload n8n;
- variável de ambiente;
- fórmula de métrica;
- fuso de cliente;
- workflow ativo;
- ação destrutiva;
- papel/permissão;
- processo de deploy;
- risco conhecido ou limitação resolvida.

Não registrar segredos. Para informações que mudam continuamente, manter a data do snapshot.

## 31. Analista Lexia

### Objetivo e acesso

O Analista Lexia é um chat somente leitura para responder perguntas sobre desempenho do agente, volume, autonomia, tempo de resposta, follow-ups, agendamentos agregados, objeções, pontos fortes, oportunidades e feedbacks. Está disponível para admin e clientes, sempre com o mesmo isolamento multi-tenant do restante da plataforma.

- Cliente: o slug vem obrigatoriamente do perfil autenticado; o valor enviado pelo navegador é descartado.
- Admin: precisa escolher um cliente ativo, validado novamente no servidor.
- Perfil e cliente precisam estar `ativo` em todas as APIs.
- Períodos usam o fuso IANA do cliente e intervalo `[start, end)`; personalizado aceita no máximo 366 dias.
- Canal pode ser `todos`, `whatsapp`, `instagram` ou `messenger`.
- Conversas `teste:%` são sempre excluídas.

### Fluxo

1. A página lista sessões recentes e envia a pergunta para `/api/analista/chat`.
2. O backend autentica novamente, fixa tenant/período/canal, grava pergunta e execução `iniciada` e envia um POST assinado ao n8n.
3. O Webhook do n8n precisa responder imediatamente; o processamento continua fora da requisição da Vercel.
4. O navegador acompanha a execução a cada 1,5 segundo em `/api/analista/status`; uma sessão recarregada retoma o polling pendente.
5. O n8n consulta apenas `/api/analista/n8n/tool`, sempre com o ID da execução e Bearer secreto. O backend reconstrói o escopo persistido e não aceita SQL, slug, período ou tabela arbitrária.
6. Para qualitativo, `listar_conversas` entrega lotes de até quatro conversas, no máximo 120 mensagens e 24 mil caracteres redigidos por conversa.
7. O n8n chama `/api/analista/n8n/callback` com resposta, ferramentas e referências opacas. O backend valida a execução e as fontes e usa uma RPC transacional para gravar a resposta e encerrar a execução.
8. O callback é idempotente por execução e ID determinístico da mensagem. Retry igual não sobrescreve; retry divergente retorna conflito. Uma execução final não aceita ferramenta nova. Execuções abertas por mais de 10 minutos expiram como erro.
9. Se perfil ou empresa forem inativados durante um trabalho já registrado, o callback tardio pode apenas concluir essa execução. Ele não resolve novas fontes nem inicia ferramenta. Pergunta, ferramenta ou execução nova permanecem bloqueadas.

O contrato integral e a montagem nó a nó do workflow estão em
`docs/LEXIA_CRM_E_ANALISTA_N8N.md`.

### Ferramentas permitidas

- `obter_desempenho`: reutiliza as mesmas funções determinísticas do dashboard e a integração externa de agendamentos. Além dos totais, devolve `por_canal` com conversas iniciadas, conversas ativas, mensagens, autonomia e tempo de primeira resposta de cada canal, ordenado por conversas iniciadas.
- `analisar_objecoes`: agrega somente insights atualizados e sempre informa cobertura. Cada objeção traz `por_canal` com as conversas daquele canal que a levantaram, e o retorno traz `cobertura_por_canal` com a base analisada de cada canal.
- `analisar_qualidade`: entrega pontos fortes e oportunidades observados nas conversas classificadas.
- `buscar_conversas`: busca lexical por termos nas mensagens com atividade no período.
- `abrir_conversa`: abre, por referência opaca, até 80 mensagens recentes e no máximo 30 mil caracteres.
- `resumir_feedbacks`: agrega avaliações e comentários do período.
- `listar_conversas`: entrega lotes redigidos para classificação no n8n.
- `obter_cobertura`: consulta cobertura dos insights legados.

Não existe ferramenta de SQL arbitrário, mutação de agente, envio de mensagem, alteração de prompt ou acesso ao Redis. Recomendações da IA são propostas; nunca significam que uma alteração foi aplicada.

### Exatidão e linguagem obrigatória

- Números de `obter_desempenho` são cálculos determinísticos; texto qualitativo é interpretação do modelo.
- “Conversas iniciadas” mantém a definição oficial: primeira mensagem recebida dentro do período.
- A classificação qualitativa e sua cobertura usam conversas iniciadas no período; busca textual pode encontrar qualquer conversa com atividade no período.
- Insight fica pendente novamente quando a conversa ganha novas mensagens dentro do escopo.
- Percentual de objeções usa como denominador apenas conversas com insight atual. Se a cobertura não for 100%, a resposta precisa declarar isso e não pode generalizar para toda a base.
- O percentual dentro de `por_canal` usa como denominador as conversas analisadas daquele canal, não o total. São bases diferentes e não podem ser somadas nem comparadas com o percentual geral.
- O canal de uma conversa vem do contacto e é normalizado em minúsculas; conversa sem canal cai em `desconhecido` em vez de ser descartada da quebra.
- Agendamentos externos são agregados e não estão ligados individualmente à conversa. O analista não pode afirmar causalidade ou atribuir um agendamento a um lead específico.
- Com canal específico, agendamentos retornam indisponíveis em vez de repetir o total geral e sugerir uma atribuição falsa.
- `followup_rapido` não representa todos os leads de anúncio e não pode ser rotulado dessa forma.
- A limitação histórica da autonomia anterior a 01/08/2026 continua valendo.

### Privacidade e segurança

- Mensagens são tratadas como evidência não confiável e nunca como instruções para o modelo.
- E-mail, URL e padrões de telefone são redigidos antes de enviar conteúdo ao n8n/modelo.
- Identificadores reais de conversa não são enviados ao workflow; as ferramentas usam referências opacas estáveis.
- IDs reais e links são resolvidos apenas no servidor e devolvidos como fontes ao usuário autorizado.
- O n8n não recebe a `service_role` do Supabase central.
- Callbacks e ferramentas exigem execução registrada e coerência entre
  execução, sessão, tenant e autor.
- As RPCs de claim/finalização são exclusivas de `service_role`; o JWT do
  usuário não consegue chamá-las.
- O chat limita cada usuário a 12 perguntas por cinco minutos.
- Histórico de sessão é privado por usuário, mesmo entre dois admins do mesmo tenant.
- Nunca logar conteúdo integral, credencial ou payload bruto da conversa em erro de aplicação.

### Cobertura, custos e limitações atuais

- A execução agora é uma fila assíncrona orquestrada pelo n8n; o orçamento e a cobertura da amostra qualitativa devem ser definidos no workflow.
- A busca fornecida pela plataforma continua lexical. Embeddings e pgvector ficam para uma fase posterior.
- `lexia_conversation_insights` e o classificador OpenAI direto permanecem como legado, mas não são chamados pela página atual.
- A escolha de modelo passa a ser responsabilidade do workflow, preservando saída estruturada, isolamento e declaração de cobertura.
- Falta definir orçamento, alertas de custo, retenção e processo de exclusão do histórico da IA.
- Sem migration, workflow publicado ou variáveis n8n, a interface mostra erro e não inicia a análise.

### Ativação e smoke test

Snapshot de produção em 03/10/2026: a migration original do Analista foi aplicada e o
fluxo direto anterior foi publicado. A branch do Lote 1 acrescenta
finalização transacional com união de claims concorrentes, claim de ferramenta
e policies por empresa ativa,
mas essas mudanças não foram aplicadas ao banco de produção nem publicadas. Em
04/10/2026 elas passaram no Supabase descartável do Lote 1; staging, backup com
restauração verificada e nova aprovação continuam obrigatórios antes de
produção. Em 05/10/2026, o runtime Next descartável também passou cadastro,
duas edições, dispatch admin/cliente, callbacks e auditoria de exposição; isso
continua sem equivaler a staging ou autorizar produção.

1. Fazer backup do Supabase central.
2. Executar `supabase/migrations/202609220001_lexia_ai_analyst.sql` no SQL Editor do projeto central.
3. Publicar o workflow n8n com resposta imediata e Header Auth.
4. Cadastrar `LEXIA_APP_URL`, `N8N_ANALYST_WEBHOOK_URL` e `N8N_ANALYST_WEBHOOK_SECRET`.
5. Fazer redeploy.
6. Como admin, selecionar Miranda e perguntar por métricas do mês.
7. Perguntar pelas maiores objeções; confirmar que o workflow informa amostra, cobertura e fontes.
8. Como usuário Miranda, confirmar que não existe seletor de cliente e que nenhuma fonte de outro slug aparece.
9. Repetir com Detail e conferir isolamento.
10. Inspecionar `lexia_ai_execucoes` sem expor conteúdo sensível em logs.

Rollback: exportar as quatro tabelas, retirar o item de navegação/deploy se necessário e só então executar `supabase/rollbacks/202609220001_lexia_ai_analyst_down.sql`.
