# Cerebro Miranda: base original para CRM

## Artefato Local (12/10/2026)

`brain-original-crm.inactive.json` e uma copia nova, INATIVA, para importacao
manual pelo usuario. Nao substitui o cerebro Miranda de producao nem foi
importada, publicada ou executada nesta rodada. O gerador e
`scripts/build-miranda-original-brain.mjs`; as regras adicionais ficam em
`scripts/lib/miranda-original-brain-runtime.mjs` e as 32 regressoes em
`tests/miranda-original-brain.test.mjs`.

Referencia: export original fornecido pelo usuario, de 30 nodes. Os 12 blocos
de Code/prompts comparados anteriormente com a versao publicada
`0ac4e98e-6e9b-4966-9519-fa276ba4cada` nao apresentaram diferencas.
Nenhuma nova operacao remota e necessaria para gerar/importar este arquivo.
O original bruto, exemplos pessoais, IDs de credenciais e destinos privados
nao foram transferidos para a entrega. Os hashes da fonte sao calculados pelo
gerador para conferencia sem versionar o export bruto.

Os 30 nomes originais permanecem. Sao 51 nodes no total: as adicoes protegem
origem, memoria, continuidade e retorno; nao sao novos workflows separados.
Os nodes de pausa/notificacao direta conservam os nomes, mas agora sao
pass-through: nao possuem Redis, HTTP ou credencial de envio.

## Inteligencia Preservada

- Especialista em Servicos, orquestradores de Atendimento/Agendamento,
  Agente Indefinido, Redator, Preparar Briefing e Montar Saida Final.
- Consultas nativas ao catalogo, promocoes, informacoes da clinica e playbook;
  venda consultiva, objecoes, precos/variantes e limites comerciais.
- Regras de laser, avaliacao, pagamentos, injetaveis, intercorrencias,
  indisponibilidade, fotos, handoff e ausencia de descontos inventados.
- Roteiro original de agendamento: disponibilidade real, escolha do cliente,
  dados necessarios, recapitulativo e OK antes da criacao, Boston, limites de
  dia/horario e encaminhamento de cancelamento/remarcacao para a equipe.
- Segundo agendamento somente com confirmacao explicita: o parametro original
  `ignorar_duplicado` foi preservado. Ele nao dispensa idempotencia da tool.
- Modelos e opcoes comerciais da fonte preservados; disponibilidade/custo
  dos modelos nao foram conferidos por chamadas reais nesta rodada.

Mudancas deliberadas: historico de ate 200 mensagens com autoria explicita,
memoria privada por conversa, idioma pt/en/es inclusive pedido de troca,
controle de reapresentacao/eco e notas do orquestrador que antes podiam ser
perdidas quando vinham como string. Respostas comuns sao divididas sem cortar
informacao em baloes de ate 250 caracteres, no maximo quatro; templates
atestados de confirmacao conservam o formato original. O limite de quatro
permite dividir a bolha longa que o codigo original recompunha no WhatsApp.
O detector de idioma e heuristico: casos ambiguos e comportamento do modelo
ainda precisam de ensaio real isolado.

## Configuracao Depois Da Importacao

1. Importe como NOVO workflow, sem alterar a Miranda ativa. Nao publique ainda.
2. Selecione credenciais HML para OpenAI, Anthropic e Supabase PRIVADO de teste
   do cerebro. As referencias no JSON sao nomes, nao IDs nem credenciais
   configuradas. Nunca escolha as credenciais privadas Miranda de producao.
3. No Set `Config Cerebro Lexia`, confira ambiente `isolated_test`, tenant,
   conta e `private_project_ref`. Os defaults da conta/empresa sao sinteticos.
   O tenant e a conta devem corresponder ao envelope confiavel do Omnichannel.
4. Prepare/revise o projeto privado descartavel e o catalogo/playbook de teste.
   Somente entao marque `models_reviewed` e `private_data_reviewed` como true.
   A ausencia de identidade/configuracao bloqueia antes de consultas de
   catalogo e modelos; nunca se usa outra memoria como fallback.
5. Selecione esta copia no Execute Workflow do Omnichannel HML. O contrato
   recebido deve incluir scope completo, invocation_id e captured_state,
   alem do payload legado. Nao chame o cerebro diretamente de canais reais.
6. Comece sem agenda: `calendar_tools_reviewed=false` e aliases vazios. Existe
   um ramo com a inteligencia original de agendamento, sem tools de calendario;
   ele nao inventa horarios nem simula uma reserva criada.
7. Para agenda real de teste, revise as duas tools isoladas, seus contratos e
   idempotencia antes de configurar aliases/marcar a revisao. O Omnichannel
   tambem precisa autorizar tools e `calendar_access=isolated_test`.

### Memoria Privada Necessaria

Estas tabelas sao requisitos NOVOS; nao foram criadas nesta rodada. Esta copia
nao funciona apenas selecionando uma credencial sobre o banco antigo.

| Tabela | Campos e invariantes previstos |
| --- | --- |
| `lexia_brain_identity` | Uma unica linha com disposable=true, environment, project_ref e cliente_slug exatos do Set |
| `lexia_brain_memories` | memory_key unico; scope_json/context_json JSON; version inteiro positivo; last_invocation_id; last_request_identity; cached_result JSON; updated_at |

`memory_key` codifica os cinco componentes do escopo como array JSON, sem
concatenacao ambigua. A criacao exige unicidade no banco; atualizacao filtra
chave E versao anterior (CAS) e exige recibo coerente. Erro de leitura/escrita
nao autoriza reiniciar sem historico ou devolver sucesso ficticio.
`last_request_identity` e a representacao canonica do pedido, nao um hash:
contem conteudo do lead e deve permanecer somente no banco privado, com RLS,
retencao/exclusao e acesso server-side revisados antes de integrar. Nao logar.

Memoria guarda fatos, idioma, perguntas e draft; nao inventa mensagens enviadas.
Perguntas propostas nao sao gravadas como ja feitas. Historico explicitamente
suprimido/falho nao e apresentado aos agentes como fala entregue. Na falta
de status no legado, direccao=enviada depende da garantia do caller; adicionar
status/IDs de entrega por linha continua necessario para prova ponta a ponta.
Apresentacao entregue vem do historico confirmado ou marcador confiavel do
Omnichannel. Proposta suprimida nao conta como apresentacao ja enviada.
O historico legado sem scope por linha depende da origem confiavel do envelope;
linhas com scope divergente sao rejeitadas. Adicionar IDs/escopo por linha ao
caller continua recomendado antes de producao.

## Tools E Efeitos: Contrato Provisorio

`lexia.tool.result.v1` foi adaptado nas copias LOCAIS das duas tools originais;
nao foi homologado nos workflows reais/Google. O cerebro atualizado acrescenta
captured_state, permissoes e recapitulativo entregue nos parametros dessas
tools, e bloqueia aliases originais conhecidos. Veja `TOOLS_AGENDA.md`.
O recibo da tool deve conter scope, invocation_id, operation, tool_call_id,
status (succeeded/failed/unknown), data e domain_events. Criacao bem-sucedida
exige data.status=CRIADO, appointment_ref, confirmacao_texto e um evento
`lexia.domain.event.v1` appointment.confirmed com inicio/fim, timezone,
referencia e chamada coerentes. Consulta de disponibilidade nao confirma
criacao. O horario criado deve corresponder ao inicio_iso da chamada.

Somente intermediateSteps observados pelo engine sao aceitos. JSON escrito
pelo modelo e a assinatura visual de um template nao atestam tool. Isto e
validacao local de proveniencia, nao autenticidade criptografica remota.
Conflito, JA_AGENDADO e falha conhecida devem continuar no contrato adaptado;
resultado unknown exige reconciliacao, nunca retry cego.

As tools devem persistir idempotencia/resultado antes de devolver e impedir
reenvio automatico apos possivel efeito, inclusive quando a validacao/memoria
do cerebro falhar. A memoria CAS posterior nao e um claim anterior a tools
nem prova exatamente-uma-execucao concorrente. Lease/buffer continuam com o
Omnichannel; corridas remotas precisam de homologacao propria.

Saida legada compativel: acao, modulo, entregas, handoff, operacoes, followup,
contexto_actualizado e erro. Acrescenta scope, invocation_id, captured_state,
domain_events e tool_audit. Memoria privada nao vai para o central como patch.

O Omnichannel atual ainda precisa CONSUMIR/PERSISTIR os novos eventos de tool
antes do envio. Apenas importar este cerebro nao cria agendamento no CRM,
pausa pos-agendamento, lembrete, pipeline ou integracao completa com Frappe.
Tools e Google Agenda continuam separados; follow-up e lembrete separados
solicitam entrega ao Omnichannel. Handoff e uma proposta: resolver e retomar
continuam comandos distintos, sem prazo de 48h imposto pelo cerebro.
Lembrete so atravessa o bloco do proprio evento confirmado; pausa humana,
manual ou handoff ainda bloqueiam. Cancelamento cancela lembrete e conserva
a pausa original ate o fim ou remocao manual.

## Verificacao Desta Rodada

32/32 regressoes passaram: escopos, isolamento/memoria, duplicacao, idioma,
historico/autoria, continuidade, baloes, preco original, tools/confirmacao,
resultados incertos, CAS e delegacao de efeitos. Lint dos tres arquivos
JS passou com zero erros/avisos. Todos os 17 nodes Code foram conferidos
sintaticamente; graph/credenciais/destinos/inatividade tambem foram validados.
Suite combinada dos originais/bundler: 163/163. Lote 2 local: 193/193.
`npm run typecheck` passou. Nenhuma falha ou teste ignorado nessas suites.

O Mac inicialmente recusou novos processos (EAGAIN). Houve uma rodada
temporaria em processo existente; depois que o ambiente voltou a permitir
execucao, o export FINAL foi regenerado pelo gerador habitual/esbuild e os
checks acima foram repetidos pelos comandos padrao, inclusive node:test CLI.
O typecheck temporario havia atingido timeout; a repeticao CLI passou.
Arquivos temporarios nao sao dependencias do JSON. Build Next, importacao/
runtime n8n, IA, banco e calendario nao foram executados nesta rodada.
