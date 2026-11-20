import { acessoOuMotivo, respostaSemAcesso } from "@/lib/onboarding/acesso";
import { chaveDoGemini, transcrever } from "@/lib/onboarding/audio";
import { abrirConversa, turno, voltar, type Resposta } from "@/lib/onboarding/conversa";
import { repositorioDoBanco } from "@/lib/onboarding/conversa-banco";
import { BUCKET_ONBOARDING, gravarTextoDoArquivo, lerLinhas, lerOnboarding, listarArquivos } from "@/lib/onboarding/dados";
import { inteligenciaReal } from "@/lib/onboarding/entrevistadora";
import { lerArquivo } from "@/lib/onboarding/fontes";
import { chaveDoCliente, custoUsd, type Uso } from "@/lib/onboarding/ia";

export const dynamic = "force-dynamic";
// Um turno com áudio comprido: transcrever, entender e responder.
export const maxDuration = 300;

const erro = (mensagem: string, status: number, extra: Record<string, unknown> = {}) => Response.json({ erro: mensagem, ...extra }, { status });

async function contexto(pedida: unknown) {
  const acesso = await acessoOuMotivo(pedida);
  if ("sem" in acesso) return { falha: respostaSemAcesso(acesso.sem) } as const;
  const onb = await lerOnboarding(acesso.admin, acesso.clienteSlug);
  if (!onb || onb.estado === "etapa1" || onb.estado === "preparando") return { falha: erro("A conversa ainda não foi liberada.", 409) } as const;
  const ia = await chaveDoCliente(acesso.admin, acesso.clienteSlug);
  if (!ia) return { falha: erro("Falta a chave da IA deste cliente.", 409) } as const;
  const linhas = await lerLinhas(acesso.admin, acesso.clienteSlug, onb.id);
  const nome = linhas.find((l) => l.campo === "nome_do_responsavel" && !l.item_id)?.valor;
  return { acesso, onb, ia, nome: typeof nome === "string" ? nome : "" } as const;
}

/** A conversa como está (e a abertura, na primeira vez). Serve para entrar e para retomar. */
export async function GET(request: Request) {
  const c = await contexto(new URL(request.url).searchParams.get("cliente") ?? undefined);
  if ("falha" in c) return c.falha;
  const repo = repositorioDoBanco(c.acesso.admin, c.acesso.clienteSlug, c.onb.id, c.acesso.userId);
  try {
    const r = await abrirConversa(repo, inteligenciaReal(c.ia), c.nome);
    return Response.json({ ...r, estado: c.onb.estado });
  } catch (e) {
    console.error("[onboarding] abrir a conversa", c.acesso.clienteSlug, e);
    return erro("Não foi possível abrir a conversa agora. Tente de novo em instantes.", 502);
  }
}

/** Um turno: a resposta da cliente. A mensagem é gravada antes de qualquer outra coisa. */
export async function POST(request: Request) {
  const corpo = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const c = await contexto(corpo.cliente);
  if ("falha" in c) return c.falha;
  if (c.onb.estado !== "conversa") return erro("A conversa já terminou.", 409);
  const { admin, clienteSlug, userId } = c.acesso;

  // Corrigir a resposta anterior: desfaz o último turno, sem IA e sem apagar nada dela (fica no histórico da mensagem).
  if (corpo.voltar === true) {
    try {
      const r = await voltar(repositorioDoBanco(admin, clienteSlug, c.onb.id, userId));
      if (!r) return erro("Não dá para corrigir mais do que a última resposta.", 409);
      return Response.json({ ...r, estado: "conversa" });
    } catch (e) {
      console.error("[onboarding] voltar", clienteSlug, e);
      return erro("Não consegui voltar agora. Tente de novo.", 502);
    }
  }

  const idDoAparelho = String(corpo.idDoAparelho ?? "");
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(idDoAparelho)) return erro("Mensagem inválida.", 400);
  const resposta: Resposta = {
    idDoAparelho,
    texto: String(corpo.texto ?? "").slice(0, 20_000),
    valores: Array.isArray(corpo.valores) ? (corpo.valores as Record<string, unknown>[]).slice(0, 60).map((v) => ({ campo: String(v.campo ?? ""), itemId: typeof v.itemId === "string" ? v.itemId : null, valor: v.valor ?? null })) : [],
    lista: corpo.lista && typeof corpo.lista === "object" ? { manter: ((corpo.lista as { manter?: unknown[] }).manter ?? []).map(String), novos: ((corpo.lista as { novos?: unknown[] }).novos ?? []).map(String) } : undefined,
    pular: corpo.pular === true,
    nenhum: corpo.nenhum === true,
  };

  // Áudio ou arquivo: tem de ser desta empresa e desta conversa. O texto dele (transcrição ou leitura) fica guardado no arquivo.
  if (typeof corpo.arquivoId === "string" && corpo.arquivoId) {
    const arquivo = (await listarArquivos(admin, clienteSlug, c.onb.id)).find((a) => a.id === corpo.arquivoId && a.origem === "conversa");
    if (!arquivo) return erro("Arquivo não encontrado.", 400);
    const mime = (arquivo.mime ?? "").toLowerCase();
    resposta.arquivoId = arquivo.id;
    resposta.tipoDoArquivo = mime.startsWith("audio/") ? "audio" : "arquivo";
    let texto = arquivo.texto ?? "";
    if (!arquivo.texto_em) {
      try {
        if (resposta.tipoDoArquivo === "audio") {
          const chave = await chaveDoGemini(admin);
          if (!chave) throw new Error("falta a chave de transcrição");
          const { data, error } = await admin.storage.from(BUCKET_ONBOARDING).download(arquivo.caminho);
          if (error || !data) throw new Error("não consegui abrir o áudio");
          texto = await transcrever(chave, Buffer.from(await data.arrayBuffer()), mime);
        } else {
          texto = (await lerArquivo(admin, c.ia, arquivo)).texto;
        }
        await gravarTextoDoArquivo(admin, clienteSlug, arquivo.id, texto);
      } catch (e) {
        console.error("[onboarding] ler arquivo", clienteSlug, arquivo.id, e);
        // O arquivo está guardado; só não foi lido. Ela pode tentar de novo sem reenviar.
        return erro(resposta.tipoDoArquivo === "audio" ? "Seu áudio está salvo, mas não consegui ouvir agora. Toque em tentar de novo." : "Seu arquivo está salvo, mas não consegui ler agora. Toque em tentar de novo.", 502, { guardada: true });
      }
    }
    resposta.textoDoArquivo = resposta.tipoDoArquivo === "audio" ? texto : `[Arquivo enviado: ${arquivo.nome ?? "arquivo"}]\n${texto}`;
  }
  if (!resposta.texto && !resposta.arquivoId && !resposta.valores?.length && !resposta.lista && !resposta.pular && !resposta.nenhum) return erro("Mensagem vazia.", 400);

  const usos: Uso[] = [];
  try {
    const r = await turno(repositorioDoBanco(admin, clienteSlug, c.onb.id, userId), inteligenciaReal(c.ia, (u) => usos.push(u)), resposta, c.nome);
    console.log("[onboarding] turno", clienteSlug, "custo US$", usos.reduce((a, u) => a + custoUsd(u), 0).toFixed(4), "progresso", r.progresso.percentual);
    return Response.json({ ...r, estado: r.progresso.terminou ? "revisao" : "conversa" });
  } catch (e) {
    console.error("[onboarding] turno", clienteSlug, e);
    // A mensagem dela já está gravada (é a primeira coisa que o turno faz). Reenviar com o mesmo id retoma de onde parou.
    return erro("Sua resposta está salva, mas tive um problema para continuar. Toque em tentar de novo.", 502, { guardada: true });
  }
}
