import { revalidatePath } from "next/cache";

import { normalizarTelefone, procurarPorTelefone } from "@/lib/clientes/read";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Escritas da ficha de clientes.
 *
 * A autorização fica a cargo de quem chama, como nos produtos e nos serviços:
 * a action tira o `cliente_slug` do perfil no servidor e passa-o para aqui.
 * Daqui para baixo o slug é tratado como verdade, e TODAS as consultas o
 * levam — o `createAdminClient()` é a `service_role` e ignora o RLS, por isso
 * o `.eq("cliente_slug", …)` é a única coisa entre uma empresa e os dados da
 * outra.
 */

export type GravarClienteResultado = {
  /**
   * Contactos que já têm este número. Preenchido quando a criação parou para
   * avisar: o formulário mostra-os e deixa insistir.
   */
  duplicados?: {
    canal: string;
    id: string;
    nome: string;
    telefone: string;
  }[];
  mensagem: string;
  ok: boolean;
};

const digitosMinimos = 9;
const digitosMaximos = 14;

function validarNome(bruto: string) {
  const nome = bruto.trim();

  if (nome === "") {
    return { erro: "Escreve o nome do cliente.", nome: null };
  }

  if (nome.length > 256) {
    return { erro: "O nome é demasiado comprido.", nome: null };
  }

  return { erro: null, nome };
}

/**
 * Valida o telefone com a mesma régua do agente.
 *
 * O `criar_marcacao` no n8n recusa um número fora de 8 a 15 dígitos com a
 * mensagem "NUNCA uses o ID do contacto". Aqui a janela é mais estreita, 9 a
 * 14, porque medido a 2026-10-16 há PSIDs de Instagram com exactamente 15
 * dígitos: dois deles passariam a régua do agente e entrariam na lista como
 * se fossem telemóveis.
 */
function validarTelefone(bruto: string) {
  const texto = bruto.trim();
  const digitos = normalizarTelefone(texto);

  if (digitos === "") {
    return { digitos: null, erro: "Escreve o telefone do cliente.", texto: null };
  }

  if (digitos.length < digitosMinimos || digitos.length > digitosMaximos) {
    return {
      digitos: null,
      erro: "Isso não parece um número de telefone. Escreve-o com o indicativo do país, por exemplo 351912345678.",
      texto: null,
    };
  }

  return { digitos, erro: null, texto };
}

/**
 * Cria um cliente à mão, no WhatsApp.
 *
 * Porque é que o canal é sempre WhatsApp: o `identificador_conversa` é
 * obrigatório e tem a forma `canal:id`. No WhatsApp o id é o próprio número,
 * portanto um contacto criado aqui liga-se à conversa real assim que a pessoa
 * escrever. No Instagram e no Messenger o id é o PSID, que ninguém sabe de
 * fora da conversa — um contacto criado à mão nesses canais nunca encontraria
 * a conversa dele.
 *
 * O aviso de duplicado é um passo e não um bloqueio, como o Arthur escolheu:
 * a primeira tentativa devolve `ok: false` com a lista, e a segunda — com
 * `confirmado` — grava. Não se decide pelo dono que são a mesma pessoa.
 */
export async function criarCliente({
  caminhoParaRevalidar,
  clienteSlug,
  confirmado,
  nomeBruto,
  notasBruto,
  telefoneBruto,
  userId,
}: {
  caminhoParaRevalidar: string;
  clienteSlug: string;
  confirmado: boolean;
  nomeBruto: string;
  notasBruto: string;
  telefoneBruto: string;
  userId: string;
}): Promise<GravarClienteResultado> {
  const { erro: erroNome, nome } = validarNome(nomeBruto);

  if (erroNome || !nome) {
    return { mensagem: erroNome ?? "Nome inválido.", ok: false };
  }

  const { digitos, erro: erroTelefone, texto: telefone } = validarTelefone(
    telefoneBruto,
  );

  if (erroTelefone || !digitos || !telefone) {
    return { mensagem: erroTelefone ?? "Telefone inválido.", ok: false };
  }

  const notas = notasBruto.trim();

  if (notas.length > 4000) {
    return { mensagem: "As notas são demasiado compridas.", ok: false };
  }

  const existentes = await procurarPorTelefone(clienteSlug, telefone);
  const identificador = `whatsapp:${digitos}`;

  // Caso diferente do duplicado: já existe a MESMA conversa de WhatsApp. Aí
  // não há nada para criar nem para juntar — é a mesma linha.
  const mesmaConversa = existentes.find(
    (linha) => linha.identificadorConversa === identificador,
  );

  if (mesmaConversa) {
    return {
      mensagem: `Este número já está no painel${
        mesmaConversa.nome ? ` como "${mesmaConversa.nome}"` : ""
      }. Abre a ficha dele em vez de criar outra.`,
      ok: false,
    };
  }

  if (existentes.length > 0 && !confirmado) {
    return {
      duplicados: existentes.map((linha) => ({
        canal: linha.canal,
        id: linha.id,
        nome: linha.nome,
        telefone: linha.telefone,
      })),
      mensagem:
        existentes.length === 1
          ? "Já existe um contacto com este número."
          : `Já existem ${existentes.length} contactos com este número.`,
      ok: false,
    };
  }

  const admin = createAdminClient();
  const agora = new Date().toISOString();
  const { error } = await admin.from("lexia_contactos").insert({
    actualizado_por: userId,
    atualizado_em: agora,
    canal: "whatsapp",
    cliente_slug: clienteSlug,
    criado_em: agora,
    identificador_conversa: identificador,
    nome,
    notas: notas === "" ? null : notas,
    telefone,
  });

  if (error) {
    console.error("[clientes] falha a criar o cliente", error);

    if (error.code === "23505") {
      return {
        mensagem: "Este número já está no painel. Abre a ficha dele.",
        ok: false,
      };
    }

    return { mensagem: "Não foi possível criar o cliente.", ok: false };
  }

  revalidatePath(caminhoParaRevalidar);

  return { mensagem: `${nome} ficou no painel.`, ok: true };
}

export async function gravarNotasDoCliente({
  caminhoParaRevalidar,
  clienteSlug,
  contactoId,
  notasBruto,
  userId,
}: {
  caminhoParaRevalidar: string;
  clienteSlug: string;
  contactoId: string;
  notasBruto: string;
  userId: string;
}): Promise<GravarClienteResultado> {
  const notas = notasBruto.trim();

  if (notas.length > 4000) {
    return { mensagem: "As notas são demasiado compridas.", ok: false };
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("lexia_contactos")
    .update({
      actualizado_por: userId,
      notas: notas === "" ? null : notas,
    })
    .eq("cliente_slug", clienteSlug)
    .eq("id", contactoId)
    .select("id");

  if (error) {
    console.error("[clientes] falha a gravar as notas", error);

    return { mensagem: "Não foi possível gravar as notas.", ok: false };
  }

  // Sem linhas afectadas o id não é deste cliente. O update não falhou — não
  // encontrou nada —, por isso é aqui que se percebe e não no erro.
  if ((data ?? []).length === 0) {
    return { mensagem: "Cliente não encontrado.", ok: false };
  }

  revalidatePath(caminhoParaRevalidar);

  return { mensagem: "Notas gravadas.", ok: true };
}

/**
 * Junta dois contactos: o duplicado passa a apontar para o principal.
 *
 * Não apaga nada, de propósito. Se a linha do duplicado desaparecesse, o
 * Omnichannel criava-a outra vez na mensagem seguinte daquela conversa e o
 * dono juntava os mesmos dois contactos para sempre. Assim a linha fica, o
 * agente continua a escrever nela, e o painel é que a mostra por baixo do
 * principal.
 *
 * As mensagens também não se mexem: a leitura soma as conversas dos dois.
 */
export async function juntarClientes({
  caminhoParaRevalidar,
  clienteSlug,
  duplicadoId,
  principalId,
  userId,
}: {
  caminhoParaRevalidar: string;
  clienteSlug: string;
  duplicadoId: string;
  principalId: string;
  userId: string;
}): Promise<GravarClienteResultado> {
  if (duplicadoId === principalId) {
    return { mensagem: "Escolhe dois contactos diferentes.", ok: false };
  }

  const admin = createAdminClient();

  // Os dois ids vêm do formulário, logo do navegador. Esta leitura é a
  // autorização: um id de outra empresa não aparece aqui.
  const { data: envolvidos, error: erroLeitura } = await admin
    .from("lexia_contactos")
    .select("id, nome, fundido_em")
    .eq("cliente_slug", clienteSlug)
    .in("id", [duplicadoId, principalId]);

  if (erroLeitura) {
    console.error("[clientes] falha a ler os contactos a juntar", erroLeitura);

    return { mensagem: "Não foi possível juntar os contactos.", ok: false };
  }

  const linhas = envolvidos ?? [];
  const principal = linhas.find((linha) => String(linha.id) === principalId);
  const duplicado = linhas.find((linha) => String(linha.id) === duplicadoId);

  if (!principal || !duplicado) {
    return { mensagem: "Contacto não encontrado.", ok: false };
  }

  // Sem correntes: se o principal escolhido já está fundido noutro, a ficha
  // que o dono está a ver não é a que ficaria com os dados.
  if (principal.fundido_em) {
    return {
      mensagem:
        "Esse contacto já está junto a outro. Junta ao contacto principal.",
      ok: false,
    };
  }

  // Se o duplicado já absorveu alguém, fundi-lo esconderia os contactos dele.
  const { data: dependentes, error: erroDependentes } = await admin
    .from("lexia_contactos")
    .select("id")
    .eq("cliente_slug", clienteSlug)
    .eq("fundido_em", duplicadoId)
    .limit(1);

  if (erroDependentes) {
    console.error("[clientes] falha a verificar dependentes", erroDependentes);

    return { mensagem: "Não foi possível juntar os contactos.", ok: false };
  }

  if ((dependentes ?? []).length > 0) {
    return {
      mensagem:
        "Esse contacto já tem outros juntos a ele. Separa-os primeiro, ou junta na outra direcção.",
      ok: false,
    };
  }

  const { error } = await admin
    .from("lexia_contactos")
    .update({
      actualizado_por: userId,
      fundido_em: principalId,
      fundido_por: userId,
      fundido_quando: new Date().toISOString(),
    })
    .eq("cliente_slug", clienteSlug)
    .eq("id", duplicadoId);

  if (error) {
    console.error("[clientes] falha a juntar os contactos", error);

    return { mensagem: "Não foi possível juntar os contactos.", ok: false };
  }

  revalidatePath(caminhoParaRevalidar);

  return {
    mensagem: `Contactos juntos em "${principal.nome ?? "o principal"}".`,
    ok: true,
  };
}

/** Desfaz uma junção. É uma coluna a voltar a NULL, nada se perdeu. */
export async function separarClientes({
  caminhoParaRevalidar,
  clienteSlug,
  duplicadoId,
  userId,
}: {
  caminhoParaRevalidar: string;
  clienteSlug: string;
  duplicadoId: string;
  userId: string;
}): Promise<GravarClienteResultado> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("lexia_contactos")
    .update({
      actualizado_por: userId,
      fundido_em: null,
      fundido_por: null,
      fundido_quando: null,
    })
    .eq("cliente_slug", clienteSlug)
    .eq("id", duplicadoId)
    .select("id");

  if (error) {
    console.error("[clientes] falha a separar os contactos", error);

    return { mensagem: "Não foi possível separar os contactos.", ok: false };
  }

  if ((data ?? []).length === 0) {
    return { mensagem: "Contacto não encontrado.", ok: false };
  }

  revalidatePath(caminhoParaRevalidar);

  return { mensagem: "Contactos separados.", ok: true };
}
