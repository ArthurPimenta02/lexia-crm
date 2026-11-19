/**
 * O que a consulta livre do Analista pode ler: as vistas do schema `analista`
 * (migração 202611190021_analista_consulta_livre.sql). Cada vista já vem
 * filtrada pela empresa da sessão; não há coluna de empresa.
 *
 * As colunas aqui TÊM de ser as da migração: o teste
 * tests/ajudante-consulta.test.mts compara as duas e falha se divergirem.
 */

export type Vista = { colunas: string[]; nota: string };

export const VISTAS: Record<string, Vista> = {
  contactos: {
    colunas: ["id", "nome", "telefone", "telefone_digitos", "email", "canal", "identificador_conversa", "criado_em", "atualizado_em", "origem_tipo", "anuncio_externo_id", "origem_titulo", "campanha_externa_id", "origem_manual", "origem_manual_nota", "notas", "morada", "viatura", "idade"],
    nota: "fichas dos clientes (leads). canal: whatsapp|instagram|messenger. origem_tipo: organico|ctwa|instagram_ad|messenger_ad|anuncio|instagram_post|null (diferente de organico e não nulo = veio de anúncio). criado_em = quando o lead chegou.",
  },
  mensagens: {
    colunas: ["id", "contacto_id", "identificador_conversa", "direccao", "tipo", "conteudo", "origem", "criado_em"],
    nota: "todas as mensagens. direccao: recebida (do cliente) | enviada. tipo: texto|audio|imagem|documento|video. origem (das enviadas): workflow = o agente; humano = a equipa; followup_agente/followup_rapido = follow-up; lembrete_agente = lembrete; recebida_na_pausa = recebida com o agente pausado.",
  },
  agendamentos: {
    colunas: ["id", "inicio", "fim", "dia_inteiro", "fuso", "titulo", "descricao", "localizacao", "estado", "nome_cliente", "telefone", "telefone_digitos", "email", "origem", "executor", "servico", "valor_previsto", "contacto_id", "dados", "criado_no_google", "criado_em"],
    nota: "a agenda (espelho do Google Calendar). inicio = dia/hora do atendimento; criado_em = quando foi marcado. estado: confirmado|cancelado. origem: agente (o agente marcou) | manual. executor = profissional. Ignore dia_inteiro = true (bloqueios). Liga à conversa por telefone_digitos (identificador_conversa = 'whatsapp:' || telefone_digitos).",
  },
  eventos: {
    colunas: ["id", "tipo", "ocorrido_em", "identificador_conversa", "telefone_digitos", "origem", "dados"],
    nota: "registo de acontecimentos. tipo: followup_armado|followup_enviado|followup_cancelado|followup_reagendado|followup_encerrado|followup_etapa_saltada|followup_longo_agendado|followup_rapido_enviado|followup_aviso_equipa|lembrete_enviado|lead_temperatura (dados->>'temperatura').",
  },
  anuncios: {
    colunas: ["anuncio_externo_id", "nome", "estado", "plataforma", "conjunto_externo_id", "conjunto_nome", "campanha_externa_id", "campanha_nome", "sincronizado_em"],
    nota: "anúncios da Meta. Liga a contactos por anuncio_externo_id.",
  },
  campanhas: {
    colunas: ["id", "campanha_externa_id", "nome", "objectivo", "estado", "plataforma", "criada_em_plataforma"],
    nota: "campanhas da Meta.",
  },
  campanha_custos: {
    colunas: ["campanha_id", "dia", "gasto", "moeda", "alcance", "impressoes", "cliques", "cliques_link", "cpm", "ctr", "accoes"],
    nota: "gasto diário por campanha (campanha_id = campanhas.id).",
  },
  frases_anuncio: {
    colunas: ["frase", "campanha_externa_id", "activa", "criado_em"],
    nota: "frases prontas da 1.ª mensagem de cada anúncio.",
  },
  analises_conversas: {
    colunas: ["identificador_conversa", "canal", "primeira_mensagem_em", "ultima_mensagem_em", "quantidade_mensagens", "resumo", "intencao", "etapa_comercial", "sentimento", "resultado", "objecoes", "pontos_fortes", "oportunidades", "confianca", "analisado_em"],
    nota: "análise automática de parte das conversas (resumo, intenção, objeções em jsonb). Pode não cobrir todas.",
  },
  turnos: {
    colunas: ["id", "identificador_conversa", "canal", "modo", "estado", "motivo", "rota", "mensagem_cliente", "mensagens", "handoff", "resumo", "duracao_ms", "iniciado_em", "criado_em"],
    nota: "cada vez que o agente correu. modo: producao|teste (use producao). estado: respondido|parado|erro. canal 'cron:*' = tarefas automáticas (follow-ups, lembretes). rota: atendimento|agendamento|followup|lembrete.",
  },
  handoffs: {
    colunas: ["id", "telefone", "nome_contacto", "motivo", "prioridade", "resumo", "status", "origem", "criado_em", "atualizado_em"],
    nota: "pedidos de passar a conversa para uma pessoa (pode estar vazia).",
  },
  feedbacks: {
    colunas: ["id", "origem", "avaliacao", "comentario", "mensagem_cliente", "resposta_agente", "status", "criado_em"],
    nota: "correções que a equipa deu ao agente.",
  },
  bloqueios: {
    colunas: ["canal", "identificador", "nome", "motivo", "criado_em"],
    nota: "contactos que o agente não atende.",
  },
  produtos: {
    colunas: ["id", "nome", "unidade", "notas", "activo", "criado_em"],
    nota: "produtos/stock (muitas vezes vazio).",
  },
  produto_movimentos: {
    colunas: ["produto_id", "tipo", "quantidade", "custo_total", "servico_nome", "nota", "ocorrido_em"],
    nota: "entradas e saídas de stock.",
  },
};

/** O texto para o sistema (fixo, vai em cache junto das instruções). */
export const ESQUEMA_CONSULTA = [
  "CONSULTA LIVRE (ferramenta consulta_livre): um SELECT de PostgreSQL sobre estas vistas do schema analista, já filtradas por esta empresa (não há coluna de empresa). Escreva sempre analista.<vista>.",
  ...Object.entries(VISTAS).map(([nome, v]) => `- analista.${nome}(${v.colunas.join(", ")}): ${v.nota}`),
  "Regras: uma só instrução SELECT ou WITH; sem ';', comentários, aspas duplas, '$' nem barra invertida; nada de pg_*, information_schema, set_config, current_setting. Datas são timestamptz em UTC: para dias no fuso da empresa use (coluna at time zone '<fuso>'). Agregue no SQL (count, sum, group by) em vez de trazer linhas soltas; devolve no máximo 200 linhas, com o total. Se der erro, leia a mensagem e corrija a consulta.",
  "Conversa: identificador_conversa = '<canal>:<id>' (ex.: whatsapp:351912345678). Lead novo = contactos.criado_em no período. Agendou = agendamentos com estado confirmado (dia_inteiro false).",
].join("\n");
