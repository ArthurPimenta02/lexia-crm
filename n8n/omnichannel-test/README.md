# OMNI v2 - mestre executável de teste

Estado em 10/10/2026. Workflows n8n **executáveis**, inativos, com adaptadores,
cérebro e provedor falsos. Substituem, como referência de execução, os nós
ilustrativos de `n8n/omnichannel/` (que continuam lá só como histórico).

O mestre amplo deste diretório continua sem importação. O arquivo
`remote-gateway.sdk.mjs` define separadamente o gateway mínimo que conecta o
Frappe de laboratório aos seis runtimes compactos de
`n8n/miranda-v2-lab-runtime/`. Ele só aceita o contrato sintético autenticado,
roteia por `Execute Workflow` interno e exige
`provider_send_attempted = false`. Gateway e filhos não possuem Supabase,
Redis, modelo, cérebro real, tool, canal ou provedor.

No laboratório, o gateway e os seis filhos internos foram publicados. Os seis
alvos passaram por HTTP e a UI do Frappe percorreu o caminho completo de
omnichannel. A validação também confirmou HTTP 403 sem autenticação ou com
autenticação incorreta, e recusa de modo de entrega real ou expectativa de
envio. O segredo fica fora do Git e não é devolvido ao navegador.

Uma primeira tentativa com filhos não publicados foi recusada pelo n8n. A
correção não desativou essa validação: os seis filhos seguros foram reduzidos
ao runtime sintético, conferidos e publicados antes do gateway. O comando
`npm run build:miranda:v2:lab-deployment` falha se encontrar node de
rede/modelo/banco/Redis, `structuredClone`, URL literal, formato de segredo ou
referência externa inesperada. Ele usa exports locais somente para preservar
IDs e metadados; seus resultados ficam fora do Git.

## Como é construído

- Lógica: `lib/omnichannel/master-runtime.ts`, encadeando os módulos já
  testados (adaptador, escopo, máquina de estados, buffer, contexto, contrato
  do cérebro, política por empresa e livro-razão de saída).
- Geração: `npm run build:omni:test-workflows` grava `workflows/*.json` e
  `workflows/manifest.json`. O código é embutido em cada nó Code (bundle de
  ~76 KB), porque nós Code não importam arquivos locais. Não editar os JSON à
  mão: o teste falha se estiverem desatualizados.
- Execução local: `local-executor.ts` interpreta os mesmos JSON (gatilhos,
  Code, IF, Execute Workflow, `splitInBatches`), com nós Code em sandbox `vm`
  sem `require` nem globais do Node.
- Cenários: `scenarios.ts` (empresas sintéticas A com pausa pós-agendamento
  ligada, B desligada e C sem configuração de contexto).
- Testes: `tests/omnichannel-master-e2e.test.ts` roda o Scenario Runner de ponta
  a ponta e confere resultados, fronteiras e nós executados.

## Qual nó executa cada etapa

| Etapa | Workflow | Nó |
| --- | --- | --- |
| Rotear o evento | Master | `Route Event` + IFs |
| 1. Identificar empresa, canal, conta, conversa e autor | Ingress | `Adapter Ingress And Trusted Scope` |
| 2. Registrar antes do buffer (ID, horário, autoria, mídia) e deduplicar | Ingress | `Persist, Authorship And Intervention` |
| 3. Intervenção humana imediata; registrar durante pausas | Ingress | `Persist, Authorship And Intervention` |
| 4. Buffer: janela, dono por sequência, bloqueio, corte | Conversation Turn | `Buffer Claim (Owner And Cutoff)` |
| 5. Histórico e configuração exata da empresa | Conversation Turn | `History And Company Context` / `Close Batch Without Brain` |
| 6. Pedido ao cérebro e cérebro falso | Conversation Turn → Brain Fake | `Build Brain Request` → `Private Brain And Tools (Fake)` |
| 7. Validar, aplicar eventos com a política, manter o estado lido | Conversation Turn | `Validate And Apply Brain Result` |
| 8. Gate por mensagem: bloqueios, mensagem nova, dono, duplicidade | Delivery | `Claim Next Action (Gate)` |
| 8. Provedor falso registra o que receberia | Provider Send Fake | `Fake Provider (No Network)` |
| 9. Registrar enviado, falha ou incerto; supersede/reprocesso | Delivery / Conversation Turn | `Record Delivery Result`, `Finish Batch Or Supersede` |
| Lembretes e follow-ups pelo mesmo gate | Automation → Delivery | `Register Automation Request` |
| Comandos da plataforma e política (só admin altera) | State Command | `Apply State Command` |
| Reconciliação e retry | Recovery → Delivery | `Reconcile Or Retry` |
| Demonstração | Scenario Runner | `Load Synthetic Scenarios` → `Each Step` → `Run Master` |

O cérebro e o provedor falsos recebem apenas `brain_call` e `provider_call`
(contrato e roteiro de teste), nunca o armazenamento; o teste confirma isso.

## Cenários cobertos

Pausa pós-agendamento ligada e desligada; outra conversa do mesmo lead não
pausa; intervenção durante o buffer e durante a geração; áudio da equipe com
falha; mensagem nova antes do envio com reprocessamento; entrega parcial e
retry; cancelamento; confirmação única; lembretes antes e depois do início;
timeout incerto, duplicatas de entrada, buffer, entrega e eco; handoff com
resolução e retomada separadas; tenant forjado; empresa sem configuração;
política alterada só pelo admin.

## O que ainda depende de integração real

| Parte | Hoje | Integração |
| --- | --- | --- |
| Armazenamento | objeto de teste passado entre nós | RPCs do Supabase central (migration do Lote 2, ainda não aplicada) |
| Buffer e espera | evento `buffer_tick` com horário do cenário | nó Wait/agendador + `lexia_omni_claim_inbound_batch` com relógio do banco |
| Adaptadores | payload sintético | webhooks Meta e Z-API com assinatura |
| Contexto | agente de contexto falso | modelo do agente de contexto |
| Cérebro e tools | cérebro falso com tool simulada | subworkflow privado de cada empresa |
| Provedor | provedor falso, sem rede | `Provider Send` com credencial, apenas no ambiente autorizado |
| Projeção Redis | inexistente | Redis v2 isolado |
| Mídia | status simulado | download e transcrição |

## Hipóteses a confirmar no n8n de teste

- `$getWorkflowStaticData('global')` guarda o armazenamento entre nós dentro de
  uma execução manual e entre iterações do laço (usado só neste harness).
- Parâmetros do Execute Workflow (`typeVersion` 1.1, origem `database`) e do
  gatilho em modo `passthrough`; os IDs de workflow precisam ser associados na
  importação, pois os JSON referenciam os subworkflows pelo nome.
- O sandbox do nó Code aceita o bundle (`structuredClone` tem fallback JSON).
- Tamanho dos JSON (~1,5 MB no total) dentro do limite da instância.
