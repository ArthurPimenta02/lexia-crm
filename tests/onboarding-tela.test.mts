/**
 * A tela da conversa do onboarding: o que fica no aparelho para nada se perder.
 *
 * O que é que isto está a proteger
 * --------------------------------
 * 19/11/2026: a Jessica (jessica_beauty) perdeu respostas. O que ela editava nos
 * cartões ("Ver e editar", os campos, o texto do microfone) só existia na memória
 * da página: recarregar, fechar ou a sessão expirar levava tudo. Aqui prova-se que
 * o cartão em edição volta depois de recarregar, e que uma resposta só sai do
 * cartão (e do aparelho) quando o servidor confirma que a gravou.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import type { Cartao } from "../lib/onboarding/conversa";
import { cartaoEditado, chaveDoCartao, chaveDoPendente, concluirEnvio, enviarTurno, estadoInicial, guardarCartao, guardarPendente, k, lerCartao, lerPendente, type EnvioGuardado } from "../lib/onboarding/tela";

function aparelho() {
  const m = new Map<string, string>();
  return { getItem: (x: string) => m.get(x) ?? null, setItem: (x: string, v: string) => void m.set(x, v), removeItem: (x: string) => void m.delete(x), m };
}
const sugestao = "Microblading fio a fio, feito com lâmina (sugestão da Lexia)";
const CARTAO: Cartao = {
  tipo: "item",
  grupo: "servicos",
  itemId: "s1",
  nome: "Microblading",
  confirmar: [{ campo: "descricao_e_indicacao", itemId: "s1", pergunta: "O que é?", tipo: "long", valor: sugestao, fonte: "recomendacao" }],
  cartoes: [],
  faltam: [{ campo: "contraindicacoes", itemId: "s1", pergunta: "Contraindicações?", tipo: "long" }],
};
const TEXTOS = { falhou: "falhou", sessao: "sessão" };

test("o que ela edita no cartão (Ver e editar, campos, microfone) continua lá depois de recarregar a página", () => {
  const a = aparelho();
  const chave = chaveDoCartao("jessica_beauty", "fala-7");
  const inicial = estadoInicial(CARTAO);
  assert.equal(inicial.valores["s1|descricao_e_indicacao"], sugestao);
  guardarCartao(a, chave, inicial, CARTAO);
  assert.equal(lerCartao(a, chave), null, "sem edições não guarda nada");
  // Ela abre "Ver e editar", reescreve, e o microfone escreve as contraindicações.
  const editado = { ...inicial, valores: { ...inicial.valores, "s1|descricao_e_indicacao": "Técnica fio a fio, do meu jeito", "s1|contraindicacoes": "Gestantes e quem usa Roacutan" } };
  assert.ok(cartaoEditado(editado, CARTAO));
  guardarCartao(a, chave, editado, CARTAO);
  // "Recarregar": um estado novo, lido só do aparelho.
  const reposto = lerCartao(a, chave)!;
  assert.equal(reposto.valores["s1|descricao_e_indicacao"], "Técnica fio a fio, do meu jeito");
  assert.equal(reposto.valores["s1|contraindicacoes"], "Gestantes e quem usa Roacutan");
  assert.equal(lerCartao(a, chaveDoCartao("jessica_beauty", "fala-8")), null, "cada cartão tem a sua chave");
  assert.equal(lerCartao(a, chaveDoCartao("outra_empresa", "fala-7")), null, "e cada empresa a sua");
});

test("o texto livre do cartão (os serviços que ela conta) também fica guardado", () => {
  const a = aparelho();
  const c: Cartao = { tipo: "itens", grupo: "faqs", obrigatorio: false };
  const chave = chaveDoCartao(undefined, "f1");
  guardarCartao(a, chave, { ...estadoInicial(c), rascunho: "Dói? Não, uso anestésico" }, c);
  assert.equal(lerCartao(a, chave)!.rascunho, "Dói? Não, uso anestésico");
});

test("nada sai do cartão nem do aparelho sem o servidor confirmar que gravou", async () => {
  const envio: EnvioGuardado = { id: "abcdefgh1", texto: "oi", valores: [{ campo: "contraindicacoes", itemId: "s1", valor: "Gestantes" }], falaId: "fala-7" };
  const respostas: [string, () => Promise<Response>][] = [
    ["erro do servidor", async () => Response.json({ erro: "Sua resposta está salva, mas tive um problema.", guardada: true }, { status: 502 })],
    ["página de erro em HTML", async () => new Response("<html>504</html>", { status: 504 })],
    ["200 sem a conversa", async () => Response.json({})],
    ["sem internet", async () => { throw new TypeError("Failed to fetch"); }],
    ["sessão expirada", async () => Response.json({ erro: "x", motivo: "sessao" }, { status: 401 })],
  ];
  for (const [nome, responder] of respostas) {
    const a = aparelho();
    const chaveCartao = chaveDoCartao(undefined, "fala-7");
    guardarCartao(a, chaveCartao, { ...estadoInicial(CARTAO), valores: { "s1|contraindicacoes": "Gestantes" } }, CARTAO);
    guardarPendente(a, chaveDoPendente(undefined), envio);
    const r = await enviarTurno(envio, { fetch: (() => responder()) as unknown as typeof fetch, textos: TEXTOS });
    assert.equal(r.ok, false, nome);
    concluirEnvio(a, undefined, envio, r);
    assert.deepEqual(lerPendente(a, chaveDoPendente(undefined)), envio, `${nome}: o envio continua guardado`);
    assert.ok(lerCartao(a, chaveCartao), `${nome}: o cartão continua com o que ela marcou`);
  }
  const a = aparelho();
  guardarCartao(a, chaveDoCartao(undefined, "fala-7"), { ...estadoInicial(CARTAO), valores: { "s1|contraindicacoes": "Gestantes" } }, CARTAO);
  guardarPendente(a, chaveDoPendente(undefined), envio);
  const ok = await enviarTurno(envio, { fetch: (async () => Response.json({ mensagens: [], progresso: null })) as unknown as typeof fetch, textos: TEXTOS });
  assert.equal(ok.ok, true);
  concluirEnvio(a, undefined, envio, ok);
  assert.equal(a.m.size, 0, "confirmado: o envio e o cartão saem do aparelho");
});

test("a sugestão nunca é confundida com o que ela respondeu: k() é a mesma chave no cartão e na resposta", () => {
  assert.equal(k({ campo: "valor", itemId: "s1" }), "s1|valor");
  assert.equal(k({ campo: "cidade", itemId: null }), "|cidade");
});

test("o fetch é chamado solto: o do navegador recusa outro `this` (Illegal invocation) e o envio nunca saía", async () => {
  // Como o fetch do navegador: falha se for chamado como método de outro objeto.
  function fetchDoNavegador(this: unknown) {
    if (this !== undefined && this !== globalThis) throw new TypeError("Illegal invocation");
    return Promise.resolve(Response.json({ mensagens: [], progresso: null }));
  }
  const r = await enviarTurno({ id: "envio-solto-1", texto: "oi" }, { fetch: fetchDoNavegador as unknown as typeof fetch, textos: TEXTOS });
  assert.equal(r.ok, true);
});
