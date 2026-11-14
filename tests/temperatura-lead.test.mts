import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { filaDosLongos, temperaturaPorConversa } from "../lib/temperatura/leitura";

const ev = (conversa: string, em: string, dados: Record<string, unknown>, tipo = "lead_temperatura") => ({ tipo, identificador_conversa: conversa, ocorrido_em: em, dados });

describe("temperatura do lead (14/11)", () => {
  it("vale o evento mais recente de cada conversa: sobe e desce (quem desiste volta a frio)", () => {
    const m = temperaturaPorConversa([
      ev("whatsapp:1", "2026-11-14T10:00:00Z", { temperatura: "quente", motivo: "escolheu sábado" }),
      ev("whatsapp:1", "2026-11-15T10:00:00Z", { temperatura: "frio", motivo: "disse que desistiu" }),
      ev("whatsapp:2", "2026-11-14T10:00:00Z", { temperatura: "morno", motivo: "perguntou o preço" }),
      ev("whatsapp:3", "2026-11-14T10:00:00Z", { temperatura: "fervendo" }),
    ]);
    assert.deepEqual(m.get("whatsapp:1"), { temperatura: "frio", motivo: "disse que desistiu", em: "2026-11-15T10:00:00Z" });
    assert.equal(m.get("whatsapp:2")?.temperatura, "morno");
    assert.equal(m.has("whatsapp:3"), false);
  });

  it("fila dos 3/7 dias: o agendado sai da fila quando há envio, cancelamento ou encerramento depois", () => {
    const agora = Date.parse("2026-11-16T12:00:00Z");
    const fila = filaDosLongos([
      ev("whatsapp:1", "2026-11-14T10:00:00Z", { etapa: 3, quando: "2026-11-17T10:00:00Z", temperatura: "quente", motivo: "parou na escolha" }, "followup_longo_agendado"),
      ev("whatsapp:2", "2026-11-14T10:00:00Z", { etapa: 4, quando: "2026-11-21T10:00:00Z", temperatura: "morno" }, "followup_longo_agendado"),
      ev("whatsapp:2", "2026-11-15T09:00:00Z", {}, "followup_cancelado"),
      ev("whatsapp:3", "2026-11-14T10:00:00Z", {}, "followup_enviado"),
      ev("whatsapp:3", "2026-11-14T10:00:01Z", { etapa: 4, quando: "2026-11-20T10:00:00Z", temperatura: "quente" }, "followup_longo_agendado"),
      ev("whatsapp:4", "2026-11-01T10:00:00Z", { etapa: 3, quando: "2026-11-04T10:00:00Z" }, "followup_longo_agendado"),
    ], agora);
    assert.deepEqual(fila.map((f) => [f.conversa, f.etapa]), [["whatsapp:1", 3], ["whatsapp:3", 4]]);
    assert.equal(fila[0].temperatura, "quente");
  });
});
