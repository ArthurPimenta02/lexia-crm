# Claude Code - Lexia CRM

Antes de alterar qualquer arquivo, leia explicitamente, nesta ordem:

1. `AGENTS.md` para as regras locais do repositorio.
2. `Agent.MD` para arquitetura, operacao, seguranca e fontes de verdade.
3. `PLAN.MD` para prioridades, riscos e criterios de aceite.
4. `docs/HANDOFF_CLAUDE.md` para o estado exato desta passagem.
5. `docs/LOTE_2_WORKFLOW_MESTRE_OMNICHANNEL.md` para o contrato aprovado do
   omnichannel.
6. `docs/PLANO_ENTREGA_CRM_MULTICLIENTE.md` para o plano de produto por fases
   (Supabase, workflows n8n, pipeline auto-classificado, design, deploy por
   cliente) e para a doutrina das tres camadas de especificidade por cliente.

Nao presuma que `Agent.MD` sera carregado automaticamente. Abra-o e confira a
secao relevante antes de agir. Antes de codigo Next.js, leia tambem o guia
correspondente em `node_modules/next/dist/docs/`.

## Estado atual

- Repositorio: `/Users/arthurpimenta/Developer/lexia-crm`.
- Branch: `codex/lote-2-workflow-mestre-omnichannel`.
- HEAD: `4bba3d425992af2308c6edce0e1214c40902fe35`.
- Ha alteracoes locais importantes ainda sem commit; preserve-as.
- Preserve sem corrigir a referencia Git invalida
  `refs/heads/codex/lote-1-autorizacao-workflows 2`.
- Os exports em `n8n/omnichannel/` sao simulacoes locais inativas. Nao formam
  um workflow mestre integrado ou pronto para importacao.
- No laboratorio, somente o gateway `LEXIA LAB - MIRANDA - GATEWAY TESTE CRM`
  esta ativo. Ele executa inline os corredores sinteticos de Entrada e
  Atendimento IA; os seis candidatos permanecem inativos e sem credenciais.

## Fronteiras

- Supabase central: autenticacao, configuracao e dados operacionais duraveis.
- Miranda e Detail: cerebros, Supabases privados dos cerebros, tools e
  calendarios separados. A plataforma nao acessa diretamente esses recursos.
- Redis v2 planejado: compartilhado, mas isolado por ambiente, empresa, canal,
  conta e conversa; e uma projecao reconstruivel, nao a fonte de verdade.
- Cliente acessa somente a propria empresa; admin Lexia tem alcance global.
- Asteric esta fora do Lote 2 ate decisao explicita.

## Invariantes omnichannel

- Registrar toda mensagem, inclusive durante pausas.
- Intervencao humana bloqueia antes de transcricao, contexto, modelo ou tool.
- Intervencao, pausa manual, handoff e agendamento sao bloqueios independentes.
- Retomada padrao `await_new_message`; `answer_pending` e opcional por empresa.
- Resolver handoff nao retoma a IA; a retomada e um comando manual separado.
- Pausa pos-agendamento e politica por empresa no Supabase central, sem
  valor fixo no codigo. Ligada: confirmacao unica vinculada a tool e pausa ate
  o termino. Desligada: sem pausa. Os demais bloqueios sempre valem.
  Somente admin Lexia altera (tambem no banco); cliente apenas ve. Vale para
  todos os canais, so na conversa do agendamento.
- Cancelar agendamento cancela lembretes, mas nao encurta a pausa existente.
- Remover a pausa de um agendamento confirmado mantem seus lembretes ate o
  inicio da consulta; os demais bloqueios continuam valendo.
- Mensagem nova do lead antes do envio descarta a resposta nao enviada e
  reprocessa; bolhas enviadas e efeitos de tools nunca se repetem.
- Revalidar escopo, versao e bloqueios antes de cada acao de saida.
- Nunca reenviar automaticamente um resultado de entrega incerto.
- Cerebro e automacoes propoem efeitos; somente adaptadores autorizados os
  executam e registram como confirmados.

Nao use segredos, dados reais ou exports brutos. Nao execute SQL, Redis, n8n,
modelos, provedores, push, merge, deploy ou producao sem autorizacao explicita.
