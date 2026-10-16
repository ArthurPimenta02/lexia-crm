import { revalidatePath } from "next/cache";

import {
  type CanalDeAquisicao,
  canalQuePedeNota,
  isCanalDeAquisicao,
} from "@/lib/clientes/ficha";
import {
  type CamposDoServico,
  escreverMarcacao,
  prepararServico,
  type ServicoJaRegistado,
  servicosJaRegistados,
} from "@/lib/clientes/marcacao";
import { procurarPorTelefone } from "@/lib/clientes/read";
import {
  montarTelefone,
  normalizarTelefone,
  pareceTelefone,
} from "@/lib/clientes/telefone";
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
  /**
   * Serviços que este cliente já tem na agenda. Preenchido quando o registo
   * de um serviço novo parou para avisar: a ficha mostra-os e deixa insistir.
   */
  jaRegistados?: ServicoJaRegistado[];
  mensagem: string;
  ok: boolean;
};

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

/** Os campos da ficha que o dono escreve, iguais a criar e a editar. */
export type CamposDaFicha = {
  emailBruto: string;
  idadeBruto: string;
  moradaBruto: string;
  notasBruto: string;
  origemManualBruto: string;
  origemManualNotaBruto: string;
  viaturaBruto: string;
};

type FichaValidada = {
  email: string | null;
  idade: number | null;
  morada: string | null;
  notas: string | null;
  origem_manual: CanalDeAquisicao | null;
  origem_manual_nota: string | null;
  viatura: string | null;
};

function limitar(bruto: string, maximo: number, nomeDoCampo: string) {
  const valor = bruto.trim();

  if (valor.length > maximo) {
    return { erro: `${nomeDoCampo} é demasiado comprido.`, valor: null };
  }

  return { erro: null, valor: valor === "" ? null : valor };
}

/**
 * Valida os campos da ficha e devolve-os já na forma da base.
 *
 * Os limites são os mesmos das restrições da tabela, de propósito: o Postgres
 * é quem decide, isto só evita que o dono descubra o limite por uma mensagem
 * de erro de base de dados. A lista de canais vem de um sítio só, e um valor
 * fora dela é recusado aqui antes de bater na restrição.
 */
function validarFicha(campos: CamposDaFicha): {
  erro: string | null;
  ficha: FichaValidada | null;
} {
  const email = limitar(campos.emailBruto, 320, "O email");
  const morada = limitar(campos.moradaBruto, 512, "A morada");
  const viatura = limitar(campos.viaturaBruto, 160, "O carro");
  const notas = limitar(campos.notasBruto, 4000, "As notas");
  const origemNota = limitar(
    campos.origemManualNotaBruto,
    200,
    "A explicação do canal",
  );

  for (const campo of [email, morada, viatura, notas, origemNota]) {
    if (campo.erro) {
      return { erro: campo.erro, ficha: null };
    }
  }

  const idadeBruta = campos.idadeBruto.trim();
  let idade: number | null = null;

  if (idadeBruta !== "") {
    const numero = Number(idadeBruta);

    if (!Number.isInteger(numero) || numero < 1 || numero > 120) {
      return { erro: "A idade tem de ser um número entre 1 e 120.", ficha: null };
    }

    idade = numero;
  }

  const origemBruta = campos.origemManualBruto.trim();
  let origemManual: CanalDeAquisicao | null = null;

  if (origemBruta !== "") {
    if (!isCanalDeAquisicao(origemBruta)) {
      return { erro: "Esse canal de aquisição não existe.", ficha: null };
    }

    origemManual = origemBruta;
  }

  // A restrição `origem_manual_outro_tem_nota` recusa estes dois casos na base.
  // Apanhá-los aqui é o que faz a diferença entre uma frase que o dono percebe
  // e um erro de Postgres no ecrã.
  if (origemManual === canalQuePedeNota && !origemNota.valor) {
    return { erro: "Escolheste 'Outro': escreve de onde veio.", ficha: null };
  }

  return {
    erro: null,
    ficha: {
      email: email.valor,
      idade,
      morada: morada.valor,
      notas: notas.valor,
      origem_manual: origemManual,
      // Uma explicação sem 'Outro' é lixo de uma escolha trocada: cai aqui.
      origem_manual_nota:
        origemManual === canalQuePedeNota ? origemNota.valor : null,
      viatura: viatura.valor,
    },
  };
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
 *
 * O número é sempre montado com o indicativo antes de chegar à base. Um
 * contacto gravado sem indicativo é um contacto que o aviso de duplicado nunca
 * mais apanha, porque `968662120` e `351968662120` comparam como diferentes.
 */
export async function criarCliente({
  caminhoParaRevalidar,
  campos,
  clienteSlug,
  confirmado,
  indicativoBruto,
  nomeBruto,
  servico: camposDoServico,
  telefoneBruto,
  userId,
}: {
  caminhoParaRevalidar: string;
  campos: CamposDaFicha;
  clienteSlug: string;
  confirmado: boolean;
  indicativoBruto: string;
  nomeBruto: string;
  servico: CamposDoServico;
  telefoneBruto: string;
  userId: string;
}): Promise<GravarClienteResultado> {
  const { erro: erroNome, nome } = validarNome(nomeBruto);

  if (erroNome || !nome) {
    return { mensagem: erroNome ?? "Nome inválido.", ok: false };
  }

  const { digitos, erro: erroTelefone } = montarTelefone(
    indicativoBruto,
    telefoneBruto,
  );

  if (erroTelefone || !digitos) {
    return { mensagem: erroTelefone ?? "Telefone inválido.", ok: false };
  }

  // O que fica gravado é o número completo, só dígitos — a mesma forma em que
  // o agente grava. Guardar o texto como foi escrito reintroduziria os
  // formatos diferentes que deram origem aos duplicados.
  const telefone = digitos;
  const { erro: erroFicha, ficha } = validarFicha(campos);

  if (erroFicha || !ficha) {
    return { mensagem: erroFicha ?? "Campos inválidos.", ok: false };
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

  // O serviço é confirmado contra o catálogo do cliente ANTES de o contacto
  // existir. São duas bases de dados sem transacção entre elas: tudo o que
  // possa ser recusado tem de o ser enquanto ainda não há nada escrito.
  const { erro: erroServico, servico } = await prepararServico({
    campos: camposDoServico,
    clienteSlug,
  });

  if (erroServico) {
    return { mensagem: erroServico, ok: false };
  }

  const admin = createAdminClient();
  const agora = new Date().toISOString();
  const { error } = await admin.from("lexia_contactos").insert({
    ...ficha,
    actualizado_por: userId,
    atualizado_em: agora,
    canal: "whatsapp",
    cliente_slug: clienteSlug,
    criado_em: agora,
    // Datar a idade e o canal: daqui a dois anos é isto que diz se "34" e
    // "veio do Google" ainda valem alguma coisa.
    idade_registada_em: ficha.idade === null ? null : agora,
    identificador_conversa: identificador,
    nome,
    origem_manual_em: ficha.origem_manual === null ? null : agora,
    origem_manual_por: ficha.origem_manual === null ? null : userId,
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

  if (!servico) {
    revalidatePath(caminhoParaRevalidar);

    return { mensagem: `${nome} ficou no painel.`, ok: true };
  }

  const { erro: erroEscrita } = await escreverMarcacao({
    clienteSlug,
    nomeCliente: nome,
    servico,
    telefone,
    viatura: ficha.viatura,
  });

  revalidatePath(caminhoParaRevalidar);

  // O contacto já existe e não se desfaz: apagá-lo para "limpar" perdia o
  // email, a morada e o canal de aquisição que o dono acabou de escrever, por
  // causa de uma segunda escrita noutra base. Diz-se o que ficou e o que não.
  if (erroEscrita) {
    return {
      mensagem: `${nome} ficou no painel, mas o serviço não foi registado: ${erroEscrita}. O contacto está criado — não o cries outra vez.`,
      ok: false,
    };
  }

  return {
    mensagem: `${nome} ficou no painel, com "${servico.nome}" no histórico.`,
    ok: true,
  };
}

/**
 * Regista um serviço já feito num cliente que já está no painel.
 *
 * Este é o caso normal, e não o raro: o Martim também trata do CRM, e um
 * cliente com ficha é precisamente o que volta para fazer mais um serviço.
 * Deixar isto só no formulário de criar obrigava a inventar um contacto
 * repetido para registar uma venda real.
 *
 * O aviso de repetição
 * --------------------
 * Carregar duas vezes no botão escrevia a mesma venda duas vezes, e o total
 * gasto passava a mentir sem dar nas vistas — um número errado continua a
 * parecer um número. A trava é a mesma que o Arthur escolheu para os
 * contactos duplicados: quem já tem serviços na agenda não é bloqueado, é
 * avisado. A primeira submissão devolve a lista do que já lá está e a segunda,
 * com `confirmado`, escreve. Mostrar a lista é o que resolve, porque o serviço
 * repetido fica à vista.
 *
 * O nome, o telefone e a viatura vêm da ficha lida aqui e nunca do formulário.
 * Um telefone vindo do navegador escrevia a venda no histórico de outra
 * pessoa; e a leitura por `cliente_slug` e `id` é, ao mesmo tempo, a
 * autorização sobre o `contactoId`.
 */
export async function registarServicoDeCliente({
  caminhoParaRevalidar,
  clienteSlug,
  confirmado,
  contactoId,
  servico: camposDoServico,
}: {
  caminhoParaRevalidar: string;
  clienteSlug: string;
  confirmado: boolean;
  contactoId: string;
  servico: CamposDoServico;
}): Promise<GravarClienteResultado> {
  const admin = createAdminClient();
  const { data: contacto, error } = await admin
    .from("lexia_contactos")
    .select("id, nome, telefone, viatura")
    .eq("cliente_slug", clienteSlug)
    .eq("id", contactoId)
    .maybeSingle();

  if (error) {
    console.error("[clientes] falha a ler a ficha antes de registar", error);

    return { mensagem: "Não foi possível ler a ficha do cliente.", ok: false };
  }

  if (!contacto) {
    return { mensagem: "Cliente não encontrado.", ok: false };
  }

  const nome = (contacto.nome ?? "").trim();
  const telefone = normalizarTelefone(contacto.telefone);

  // Sem número não há ponte: `marcacoes` liga-se à ficha pelo telefone e por
  // mais nada. Uma linha escrita sem ele ficava na agenda sem nunca voltar a
  // aparecer nesta ficha nem no total gasto.
  if (!pareceTelefone(telefone)) {
    return {
      mensagem:
        "Esta ficha não tem um número de telefone a sério, e é o número que liga o serviço ao histórico. Põe o número primeiro.",
      ok: false,
    };
  }

  const { erro: erroServico, servico } = await prepararServico({
    campos: camposDoServico,
    clienteSlug,
  });

  if (erroServico) {
    return { mensagem: erroServico, ok: false };
  }

  // Aqui o bloco não é opcional: o formulário existe só para isto. Vazio é
  // um engano, e dizê-lo é melhor do que gravar nada e responder "feito".
  if (!servico) {
    return { mensagem: "Escolhe o serviço que foi feito e a data.", ok: false };
  }

  if (!confirmado) {
    const { erro: erroHistorico, servicos } = await servicosJaRegistados({
      clienteSlug,
      telefone,
    });

    if (erroHistorico) {
      return { mensagem: erroHistorico, ok: false };
    }

    if (servicos.length > 0) {
      return {
        jaRegistados: servicos,
        mensagem:
          servicos.length === 1
            ? `${nome || "Este cliente"} já tem um serviço registado.`
            : `${nome || "Este cliente"} já tem ${servicos.length} serviços registados.`,
        ok: false,
      };
    }
  }

  const { erro: erroEscrita } = await escreverMarcacao({
    clienteSlug,
    nomeCliente: nome,
    servico,
    telefone,
    viatura: contacto.viatura,
  });

  if (erroEscrita) {
    return {
      mensagem: `O serviço não foi registado: ${erroEscrita}.`,
      ok: false,
    };
  }

  revalidatePath(caminhoParaRevalidar);

  return {
    mensagem: `"${servico.nome}" entrou no histórico.`,
    ok: true,
  };
}

/**
 * Grava a ficha de um contacto que já existe.
 *
 * Isto era só as notas. Passou a ser a ficha toda porque os campos novos sem
 * edição não serviam para nada: medido a 2026-10-16, o Detail tem 1001
 * contactos e a Miranda 573, todos já criados. Um formulário que só preenche
 * o canal de aquisição de quem for registado a partir de hoje deixava 97% da
 * base sem resposta — que é exactamente o buraco que se queria tapar.
 *
 * O nome e o telefone continuam de fora. O telefone é a chave por onde o
 * histórico de marcações se liga à outra base e por onde os duplicados se
 * encontram; mudá-lo num campo de texto partia as duas coisas em silêncio.
 */
export async function gravarFichaDoCliente({
  caminhoParaRevalidar,
  campos,
  clienteSlug,
  contactoId,
  userId,
}: {
  caminhoParaRevalidar: string;
  campos: CamposDaFicha;
  clienteSlug: string;
  contactoId: string;
  userId: string;
}): Promise<GravarClienteResultado> {
  const { erro: erroFicha, ficha } = validarFicha(campos);

  if (erroFicha || !ficha) {
    return { mensagem: erroFicha ?? "Campos inválidos.", ok: false };
  }

  const admin = createAdminClient();
  const agora = new Date().toISOString();
  const { data, error } = await admin
    .from("lexia_contactos")
    .update({
      ...ficha,
      actualizado_por: userId,
      idade_registada_em: ficha.idade === null ? null : agora,
      origem_manual_em: ficha.origem_manual === null ? null : agora,
      origem_manual_por: ficha.origem_manual === null ? null : userId,
    })
    .eq("cliente_slug", clienteSlug)
    .eq("id", contactoId)
    .select("id");

  if (error) {
    console.error("[clientes] falha a gravar a ficha", error);

    return { mensagem: "Não foi possível gravar a ficha.", ok: false };
  }

  // Sem linhas afectadas o id não é deste cliente. O update não falhou — não
  // encontrou nada —, por isso é aqui que se percebe e não no erro.
  if ((data ?? []).length === 0) {
    return { mensagem: "Cliente não encontrado.", ok: false };
  }

  revalidatePath(caminhoParaRevalidar);

  return { mensagem: "Ficha gravada.", ok: true };
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
