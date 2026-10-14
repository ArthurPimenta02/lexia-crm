const NOTE = 'n8n-nodes-base.stickyNote';
const STEP = 250;

// Only canvas metadata is changed. Connections and executable parameters stay intact.
export function organizeMirandaCanvas(workflow) {
  const byName = new Map(workflow.nodes.map(node => [node.name, node]));
  const placed = new Set();
  const notes = workflow.nodes.filter(node => node.type === NOTE && (!node.name.startsWith('LEXIA |') || node.name.startsWith('LEXIA | SECAO VISUAL')));
  while (notes.length < 29) {
    const index = notes.length;
    const note = { id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`, name: 'LEXIA | SECAO VISUAL ' + index, type: NOTE, typeVersion: 1, parameters: {}, position: [0, 0] };
    notes.push(note);
    workflow.nodes.push(note);
  }
  let noteIndex = 0;
  const place = (names, x, y) => names.forEach((name, index) => {
    const node = byName.get(name);
    if (!node || placed.has(name)) throw new Error('layout_node_missing_or_repeated:' + name);
    node.position = [x + index * STEP, y];
    placed.add(name);
  });
  const box = (title, x, y, width, height, color = 4) => {
    const note = notes[noteIndex++];
    if (!note) throw new Error('layout_notes_exhausted');
    note.position = [x, y];
    note.parameters = { content: '## ' + title, width, height, color };
  };
  let cursor = 0;
  const stage = (title, names, color = 4) => {
    const x = cursor;
    const width = names.length * STEP + 100;
    place(names, x + 70, 900);
    box(title, x, 770, width, 330, color);
    cursor += width + 90;
    return x;
  };

  place(['Webhook WhatsApp Omnichannel', 'Adaptar Entrada Z-API'], -1500, 300);
  place(['Webhook Meta Omnichannel', 'Contatos Bloqueados Meta', 'Normalizar Entrada Meta Omnichannel'], -1500, 600);
  place(['LEXIA | Distribuir eventos em serie', 'LEXIA | Executar este omnichannel por evento'], -550, 450);
  box('01 | ENTRADAS WHATSAPP / META', -1570, 170, 1570, 570, 3);
  place(['LEXIA | Webhook Teste Frappe', 'LEXIA | Adaptar teste virtual', 'LEXIA | Chamar teste neste omnichannel', 'LEXIA | Responder teste Frappe'], -1500, 1200);
  box('02 | ENTRADA DE TESTE PELO CRM', -1570, 1070, 1150, 330, 6);

  stage('03 | CONFIGURACAO E NORMALIZACAO', ['LEXIA | Evento interno individual', 'Entrada Unificada', 'CENTRAL DE CONTROLE', 'Config Cliente Lexia', 'Normalizar Dados Operacionais'], 3);
  const ingress = stage('04 | REGISTRO INDIVIDUAL / AUTORIA', ['LEXIA | Preparar registro individual', 'LEXIA | Persistir evento e mensagem', 'LEXIA | Registro individual confirmado', 'Buscar Contacto', 'Unificar Contacto', 'LEXIA | Evento novo?', 'Verificar Intervenção', 'É intervenção humana?']);
  place(['Set Intervenção Humana', 'Intervenção é áudio?', 'Baixar Áudio da Intervenção', 'Transcrever Áudio da Intervenção', 'LEXIA | Normalizar audio da equipe', 'LEXIA | Gravar transcricao humana'], ingress + 650, 300);
  place(['LEXIA | Erro audio equipe preserva pausa'], ingress + 1400, 550);
  box('05 | INTERVENCAO HUMANA / AUDIO DA EQUIPE', ingress + 580, 170, 1600, 580, 5);
  stage('06 | PAUSAS ANTES DA MIDIA', ['LEXIA | Enfileirar lead duravel', 'Ver Pausa Manual', 'Ver Pausa Eterna', 'Ver Status Agente', 'LEXIA | Checar todos os bloqueios', 'Agente desativado?']);
  stage('07 | TIPO DE MENSAGEM', ['Switch']);
  const mediaX = cursor;
  const mediaRows = [
    ['TEXTO', ['Texto']],
    ['AUDIO', ['Audio', 'HTTP Request5', 'Transcribe a recording']],
    ['IMAGEM / LEGENDA', ['Imagem', 'HTTP Request7', 'Analyze image']],
    ['PDF', ['PDF', 'HTTP Request9', 'Extract from File']],
    ['VIDEO', ['Imagem1', 'HTTP Request11', 'Analyze video']],
  ];
  mediaRows.forEach(([label, names], index) => {
    const y = 300 + index * 300;
    place(names, mediaX + 70, y);
    box('08 | MIDIA: ' + label, mediaX, y - 120, 850, 280, 6);
  });
  place(['LEXIA | Falha de midia preserva mensagem'], mediaX + 820, 1830);
  cursor += 1080;
  stage('09 | RESULTADO DA MIDIA / REGISTRO', ['LEXIA | Normalizar resultado de midia', 'LEXIA | Atualizar midia sem duplicar mensagem']);
  const buffer = stage('10 | BUFFER / DEBOUNCE / DONO DO LOTE', ['Redis', 'Redis_Buffer1', 'Wait', 'Redis_Buffer2', 'LEXIA | Lote autorizado', 'LEXIA | Lote reivindicado?'], 3);
  place(['LEXIA | Aguardar lote em andamento?', 'LEXIA | Aguardar concorrencia'], buffer + 820, 300);
  box('11 | LOTE CONCORRENTE: AGUARDAR, NAO DUPLICAR', buffer + 750, 170, 700, 340, 5);
  stage('12 | HISTORICO E CONTEXTO DURAVEL', ['Mensagem para o Agente', 'Buscar Histórico da Conversa', 'Agrupar Histórico', 'LEXIA | Estado e contexto duraveis', 'Obter Contexto Activo']);
  const context = stage('13 | PROMPT POR EMPRESA / AGENTE DE CONTEXTO', ['LEXIA | Configuracao de contexto', 'LEXIA | Validar configuracao unica', 'Preparar Pacote de Contexto', 'Agente de Contexto', 'Preparar Contexto Activo', 'LEXIA | Guardar contexto versionado', 'Guardar Contexto Activo Genérico'], 6);
  place(['OpenAI Chat Model'], context + 820, 1210);
  // Include the model connector inside the context section rather than another section.
  notes[noteIndex - 1].parameters.height = 620;
  const brain = stage('14 | CEREBRO ORIGINAL / RESPOSTA VALIDADA', ['Preparar Payload Cérebro', 'LEXIA | Cerebro de teste revisado?', 'Chamar Cérebro do Cliente', 'Validar Saída Cérebro Cliente', 'Fundir Contexto Pós-Cérebro', 'LEXIA | Validar fatos operacionais do cerebro', 'LEXIA | Persistir fatos apos o cerebro', 'LEXIA | Restaurar saida validada', 'Guardar Contexto Pós-Cérebro'], 3);
  place(['LEXIA | Bloquear tools reais no teste'], brain + 320, 500);
  const output = stage('15 | HANDOFF / PROPOSTA DE RESPOSTA', ['LEXIA | Cerebro solicitou handoff?', 'Preparar Saída Omnichannel', 'LEXIA | Tem entregas?', 'É Teste Workflow? - Saída Genérica']);
  place(['LEXIA | Registrar handoff independente'], output + 70, 300);
  box('16 | HANDOFF INDEPENDENTE', output, 170, 430, 340, 5);
  place(['LEXIA | Resultado virtual Frappe', 'LEXIA | Persistir resposta no canal virtual', 'LEXIA | Identificar historico virtual', 'LEXIA | Restaurar revalidacao virtual', 'LEXIA | Resultado virtual revalidado', 'LEXIA | Concluir lote virtual', 'LEXIA | Devolver resposta virtual'], output + 820, 1500);
  box('17 | RESPOSTA NO CANAL VIRTUAL: SEM ENVIO AO PROVEDOR', output + 750, 1370, 1850, 350, 6);
  stage('18 | PLANO ORDENADO / UMA BOLHA POR VEZ', ['LEXIA | Preparar plano de entrega', 'LEXIA | Anexar IDs de acoes', 'Split Out - Texto Genérico', 'Loop Over Items - Entregas', 'Wait - Texto Genérico'], 3);
  const gate = stage('19 | REVALIDAR PAUSAS / CLAIM ANTES DE CADA ENVIO', ['LEXIA | Ler pausa manual na entrega', 'LEXIA | Ler agendamento legado na entrega', 'LEXIA | Ler handoff legado na entrega', 'LEXIA | Revalidar legado antes da bolha', 'LEXIA | Legado permite esta bolha?', 'LEXIA | Claim antes de cada envio', 'LEXIA | Claim autorizado?']);
  place(['LEXIA | Encerrar resposta bloqueada'], gate + 1320, 1500);
  box('20 | ENVIO SUPRIMIDO: PRESERVAR HISTORICO', gate + 1250, 1370, 570, 350, 5);
  stage('21 | SELECIONAR PROVEDOR', ['Enviar Mensagem Cliente - Texto Genérico']);
  const send = cursor;
  ['LEXIA | Enviar whatsapp', 'LEXIA | Enviar instagram', 'LEXIA | Enviar messenger'].forEach((name, index) => place([name], send + 70, 600 + index * 300));
  box('22 | ENTREGA WHATSAPP / INSTAGRAM / MESSENGER', send, 470, 550, 940, 6);
  cursor += 700;
  stage('23 | CONFIRMAR OU RECONCILIAR / FECHAR LOTE', ['LEXIA | Classificar resultado de envio', 'Guardar Mensagem Enviada - Texto Genérico', 'LEXIA | Entrega confirmada?', 'LEXIA | Concluir lote']);

  const crmX = ingress + 400;
  place(['CRM | Ler espelho da conversa', 'CRM | Montar eventos idempotentes', 'CRM | Espelhar eventos em ordem', 'CRM | Enviar evento ao Frappe', 'CRM | Confirmar espelho'], crmX + 70, 2450);
  box('24 | ESPELHO CRM: MENSAGENS / ESTADO / ENTREGAS', crmX, 2320, 1400, 380, 4);

  const legacy = workflow.nodes.filter(node => node.disabled && node.type !== NOTE);
  legacy.forEach((node, index) => place([node.name], (index % 12) * STEP, 3400 + Math.floor(index / 12) * 260));
  box('25 | REFERENCIA DO ORIGINAL: NODES DESATIVADOS, SEM EXECUCAO', -70, 3230, 3150, Math.ceil(legacy.length / 12) * 260 + 170, 7);
  if (noteIndex !== notes.length) throw new Error('layout_unused_original_notes');
  for (const node of workflow.nodes) {
    if (node.type !== NOTE && !placed.has(node.name)) throw new Error('layout_unplaced_node:' + node.name);
  }

  const guides = ['LEXIA | CONFIGURAR ANTES DO TESTE', 'LEXIA | PAUSAS E COMPATIBILIDADE', 'LEXIA | ENTREGA E CRM', 'LEXIA | VERIFICACAO LOCAL'];
  guides.forEach((name, index) => { byName.get(name).position = [-1570 + index * 1400, -950]; });
  const legacyGuide = byName.get('LEXIA | RAMOS LEGADOS SUBSTITUIDOS');
  legacyGuide.position = [3300, 3230];
  return workflow;
}
