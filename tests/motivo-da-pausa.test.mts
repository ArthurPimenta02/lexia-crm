/**
 * Quem pausou o agente: o dono, ou o próprio agente ao entregar a conversa?
 *
 * Os dois gravam a mesma chave `:status:` com o mesmo valor `Desativado`. O
 * painel dizia "Atendimento humano em curso" nas duas, e isso era falso sempre
 * que a pausa tinha vindo de um handoff — foi exactamente o que o Arthur viu a
 * 21/10/2026 numa conversa em que ninguém da equipa tinha escrito nada.
 *
 * A única pista é o prazo. Um TTL nunca é maior do que o prazo com que a chave
 * foi gravada, por isso um TTL acima do prazo mais curto só pode ter vindo do
 * nó mais longo. Abaixo disso há empate, e a regra tem de admitir que não sabe
 * em vez de adivinhar — uma etiqueta errada aqui manda o dono ignorar um lead
 * que estava à espera dele.
 *
 * Os prazos reais estão em `clientConfigs` e vêm dos workflows activos. O teste
 * usa números próprios para provar a regra, e no fim confere que a configuração
 * do Detail e da Miranda continua a ser aquela contra a qual isto foi medido.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { classifyStatusLock } from "@/lib/redis/agent-locks";

// Miranda: handoff 24 h, intervenção humana 15 min.
const miranda = { statusTtlHandoff: 86400, statusTtlIntervencao: 900 };
// Detail: os dois gravam 24 h — não há pista nenhuma.
const detail = { statusTtlHandoff: 86400, statusTtlIntervencao: 86400 };
// Um cliente hipotético ao contrário, para a regra não ficar presa a um lado.
const invertido = { statusTtlHandoff: 600, statusTtlIntervencao: 7200 };

test("prazo acima do mais curto só pode ter vindo do nó mais longo", () => {
  assert.equal(classifyStatusLock(miranda, 70231), "handoff");
  assert.equal(classifyStatusLock(miranda, 901), "handoff");
  assert.equal(classifyStatusLock(invertido, 601), "intervencao");
});

test("dentro do prazo mais curto há empate, e o empate não se resolve", () => {
  assert.equal(classifyStatusLock(miranda, 900), "indeterminado");
  assert.equal(classifyStatusLock(miranda, 120), "indeterminado");
  assert.equal(classifyStatusLock(miranda, 0), "indeterminado");
  assert.equal(classifyStatusLock(invertido, 600), "indeterminado");
});

test("prazos iguais nunca dizem quem foi", () => {
  for (const ttl of [0, 900, 86400]) {
    assert.equal(classifyStatusLock(detail, ttl), "indeterminado");
  }
});

test("chave sem prazo não diz quem foi", () => {
  assert.equal(classifyStatusLock(miranda, null), "indeterminado");
  assert.equal(classifyStatusLock(detail, null), "indeterminado");
});

test("os prazos configurados são os que foram medidos nos workflows", async () => {
  const { getAgentLocksClientSlugs, getStatusTtls } = await import(
    "@/lib/redis/agent-locks"
  );

  assert.deepEqual(getAgentLocksClientSlugs().sort(), [
    "detail_by_cordeiro",
    "miranda_skin_experts",
  ]);
  assert.deepEqual(getStatusTtls("detail_by_cordeiro"), detail);
  assert.deepEqual(getStatusTtls("miranda_skin_experts"), miranda);
});
