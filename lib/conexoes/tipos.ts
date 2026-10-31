/**
 * Catálogo das conexões que um agente usa (Fase 19).
 *
 * Saiu do que os workflows do n8n leem hoje (nós "Config Cliente Lexia" da
 * Miranda, do Detail e da Asteric, e as credenciais ligadas aos nós). Cada
 * tipo diz que campos pede e quais são segredo: os segredos vão cifrados
 * (lib/conexoes/cifra.ts) e a tela nunca os mostra de volta, só o final.
 *
 * `global`: conexões da Lexia, partilhadas por todos os clientes (a conta
 * Google do Arthur, onde os clientes partilham a agenda; as chaves de IA de
 * reserva). Gravam-se com `cliente_slug` nulo.
 */

export type CampoConexao = {
  nome: string;
  label: string;
  segredo: boolean;
  ajuda?: string;
  exemplo?: string;
};

export type TipoConexao = {
  tipo: string;
  titulo: string;
  descricao: string;
  ambito: "cliente" | "global";
  campos: CampoConexao[];
};

export const TIPOS_CONEXAO: TipoConexao[] = [
  {
    tipo: "whatsapp_zapi",
    titulo: "WhatsApp (Z-API)",
    descricao: "Receber e enviar mensagens pelo número do cliente. É o que a Miranda usa.",
    ambito: "cliente",
    campos: [
      {
        nome: "base_url",
        label: "URL da instância",
        segredo: true,
        ajuda: "No painel da Z-API, em Instâncias. Já traz o ID e o token da instância.",
        exemplo: "https://api.z-api.io/instances/…/token/…",
      },
      {
        nome: "client_token",
        label: "Client-Token da conta",
        segredo: true,
        ajuda: "No painel da Z-API, em Segurança.",
      },
    ],
  },
  {
    tipo: "whatsapp_uazapi",
    titulo: "WhatsApp (uazapi)",
    descricao: "Receber e enviar mensagens pelo número do cliente. É o que o Detail e a Asteric usam.",
    ambito: "cliente",
    campos: [
      {
        nome: "base_url",
        label: "URL do servidor",
        segredo: false,
        exemplo: "https://….uazapi.com",
      },
      { nome: "token", label: "Token da instância", segredo: true },
    ],
  },
  {
    tipo: "meta",
    titulo: "Instagram e Messenger (Meta)",
    descricao: "Responder no Direct do Instagram e no Messenger da página.",
    ambito: "cliente",
    campos: [
      { nome: "page_id", label: "ID da página do Facebook", segredo: false },
      { nome: "instagram_id", label: "ID da conta do Instagram", segredo: false },
      {
        nome: "page_access_token",
        label: "Token da página (Messenger)",
        segredo: true,
      },
      {
        nome: "instagram_access_token",
        label: "Token do Instagram",
        segredo: true,
        ajuda: "Se for o mesmo token da página, cole o mesmo nos dois.",
      },
    ],
  },
  {
    tipo: "google_agenda",
    titulo: "Agenda (Google)",
    descricao:
      "Qual agenda, das partilhadas com a conta Google da Lexia, é a deste cliente.",
    ambito: "cliente",
    campos: [
      {
        nome: "calendar_id",
        label: "ID da agenda",
        segredo: false,
        ajuda: "Normalmente o e-mail do dono da agenda.",
        exemplo: "nome@gmail.com",
      },
      {
        nome: "outras_agendas",
        label: "Outras agendas (se houver mais de um profissional)",
        segredo: false,
        ajuda: "Nome=ID, separados por ponto e vírgula. O Detail usa a do Martim e a do Roberto.",
        exemplo: "Roberto=…@group.calendar.google.com",
      },
    ],
  },
  {
    tipo: "redis",
    titulo: "Memória rápida (Redis)",
    descricao: "Pausas, buffer e contexto da conversa. O botão de pausar do painel usa o mesmo.",
    ambito: "cliente",
    campos: [
      { nome: "url", label: "URL REST (Upstash)", segredo: false },
      { nome: "token", label: "Token REST", segredo: true },
      {
        nome: "host",
        label: "Endereço TCP",
        segredo: false,
        ajuda: "O que o n8n usa. Basta um dos dois jeitos: REST ou TCP.",
      },
      { nome: "password", label: "Senha TCP", segredo: true },
    ],
  },
  {
    tipo: "supabase_cliente",
    titulo: "Base de dados do cliente (Supabase)",
    descricao: "Catálogo, promoções, follow-ups e agenda do cliente.",
    ambito: "cliente",
    campos: [
      { nome: "url", label: "URL do projeto", segredo: false },
      { nome: "service_role_key", label: "Chave service_role", segredo: true },
    ],
  },
  {
    tipo: "postgres_cliente",
    titulo: "Base de dados do cliente (Postgres direto)",
    descricao: "Só para quem tem consultas SQL próprias, como o preço por carro do Detail.",
    ambito: "cliente",
    campos: [
      {
        nome: "connection_string",
        label: "Connection string",
        segredo: true,
        exemplo: "postgresql://…",
      },
    ],
  },
  {
    tipo: "shopify",
    titulo: "Loja (Shopify)",
    descricao: "Produtos, estoque e pedidos.",
    ambito: "cliente",
    campos: [
      { nome: "loja", label: "Endereço da loja", segredo: false, exemplo: "loja.myshopify.com" },
      { nome: "access_token", label: "Access token da Admin API", segredo: true },
    ],
  },
  {
    tipo: "email_zoho",
    titulo: "E-mail (Zoho)",
    descricao: "Ler e responder a caixa de e-mail do cliente. É o que a Asteric usa.",
    ambito: "cliente",
    campos: [
      { nome: "email", label: "Endereço de e-mail", segredo: false },
      { nome: "api_domain", label: "Domínio da API", segredo: false, exemplo: "https://www.zohoapis.com" },
      { nome: "client_id", label: "OAuth Client ID", segredo: false },
      { nome: "client_secret", label: "OAuth Client Secret", segredo: true },
      { nome: "refresh_token", label: "Refresh token", segredo: true },
    ],
  },
  {
    tipo: "google_conta",
    titulo: "Conta Google da Lexia",
    descricao:
      "A conta onde os clientes partilham a agenda. Ligada uma vez, serve para todos.",
    ambito: "global",
    campos: [
      { nome: "email", label: "E-mail da conta", segredo: false },
      { nome: "client_id", label: "OAuth Client ID", segredo: false },
      { nome: "client_secret", label: "OAuth Client Secret", segredo: true },
      { nome: "refresh_token", label: "Refresh token", segredo: true },
    ],
  },
  {
    tipo: "ia",
    titulo: "Chaves de IA",
    descricao:
      "Para o cliente: só se a IA dele for paga numa conta separada. Na Lexia: a chave usada por todos os outros.",
    ambito: "cliente",
    campos: [
      { nome: "anthropic_api_key", label: "Anthropic", segredo: true },
      {
        nome: "anthropic_base_url",
        label: "Endereço da Anthropic (Cloudflare)",
        segredo: false,
        ajuda: "O worker da Cloudflare que guarda o cache e economiza tokens.",
      },
      { nome: "openai_api_key", label: "OpenAI", segredo: true },
      { nome: "gemini_api_key", label: "Google Gemini", segredo: true },
    ],
  },
];

/** `ia` vale nos dois âmbitos: por cliente e como reserva global. */
export function tiposDoAmbito(ambito: "cliente" | "global") {
  return TIPOS_CONEXAO.filter((t) => t.ambito === ambito || t.tipo === "ia");
}

export function tipoConexao(tipo: string) {
  return TIPOS_CONEXAO.find((t) => t.tipo === tipo) ?? null;
}

/**
 * Junta o que veio do formulário com o que já estava gravado.
 *
 * Um campo de segredo deixado em branco MANTÉM o valor antigo: a tela nunca
 * mostra o segredo de volta, por isso o campo aparece sempre vazio, e gravar o
 * formulário para mudar outra coisa não pode apagar o token que já lá estava.
 * Para apagar um segredo existe a caixa "apagar" de cada campo.
 */
export function juntarSegredos(
  antigos: Record<string, string>,
  novos: Record<string, string>,
  apagar: string[],
) {
  const resultado: Record<string, string> = { ...antigos };
  for (const [nome, valor] of Object.entries(novos)) {
    if (valor.trim()) resultado[nome] = valor.trim();
  }
  for (const nome of apagar) delete resultado[nome];
  return resultado;
}
