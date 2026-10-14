# Auditoria HML: Miranda original / Lexia CRM

Rodada iniciada em 11/10/2026, com execucoes registradas no n8n em 12/10 UTC
(ainda 11/10 no Brasil). Esta e uma auditoria das copias de teste, nao um
certificado de prontidao para producao.

## Escopo remoto

Projeto Personal; pasta `CRM MIRANDA SKIN` (`hWqNdYG8tEKZDiI1`).

| Workflow | ID | Nodes | Estado final |
| --- | --- | ---: | --- |
| Omnichannel / entrega comum | `QQSDuqQvm8SFuJvA` | 258 | inativo, virtual |
| Follow-up / previa | `vhHzyoiBB4D5SSMw` | 65 | inativo, preview |
| Lembretes / previa | `3Rbpd9y5yBpD7q0e` | 31 | inativo, preview |

Nao foram acessados dados/executadas chamadas do cerebro de producao. Nenhuma
copia foi publicada, ativada, arquivada ou excluida nesta rodada. Layout,
buffer, ramos de midia e inteligencia original nao foram substituidos por
um fluxo compacto. Schedules e ingresso de canais reais permanecem desligados.

## Correcoes aplicadas

- 32 referencias Postgres no Omnichannel, oito no follow-up e cinco nos
  lembretes agora usam `Lexia HML Central Postgres`, inclusive nodes legados
  desabilitados. Nao foi reaproveitada a credencial Postgres Miranda.
- Credenciais Supabase nativas e Redis apontam para aliases HML existentes.
- Webhook do Agent Test usa `Lexia CRM Agent Test Header Auth`, separado
  da autenticacao da API Frappe.
- Chamadas internas Execute Workflow com trigger passthrough deixam de enviar
  `workflowInputs` artificial. Omnichannel aceita somente os IDs das tres
  copias como chamadores, incluindo suas chamadas internas.
- Produtores vinculados ao ID do Omnichannel, mantendo preview; nenhuma
  credencial de provedor real foi liberada.
- Modulos Code usam objetos com propriedades comuns, nao getters de exports
  gerados por esbuild. Correcao inclui modulo aninhado na preparacao de contexto.
- Entrega comum copia somente envelopes JSON validados, sem depender de
  `structuredClone`, ausente no task runner observado.

Geradores atualizados usam `scripts/lib/n8n-code-bundle.mjs`; a ferramenta
`scripts/refresh-miranda-code-bundles.mjs` substitui apenas namespaces conhecidos
via AST, preservando o restante do Code. Os JSONs locais continuam sanitizados,
inativos e com credenciais apenas por nome, sem IDs privados ou segredos.
As configuracoes/IDs remotos de HML nao sao inseridos nos JSONs de distribuicao.

## Credencial Postgres: criada, mas bloqueada

Atualizacao TLS apos aprovacao: CA publica aplicada ao compose principal,
somente como mount do servidor e worker. Ambos recriados na mesma imagem
n8n 2.42.6. Banco/Redis/proxy/Frappe nao foram reiniciados. Painel/readiness
HTTP 200; credencial HML autenticou e leu metadados de schemas via node
Postgres nativo, com verificacao SSL ativa. Nenhuma migration ou escrita em
banco foi executada. Evidencia e rollback em `TLS_HML.md`.

O usuario aprovou especificamente cadastrar a conexao/senha de teste guardada
no arquivo local ignorado. A credencial `Lexia HML Central Postgres` foi salva
no n8n. Nenhuma senha/token foi copiado para este documento ou para os exports.

O teste inicial falhou com `self-signed certificate in certificate chain`.
SSL permanece Require; Ignore SSL Issues permanece desligado; limite de cinco
conexoes. Reteste nativo apos manutencao conectou; isso nao homologa as queries
operacionais nem os fluxos completos.

A cadeia de confianca foi configurada sem desabilitar verificacao, somente
apos plano e aprovacao especifica da interrupcao na VPS compartilhada.
Nenhum workflow foi publicado/editado, nem houve upgrade do n8n.

Supabase API nativa conseguiu listar nomes de 22 tabelas de teste, somente
metadados, sem ler linhas de clientes ou escrever. Isso nao prova que
queries Postgres, RPCs, constraints e fixtures das copias estejam completos.
`lexia_followups` e `playbook_vendas_miranda` nao aparecem nesse inventario.

O Redis `lexia-staging` foi observado na UI, com TLS habilitado e porta 6379.
Seu token nao foi revelado/alterado. Vinculo de credencial nao prova ainda
comportamento de locks/buffer/projecao em uma execucao integrada.

## Evidencias de testes

131 testes especificos locais passaram (128 existentes mais tres regressoes
de empacotamento/task runner). Os 193 testes locais Lote 2 tambem passaram.
Lint dos geradores/modulos tocados e `npm run typecheck` passaram.
Nao foi executado build nesta rodada: nao houve alteracao de UI/aplicacao.

Os ensaios seguintes executaram Code, IF e loops reais no n8n, mas os nodes
de banco, modelos, chamadas de subworkflow e provedores foram pinados com
dados sinteticos. Nenhum SQL/modelo/canal foi chamado por esses ensaios.

| Execucao | Workflow / cenario | Evidencia final |
| --- | --- | --- |
| `133927` | Follow-up bloqueado | pending / conversation_blocked; sem Juiz/Redator ou envio |
| `133928` | Lembrete fora da janela Boston | pending / outside_reminder_hours; sem envio |
| `133929` | Entrega com pausa manual | suppressed / blocked |
| `133930` | Entrega virtual autorizada | suppressed / virtual_delivered; nao comprova entrega de canal |
| `133931` | Epoch alterado | suppressed / state_changed |
| `133932` | Ledger incerto | delivery_unknown / requires_reconciliation; nao reenvia |

Falhas anteriores preservadas para diagnostico: `133918` e `133919` expuseram
exports nao chamaveis; `133926` expos `structuredClone` ausente. Corrigidas e
retestadas. Uma tentativa anterior do Omnichannel foi rejeitada antes de
executar por nomes de pin inexistentes, depois corrigidos. Nao ocultar essas
falhas sob os resultados locais anteriores.

138 configuracoes de nodes ativos nao-Code/nao-nota foram validadas contra os
tipos do plugin, incluindo subnodes de modelo dos agentes. Isso nao testa
credenciais, comportamento de IA, SQL, contratos de provedor ou concorrencia.
Avisos de conexoes de legado desabilitado permanecem intencionais.

## O que falta antes do teste pelo CRM

1. TLS seguro resolvido e conexao Postgres HML validada, sem credencial Miranda.
2. Conferir identidade descartavel, schemas/RPCs e seeds de conta/politica/prompt
   por tenant. Escritas/migrations nao foram executadas nesta rodada.
3. Disponibilizar uma copia revisada do cerebro original para teste, vinculada
   ao Omnichannel. O alias permanece vazio/nao revisado; nao conectar o cerebro
   de producao automaticamente. Google pessoal so apos revisar suas tools.
4. Preparar fila/playbook sinteticos para follow-up e mirror atestado de
   confirmacao/cancelamento para lembretes, sem copiar clientes reais.
5. Homologar buffer, contexto, historico, idioma e pausas com banco/Redis
   de teste, depois retorno do webhook e configuracao server-side do Frappe.
6. Homologar outbox/recovery, pipeline e automacoes. Eventos preparados nao
   significam que o Kanban ja esteja atualizado automaticamente.
7. Somente depois testar Instagram e WhatsApp pessoais, um de cada vez,
   preservando Miranda em producao como unico dono de seus canais.

## Git / continuidade

Repositorio canonico: `/Users/arthurpimenta/Developer/lexia-crm`.
Branch `codex/lote-2-workflow-mestre-omnichannel`;
HEAD `4bba3d425992af2308c6edce0e1214c40902fe35`, sem commit/push/merge.
Alteracoes locais anteriores preservadas. A referencia invalida
`refs/heads/codex/lote-1-autorizacao-workflows 2` permanece intocada.

Leia `Agent.MD`, `PLAN.MD`, a especificacao Lote 2 e os runbooks
`README.md`, `FOLLOWUP.md`, `LEMBRETES.md`, `ENTREGA_COMPARTILHADA.md` desta pasta.
Relatos anteriores de "somente local" descrevem aquelas rodadas historicas;
esta auditoria acrescenta a evidencia remota limitada acima, nao as substitui
por uma alegacao de integracao completa.
