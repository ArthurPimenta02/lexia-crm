# Miranda V2 - seis workflows candidatos e inativos

Os 16 blocos técnicos da primeira revisão foram consolidados em seis canvases compreensíveis. Todos permanecem com `active: false`, sem credenciais e sem destinos reais embutidos. Importar não significa publicar: cada integração ainda precisa ser ligada e validada em laboratório.

## O que é cada workflow

1. **Entrada Omnichannel:** recebe Z-API, Meta e o teste da plataforma; identifica a conta confiável, deduplica, registra a mensagem, aplica a pausa humana antes de mídia/IA e forma o lote do lead.
2. **Atendimento IA:** monta contexto isolado, usa o prompt da empresa, chama o cérebro privado e aplica handoff/agendamento antes de propor respostas.
3. **Agenda:** reúne consulta de disponibilidade e criação de agendamento, mantendo operações e provas de tool separadas.
4. **Follow-ups e Lembretes:** mantém os dois agendadores separados no mesmo canvas e obriga ambos a passar pelo ledger e pelo gate de saída.
5. **Integração CRM:** espelha Lead, Deal e timeline no Frappe e recebe comandos autenticados de pausa, retomada, handoff, cancelamento e comparecimento.
6. **Saída Segura:** é o único dono do envio ao provedor; revalida cada ação, registra progresso parcial e interrompe resultados incertos para reconciliação.

## Ordem de importação em laboratório

1. Integração CRM.
2. Saída Segura.
3. Agenda.
4. Atendimento IA.
5. Follow-ups e Lembretes.
6. Entrada Omnichannel por último.

Os nós Execute Workflow são vinculados pelos nomes exibidos após a importação. Credenciais devem ser criadas e associadas manualmente no laboratório. URLs, tokens, IDs de conta, calendário, ativos de mídia e allowlists ficam somente em credenciais ou variáveis do ambiente isolado.

## Garantias estruturais locais

- a mensagem é deduplicada e persistida antes de pausa, buffer, mídia ou IA;
- intervenção humana cria/renova o bloqueio antes de transcrição;
- apenas Provider Send possui um caminho de rede de saída;
- cada ação passa novamente pelo claim transacional imediatamente antes do envio;
- resultado incerto vira delivery_unknown e nunca autoriza retry cego;
- português, inglês e espanhol são resolvidos pelo turno do lead, impostos ao redator e revalidados antes do plano de entrega;
- follow-ups e lembretes entram pelo mesmo ledger/gate;
- agendamento só emite appointment.confirmed depois do Calendar e do registro privado;
- cancelamento, comparecimento/no-show, pausa e handoff chegam por comandos autenticados do CRM;
- o Frappe é espelho/cockpit; o Supabase central permanece a autoridade durável.

## Validação HML

Cópias privadas hidratadas dos seis workflows foram publicadas no laboratório. O pacote local e as seis cópias HML têm os mesmos 312 nodes; a hidratação acrescenta credenciais, referências internas e configuração, não nodes. O gateway sintético é separado. Webhooks de canal e schedules estão desligados, Calendar está desabilitado e a entrega permanece observe_only. O Agent Test percorreu Entrada, buffer, Atendimento real, CRM e Saída em português, inglês e espanhol e terminou sempre suprimido sem executar provider. Duas rodadas com mensagens rápidas descartaram a resposta obsoleta, reuniram as duas entradas seguintes com o histórico e responderam sem reapresentação ou pergunta repetida. Os arquivos deste diretório continuam inativos e sem credenciais; o deployment HML não foi versionado.

## Ainda depende de integração real

Assinaturas e payloads reais dos provedores, efeitos reais de canais, permissões finais, campos das tabelas privadas e respostas operacionais do Calendar ainda precisam de validação própria. O Agent Test usa o gateway dos seis workflows HML completos, com canal virtual. Estes exports não estão prontos para produção e os workflows operacionais originais da Miranda não foram alterados.
