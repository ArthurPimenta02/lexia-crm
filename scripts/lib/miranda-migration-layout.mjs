import { createHash } from 'node:crypto';

const NOTE = 'n8n-nodes-base.stickyNote';
const STEP = 256;
const ROW = 320;
const names = text => text.split('\n').map(s => s.trim()).filter(Boolean);
const lanes = (title, x, y, text, color = 4) => ({ title, x, y, names: names(text), color });

const ORIGINAL_HEADINGS = {
  'Sticky Note': 'ENTRADAS', 'Sticky Note1': 'AUTORIA', 'Sticky Note2': 'DADOS',
  'Sticky Note3': 'HISTORICO E CONTEXTO', 'Sticky Note4': 'CEREBRO',
  'Sticky Note5': 'SAIDA', 'Sticky Note6': 'MENSAGEM', 'Sticky Note7': 'BUFFER',
  'Sticky Note8': 'TEXTO', 'Sticky Note9': 'AUDIO', 'Sticky Note10': 'IMAGEM',
  'Sticky Note11': 'PDF', 'Sticky Note12': 'CONTROLE', 'Sticky Note13': 'ESTADO DO AGENTE',
  'Sticky Note14': 'ENTREGA', 'Sticky Note15': 'INTERVENCAO HUMANA',
  'Sticky Note16': 'FOLLOW-UP RAPIDO', 'Sticky Note17': 'RETOMADA',
  'Sticky Note18': 'PAUSA MANUAL', 'Sticky Note19': 'AUDIO DA EQUIPE',
  'Sticky Note20': 'VIDEO', 'Sticky Note21': 'CLIENTE', 'Sticky Note22': 'ECO E PERMISSAO',
  'Sticky Note40': 'CONTACTO', 'Sticky Note41': 'REGISTRO',
};

// Deliberately exclude parameters, IDs, credentials and raw sticky-note text.
export function visualReference(source) {
  return { name: source.name, nodes: source.nodes.map(n => ({
    name: n.name, type: n.type, position: [...n.position],
    ...(n.type === NOTE ? { parameters: {
      content: '## ' + (ORIGINAL_HEADINGS[n.name] || 'SECAO ORIGINAL'),
      width: n.parameters.width, height: n.parameters.height, color: n.parameters.color ?? 4,
    } } : {}),
  })) };
}

function plan(kind) {
  if (kind === 'omnichannel') return [
    lanes('Entrada dos canais / um evento por execucao', -6256, 48, `
      LEXIA | Distribuir eventos em serie
      LEXIA | Executar este omnichannel por evento`),
    lanes('Teste pelo CRM / webhook e retorno', -6976, -1000, `
      LEXIA | Webhook Teste Frappe
      LEXIA | Adaptar teste virtual
      LEXIA | Chamar teste neste omnichannel
      LEXIA | Conferir retorno ao CRM
      LEXIA | Responder teste Frappe`, 6),
    lanes('Entrada interna / separar atendimento e entrega', -6976, 1984, `
      LEXIA | Evento interno individual
      OPERACAO | Entrada interna
      OPERACAO | Tarefa interna?
      ENTREGA | Separar atendimento e pedido
      ENTREGA | Pedido de envio?`),
    lanes('Registrar cada mensagem antes das pausas', -4240, 1984, `
      LEXIA | Preparar registro individual
      LEXIA | Persistir evento e mensagem
      LEXIA | Registro individual confirmado
      LEXIA | Evento novo?`),
    lanes('Intervencao / projetar pausa antes do audio', -1696, -1000, `
      ESTADO | Antes de Intervenção é áudio?
      ESTADO | Antes de Intervenção é áudio? - executar
      ESTADO | Antes de Intervenção é áudio? - continuar`, 5),
    lanes('Audio da equipe / preservar mensagem mesmo com erro', -944, -1504, `
      LEXIA | Erro audio equipe preserva pausa
      LEXIA | Normalizar audio da equipe
      LEXIA | Gravar transcricao humana`, 5),
    lanes('Lead pendente / conferir todos os motivos de pausa', -1952, 2496, `
      LEXIA | Enfileirar lead duravel
      ESTADO | Antes de LEXIA | Checar todos os bloqueios
      ESTADO | Antes de LEXIA | Checar todos os bloqueios - executar
      ESTADO | Antes de LEXIA | Checar todos os bloqueios - continuar
      LEXIA | Checar todos os bloqueios`, 5),
    lanes('Resultado da midia / sem duplicar o registro', 1776, 1984, `
      LEXIA | Falha de midia preserva mensagem
      LEXIA | Normalizar resultado de midia
      LEXIA | Atualizar midia sem duplicar mensagem`, 6),
    lanes('Buffer / dona do lote e concorrencia', 3232, 1280, `
      LEXIA | Lote autorizado
      LEXIA | Lote reivindicado?
      LEXIA | Aguardar lote em andamento?
      LEXIA | Aguardar concorrencia`),
    lanes('Contexto duravel / prompt exato por empresa', 5920, -336, `
      LEXIA | Estado e contexto duraveis
      LEXIA | Configuracao de contexto
      LEXIA | Validar configuracao unica
      LEXIA | Guardar contexto versionado`, 6),
    lanes('Cerebro / conferir a copia configurada', 7488, -336, `
      LEXIA | Cerebro de teste revisado?
      LEXIA | Conferir cerebro importado
      LEXIA | Bloquear tools reais no teste`),
    lanes('Fatos devolvidos pelo cerebro / validar e persistir', 8480, 1344, `
      LEXIA | Validar fatos operacionais do cerebro
      LEXIA | Persistir fatos apos o cerebro
      LEXIA | Restaurar saida validada`),
    lanes('Handoff / prioridade e bloqueio independente', 8704, -1000, `
      LEXIA | Cerebro solicitou handoff?
      LEXIA | Registrar handoff independente
      ESTADO | Antes de LEXIA | Handoff bloqueante?
      ESTADO | Antes de LEXIA | Handoff bloqueante? - executar
      ESTADO | Antes de LEXIA | Handoff bloqueante? - continuar
      LEXIA | Handoff bloqueante?`, 5),
    lanes('Resposta / encaminhar cada acao pelo envio comum', 9248, 1984, `
      LEXIA | Tem entregas?
      LEXIA | Resultado virtual Frappe
      ENTREGA | Resposta virtual tem acoes?
      ENTREGA | IDs da resposta
      ENTREGA | Pedido da resposta
      ENTREGA | Chamar envio neste omnichannel
      ENTREGA | Restaurar resposta virtual
      LEXIA | Resultado virtual revalidado
      ENTREGA | Concluir canal virtual?
      LEXIA | Concluir lote virtual
      LEXIA | Concluir lote`),
    lanes('Fila de follow-up / despacho e retorno ao CRM', 11072, 48, `
      LEXIA | Agendar follow-up central
      EQUIPE | Preparar despacho apos lote
      EQUIPE | Despachar neste omnichannel
      CRM | Conversa virtual?
      LEXIA | Devolver resposta virtual`),
    lanes('Envio comum / contrato, plano e revalidacao por acao', 2720, 3648, `
      Config Entrega Compartilhada
      ENTREGA | Validar contrato e origem
      ENTREGA | Conferir identidade central
      ENTREGA | Identidade confirmada
      ENTREGA | Resolver conversa confiavel
      ENTREGA | Conversa confirmada
      ESTADO | Antes de ENTREGA | Registrar plano idempotente
      ESTADO | Antes de ENTREGA | Registrar plano idempotente - executar
      ESTADO | Antes de ENTREGA | Registrar plano idempotente - continuar
      ENTREGA | Registrar plano idempotente
      ENTREGA | Plano confirmado
      ENTREGA | Plano registrado?
      ENTREGA | Selecionar acao
      ENTREGA | Ler estado antes da acao
      ENTREGA | Revalidar antes da acao
      ENTREGA | Acao permitida?
      ENTREGA | Canal virtual?
      ENTREGA | Entrega virtual atomica
      ENTREGA | Confirmar virtual
      ENTREGA | Claim atomico por acao
      ENTREGA | Conferir claim
      ENTREGA | Claim exclusivo?
      ENTREGA | Enviar ao provedor
      ENTREGA | Classificar retorno do provedor
      ENTREGA | Confirmar entrega e historico
      ENTREGA | Resultado confirmado
      ENTREGA | Proxima acao?
      ENTREGA | Devolver recibo
      ENTREGA | Preparar espelho confirmado
      ENTREGA | Atualizar CRM pelo ledger
      ENTREGA | Preservar recibo de envio`, 6),
    lanes('CRM / timeline e outbox idempotente', 5696, 5248, `
      CRM | Resolver escopo do espelho
      CRM | Ler espelho da conversa
      CRM | Montar eventos idempotentes
      CRM | Espelhar eventos em ordem
      CRM | Registrar outbox duravel
      CRM | Reservar espelho idempotente
      CRM | Espelho reservado?
      CRM | Enviar evento ao Frappe
      CRM | Confirmar espelho
      CRM | Registrar resultado do espelho`),
    lanes('Comandos do CRM / pausa, retomada e cancelamento', -6976, 3648, `
      CRM | Webhook Comandos
      CRM | Validar comando autorizado
      CRM | Aplicar comando central
      CRM | Cancelamento Google solicitado?
      CRM | Preparar cancelamento
      CRM | Chamar Agendamentos
      CRM | Conferir cancelamento duravel
      CRM | Preparar projecao do comando
      CRM | Projetar comando
      CRM | Recibo do comando
      CRM | Responder comando`, 5),
    lanes('Operacoes internas / selecionar tarefa', -6976, 5248, `
      OPERACAO | Configuracao
      OPERACAO | Identificar entrada de controle
      OPERACAO | Comando autenticado?
      OPERACAO | Manutencao agendada?
      OPERACAO | Selecionar tarefa
      OPERACAO | Projecao?
      OPERACAO | Sincronizar CRM?
      OPERACAO | Espelho completo?
      OPERACAO | Enfileirar automacao?`),
    lanes('Redis / snapshot versionado do estado central', -6976, 6848, `
      ESTADO | Ler snapshot autorizado
      ESTADO | Preparar chave versionada
      ESTADO | Projetar Redis
      ESTADO | Classificar projecao
      ESTADO | Confirmar versao projetada
      ESTADO | Retornar projecao`),
    lanes('CRM / recuperar sincronizacao pendente', -4160, 6848, `
      CRM | Buscar outbox pendente
      CRM | Recuperar evento no Frappe
      CRM | Conferir recibo recuperado
      CRM | Finalizar recuperacao`),
    lanes('Automacoes / registrar eventos recebidos', -2368, 6848, `
      CRM | Validar eventos da automacao
      CRM | Enfileirar automacao duravel`),
    lanes('Equipe / notificacoes Z-API e UAZAPI', 2720, 6848, `
      EQUIPE | Ler notificacoes pendentes
      EQUIPE | Uma notificacao por vez
      EQUIPE | Preparar notificacao
      EQUIPE | Destino revisado?
      EQUIPE | Reservar notificacao
      EQUIPE | Reserva exclusiva?
      EQUIPE | Handoff Z-API?
      EQUIPE | Enviar Z-API
      EQUIPE | Enviar UAZAPI
      EQUIPE | Classificar comprovante
      EQUIPE | Guardar resultado
      EQUIPE | Retornar tarefa`, 5),
    lanes('Manutencao / reprojetar e sincronizar', -6976, 8448, `
      MANUTENCAO | Manual
      MANUTENCAO | A cada minuto
      MANUTENCAO | Buscar conversas pendentes
      MANUTENCAO | Uma conversa por vez
      MANUTENCAO | Preparar projecao
      MANUTENCAO | Projetar estado
      MANUTENCAO | Preparar espelho
      MANUTENCAO | Atualizar CRM
      MANUTENCAO | Preparar notificacoes
      MANUTENCAO | Despachar equipe`),
  ];
  if (kind === 'cerebro') return [
    lanes('Entrada / identidade e memoria isolada', -2928, -960, `
      Config Cerebro Lexia
      LEXIA | Validar origem e limites
      LEXIA | Identidade do Supabase privado
      LEXIA | Identidade privada confirmada
      LEXIA | Ler memoria privada
      LEXIA | Entrada e memoria isoladas
      LEXIA | Chamada ja concluida?
      LEXIA | Devolver resultado idempotente`),
    lanes('Permissao de agenda / somente leitura ou criacao', -1888, 1856, `
      LEXIA | Agenda de teste autorizada?
      LEXIA | Agenda pode escrever?
      Orquestrador de Agendamento (somente disponibilidade)
      Agendamento sem agenda conectada`, 5),
    lanes('Resultado / vincular tools antes do redator', 80, 336, `
      LEXIA | Resultado e tools atestadas`),
    lanes('Saida / conferir continuidade e efeitos', 1520, 304, `
      LEXIA | Validar continuidade e efeitos`),
    lanes('Memoria / persistir e devolver ao Omnichannel', 3456, 656, `
      LEXIA | Gravar memoria privada
      LEXIA | Memoria existente?
      LEXIA | Criar memoria privada
      LEXIA | Atualizar memoria por versao
      LEXIA | Devolver contrato ao Omnichannel`),
  ];
  if (kind === 'followup') return [
    lanes('Configuracao / conferir recursos autorizados', 208, -1376, `
      Teste Manual
      LEXIA | Validar configuracao
      LEXIA | Conferir banco de teste
      LEXIA | Conferir API de teste
      LEXIA | Identidade de teste`),
    lanes('Pausas / bloquear antes do juiz e redator', 1344, -1920, `
      LEXIA | Ler escopo e pausas
      LEXIA | Validar origem do lead
      LEXIA | Bloquear antes da IA
      LEXIA | Rotear bloqueio
      LEXIA | Ja processado - nao reenviar
      LEXIA | Liberar modelos isolados`, 5),
    lanes('Proposta / revalidar antes de encaminhar', 3936, -1920, `
      LEXIA | Montar pedido de automacao
      LEXIA | Revalidar antes da entrega
      LEXIA | Aplicar permissao atual
      LEXIA | Escolher entrega
      LEXIA | Previa sem envio
      LEXIA | Entrada do delivery comum`, 6),
    lanes('Entrega / conferir recibo e historico', 4528, 384, `
      LEXIA | Conferir recibo de entrega
      LEXIA | Ler comprovante de envio
      LEXIA | Confirmar entrega no livro central
      LEXIA | Pode registrar envio?
      LEXIA | Exigir historico confirmado
      LEXIA | Resultado do follow-up`),
    lanes('Fila / reagendar ou encerrar sem inventar envio', 1392, 1504, `
      LEXIA | Preparar mudanca da fila
      LEXIA | Pode alterar fila?
      LEXIA | Atualizar fila sem envio
      LEXIA | Previa da fila
      LEXIA | Resultado da fila`),
    lanes('CRM / eventos para pipeline e timeline', 5632, -720, `
      CRM | Preparar evento de follow-up
      CRM | Envelopar eventos da automacao
      CRM | Enfileirar pelo Omnichannel`),
  ];
  if (kind === 'lembretes') return [
    lanes('Configuracao / conferir recursos autorizados', 240, -960, `
      Teste Manual
      LEXIA | Validar configuracao
      LEXIA | Conferir banco de teste
      LEXIA | Identidade confirmada
      LEXIA | Conferir API de teste
      LEXIA | Identidade da API confirmada`),
    lanes('Consultas / escopo e permissao do lembrete', 464, 640, `
      LEXIA | Selecionar consultas do teste
      Loop Consultas
      LEXIA | Resolver consulta e conversa
      LEXIA | Origem confirmada
      LEXIA | Lembrete permitido?
      LEXIA | Resultado sem envio`, 5),
    lanes('Proposta / gate e envio pelo Omnichannel', 912, -1920, `
      LEXIA | Montar pedido de lembrete
      LEXIA | Revalidar lembrete
      LEXIA | Permissao atual
      LEXIA | Chamar entrega comum?
      LEXIA | Entrada do Omnichannel
      LEXIA | Previa sem envio`, 6),
    lanes('Entrega / conferir comprovante sem renovar pausa', 912, 1504, `
      LEXIA | Conferir recibo
      LEXIA | Confirmar no livro central`),
    lanes('CRM / registrar o resultado do lembrete', 1728, 0, `
      CRM | Preparar resultado de lembrete
      CRM | Envelopar eventos da automacao
      CRM | Enfileirar pelo Omnichannel`),
  ];
  const toolEntry = lanes('Entrada / identidade, duplicidade e permissao', -80, -1920, `
    Config Tools Lexia
    LEXIA | Validar chamada de teste
    LEXIA | Conferir banco de teste
    LEXIA | Identidade confirmada
    LEXIA | Registrar chamada idempotente
    LEXIA | Chamada registrada
    LEXIA | Resultado ja confirmado?
    LEXIA | Devolver resultado conhecido
    LEXIA | Criacao incerta?
    LEXIA | Devolver pendencia de reconciliacao
    LEXIA | Conferir pausas e versao
    LEXIA | Permissao conferida
    LEXIA | Pode consultar?
    LEXIA | Recusa antes de processamento`, 5);
  if (kind === 'disponibilidade') return [toolEntry,
    lanes('Saida / registrar recibo da consulta', 1392, -160, `
      LEXIA | Preparar recibo final
      LEXIA | Confirmar recibo duravel
      LEXIA | Devolver contrato ao cerebro`),
  ];
  if (kind === 'agendamentos') return [toolEntry,
    lanes('Reserva / recapitulativo e claim exclusivo', 704, 736, `
      LEXIA | Conferir OK e recapitulativo
      LEXIA | Reservar criacao unica
      LEXIA | Claim confirmado
      LEXIA | Criacao autorizada?
      LEXIA | Recusa de claim`, 5),
    lanes('Google / revalidar imediatamente antes da criacao', 1984, -1248, `
      LEXIA | Revalidar antes do Google
      LEXIA | Gate final confirmado
      LEXIA | Pode criar agora?`, 5),
    lanes('Criacao / conferir evento retornado pelo Google', 2528, -592, `
      LEXIA | Conferir evento criado
      LEXIA | Google confirmou?`),
    lanes('Saida / recibo e reserva de outra execucao', 4992, -560, `
      LEXIA | Preparar recibo final
      LEXIA | Recusa de chamada em andamento?
      LEXIA | Devolver sem mudar claim alheio
      LEXIA | Devolver contrato ao cerebro`),
    lanes('Comando CRM / separar criacao de cancelamento', 0, -448, `
      CANCELAR | Classificar entrada
      CANCELAR | Pedido do CRM?`),
    lanes('Cancelamento / alvo mapeado e comprovacao Google', 0, 2016, `
      CANCELAR | Configuracao confiavel
      CANCELAR | Validar comando
      CANCELAR | Reservar operacao
      CANCELAR | Reserva autorizada?
      CANCELAR | Devolver estado conhecido
      CANCELAR | Excluir evento mapeado
      CANCELAR | Verificar ausencia no Google
      CANCELAR | Conferir acesso a agenda
      CANCELAR | Classificar comprovacao
      CANCELAR | Confirmar ou reconciliar`, 5),
  ];
  throw Error('unknown_layout_kind:' + kind);
}

export function layoutKind(source) {
  if (source.name.includes('OMNICHANNEL')) return 'omnichannel';
  if (source.name.startsWith('C\u00e9rebro')) return 'cerebro';
  if (source.name.includes('FOLLOW-UP')) return 'followup';
  if (source.name.includes('LEMBRETES')) return 'lembretes';
  if (source.name === 'verificar_disponibilidade') return 'disponibilidade';
  if (source.name === 'criar_agendamento') return 'agendamentos';
  throw Error('unknown_original_layout');
}

export function executableFingerprint(w) {
  const nodes = w.nodes.filter(n => n.type !== NOTE).map(n => {
    const copy = { ...n }; delete copy.position; return copy;
  });
  const copy = { ...w, nodes };
  return createHash('sha256').update(JSON.stringify(copy)).digest('hex');
}

// Preserve every surviving original anchor. Added lanes use graph columns,
// ignoring only loop-back edges for placement, never altering connections.
export function organizeMigrationCanvas(w, reference) {
  const before = executableFingerprint(w);
  const kind = layoutKind(reference);
  const anchors = new Map(reference.nodes.filter(n => n.type !== NOTE).map(n => [n.name, n.position]));
  w.nodes = w.nodes.filter(n => n.type !== NOTE);
  const placed = new Set();
  for (const n of w.nodes) if (anchors.has(n.name)) {
    n.position = [...anchors.get(n.name)]; placed.add(n.name);
  }
  const executable = w.nodes.slice();
  const byName = new Map(executable.map(n => [n.name, n]));
  const notes = [];
  function box(title, position, width, height, color = 4, identity = title) {
    const [heading, ...detail] = title.split(' / ');
    notes.push({ id: createHash('sha256').update(kind + ':layout:' + identity).digest('hex').slice(0, 32),
      name: 'MAPA | ' + title, type: NOTE, typeVersion: 1, position,
      parameters: { content: '## ' + heading + (detail.length ? '\n\n' + detail.join(' / ') : ''), width, height, color } });
  }
  // Only explicitly sanitized note headings and geometry enter the package.
  for (const n of reference.nodes.filter(n => n.type === NOTE)) {
    const p = n.parameters;
    if (executable.some(step => anchors.has(step.name) && step.position[0] >= n.position[0] &&
      step.position[0] < n.position[0] + p.width && step.position[1] >= n.position[1] &&
      step.position[1] < n.position[1] + p.height)) {
      box(p.content.replace(/^## /, ''), [...n.position], p.width, p.height, p.color ?? 4, n.name);
    }
  }
  const originalSections = {
    cerebro: [
      ['Entrada e playbook', ['When Executed by Another Workflow', 'Preparar Entrada', 'Buscar Playbook de Vendas (Cérebro)', 'Anexar Playbook ao Contexto', 'Rotear por Assunto']],
      ['Atendimento e catalogo', ['Orquestrador de Atendimento', 'Especialista em Serviços', 'OpenAI Chat Model1', 'consultar_servicos', 'consultar_promocoes', 'consultar_info_clinica']],
      ['Agendamento e tools', ['Orquestrador de Agendamento', 'Anthropic Chat Model', 'consultar_info_clinica1', 'consultar-servicos', 'verificar_disponibilidade', 'criar_agendamento']],
      ['Assunto indefinido', ['Agente Indefinido', 'OpenAI Chat Model']],
      ['Briefing e redator', ['Preparar Briefing', 'Redator — Voz do Cliente', 'Anthropic Chat Model1', 'Montar Saída Final', 'Validar Saída Cérebro']],
      ['Handoff e retorno', ['Preparar Handoff', 'Devolver Saída Cérebro']],
    ],
    followup: [
      ['Entrada e roteamento', ['Schedule Trigger', 'Config Follow-up', 'Buscar Follow-ups Vencidos', 'Travas de Follow-up', 'Rotear por Ação']],
      ['Historico e juiz', ['Loop Follow-ups - Leads', 'Buscar Histórico Follow-up', 'Buscar Playbook de Vendas', 'Montar Análise do Juiz', 'Juiz de Follow-up', 'OpenAI Chat Model', 'Validar Decisão do Juiz', 'Rotear Decisão do Juiz']],
      ['Redator e encaminhamento', ['Redator de Follow-up', 'OpenAI Chat Model1', 'Preparar Envio Follow-up', 'Registrar Eco Follow-up', 'Enviar Follow-up', 'Guardar Follow-up no Histórico', 'Atualizar Após Envio']],
      ['Aviso para a equipe', ['Preparar Aviso Samuel', 'Buscar Perfil do Lead', 'Montar Link do Aviso', 'Enviar Aviso Samuel', 'Atualizar Após Aviso']],
      ['Reagendar', ['Reagendar Follow-up']], ['Pular etapa', ['Pular Etapa']], ['Encerrar', ['Encerrar Follow-up']],
    ],
    lembretes: [['Janela do lembrete / regras originais', ['Intervalo 1h', 'Config Lembretes', 'Buscar Consultas Próximas', 'Travas de Lembrete', 'Enviar Lembrete', 'Marcar Lembrete Enviado', 'Pausa Eterna (Lembrete)']]],
    disponibilidade: [['Servico, janela e slots / regras originais', ['When Executed by Another Workflow', 'Get many rows', 'Resolver Serviço e Janela', 'Status OK?', 'Get many events', 'Calcular Slots', 'Saída Erro']]],
    agendamentos: [
      ['Pedido e validacao', ['When Executed by Another Workflow', 'Get many rows', 'Validar Pedido', 'Validação OK?', 'Saída Erro']],
      ['Duplicidade', ['Evento confirmado?', 'Checar Duplicidade', 'Sem duplicado?']],
      ['Duplicado', ['Saída Erro2']],
      ['Conflito', ['Get many events', 'Checar Conflito', 'Livre?', 'Saída Erro1']],
      ['Criacao Google e registro', ['Create an event', 'Create a row']],
      ['Confirmacao', ['Montar Confirmação']],
    ],
  };
  for (const [title, sectionNames] of originalSections[kind] || []) {
    const steps = sectionNames.map(name => byName.get(name)).filter(Boolean);
    if (!steps.length) continue;
    const xs = steps.map(n => n.position[0]), ys = steps.map(n => n.position[1]);
    box(title, [Math.min(...xs) - 32, Math.min(...ys) - 80],
      Math.max(...xs) - Math.min(...xs) + 176, Math.max(...ys) - Math.min(...ys) + 160);
  }
  const collides = (x, y) => executable.some(n => placed.has(n.name) &&
    Math.abs(n.position[0] - x) < 160 && Math.abs(n.position[1] - y) < 180);
  for (const lane of plan(kind)) {
    const members = lane.names.filter(name => byName.has(name) && !anchors.has(name));
    if (!members.length) continue;
    if (members.some(name => placed.has(name))) throw Error('duplicate_layout_member:' + lane.title);
    const set = new Set(members), edges = new Map(members.map(name => [name, []]));
    const parents = new Map(members.map(name => [name, []]));
    const visiting = new Set(), visited = new Set(), order = [];
    const visit = name => {
      if (visited.has(name)) return;
      visiting.add(name);
      for (const group of w.connections[name]?.main || []) for (const e of group) {
        if (!set.has(e.node) || visiting.has(e.node)) continue;
        edges.get(name).push(e.node); parents.get(e.node).push(name); visit(e.node);
      }
      visiting.delete(name); visited.add(name); order.push(name);
    };
    members.forEach(visit);
    const depth = new Map();
    for (const name of order) depth.set(name, 1 + Math.max(0, ...edges.get(name).map(child => depth.get(child))));
    const priority = list => [...list].sort((a, b) => depth.get(b) - depth.get(a) || members.indexOf(a) - members.indexOf(b));
    const roots = priority(members.filter(n => !parents.get(n).length));
    const columns = new Map(), rows = new Map();
    for (const name of order.reverse()) {
      const from = parents.get(name);
      const column = from.length ? Math.max(...from.map(p => columns.get(p) + 1)) : 0;
      let row = from.length ? rows.get(from[0]) : 0;
      const siblings = from.length ? priority(edges.get(from[0])) : roots;
      row += Math.max(0, siblings.indexOf(name));
      const x = lane.x + column * STEP;
      while (collides(x, lane.y + row * ROW)) row++;
      byName.get(name).position = [x, lane.y + row * ROW];
      columns.set(name, column); rows.set(name, row); placed.add(name);
    }
    const group = members.map(name => byName.get(name));
    const xs = group.map(n => n.position[0]), ys = group.map(n => n.position[1]);
    box(lane.title, [Math.min(...xs) - 48, Math.min(...ys) - 112],
      Math.max(...xs) - Math.min(...xs) + 272, Math.max(...ys) - Math.min(...ys) + 288, lane.color);
  }
  const missing = executable.filter(n => !placed.has(n.name));
  if (missing.length) throw Error('unplaced_layout_nodes:' + missing.map(n => n.name).join(','));
  w.nodes.push(...notes);
  if (executableFingerprint(w) !== before) throw Error('layout_changed_executable_semantics');
  return w;
}
