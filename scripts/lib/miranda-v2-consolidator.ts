import {
  CANDIDATE_PREFIX,
  WorkflowBuilder,
  code,
  ifNode,
  stableUuid,
  subworkflow,
  switchNode,
  trigger,
  type CandidateWorkflow,
  type N8nNode,
} from "./miranda-v2-builder";

type CandidateEntry = [string, CandidateWorkflow];

type PartOptions = {
  include?: string[];
  exclude?: string[];
};

const TARGETS = {
  entry: "01 ENTRADA OMNICHANNEL",
  service: "02 ATENDIMENTO IA",
  agenda: "03 AGENDA",
  automations: "04 FOLLOW-UPS E LEMBRETES",
  crm: "05 INTEGRAÇÃO CRM",
  delivery: "06 SAÍDA SEGURA",
} as const;

const FILES = {
  entry: "01-entrada-omnichannel-v2.inactive.json",
  service: "02-atendimento-ia-v2.inactive.json",
  agenda: "03-agenda-v2.inactive.json",
  automations: "04-followups-lembretes-v2.inactive.json",
  crm: "05-integracao-crm-v2.inactive.json",
  delivery: "06-saida-segura-v2.inactive.json",
} as const;

const NOTES: Record<string, string> = {
  CANAIS: "Recebe Z-API, Meta e o teste sintético. Não aceita o tenant enviado pelo payload.",
  INGRESSO: "Deduplica, resolve a conta confiável e grava toda mensagem antes de qualquer decisão.",
  DECISÃO: "Separa lead, intervenção humana, eco e duplicidade depois da persistência.",
  MÍDIA: "Processa texto, áudio, imagem, PDF ou vídeo. Falha de mídia preserva mensagem e pausa.",
  BUFFER: "Agrupa mensagens do lead e chama a IA somente com um lote ainda permitido.",
  RETORNO: "Fecha o evento e responde o teste da plataforma sem liberar envio real.",
  LABORATÓRIO: "Oferece simulação curta e execução completa com canal virtual. Nenhum modo alcança provedor real.",
  CONTEXTO: "Carrega prompt, histórico e estado pelo escopo completo da conversa.",
  CÉREBRO: "Executa a inteligência privada da Miranda sem credencial de envio ao provedor.",
  VÍNCULO: "Vincula o resultado à mesma solicitação, conversa, empresa e versão de estado.",
  EFEITOS: "Aplica handoff e agendamento antes de propor qualquer resposta.",
  OPERAÇÃO: "Escolhe disponibilidade ou criação de agendamento por contrato explícito.",
  DISPONIBILIDADE: "Consulta serviços e horários, mas nunca comprova criação de agendamento.",
  AGENDAMENTO: "Cria o evento e só então emite appointment.confirmed com atestado da tool.",
  "FOLLOW-UP": "Seleciona e redige follow-ups; não envia diretamente ao canal.",
  LEMBRETE: "Seleciona lembretes de agendamentos confirmados e não cancelados.",
  AUTOMAÇÃO: "Deduplica e submete follow-up ou lembrete ao mesmo gate de saída.",
  RESULTADO: "Atualiza o estado privado somente após resultado confirmado ou preservado.",
  COMANDOS: "Recebe pausa, retomada, handoff, cancelamento e presença autenticados pelo CRM.",
  ESPELHO: "Cria ou atualiza Lead, Deal e timeline em ordem idempotente.",
  RESPOSTA: "Responde comandos do CRM e retorna confirmações para os demais workflows.",
  GATE: "Revalida estado e bloqueios imediatamente antes de cada ação.",
  PROVEDOR: "Único trecho autorizado a chamar Z-API ou Meta; não repete resultado incerto.",
  LEDGER: "Registra envio, falha ou incerteza e preserva o progresso parcial do plano.",
};

function clone<T>(value: T): T {
  return structuredClone(value);
}

function transformStrings(value: unknown, names: Map<string, string>): unknown {
  if (typeof value === "string") {
    let result = value;
    for (const [before, after] of [...names.entries()].sort(
      ([left], [right]) => right.length - left.length,
    )) {
      for (const [open, close] of [
        ["$('", "')"],
        ['$("', '")'],
        ["$node['", "']"],
        ['$node["', '"]'],
      ]) {
        result = result.split(`${open}${before}${close}`).join(`${open}${after}${close}`);
      }
    }
    return result;
  }
  if (Array.isArray(value)) return value.map((item) => transformStrings(item, names));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, transformStrings(item, names)]),
    );
  }
  return value;
}

function updateWorkflowTarget(node: N8nNode, shortName: string) {
  const workflowId = node.parameters.workflowId;
  if (!workflowId || typeof workflowId !== "object") return;
  const target = workflowId as Record<string, unknown>;
  target.value = "";
  target.mode = "list";
  target.__rl = true;
  target.cachedResultName = `${CANDIDATE_PREFIX} - ${shortName}`;
}

class Composer {
  private readonly builder: WorkflowBuilder;
  private readonly sourceMaps = new Map<string, Map<string, string>>();
  private readonly sources = new Map<string, CandidateWorkflow>();
  private readonly sourceForNode = new Map<string, string>();
  private readonly sectionForNode = new Map<string, string>();
  private readonly sectionOrder: string[] = [];
  private order = 0;
  private readonly orderForNode = new Map<string, number>();

  constructor(private readonly shortName: string) {
    this.builder = new WorkflowBuilder(shortName);
  }

  private section(section: string) {
    if (!this.sectionOrder.includes(section)) this.sectionOrder.push(section);
  }

  addPart(
    source: CandidateWorkflow,
    sourceKey: string,
    section: string,
    options: PartOptions = {},
  ) {
    this.section(section);
    this.sources.set(sourceKey, source);
    const names = this.sourceMaps.get(sourceKey) ?? new Map<string, string>();
    this.sourceMaps.set(sourceKey, names);
    const included = options.include ? new Set(options.include) : null;
    const excluded = new Set(options.exclude ?? []);

    for (const sourceNode of source.nodes) {
      if (included && !included.has(sourceNode.name)) continue;
      if (excluded.has(sourceNode.name)) continue;
      if (names.has(sourceNode.name)) {
        throw new Error(`${this.shortName}: node included twice: ${sourceKey}/${sourceNode.name}`);
      }
      const name = `${section} | ${sourceNode.name}`;
      names.set(sourceNode.name, name);
      this.builder.add(
        name,
        sourceNode.type,
        sourceNode.typeVersion,
        clone(sourceNode.parameters),
        {
          ...(typeof sourceNode.onError === "string" ? { onError: sourceNode.onError } : {}),
          ...(typeof sourceNode.retryOnFail === "boolean"
            ? { retryOnFail: sourceNode.retryOnFail }
            : {}),
        },
      );
      this.sourceForNode.set(name, sourceKey);
      this.sectionForNode.set(name, section);
      this.orderForNode.set(name, this.order++);
    }
    return names;
  }

  ref(sourceKey: string, sourceName: string) {
    const value = this.sourceMaps.get(sourceKey)?.get(sourceName);
    if (!value) throw new Error(`${this.shortName}: missing reference ${sourceKey}/${sourceName}`);
    return value;
  }

  addCode(section: string, name: string, jsCode: string) {
    this.section(section);
    const fullName = `${section} | ${name}`;
    code(this.builder, fullName, jsCode);
    this.sectionForNode.set(fullName, section);
    this.orderForNode.set(fullName, this.order++);
    return fullName;
  }

  addIf(section: string, name: string, expression: string) {
    this.section(section);
    const fullName = `${section} | ${name}`;
    ifNode(this.builder, fullName, expression);
    this.sectionForNode.set(fullName, section);
    this.orderForNode.set(fullName, this.order++);
    return fullName;
  }

  addSwitch(section: string, name: string, expression: string, values: string[]) {
    this.section(section);
    const fullName = `${section} | ${name}`;
    switchNode(this.builder, fullName, expression, values);
    this.sectionForNode.set(fullName, section);
    this.orderForNode.set(fullName, this.order++);
    return fullName;
  }

  addTrigger(section: string, name: string) {
    this.section(section);
    const fullName = `${section} | ${name}`;
    trigger(this.builder, fullName);
    this.sectionForNode.set(fullName, section);
    this.orderForNode.set(fullName, this.order++);
    return fullName;
  }

  addSubworkflow(section: string, name: string, target: string) {
    this.section(section);
    const fullName = `${section} | ${name}`;
    subworkflow(this.builder, fullName, target);
    this.sectionForNode.set(fullName, section);
    this.orderForNode.set(fullName, this.order++);
    return fullName;
  }

  connect(from: string, to: string, output = 0, type = "main", targetIndex = 0) {
    this.builder.connect(from, to, output, type, targetIndex);
  }

  node(name: string) {
    return this.builder.node(name);
  }

  private copySourceConnections() {
    for (const [sourceKey, source] of this.sources) {
      const names = this.sourceMaps.get(sourceKey)!;
      for (const [from, byType] of Object.entries(source.connections)) {
        const mappedFrom = names.get(from);
        if (!mappedFrom) continue;
        for (const [type, outputs] of Object.entries(byType)) {
          outputs.forEach((branch, output) => {
            branch.forEach((connection) => {
              const mappedTo = names.get(connection.node);
              if (mappedTo) {
                this.builder.connect(mappedFrom, mappedTo, output, type, connection.index);
              }
            });
          });
        }
      }
    }
  }

  private rewriteNodeReferences() {
    for (const node of this.builder.nodes) {
      const sourceKey = this.sourceForNode.get(node.name);
      if (!sourceKey) continue;
      node.parameters = transformStrings(
        node.parameters,
        this.sourceMaps.get(sourceKey)!,
      ) as Record<string, unknown>;
    }
  }

  private layout(workflow: CandidateWorkflow) {
    let sectionStart = 0;
    const notes: N8nNode[] = [];
    const crossSectionOutputs = new Set<string>();

    for (const [from, byType] of Object.entries(workflow.connections)) {
      const fromSection = this.sectionForNode.get(from);
      for (const branch of byType.main ?? []) {
        for (const connection of branch) {
          const toSection = this.sectionForNode.get(connection.node);
          if (fromSection && toSection && fromSection !== toSection) {
            crossSectionOutputs.add(from);
          }
        }
      }
    }

    for (const section of this.sectionOrder) {
      const sectionNodes = workflow.nodes.filter(
        (node) => this.sectionForNode.get(node.name) === section,
      );
      if (sectionNodes.length === 0) continue;
      const names = new Set(sectionNodes.map((node) => node.name));
      const aiNodes = new Set<string>();
      for (const [from, byType] of Object.entries(workflow.connections)) {
        if (!names.has(from)) continue;
        if (Object.keys(byType).some((type) => type.startsWith("ai_"))) aiNodes.add(from);
      }
      const mainNodes = sectionNodes.filter((node) => !aiNodes.has(node.name));
      const incoming = new Map(mainNodes.map((node) => [node.name, 0]));
      const children = new Map(mainNodes.map((node) => [node.name, [] as string[]]));
      const parents = new Map(mainNodes.map((node) => [node.name, [] as string[]]));
      for (const [from, byType] of Object.entries(workflow.connections)) {
        if (!names.has(from) || aiNodes.has(from)) continue;
        for (const branch of byType.main ?? []) {
          for (const connection of branch) {
            if (!names.has(connection.node) || aiNodes.has(connection.node)) continue;
            children.get(from)?.push(connection.node);
            parents.get(connection.node)?.push(from);
            incoming.set(connection.node, (incoming.get(connection.node) ?? 0) + 1);
          }
        }
      }
      const roots = mainNodes
        .filter((node) => (incoming.get(node.name) ?? 0) === 0)
        .sort(
          (left, right) =>
            (this.orderForNode.get(left.name) ?? 0) -
            (this.orderForNode.get(right.name) ?? 0),
        );
      const queue = (roots.length > 0 ? roots : mainNodes.slice(0, 1)).map((node) => node.name);
      const depth = new Map<string, number>(queue.map((name) => [name, 0]));
      while (queue.length > 0) {
        const current = queue.shift()!;
        for (const child of children.get(current) ?? []) {
          if (!depth.has(child)) {
            depth.set(child, (depth.get(current) ?? 0) + 1);
            queue.push(child);
          }
        }
      }
      let orphanDepth = Math.max(0, ...depth.values()) + 1;
      for (const node of mainNodes) {
        if (!depth.has(node.name)) depth.set(node.name, orphanDepth++);
      }

      // Keep transitions to the next visual section on the right edge. Without
      // this, a terminal branch created early in the source workflow draws a
      // long wire across the rest of its own section.
      const finalDepth = Math.max(0, ...depth.values()) + 1;
      for (const node of mainNodes) {
        if (
          crossSectionOutputs.has(node.name) &&
          (children.get(node.name)?.length ?? 0) === 0
        ) {
          depth.set(node.name, finalDepth);
        }
      }

      const grouped = new Map<number, N8nNode[]>();
      for (const node of mainNodes) {
        const value = depth.get(node.name)!;
        const group = grouped.get(value) ?? [];
        group.push(node);
        grouped.set(value, group);
      }

      const orderedDepths = [...grouped.keys()].sort((left, right) => left - right);
      const rank = new Map<string, number>();
      const refreshRanks = () => {
        for (const value of orderedDepths) {
          grouped.get(value)?.forEach((node, index) => rank.set(node.name, index));
        }
      };
      const sourceOrder = (name: string) => this.orderForNode.get(name) ?? 0;
      const barycenter = (neighbors: string[]) => {
        const values = neighbors
          .map((name) => rank.get(name))
          .filter((value): value is number => value !== undefined);
        return values.length === 0
          ? Number.POSITIVE_INFINITY
          : values.reduce((total, value) => total + value, 0) / values.length;
      };
      for (const value of orderedDepths) {
        grouped.get(value)?.sort((left, right) => sourceOrder(left.name) - sourceOrder(right.name));
      }
      refreshRanks();
      for (let pass = 0; pass < 4; pass += 1) {
        for (const value of orderedDepths.slice(1)) {
          grouped.get(value)?.sort((left, right) => {
            const difference =
              barycenter(parents.get(left.name) ?? []) -
              barycenter(parents.get(right.name) ?? []);
            return Number.isFinite(difference) && difference !== 0
              ? difference
              : (rank.get(left.name) ?? 0) - (rank.get(right.name) ?? 0);
          });
          refreshRanks();
        }
        for (const value of orderedDepths.slice(0, -1).reverse()) {
          grouped.get(value)?.sort((left, right) => {
            const difference =
              barycenter(children.get(left.name) ?? []) -
              barycenter(children.get(right.name) ?? []);
            return Number.isFinite(difference) && difference !== 0
              ? difference
              : (rank.get(left.name) ?? 0) - (rank.get(right.name) ?? 0);
          });
          refreshRanks();
        }
      }

      for (const [value, group] of [...grouped.entries()].sort(([a], [b]) => a - b)) {
        group.sort(
          (left, right) =>
            (rank.get(left.name) ?? 0) - (rank.get(right.name) ?? 0),
        );
        group.forEach((node, index) => {
          node.position = [sectionStart + value * 360, (index - (group.length - 1) / 2) * 220];
        });
      }
      const aiByTarget = new Map<string, N8nNode[]>();
      for (const node of sectionNodes.filter((candidate) => aiNodes.has(candidate.name))) {
        const target = Object.entries(workflow.connections[node.name] ?? {})
          .filter(([type]) => type.startsWith("ai_"))
          .flatMap(([, outputs]) => outputs.flat())
          .find((connection) => names.has(connection.node))?.node;
        const key = target ?? "__unattached__";
        const group = aiByTarget.get(key) ?? [];
        group.push(node);
        aiByTarget.set(key, group);
      }
      const occupied = mainNodes.map((node) => node.position);
      for (const [target, group] of aiByTarget) {
        const anchor = workflow.nodes.find((node) => node.name === target);
        const baseX = anchor?.position[0] ?? sectionStart;
        const baseY = (anchor?.position[1] ?? 0) + 300;
        group.forEach((node, index) => {
          const position: [number, number] = [
            baseX + (index - (group.length - 1) / 2) * 280,
            baseY,
          ];
          while (
            occupied.some(
              ([x, y]) =>
                Math.abs(x - position[0]) < 250 && Math.abs(y - position[1]) < 150,
            )
          ) {
            position[1] += 180;
          }
          node.position = position;
          occupied.push(position);
        });
      }

      const xs = sectionNodes.map((node) => node.position[0]);
      const ys = sectionNodes.map((node) => node.position[1]);
      const minX = Math.min(...xs) - 120;
      const maxX = Math.max(...xs) + 260;
      const minY = Math.min(...ys) - 180;
      const maxY = Math.max(...ys) + 220;
      notes.push({
        id: stableUuid(`${this.shortName}:note:${section}`),
        name: `NOTA | ${section}`,
        type: "n8n-nodes-base.stickyNote",
        typeVersion: 1,
        position: [minX, minY],
        parameters: {
          content: `## ${section}\n${NOTES[section] ?? "Etapa interna do fluxo."}`,
          width: maxX - minX,
          height: maxY - minY,
          color: 7,
        },
      });
      sectionStart = maxX + 520;
    }

    // Sections that feed the same shared stage are parallel lanes. Placing
    // them in the same column avoids drawing, for example, the follow-up wire
    // across the whole reminder lane before both reach the common gate.
    const sectionIndex = new Map(this.sectionOrder.map((section, index) => [section, index]));
    const sectionRank = new Map(this.sectionOrder.map((section) => [section, 0]));
    for (const section of this.sectionOrder) {
      const fromRank = sectionRank.get(section) ?? 0;
      const fromIndex = sectionIndex.get(section) ?? 0;
      for (const [from, byType] of Object.entries(workflow.connections)) {
        if (this.sectionForNode.get(from) !== section) continue;
        for (const branch of byType.main ?? []) {
          for (const connection of branch) {
            const targetSection = this.sectionForNode.get(connection.node);
            if (!targetSection || targetSection === section) continue;
            if ((sectionIndex.get(targetSection) ?? 0) <= fromIndex) continue;
            sectionRank.set(
              targetSection,
              Math.max(sectionRank.get(targetSection) ?? 0, fromRank + 1),
            );
          }
        }
      }
    }

    const notesBySection = new Map(
      notes.map((note) => [note.name.replace(/^NOTA \| /, ""), note]),
    );
    const sectionsByRank = new Map<number, string[]>();
    for (const section of this.sectionOrder) {
      const value = sectionRank.get(section) ?? 0;
      const group = sectionsByRank.get(value) ?? [];
      group.push(section);
      sectionsByRank.set(value, group);
    }
    const rankXs = new Map<number, number>();
    let nextRankX = 0;
    for (const value of [...sectionsByRank.keys()].sort((left, right) => left - right)) {
      rankXs.set(value, nextRankX);
      const width = Math.max(
        ...sectionsByRank
          .get(value)!
          .map((section) => Number(notesBySection.get(section)?.parameters.width ?? 0)),
      );
      nextRankX += width + 520;
    }
    for (const [value, sections] of sectionsByRank) {
      const verticalGap = 360;
      const heights = sections.map((section) =>
        Number(notesBySection.get(section)?.parameters.height ?? 0),
      );
      const totalHeight =
        heights.reduce((total, height) => total + height, 0) +
        Math.max(0, sections.length - 1) * verticalGap;
      let targetY = -totalHeight / 2;
      sections.forEach((section, index) => {
        const note = notesBySection.get(section)!;
        const targetX = rankXs.get(value) ?? 0;
        const deltaX = targetX - note.position[0];
        const deltaY = targetY - note.position[1];
        for (const node of workflow.nodes) {
          if (this.sectionForNode.get(node.name) !== section) continue;
          node.position = [node.position[0] + deltaX, node.position[1] + deltaY];
        }
        note.position = [targetX, targetY];
        targetY += heights[index]! + verticalGap;
      });
    }

    workflow.nodes.unshift(...notes);
  }

  finish() {
    this.copySourceConnections();
    this.rewriteNodeReferences();
    const result = this.builder.done();
    this.layout(result);
    return result;
  }
}

function byFile(entries: CandidateEntry[], file: string): CandidateWorkflow;
function byFile(entries: CandidateEntry[], file: string) {
  const workflow = entries.find(([name]) => name === file)?.[1];
  if (!workflow) throw new Error(`Missing candidate source workflow: ${file}`);
  return workflow;
}

function replaceCode(node: N8nNode, search: string, replacement: string) {
  const source = node.parameters.jsCode;
  if (typeof source !== "string" || !source.includes(search)) {
    throw new Error(`${node.name}: expected code fragment not found`);
  }
  node.parameters.jsCode = source.replace(search, replacement);
}

function patchTargets(workflow: CandidateWorkflow) {
  const mapping: Array<[RegExp, string]> = [
    [/03 CONTEXTO E CÉREBRO V2$/, TARGETS.service],
    [/06 DELIVERY GATE V2$/, TARGETS.delivery],
    [/07 CRM SYNC V2$/, TARGETS.crm],
    [/11 CRIAR AGENDAMENTO V2$/, TARGETS.agenda],
    [/12 VERIFICAR DISPONIBILIDADE V2$/, TARGETS.agenda],
  ];
  for (const node of workflow.nodes) {
    const workflowId = node.parameters.workflowId;
    if (!workflowId || typeof workflowId !== "object") continue;
    const target = workflowId as Record<string, unknown>;
    const cached = String(target.cachedResultName ?? "");
    const match = mapping.find(([pattern]) => pattern.test(cached));
    if (match) updateWorkflowTarget(node, match[1]);
  }
}

function addAgendaOperation(node: N8nNode, operation: string) {
  const inputs = node.parameters.workflowInputs as Record<string, unknown> | undefined;
  if (!inputs) throw new Error(`${node.name}: missing workflow inputs`);
  const value = inputs.value as Record<string, unknown>;
  value.operation = operation;
  value.test_control =
    "={{ $('CÉREBRO | Validar Brain Request V2').first().json.workflow_test || null }}";
  const schema = inputs.schema as Array<Record<string, unknown>>;
  schema.unshift({
    id: "operation",
    displayName: "operation",
    required: true,
    defaultMatch: false,
    display: true,
    canBeUsedToMatch: true,
    type: "string",
    removed: false,
  });
  schema.unshift({
    id: "test_control",
    displayName: "test_control",
    required: false,
    defaultMatch: false,
    display: true,
    canBeUsedToMatch: false,
    type: "object",
    removed: false,
  });
}

function buildEntry(parts: CandidateEntry[]) {
  const adapters = byFile(parts, "00a-adapters-v2.inactive.json");
  const ingress = byFile(parts, "01-ingress-durable-v2.inactive.json");
  const master = byFile(parts, "00-master-omnichannel-v2.inactive.json");
  const media = byFile(parts, "02-media-after-block-v2.inactive.json");
  const c = new Composer(TARGETS.entry);

  c.addPart(adapters, "adapters", "CANAIS", {
    exclude: [
      "Executar mestre Z-API",
      "Executar mestre Meta",
      "Executar mestre em simulação",
      "Responder teste",
    ],
  });
  c.addPart(ingress, "ingress", "INGRESSO", { exclude: ["Receber contrato"] });
  c.addPart(master, "master", "DECISÃO", {
    include: ["Rotear mensagem já persistida"],
  });
  c.addPart(media, "media", "MÍDIA", { exclude: ["Receber contrato"] });
  c.addPart(master, "master", "BUFFER", {
    include: [
      "Carregar janela de buffer da empresa",
      "Validar política antes do buffer",
      "Aguardar janela configurada",
      "Preparar claim atômico",
      "Reivindicar lote sem GET DEL",
      "Avaliar lote reivindicado",
      "Lote ainda permitido?",
      "Claim deve aguardar?",
      "Aguardar liberação ou novo debounce",
      "Carregar sequência para nova tentativa",
      "Preparar nova tentativa de claim",
      "Reivindicar lote após prontidão",
      "Avaliar lote após prontidão",
      "Lote permitido após prontidão?",
      "Executar contexto e cérebro",
      "Encerrar intervenção antes da IA",
      "Encerrar sem efeito automático",
    ],
  });
  c.addPart(adapters, "adapters", "RETORNO", { include: ["Responder teste"] });

  const labReceive = c.addTrigger(
    "LABORATÓRIO",
    "Receber teste seguro do gateway",
  );
  const labValidate = c.addCode(
    "LABORATÓRIO",
    "Validar contrato isolado do teste",
    `
const body = $input.first().json;
const fail = (code) => { throw new Error('candidate_entry_test_rejected:' + code); };
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (value, allowed, code) => {
  if (!isObject(value)) fail(code);
  for (const key of Object.keys(value)) if (!allowed.includes(key)) fail(code + '_field_' + key);
};
const copyJson = (value) => JSON.parse(JSON.stringify(value));
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const chatConversation = /^test:SYNTH-LEXIA-TEST-CHAT-([0-9a-f-]{36})$/i;

exactKeys(body, ['schema_version','run_id','target','delivery_mode','execution_mode','tool_policy','scope','input','expectations'], 'top_level');
if (body.schema_version !== 'lexia.workflow.test.request.v1') fail('schema_version');
if (!uuid.test(String(body.run_id || ''))) fail('run_id');
if (body.target !== 'omnichannel') fail('target');
if (body.delivery_mode !== 'simulate') fail('delivery_mode');
if (!['safe_simulation','full_agent_virtual'].includes(body.execution_mode)) fail('execution_mode');
exactKeys(body.tool_policy, ['calendar'], 'tool_policy');
if (!['disabled','test_read_only','test_read_write'].includes(body.tool_policy.calendar)) fail('calendar_policy');
if (body.execution_mode === 'safe_simulation' && body.tool_policy.calendar !== 'disabled') fail('safe_simulation_calendar');

exactKeys(body.scope, ['environment','cliente_slug','channel','account_ref','conversation_ref'], 'scope');
if (body.scope.environment !== 'isolated_test') fail('environment');
if (body.scope.cliente_slug !== 'empresa_sintetica_a') fail('cliente_slug');
if (!['whatsapp','instagram','messenger'].includes(body.scope.channel)) fail('channel');
if (!uuid.test(String(body.scope.account_ref || ''))) fail('account_ref');
const chatMatch = chatConversation.exec(String(body.scope.conversation_ref || ''));
const isSingleRunConversation = body.scope.conversation_ref === 'test:' + body.run_id;
const isPersistentChatConversation = Boolean(chatMatch && uuid.test(chatMatch[1]));
if (!isSingleRunConversation && !isPersistentChatConversation) fail('conversation_ref');

exactKeys(body.input, ['message_id','type','text'], 'input');
if (body.input.message_id !== 'test-message:' + body.run_id) fail('message_id');
if (body.input.type !== 'text') fail('message_type');
if (typeof body.input.text !== 'string' || body.input.text.trim().length === 0 || body.input.text.length > 4000) fail('message_text');

exactKeys(body.expectations, ['provider_send','persist_synthetic_events','return_trace'], 'expectations');
if (body.expectations.provider_send !== false) fail('provider_send');
if (body.expectations.persist_synthetic_events !== true) fail('persist_synthetic_events');
if (body.expectations.return_trace !== true) fail('return_trace');

const stage = {
  schema_version: 'lexia.workflow.test.stage.v1',
  stage: 'entry_validated',
  run_id: body.run_id,
  target: body.target,
  delivery_mode: 'simulate',
  execution_mode: body.execution_mode,
  tool_policy: copyJson(body.tool_policy),
  scope: copyJson(body.scope),
  input: copyJson(body.input),
  expectations: copyJson(body.expectations),
  guard: {
    environment: 'isolated_test',
    external_effects_allowed: false,
    provider_send_allowed: false,
  },
  entry: {
    provider: 'fake',
    event_ref: 'test-event:' + body.run_id,
    message_id: body.input.message_id,
    author: 'lead',
    persistence: 'simulated',
  },
  trace: [
    { step: 'candidate_entry_contract', status: 'passed' },
    { step: 'candidate_entry_scope', status: 'passed' },
    { step: 'candidate_entry_persistence', status: 'simulated', reason: 'isolated_candidate_has_no_database_credential' },
  ],
};
return [{ json: { route: body.execution_mode, request: copyJson(body), stage } }];`,
  );
  const labRoute = c.addSwitch(
    "LABORATÓRIO",
    "Escolher profundidade do teste",
    "$json.route",
    ["safe_simulation", "full_agent_virtual"],
  );
  const prepareSafe = c.addCode(
    "LABORATÓRIO",
    "Preparar simulação curta",
    `return [{ json: $input.first().json.stage }];`,
  );
  const prepareFull = c.addCode(
    "LABORATÓRIO",
    "Preparar agente completo com canal virtual",
    `const validated = $input.first().json;
return [{ json: { body: validated.request, test_transport: 'subworkflow' } }];`,
  );
  const labService = c.addSubworkflow(
    "LABORATÓRIO",
    "Executar atendimento sintético isolado",
    TARGETS.service,
  );
  const labResult = c.addCode(
    "LABORATÓRIO",
    "Validar retorno correlacionado do atendimento",
    `
const request = $('LABORATÓRIO | Validar contrato isolado do teste').first().json.request;
const result = $input.first().json;
const fail = (code) => { throw new Error('candidate_service_result_rejected:' + code); };
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (value, allowed, code) => {
  if (!isObject(value)) fail(code);
  for (const key of Object.keys(value)) if (!allowed.includes(key)) fail(code + '_field_' + key);
};

exactKeys(result, ['schema_version','stage','run_id','target','delivery_mode','execution_mode','tool_policy','scope','input','expectations','guard','entry','trace','context','assistant_message','provider_send_attempted'], 'top_level');
if (result.schema_version !== 'lexia.workflow.test.stage.v1' || result.stage !== 'service_completed') fail('stage');
if (result.run_id !== request.run_id || result.target !== request.target) fail('request_correlation');
if (JSON.stringify(result.scope) !== JSON.stringify(request.scope)) fail('scope_correlation');
if (result.input?.message_id !== request.input?.message_id) fail('message_correlation');
if (result.context?.context_call_id !== 'test-context:' + request.run_id) fail('context_call_correlation');
if (result.context?.source_message_ids?.length !== 1 || result.context.source_message_ids[0] !== request.input.message_id) fail('context_source_messages');
if (result.assistant_message?.message_id !== 'n8n-test-out:' + request.run_id) fail('assistant_message_id');
if (result.assistant_message?.type !== 'text' || typeof result.assistant_message?.text !== 'string') fail('assistant_message');
if (result.provider_send_attempted !== false) fail('provider_send_attempted');
if (!Array.isArray(result.trace)) fail('trace');

return [{ json: {
  schema_version: 'lexia.workflow.test.result.v1',
  run_id: request.run_id,
  target: request.target,
  status: 'completed',
  provider_send_attempted: false,
  summary: 'Entrada e atendimento candidatos executados em corredor sintético sem efeitos externos.',
  trace: [
    ...result.trace,
    { step: 'candidate_result_correlation', status: 'passed' },
    { step: 'delivery_gate', status: 'passed' },
    { step: 'provider_send', status: 'simulated', reason: 'external_send_disabled' },
  ],
  output: {
    simulation_engine: 'n8n_candidate_chain_v1',
    candidate_chain: ['01_entrada_omnichannel', '02_atendimento_ia'],
    assistant_message: result.assistant_message,
    context: {
      context_call_id: result.context.context_call_id,
      config_version: result.context.config_version,
      source_message_ids: result.context.source_message_ids,
    },
    external_effects: {
      supabase: false,
      redis: false,
      model: false,
      tool: false,
      provider: false,
    },
  },
} }];`,
  );
  c.connect(labReceive, labValidate);
  c.connect(labValidate, labRoute);
  c.connect(labRoute, prepareSafe, 0);
  c.connect(labRoute, prepareFull, 1);
  c.connect(prepareSafe, labService);
  c.connect(labService, labResult);
  c.connect(prepareFull, c.ref("adapters", "Validar teste sintético"));

  for (const name of [
    "Normalizar Z-API sem confiar no tenant",
    "Normalizar Meta sem token inline",
    "Validar teste sintético",
  ]) {
    c.connect(c.ref("adapters", name), c.ref("ingress", "Validar envelope do adaptador"));
  }
  for (const name of [
    "Retornar ingresso persistido",
    "Ignorar eco automático já registrado",
    "Retornar evento duplicado",
  ]) {
    c.connect(c.ref("ingress", name), c.ref("master", "Rotear mensagem já persistida"));
  }
  c.connect(
    c.ref("master", "Rotear mensagem já persistida"),
    c.ref("media", "Validar mídia de mensagem persistida"),
    0,
  );
  c.connect(
    c.ref("master", "Rotear mensagem já persistida"),
    c.ref("media", "Validar mídia de mensagem persistida"),
    1,
  );
  const afterMedia = c.addSwitch("BUFFER", "Continuar conforme autoria", "$json.route", [
    "process",
    "human_intervention",
  ]);
  c.connect(c.ref("media", "Retornar resultado da mídia"), afterMedia);
  c.connect(afterMedia, c.ref("master", "Carregar janela de buffer da empresa"), 0);
  c.connect(afterMedia, c.ref("master", "Encerrar intervenção antes da IA"), 1);
  c.connect(afterMedia, c.ref("master", "Encerrar sem efeito automático"), 2);

  const finish = c.addCode("RETORNO", "Consolidar resultado da entrada", `
const input = $input.first().json;
return [{ json: input }];`);
  const isTest = c.addIf(
    "RETORNO",
    "É teste da plataforma?",
    "Boolean($json.workflow_test?.run_id)",
  );
  const realDone = c.addCode("RETORNO", "Encerrar evento real", `
return [{ json: $input.first().json }];`);
  const fullTestResult = c.addCode(
    "RETORNO",
    "Montar resultado do agente completo",
    `const input = $input.first().json;
const test = input.workflow_test;
if (!test || test.execution_mode !== 'full_agent_virtual') throw new Error('full_agent_test_context_missing');
if (input.provider_send_attempted === true) throw new Error('full_agent_test_provider_send_attempted');
const messages = Array.isArray(input.assistant_messages) ? input.assistant_messages : [];
const language = input.language_policy || {};
const languageBlocked = language.status === 'blocked';
const bufferedReasons = new Set(['newer_message_waiting', 'batch_in_progress', 'empty', 'window_open', 'superseded_by_new_message']);
const bufferedIntoNewerRun = messages.length === 0 && input.message_persisted === true &&
  (bufferedReasons.has(input.status) || input.reprocess_required === true);
if (!languageBlocked && !bufferedIntoNewerRun && (language.status !== 'passed' || messages.length === 0)) {
  throw new Error('full_agent_test_brain_not_completed');
}
return [{ json: {
  schema_version: 'lexia.workflow.test.result.v1',
  run_id: test.run_id,
  target: test.target,
  status: languageBlocked ? 'blocked' : 'completed',
  provider_send_attempted: false,
  summary: languageBlocked
    ? 'A resposta foi bloqueada porque não corresponde ao idioma do lead.'
    : bufferedIntoNewerRun
      ? 'Mensagem incorporada ao buffer; a execução mais nova ficou responsável pela resposta.'
      : 'Inteligência completa executada com canal virtual e sem envio ao provedor.',
  ...(languageBlocked ? { error_code: 'response_language_mismatch' } : {}),
  trace: [
    { step: 'trusted_scope', status: 'passed' },
    { step: 'persist_synthetic_message', status: 'passed' },
    { step: 'buffer_and_context', status: 'passed', ...(bufferedIntoNewerRun ? { reason: input.status } : {}) },
    { step: 'real_miranda_brain', status: bufferedIntoNewerRun ? 'simulated' : 'passed', ...(bufferedIntoNewerRun ? { reason: 'owned_by_newer_batch' } : {}) },
    { step: 'response_language_gate', status: languageBlocked ? 'blocked' : 'passed', ...(languageBlocked ? { reason: 'response_language_mismatch' } : bufferedIntoNewerRun ? { reason: 'no_response_owned_by_newer_batch' } : {}) },
    { step: 'delivery_gate', status: 'passed' },
    { step: 'provider_send', status: 'blocked', reason: 'virtual_channel_observe_only' },
  ],
  output: {
    simulation_engine: 'n8n_full_agent_virtual_v1',
    assistant_messages: messages,
    buffered_into_newer_run: bufferedIntoNewerRun,
    ...(messages[0] ? { assistant_message: { message_id: messages[0].message_id, type: messages[0].type, text: messages[0].text } } : {}),
    expected_language: language.expected_language || null,
    response_languages: language.detected_languages || [],
    language_policy_status: bufferedIntoNewerRun ? 'passed' : (language.status || 'not_applicable'),
    calendar_access: test.tool_policy?.calendar || 'disabled',
    external_effects: {
      central_supabase: true,
      redis: true,
      model: true,
      calendar: false,
      provider: false,
    },
  },
} }];`,
  );
  const testTransport = c.addSwitch(
    "RETORNO",
    "Escolher retorno do teste",
    "$json.workflow_test.transport",
    ["subworkflow", "webhook"],
  );
  const returnGateway = c.addCode(
    "RETORNO",
    "Retornar resultado ao gateway",
    `return [{ json: $input.first().json }];`,
  );
  const returnUnified = c.addCode(
    "LABORATÓRIO",
    "Retornar contrato único ao gateway",
    `return [{ json: $input.first().json }];`,
  );
  for (const name of [
    "Executar contexto e cérebro",
    "Encerrar intervenção antes da IA",
    "Encerrar sem efeito automático",
  ]) {
    c.connect(c.ref("master", name), finish);
  }
  c.connect(finish, isTest);
  c.connect(isTest, fullTestResult, 0);
  c.connect(isTest, realDone, 1);
  c.connect(fullTestResult, testTransport);
  c.connect(testTransport, returnGateway, 0);
  c.connect(testTransport, c.ref("adapters", "Responder teste"), 1);
  c.connect(labResult, returnUnified);
  c.connect(returnGateway, returnUnified);

  c.node(c.ref("adapters", "Validar teste sintético")).parameters.jsCode = `const incoming = $input.first().json;
const body = incoming.body || incoming;
const fail = (code) => { throw new Error('workflow_test_contract_invalid:' + code); };
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (value, allowed, code) => {
  if (!isObject(value)) fail(code);
  for (const key of Object.keys(value)) if (!allowed.includes(key)) fail(code + '_field_' + key);
};
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const chatConversation = /^test:SYNTH-LEXIA-TEST-CHAT-([0-9a-f-]{36})$/i;
exactKeys(body, ['schema_version','run_id','target','delivery_mode','execution_mode','tool_policy','scope','input','expectations'], 'top_level');
if (body.schema_version !== 'lexia.workflow.test.request.v1' || !uuidPattern.test(String(body.run_id || ''))) fail('identity');
if (body.target !== 'omnichannel' || body.delivery_mode !== 'simulate' || body.execution_mode !== 'full_agent_virtual') fail('mode');
exactKeys(body.tool_policy, ['calendar'], 'tool_policy');
if (!['disabled','test_read_only','test_read_write'].includes(body.tool_policy.calendar)) fail('calendar_policy');
exactKeys(body.scope, ['environment','cliente_slug','channel','account_ref','conversation_ref'], 'scope');
if (body.scope.environment !== 'isolated_test' || body.scope.cliente_slug !== 'empresa_sintetica_a') fail('scope_owner');
if (!['whatsapp','instagram','messenger'].includes(body.scope.channel) || !uuidPattern.test(String(body.scope.account_ref || ''))) fail('scope');
const chatMatch = chatConversation.exec(String(body.scope.conversation_ref || ''));
if (body.scope.conversation_ref !== 'test:' + body.run_id && !(chatMatch && uuidPattern.test(chatMatch[1]))) fail('conversation_ref');
exactKeys(body.input, ['message_id','type','text'], 'input');
if (body.input.message_id !== 'test-message:' + body.run_id || body.input.type !== 'text') fail('message');
if (typeof body.input.text !== 'string' || !body.input.text.trim() || body.input.text.length > 4000) fail('message_text');
exactKeys(body.expectations, ['provider_send','persist_synthetic_events','return_trace'], 'expectations');
if (body.expectations.provider_send !== false || body.expectations.persist_synthetic_events !== true || body.expectations.return_trace !== true) fail('expectations');
const occurredAt = new Date().toISOString();
const eventId = (() => {
  const seedText = String(body.run_id + ':test:event');
  let h1 = 0x811c9dc5, h2 = 0x9e3779b9;
  for (let i = 0; i < seedText.length; i++) {
    h1 = Math.imul(h1 ^ seedText.charCodeAt(i), 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ (seedText.charCodeAt(i) + i), 0x85ebca6b) >>> 0;
  }
  const hex = [h1, h2, h1 ^ h2, Math.imul(h1, 31) ^ h2]
    .map((n) => (n >>> 0).toString(16).padStart(8, '0')).join('');
  return hex.slice(0,8) + '-' + hex.slice(8,12) + '-4' + hex.slice(13,16) + '-8' + hex.slice(17,20) + '-' + hex.slice(20,32);
})();
return [{ json: {
  trusted_account_id: body.scope.account_ref,
  delivery_mode: 'observe_only',
  echo_candidate: false,
  event: {
    schema_version: 'lexia.ingress.event.v1', event_id: eventId,
    provider_event_id: body.input.message_id, correlation_id: body.run_id,
    scope: body.scope, provider: 'fake', event_type: 'message', occurred_at: occurredAt,
    message: {
      schema_version: 'lexia.message.v1', event_id: eventId,
      provider_event_id: body.input.message_id, message_id: body.input.message_id,
      scope: body.scope, author: 'lead', direction: 'inbound', occurred_at: occurredAt,
      text: body.input.text, media: { kind: 'text', processing_status: 'completed' },
    },
    contact: { provider_contact_ref: body.scope.conversation_ref, display_name: 'Lead sintético' },
    capability_refs: [],
  },
  workflow_test: {
    run_id: body.run_id,
    target: body.target,
    execution_mode: body.execution_mode,
    tool_policy: body.tool_policy,
    transport: incoming.test_transport === 'subworkflow' ? 'subworkflow' : 'webhook',
  },
} }];`;
  c.node(c.ref("adapters", "Responder teste")).parameters.responseBody = "={{ $json }}";

  replaceCode(
    c.node(c.ref("ingress", "Validar envelope do adaptador")),
    "delivery_mode: input.delivery_mode || 'observe_only' }",
    "delivery_mode: input.delivery_mode || 'observe_only', workflow_test: input.workflow_test || null }",
  );
  for (const name of ["Encerrar intervenção antes da IA", "Encerrar sem efeito automático"]) {
    replaceCode(
      c.node(c.ref("master", name)),
      "provider_send_attempted: false }",
      "provider_send_attempted: false, workflow_test: input.workflow_test || null }",
    );
  }
  replaceCode(
    c.node(c.ref("master", "Validar política antes do buffer")),
    "$('Processar mídia do lead')",
    `$('${c.ref("media", "Retornar resultado da mídia")}')`,
  );
  const result = c.finish();
  patchTargets(result);
  return result;
}

function buildService(parts: CandidateEntry[]) {
  const context = byFile(parts, "03-context-and-brain-v2.inactive.json");
  const brain = byFile(parts, "10-private-brain-v2.inactive.json");
  const effects = byFile(parts, "04-apply-brain-result-v2.inactive.json");
  const c = new Composer(TARGETS.service);
  const receive = c.addTrigger("LABORATÓRIO", "Receber contrato");
  c.addPart(context, "context", "CONTEXTO", {
    exclude: [
      "Receber contrato",
      "Chamar cérebro privado sem credencial de envio",
      "Vincular resultado à solicitação",
      "Aplicar resultado e efeitos",
    ],
  });
  c.addPart(brain, "brain", "CÉREBRO", { exclude: ["When Executed by Another Workflow"] });
  c.addPart(context, "context", "VÍNCULO", { include: ["Vincular resultado à solicitação"] });
  c.addPart(effects, "effects", "EFEITOS", { exclude: ["Receber contrato"] });
  const routeInput = c.addCode(
    "LABORATÓRIO",
    "Separar simulação do contrato real",
    `
const input = $input.first().json;
const fail = (code) => { throw new Error('candidate_service_test_rejected:' + code); };
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (value, allowed, code) => {
  if (!isObject(value)) fail(code);
  for (const key of Object.keys(value)) if (!allowed.includes(key)) fail(code + '_field_' + key);
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const chatConversation = /^test:SYNTH-LEXIA-TEST-CHAT-([0-9a-f-]{36})$/i;
const isLab = input?.schema_version === 'lexia.workflow.test.stage.v1';
if (!isLab) {
  if (String(input?.schema_version || '').startsWith('lexia.workflow.test.')) fail('unknown_test_contract');
  return [{ json: { route: 'real_contract', payload: input } }];
}

exactKeys(input, ['schema_version','stage','run_id','target','delivery_mode','execution_mode','tool_policy','scope','input','expectations','guard','entry','trace'], 'top_level');
if (input.stage !== 'entry_validated') fail('stage');
if (!uuid.test(String(input.run_id || ''))) fail('run_id');
if (input.target !== 'omnichannel' || input.delivery_mode !== 'simulate') fail('mode');
if (input.execution_mode !== 'safe_simulation' || input.tool_policy?.calendar !== 'disabled') fail('safe_simulation_policy');
exactKeys(input.scope, ['environment','cliente_slug','channel','account_ref','conversation_ref'], 'scope');
if (input.scope.environment !== 'isolated_test' || input.scope.cliente_slug !== 'empresa_sintetica_a') fail('scope_owner');
if (!['whatsapp','instagram','messenger'].includes(input.scope.channel)) fail('channel');
if (!uuid.test(String(input.scope.account_ref || ''))) fail('account_ref');
const chatMatch = chatConversation.exec(String(input.scope.conversation_ref || ''));
const isSingleRunConversation = input.scope.conversation_ref === 'test:' + input.run_id;
const isPersistentChatConversation = Boolean(chatMatch && uuid.test(chatMatch[1]));
if (!isSingleRunConversation && !isPersistentChatConversation) fail('conversation_ref');
exactKeys(input.input, ['message_id','type','text'], 'input');
if (input.input.message_id !== 'test-message:' + input.run_id || input.input.type !== 'text') fail('message');
if (typeof input.input.text !== 'string' || input.input.text.trim().length === 0 || input.input.text.length > 4000) fail('message_text');
exactKeys(input.expectations, ['provider_send','persist_synthetic_events','return_trace'], 'expectations');
if (input.expectations.provider_send !== false || input.expectations.persist_synthetic_events !== true || input.expectations.return_trace !== true) fail('expectations');
exactKeys(input.guard, ['environment','external_effects_allowed','provider_send_allowed'], 'guard');
if (input.guard.environment !== 'isolated_test' || input.guard.external_effects_allowed !== false || input.guard.provider_send_allowed !== false) fail('guard');
exactKeys(input.entry, ['provider','event_ref','message_id','author','persistence'], 'entry');
if (input.entry.provider !== 'fake' || input.entry.event_ref !== 'test-event:' + input.run_id) fail('entry_event');
if (input.entry.message_id !== input.input.message_id || input.entry.author !== 'lead' || input.entry.persistence !== 'simulated') fail('entry_message');
if (!Array.isArray(input.trace)) fail('trace');
return [{ json: { route: 'lab_simulation', payload: input } }];`,
  );
  const route = c.addSwitch(
    "LABORATÓRIO",
    "Rotear contrato isolado",
    "$json.route",
    ["lab_simulation", "real_contract"],
  );
  const restoreReal = c.addCode(
    "LABORATÓRIO",
    "Restaurar contrato real sem metadado de rota",
    `return [{ json: $input.first().json.payload }];`,
  );
  const simulateContext = c.addCode(
    "LABORATÓRIO",
    "Simular contexto isolado por empresa e conversa",
    `
const stage = $input.first().json.payload;
const configs = {
  'isolated_test|empresa_sintetica_a': {
    config_version: 'lab-context-empresa-sintetica-a-v1',
    prompt_ref: 'context:empresa_sintetica_a:v1',
    locale: 'pt-BR',
  },
};
const key = stage.scope.environment + '|' + stage.scope.cliente_slug;
const config = configs[key];
if (!config) throw new Error('candidate_context_config_unavailable');
const copyJson = (value) => JSON.parse(JSON.stringify(value));
const messages = [{
  message_id: stage.input.message_id,
  scope: copyJson(stage.scope),
  author: 'lead',
  type: stage.input.type,
  text: stage.input.text,
}];
if (messages.length !== 1) throw new Error('candidate_context_message_cardinality');
if (messages.some((message) => JSON.stringify(message.scope) !== JSON.stringify(stage.scope))) throw new Error('candidate_context_mixed_scope');
const context = {
  schema_version: 'lexia.context.result.v1',
  scope: copyJson(stage.scope),
  context_call_id: 'test-context:' + stage.run_id,
  config_version: config.config_version,
  source_message_ids: messages.map((message) => message.message_id),
  operational_context: {
    summary: 'Resumo sintético isolado para validação do encadeamento.',
    language: config.locale,
    intent: 'workflow_test',
    topic: { current: 'workflow_test', changed: false, resumed_previous: false },
    confidence: 1,
    missing_information: [],
    contact_updates: {},
    scheduling_intent: {},
  },
  company_fields: {},
};
return [{ json: {
  ...stage,
  stage: 'context_prepared',
  context,
  trace: [
    ...stage.trace,
    { step: 'candidate_context_config', status: 'simulated', reason: config.prompt_ref },
    { step: 'candidate_history_scope', status: 'passed' },
  ],
} }];`,
  );
  const simulateBrain = c.addCode(
    "LABORATÓRIO",
    "Simular cérebro sem modelo tools ou efeitos",
    `
const stage = $input.first().json;
if (stage.schema_version !== 'lexia.workflow.test.stage.v1' || stage.stage !== 'context_prepared') throw new Error('candidate_brain_stage_invalid');
if (stage.context?.context_call_id !== 'test-context:' + stage.run_id) throw new Error('candidate_brain_context_call_mismatch');
if (JSON.stringify(stage.context?.scope) !== JSON.stringify(stage.scope)) throw new Error('candidate_brain_context_scope_mismatch');
if (stage.context?.source_message_ids?.length !== 1 || stage.context.source_message_ids[0] !== stage.input.message_id) throw new Error('candidate_brain_source_message_mismatch');
if (stage.guard?.external_effects_allowed !== false || stage.guard?.provider_send_allowed !== false) throw new Error('candidate_brain_guard_invalid');
return [{ json: {
  ...stage,
  stage: 'service_completed',
  assistant_message: {
    message_id: 'n8n-test-out:' + stage.run_id,
    type: 'text',
    text: 'Recebi sua mensagem no encadeamento candidato de teste. Nenhum modelo, tool, canal ou provedor real foi chamado.',
  },
  provider_send_attempted: false,
  trace: [
    ...stage.trace,
    { step: 'candidate_context_agent', status: 'simulated', reason: 'external_model_disabled' },
    { step: 'candidate_brain', status: 'simulated', reason: 'external_model_and_tools_disabled' },
    { step: 'candidate_brain_result_binding', status: 'passed' },
  ],
} }];`,
  );
  c.connect(receive, routeInput);
  c.connect(routeInput, route);
  c.connect(route, simulateContext, 0);
  c.connect(route, restoreReal, 1);
  c.connect(restoreReal, c.ref("context", "Validar lote e escopo"));
  c.connect(simulateContext, simulateBrain);
  c.connect(
    c.ref("context", "Montar Brain Request vinculado"),
    c.ref("brain", "Validar Brain Request V2"),
  );
  c.connect(
    c.ref("brain", "Emitir Brain Result sem efeitos diretos"),
    c.ref("context", "Vincular resultado à solicitação"),
  );
  c.connect(
    c.ref("context", "Vincular resultado à solicitação"),
    c.ref("effects", "Validar resultado e atestados"),
  );
  const brainRequestNode = c.node(c.ref("context", "Montar Brain Request vinculado"));
  const brainRequestCode = String(brainRequestNode.parameters.jsCode ?? "");
  if (!brainRequestCode.includes("workflow_test: input.workflow_test || null")) {
    replaceCode(
      brainRequestNode,
      "source_central_message_ids: input.mensagem_ids } } }];",
      "source_central_message_ids: input.mensagem_ids, workflow_test: input.workflow_test || null } } }];",
    );
  }
  replaceCode(
    c.node(c.ref("brain", "Validar Brain Request V2")),
    "return [{ json: { request, payload:",
    "return [{ json: { request, workflow_test: wrapper.execution_context?.workflow_test || null, payload:",
  );
  replaceCode(
    c.node(c.ref("brain", "Preparar Briefing")),
    "function detectarIdioma(texto) {\n  const s = medirIdioma(texto);",
    "function detectarIdioma(texto) {\n  const curto = normalizarTexto(texto);\n  const saudacoesUnivocas = { oi: 'pt', ola: 'pt', hello: 'en', hi: 'en', hola: 'es' };\n  if (saudacoesUnivocas[curto]) return saudacoesUnivocas[curto];\n  const s = medirIdioma(texto);",
  );
  replaceCode(
    c.node(c.ref("brain", "Preparar Briefing")),
    `if (/\\b(in\\s+english|speak\\s+english|english\\s*,?\\s*please|em\\s+ingles|en\\s+ingles)\\b/.test(t)) return 'en';
  if (/\\b(en\\s+espanol|hablas?\\s+espanol|espanol\\s*,?\\s*por\\s*favor|em\\s+espanhol|in\\s+spanish|speak\\s+spanish)\\b/.test(t)) return 'es';
  if (/\\b(em\\s+portugues|fala\\s+portugues|portugues\\s*,?\\s*por\\s*favor|in\\s+portuguese|speak\\s+portuguese)\\b/.test(t)) return 'pt';`,
    `if (/\\b((in|speak)\\s+english|(em|en)\\s+(ingles|english)|english\\s*,?\\s*please)\\b/.test(t)) return 'en';
  if (/\\b((en|em)\\s+(espanol|espanhol)|(in|speak)\\s+spanish|hablas?\\s+espanol|espanol\\s*,?\\s*por\\s*favor)\\b/.test(t)) return 'es';
  if (/\\b((em|en)\\s+portugues|(in|speak)\\s+portuguese|fala\\s+portugues|portugues\\s*,?\\s*por\\s*favor)\\b/.test(t)) return 'pt';`,
  );
  c.node(c.ref("effects", "Preparar ações após efeitos de domínio")).parameters.jsCode = `const input = $('EFEITOS | Validar resultado e atestados').first().json;
const normalize = (value) => String(value || '').toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').replace(/[^a-z0-9\\s]/g, ' ').replace(/\\s+/g, ' ').trim();
const words = {
  pt: new Set(['oi','ola','voce','voces','gostaria','quero','queria','preciso','tratamento','tratamentos','pele','corpo','preco','valor','quanto','onde','quando','agendar','marcar','avaliacao','amanha','obrigado','obrigada','horario','horarios','disponibilidade','tenho','posso','bom','boa','tarde','noite','dia','sim','nao','tambem']),
  en: new Set(['hello','hi','hey','you','your','would','like','want','need','treatment','treatments','skin','body','price','cost','much','where','when','appointment','book','schedule','tomorrow','thanks','thank','available','availability','time','times','have','can','please','morning','afternoon','evening','yes','also','what','which','how']),
  es: new Set(['hola','usted','ustedes','quisiera','quiero','necesito','tratamiento','tratamientos','piel','cuerpo','precio','cuanto','donde','cuando','cita','agendar','reservar','manana','gracias','horario','horarios','disponibilidad','tengo','puedo','buenos','buenas','tardes','noches','si','tambien','que','cual','como','favor']),
};
const localeLanguage = (value) => {
  const normalized = normalize(value);
  if (normalized.startsWith('pt') || normalized.includes('portugues')) return 'pt';
  if (normalized.startsWith('en') || normalized.includes('ingles') || normalized.includes('english')) return 'en';
  if (normalized.startsWith('es') || normalized.includes('espanhol') || normalized.includes('espanol') || normalized.includes('spanish')) return 'es';
  return '';
};
const explicitLanguageRequest = (text) => {
  const normalized = normalize(text);
  if (/\\b((in|speak) english|(em|en) (ingles|english)|english please)\\b/.test(normalized)) return 'en';
  if (/\\b((en|em) (espanol|espanhol)|(in|speak) spanish|habla(?:r|s)? espanol|espanol por favor)\\b/.test(normalized)) return 'es';
  if (/\\b((em|en) portugues|(in|speak) portuguese|fala(?:r)? portugues|portugues por favor)\\b/.test(normalized)) return 'pt';
  return '';
};
const detect = (text) => {
  const raw = String(text || '');
  const tokens = normalize(raw).split(' ').filter(Boolean);
  const unique = { oi: 'pt', ola: 'pt', hello: 'en', hi: 'en', hola: 'es' };
  if (tokens.length === 1 && unique[tokens[0]]) return unique[tokens[0]];
  const score = { pt: 0, en: 0, es: 0 };
  if (/[çãõ]/i.test(raw)) score.pt += 3;
  if (/[¿¡ñ]/i.test(raw)) score.es += 3;
  for (const token of tokens) for (const language of ['pt','en','es']) if (words[language].has(token)) score[language] += 1;
  const ranked = ['pt','en','es'].sort((left, right) => score[right] - score[left]);
  return score[ranked[0]] >= 2 && score[ranked[0]] - score[ranked[1]] >= 1 ? ranked[0] : '';
};
const briefingLanguage = localeLanguage($('CÉREBRO | Preparar Briefing').first().json.idioma);
const leadMessages = input.request.messages.filter((message) => message.author === 'lead');
const latestLead = leadMessages.at(-1);
const latestLeadText = latestLead?.text || latestLead?.media?.caption || '';
const expectedLanguage = explicitLanguageRequest(latestLeadText) || detect(latestLeadText) || briefingLanguage || localeLanguage(input.request.operational_context?.language) || 'pt';
const responseTexts = input.result.actions.flatMap((action) => {
  if (action.content?.type === 'text') return [String(action.content.text || '')];
  if (action.content?.caption) return [String(action.content.caption)];
  return [];
}).filter(Boolean);
const detectedLanguages = responseTexts.map(detect);
const mismatch = detectedLanguages.some((language) => language && language !== expectedLanguage);
const languagePolicy = {
  status: mismatch ? 'blocked' : 'passed',
  expected_language: expectedLanguage,
  detected_languages: detectedLanguages.map((language) => language || null),
  checked_action_count: responseTexts.length,
};
if (input.result.actions.length === 0) return [{ json: { ...input, language_policy: languagePolicy, skip_delivery: true, delivery_result: { status: input.result.decision === 'handoff' ? 'handoff' : 'no_reply', provider_send_attempted: false } } }];
if (mismatch) return [{ json: { ...input, language_policy: languagePolicy, skip_delivery: true, delivery_result: { status: 'suppressed', reason: 'response_language_mismatch', provider_send_attempted: false } } }];
return [{ json: { ...input, language_policy: languagePolicy, skip_delivery: false, actions: input.result.actions, invocation_id: input.request.invocation_id,
  correlation_id: input.request.correlation_id, delivery_mode: input.delivery_mode,
  lead_cutoff_seq: input.lead_cutoff_seq, claimant: 'brain:' + input.request.invocation_id } }];`;
  c.node(c.ref("effects", "Retornar resultado do cérebro")).parameters.jsCode = `const input = $('EFEITOS | Encerrar lote conforme resultado').first().json;
const languageBlocked = input.language_policy?.status === 'blocked';
const superseded = input.delivery_result?.status === 'superseded_by_new_message' || input.delivery_result?.reason === 'superseded_by_new_message';
const textActions = languageBlocked || superseded ? [] : (input.result?.actions || []).filter((action) => action.content?.type === 'text' && String(action.content.text || '').trim());
const assistantMessages = textActions.map((action) => ({
  message_id: action.action_id,
  type: 'text',
  text: String(action.content.text).trim(),
  sequence: Number(action.sequence),
}));
return [{ json: {
  status: input.delivery_result?.status || input.result.decision,
  reason: input.delivery_result?.reason || null,
  invocation_id: input.request.invocation_id,
  provider_send_attempted: input.delivery_result?.provider_send_attempted === true,
  workflow_test: input.workflow_test || null,
  assistant_messages: assistantMessages,
  language_policy: input.language_policy || null,
  reprocess_required: superseded,
} }];`;
  addAgendaOperation(c.node(c.ref("brain", "verificar_disponibilidade")), "availability.check");
  addAgendaOperation(c.node(c.ref("brain", "criar_agendamento")), "appointment.create");
  const result = c.finish();
  patchTargets(result);
  return result;
}

function buildAgenda(parts: CandidateEntry[]) {
  const availability = byFile(parts, "12-check-availability-v2.inactive.json");
  const appointment = byFile(parts, "11-create-appointment-v2.inactive.json");
  const c = new Composer(TARGETS.agenda);
  const receive = c.addTrigger("OPERAÇÃO", "Receber operação de agenda");
  const authorizeTest = c.addCode(
    "OPERAÇÃO",
    "Aplicar política de Calendar do teste",
    `const input = $input.first().json;
const test = input.test_control;
if (!test) return [{ json: { ...input, agenda_route: input.operation } }];
if (test.execution_mode !== 'full_agent_virtual') throw new Error('agenda_test_mode_invalid');
const calendar = test.tool_policy?.calendar;
if (!['disabled','test_read_only','test_read_write'].includes(calendar)) throw new Error('agenda_test_calendar_policy_invalid');
if (calendar === 'disabled') return [{ json: { ...input, agenda_route: 'test.calendar.disabled' } }];
if (calendar === 'test_read_only' && input.operation === 'appointment.create') return [{ json: { ...input, agenda_route: 'test.calendar.read_only' } }];
return [{ json: { ...input, agenda_route: input.operation } }];`,
  );
  const route = c.addSwitch("OPERAÇÃO", "Escolher operação", "$json.agenda_route", [
    "availability.check",
    "appointment.create",
    "test.calendar.disabled",
    "test.calendar.read_only",
  ]);
  const calendarDisabled = c.addCode(
    "OPERAÇÃO",
    "Responder Calendar desativado no teste",
    `const input = $input.first().json;
return [{ json: {
  status: 'CALENDAR_DISABLED_IN_TEST',
  operation: input.operation,
  instrucao_apresentacao: 'A agenda está desativada neste teste. Informe que a consulta ou criação de horário não foi executada e não invente disponibilidade.',
  provider_send_attempted: false,
} }];`,
  );
  const calendarReadOnly = c.addCode(
    "OPERAÇÃO",
    "Bloquear escrita no Calendar de leitura",
    `const input = $input.first().json;
return [{ json: {
  status: 'CALENDAR_READ_ONLY_IN_TEST',
  operation: input.operation,
  instrucao_apresentacao: 'O calendário deste teste permite somente consulta. Nenhum agendamento foi criado.',
  provider_send_attempted: false,
} }];`,
  );
  c.addPart(availability, "availability", "DISPONIBILIDADE", {
    exclude: ["When Executed by Another Workflow"],
  });
  c.addPart(appointment, "appointment", "AGENDAMENTO", {
    exclude: ["When Executed by Another Workflow"],
  });
  c.connect(receive, authorizeTest);
  c.connect(authorizeTest, route);
  c.connect(route, c.ref("availability", "Validar solicitação de disponibilidade"), 0);
  c.connect(route, c.ref("appointment", "Validar contrato de criação"), 1);
  c.connect(route, calendarDisabled, 2);
  c.connect(route, calendarReadOnly, 3);
  for (const [sourceKey, names] of [
    ["availability", ["Resolver Serviço e Janela", "Calcular Slots"]],
    ["appointment", ["Validar Pedido", "Checar Duplicidade"]],
  ] as const) {
    for (const name of names) {
      replaceCode(
        c.node(c.ref(sourceKey, name)),
        "$('When Executed by Another Workflow')",
        `$('${receive}')`,
      );
    }
  }
  return c.finish();
}

function buildAutomations(parts: CandidateEntry[]) {
  const followup = byFile(parts, "13-followup-v2.inactive.json");
  const reminder = byFile(parts, "14-reminders-v2.inactive.json");
  const gateway = byFile(parts, "09-automation-gateway-v2.inactive.json");
  const c = new Composer(TARGETS.automations);
  const followupAfter = [
    "Classificar resultado do follow-up",
    "Classificar entrega do follow-up",
    "Atualizar Após Envio",
    "Reagendar Follow-up",
    "Preservar tentativa não confirmada",
  ];
  const reminderAfter = [
    "Classificar resultado do lembrete",
    "Lembrete confirmado pelo provedor?",
    "Marcar Lembrete Enviado",
    "Preservar lembrete não confirmado",
  ];
  c.addPart(followup, "followup", "FOLLOW-UP", {
    exclude: ["Enviar follow-up pelo gate comum", ...followupAfter],
  });
  c.addPart(reminder, "reminder", "LEMBRETE", {
    exclude: ["Enviar lembrete pelo gate comum", ...reminderAfter],
  });
  c.addPart(gateway, "gateway", "AUTOMAÇÃO", { exclude: ["Receber contrato"] });
  c.addPart(followup, "followup", "RESULTADO", { include: followupAfter });
  c.addPart(reminder, "reminder", "RESULTADO", { include: reminderAfter });

  // The schedules stay independently switchable, while this trigger lets the
  // shared automation contract be called and published with both schedules
  // disabled in an isolated environment.
  const internalRequest = c.addTrigger("AUTOMAÇÃO", "Receber solicitação interna");
  c.connect(internalRequest, c.ref("gateway", "Validar pedido de automação"));

  c.connect(
    c.ref("followup", "Montar pedido idempotente de follow-up"),
    c.ref("gateway", "Validar pedido de automação"),
  );
  c.connect(
    c.ref("reminder", "Montar lembrete idempotente"),
    c.ref("gateway", "Validar pedido de automação"),
  );
  const back = c.addSwitch("RESULTADO", "Retornar ao fluxo de origem", "$json.kind", [
    "followup",
    "appointment_reminder",
  ]);
  c.connect(c.ref("gateway", "Retornar automação rejeitada ou duplicada"), back);
  c.connect(c.ref("gateway", "Retornar resultado da automação"), back);
  c.connect(back, c.ref("followup", "Classificar resultado do follow-up"), 0);
  c.connect(back, c.ref("reminder", "Classificar resultado do lembrete"), 1);

  replaceCode(
    c.node(c.ref("gateway", "Retornar automação rejeitada ou duplicada")),
    "request_id: input.request.request_id, status:",
    "request_id: input.request.request_id, kind: input.request.kind, status:",
  );
  replaceCode(
    c.node(c.ref("gateway", "Espelhar resultado da automação")),
    "request_id: input.request.request_id, status,",
    "request_id: input.request.request_id, kind: input.request.kind, status,",
  );

  const result = c.finish();
  patchTargets(result);
  return result;
}

function buildCrm(parts: CandidateEntry[]) {
  const sync = byFile(parts, "07-crm-sync-v2.inactive.json");
  const commands = byFile(parts, "15-crm-commands-v2.inactive.json");
  const c = new Composer(TARGETS.crm);
  c.addPart(commands, "commands", "COMANDOS", { exclude: ["Confirmar estado no CRM"] });
  c.addPart(sync, "sync", "ESPELHO");
  const isCommand = c.addIf(
    "RESPOSTA",
    "Veio de comando do CRM?",
    "Boolean($json.passthrough?.command_id)",
  );
  const internal = c.addCode("RESPOSTA", "Retornar confirmação interna", `
return [{ json: $input.first().json }];`);
  c.connect(
    c.ref("commands", "Espelhar comando aceito no CRM"),
    c.ref("sync", "Validar eventos CRM"),
  );
  c.connect(c.ref("sync", "Espelho CRM concluído"), isCommand);
  c.connect(isCommand, c.ref("commands", "Responder comando"), 0);
  c.connect(isCommand, internal, 1);
  return c.finish();
}

function buildDelivery(parts: CandidateEntry[]) {
  const gate = byFile(parts, "06-delivery-gate-v2.inactive.json");
  const provider = byFile(parts, "08-provider-send-only-v2.inactive.json");
  const c = new Composer(TARGETS.delivery);
  const post = [
    "Preparar resultado da tentativa",
    "Concluir ação no ledger",
    "Espelhar resultado confirmado ou incerto",
    "Espelhar resultado antes de continuar",
    "Entrega foi confirmada?",
    "Parar plano suprimido",
    "Parar plano após falha ou incerteza",
    "Plano concluído sem duplicar",
  ];
  c.addPart(gate, "gate", "GATE", {
    exclude: ["Enviar pelo adaptador único", ...post],
  });
  c.addPart(provider, "provider", "PROVEDOR", { exclude: ["Receber contrato"] });
  c.addPart(gate, "gate", "LEDGER", { include: post });
  c.connect(
    c.ref("gate", "Preparar único caminho de envio"),
    c.ref("provider", "Validar autorização de envio"),
  );
  c.connect(
    c.ref("provider", "Classificar resultado sem retry cego"),
    c.ref("gate", "Preparar resultado da tentativa"),
  );
  c.connect(
    c.ref("provider", "Tratar exceção como resultado incerto"),
    c.ref("gate", "Preparar resultado da tentativa"),
  );
  const result = c.finish();
  patchTargets(result);
  return result;
}

export function consolidateMirandaWorkflows(parts: CandidateEntry[]) {
  return [
    [FILES.entry, buildEntry(parts)],
    [FILES.service, buildService(parts)],
    [FILES.agenda, buildAgenda(parts)],
    [FILES.automations, buildAutomations(parts)],
    [FILES.crm, buildCrm(parts)],
    [FILES.delivery, buildDelivery(parts)],
  ] as CandidateEntry[];
}

