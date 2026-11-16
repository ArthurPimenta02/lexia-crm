/**
 * Etapa 1, de ponta a ponta: lê as fontes, pede o rascunho à IA e grava-o no
 * caderno como "rascunho". Só corre no servidor, a pedido de um lexia_admin.
 *
 * Pode ser repetido enquanto a conversa não foi liberada: cada geração retira
 * os itens do rascunho anterior (marca-os como removidos, não apaga) e
 * acrescenta os novos. Depois de liberada a conversa já há respostas da
 * cliente em jogo, e gerar de novo deixa de ser permitido aqui.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { montarCaderno, resumir } from "@/lib/onboarding/caderno";
import {
  abrirOnboarding,
  acrescentarLinhas,
  criarItem,
  gravarEstado,
  gravarTextoDoArquivo,
  lerItens,
  lerLinhas,
  listarArquivos,
  type Achado,
} from "@/lib/onboarding/dados";
import { lerArquivo, lerSite, pedirRascunho, rascunhoParaCaderno } from "@/lib/onboarding/fontes";
import { chaveDoCliente, custoUsd, type Uso } from "@/lib/onboarding/ia";

export type ResultadoDoRascunho = { ok: true; custoUsd: number } | { ok: false; erro: string };

const agora = () => new Date().toISOString();

/** As peças que falam com o mundo de fora. Trocam-se nos testes; em produção são as verdadeiras. */
export type Pecas = { chave: typeof chaveDoCliente; site: typeof lerSite; arquivo: typeof lerArquivo; rascunho: typeof pedirRascunho };
const PECAS: Pecas = { chave: chaveDoCliente, site: lerSite, arquivo: lerArquivo, rascunho: pedirRascunho };

export async function gerarRascunho(admin: SupabaseClient, clienteSlug: string, feitoPor: string | null, pecas: Pecas = PECAS): Promise<ResultadoDoRascunho> {
  const onb = await abrirOnboarding(admin, clienteSlug);
  if (onb.estado !== "etapa1" && onb.estado !== "preparando") return { ok: false, erro: "A conversa já foi liberada: o rascunho não pode mais ser gerado de novo." };
  const ia = await pecas.chave(admin, clienteSlug);
  if (!ia) return { ok: false, erro: "Falta a chave da IA deste cliente em Conexões." };

  await gravarEstado(admin, clienteSlug, { estado: "preparando" });
  const fontes: Achado[] = [];
  const usos: Uso[] = [];
  try {
    // 1) site
    let site = "";
    if (onb.etapa1.site?.trim()) {
      const r = await pecas.site(onb.etapa1.site);
      site = r.texto;
      fontes.push({ fonte: "site", titulo: "Site", ok: r.ok, detalhe: r.ok ? (r.paginas.length === 1 ? "1 página lida" : `${r.paginas.length} páginas lidas`) : "Não consegui abrir o site. Nada perdido: a conversa pergunta o que faltar.", em: agora() });
    }
    // 2) Instagram e Google não se deixam ler por fora: contam o texto colado, se houver.
    const colado = !!onb.etapa1.texto_colado?.trim();
    if (onb.etapa1.instagram?.trim()) fontes.push({ fonte: "instagram", titulo: "Instagram", ok: colado, detalhe: colado ? "Lido pelo texto colado" : "O Instagram não deixa ler o perfil por fora. Cole a bio e os posts principais em “Texto colado”, ou envie prints.", em: agora() });
    if (onb.etapa1.google?.trim()) fontes.push({ fonte: "google", titulo: "Google", ok: colado, detalhe: colado ? "Lido pelo texto colado" : "O Google não deixa ler o perfil por fora. Cole o horário e as avaliações em “Texto colado”, ou envie um print.", em: agora() });
    // 3) arquivos (só lê os que ainda não foram lidos)
    const arquivos = (await listarArquivos(admin, clienteSlug, onb.id)).filter((a) => a.origem === "etapa1");
    const lidos: { nome: string; texto: string }[] = [];
    for (const a of arquivos) {
      const nome = a.nome ?? "arquivo";
      try {
        let texto = a.texto ?? "";
        if (!a.texto_em) {
          const r = await pecas.arquivo(admin, ia, a);
          texto = r.texto;
          if (r.uso) usos.push(r.uso);
          await gravarTextoDoArquivo(admin, clienteSlug, a.id, texto);
        }
        lidos.push({ nome, texto });
        fontes.push({ fonte: "arquivo", titulo: nome, ok: true, detalhe: `${texto.length.toLocaleString("pt-BR")} caracteres lidos`, em: agora() });
      } catch (e) {
        fontes.push({ fonte: "arquivo", titulo: nome, ok: false, detalhe: e instanceof Error ? e.message : "não consegui ler", em: agora() });
      }
    }
    // 4) rascunho
    const { rascunho, uso } = await pecas.rascunho(ia, { etapa1: onb.etapa1, site, arquivos: lidos });
    usos.push(uso);
    const { linhas, itens } = rascunhoParaCaderno(rascunho);

    // 5) gravar: sai o rascunho anterior (itens marcados como removidos), entra o novo
    const antigos = (await lerItens(admin, clienteSlug, onb.id)).filter((i) => !i.removido);
    if (antigos.length) {
      const { error } = await admin.from("lexia_onboarding_itens").update({ removido_em: agora() }).eq("cliente_slug", clienteSlug).eq("onboarding_id", onb.id).is("removido_em", null);
      if (error) throw new Error(error.message);
    }
    await acrescentarLinhas(admin, clienteSlug, onb.id, linhas, feitoPor);
    const ordem: Record<string, number> = {};
    for (const item of itens) {
      const n = (ordem[item.grupo] = (ordem[item.grupo] ?? -1) + 1);
      const id = await criarItem(admin, clienteSlug, onb.id, item.grupo, n);
      await acrescentarLinhas(admin, clienteSlug, onb.id, item.linhas.map((l) => ({ ...l, itemId: id })), feitoPor);
    }
    const custo = usos.reduce((a, u) => a + custoUsd(u), 0);
    await gravarEstado(admin, clienteSlug, { estado: "etapa1", achados: { fontes, rascunho_em: agora(), resumo: rascunho.resumo, custo_usd: Number(custo.toFixed(4)) } });
    return { ok: true, custoUsd: custo };
  } catch (e) {
    // Falhou a meio: volta ao estado de edição, com o que foi lido até aqui, para poder tentar de novo.
    await gravarEstado(admin, clienteSlug, { estado: "etapa1", achados: { ...onb.achados, fontes } }).catch(() => {});
    return { ok: false, erro: e instanceof Error ? e.message : "Não foi possível gerar o rascunho." };
  }
}

/** Números para a tela "O que a IA encontrou". */
export async function situacaoDoCaderno(admin: SupabaseClient, clienteSlug: string, onboardingId: string) {
  const [linhas, itens] = await Promise.all([lerLinhas(admin, clienteSlug, onboardingId), lerItens(admin, clienteSlug, onboardingId)]);
  const caderno = montarCaderno(linhas, itens);
  const r = resumir(caderno, itens);
  const ativos = itens.filter((i) => !i.removido);
  const conta = (g: string) => ativos.filter((i) => i.grupo === g).length;
  const daRaiz = caderno.filter((c) => !c.grupo);
  const doServico = (campo: string) => caderno.filter((c) => c.grupo === "servicos" && c.campo.chave === campo && c.situacao !== "falta").length;
  return {
    raizTotal: daRaiz.length,
    raizPreenchidos: daRaiz.filter((c) => c.situacao !== "falta").length,
    servicosComPreco: doServico("valor"),
    servicosComDuracao: doServico("duracao_media"),
    total: r.total,
    preenchidos: r.porConfirmar + r.resolvidos,
    faltam: r.faltam,
    percentual: r.total ? Math.round(((r.porConfirmar + r.resolvidos) / r.total) * 100) : 0,
    servicos: conta("servicos"),
    faqs: conta("faqs"),
    profissionais: conta("profissionais"),
    promocoes: conta("promocoes"),
    caderno,
  };
}
