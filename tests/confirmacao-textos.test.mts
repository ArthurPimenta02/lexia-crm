/**
 * Os textos de confirmação do app têm de ser EXATAMENTE os dos agentes (25/11, "tem que ser tudo a mesma coisa").
 * Os esperados abaixo foram gerados a 25/11 correndo o código ORIGINAL de cada agente com os mesmos dados:
 * Miranda (nó "Montar Confirmação" do snapshot), Claudia (cerebro/marcar.ts no contentor claudia-teste),
 * Detail (raiz/turno.ts no contentor detail-teste). Se um agente mudar o texto, este teste deixa de valer:
 * gerar de novo e atualizar lib/agenda/confirmacao-textos.ts.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { confirmacaoClaudia, confirmacaoDetail, confirmacaoMiranda } from "@/lib/agenda/confirmacao-textos";

const MIRANDA = ["✨ Agendamento confirmado, Ana!\n\n📅 sexta-feira, 27/11\n🕒 10:30 AM\n💆 Botox (Toxina Botulínica) com Bruna\n📍 469 Salem St., Suite 71. Medford, MA 02155\n(Dentro do Sola Salons: ao entrar, vire à direita, estúdio 4)\n\nQualquer imprevisto, é só nos avisar por aqui.", "✨ Appointment confirmed, Mary!\n\n📅 Friday, 27/11\n🕒 2:00 PM\n💆 Deep Facial Cleansing with Samuel\n📍 469 Salem St., Suite 71. Medford, MA 02155\n(Inside Sola Salons: walk in, turn right, studio 4)\n\nIf anything comes up, just message us here.", "✨ ¡Cita confirmada, Lucia!\n\n📅 sábado, 28/11\n🕒 9:00 AM\n💆 Depilación Láser con Bruna\n📍 469 Salem St., Suite 71. Medford, MA 02155\n(Dentro de Sola Salons: al entrar, gira a la derecha, estudio 4)\n\nCualquier imprevisto, avísanos por aquí.\n\n📝 Preparación para tu sesión:\n• Rasura el área con cuchilla de 12 a 24 horas antes (no uses cera ni pinza)\n• Evita el sol y el bronceado en el área los 7 días previos\n• Suspende ácidos y exfoliantes en la zona de 3 a 5 días antes\n• Ven con la piel limpia, sin cremas, desodorante ni maquillaje en el área\n• Si estás tomando algún medicamento, avísanos por aquí"];
const CLAUDIA = ["Prontinho, Ana! Seu horário está marcado ✅\n\n• Facial Classic, sexta-feira, 27/11 às 10:30 AM com a Jessica\n📍 10 Holden St, Malden, MA. Tem estacionamento ao lado da High School.\n\nSe precisar remarcar ou cancelar, é só me avisar aqui.", "All set, Ana! Your appointment is booked ✅\n\n• Classic Facial, Friday, Nov 27 at 10:30 AM with Nurse Priscilla\n📍 10 Holden St, Malden, MA. There is parking next to the High School.\n\nIf you need to reschedule or cancel, just let me know here.", "¡Listo, Ana! Tu cita está agendada ✅\n\n• Depilación láser de axila, viernes, 27/11 a las 10:30 AM con Claudia\n📍 10 Holden St, Malden, MA. Hay estacionamiento al lado de la High School.\nVen con el área rasurada.\n\nSi necesitas cambiar o cancelar, solo avísame aquí.", "Prontinho, Ana! Seu horário está marcado ✅\n\n• Avaliação de Depilação a laser de axila + virilha, sexta-feira, 27/11 às 10:30 AM com a Suellen\n📍 10 Holden St, Malden, MA. Tem estacionamento ao lado da High School.\nVenha com a área raspada.\n\nSe precisar remarcar ou cancelar, é só me avisar aqui."];
const DETAIL = ["A tua marcação está registada ✅\n\n📋 Full Detail\n🚗 BMW X1\n📅 sexta-feira, 27/11 às 10:00\n👤 João Silva\n\nFalta só o sinal de 88€ para a marcação ficar confirmada (são 40% do valor do serviço; o resto pagas no dia).\n\n📲 MB WAY — 912345678\n🏦 Transferência — PT50 0000 0000 0000\n     em nome de Martim Cordeiro\n\nDepois é só enviares o comprovativo aqui mesmo nesta conversa 👍", "A tua marcação está registada ✅\n\n📋 Lavagem Express\n🚗 Clio\n📅 sábado, 28/11 às 14:30\n👤 Rita\n\nEstá confirmada! Se precisares de alterar alguma coisa, é só dizer por aqui.", "A tua marcação está registada ✅\n\n📋 Polimento (avaliação presencial, ~15 min)\n🚗 Golf\n📅 sábado, 28/11 às 09:00\n👤 Rui\n\nEstá confirmada! Se precisares de alterar alguma coisa, é só dizer por aqui.", "A tua marcação está registada ✅\n\n📋 Full Detail\n🚗 X\n📅 sexta-feira, 27/11 às 10:00\n👤 João\n\nFalta só o sinal de 88€ para ficar confirmada. O Martim passa-te já os dados de pagamento 👍"];

test("Miranda: igual ao nó Montar Confirmação (pt, en, es; laser com preparo)", () => {
  assert.equal(confirmacaoMiranda({ idioma: "pt", inicio: "2026-11-27T15:30:00.000Z", nome: "Ana Souza", profissional: "Bruna", servico: "Botox (Toxina Botulínica)", servicoEn: "Botox (Botulinum Toxin)", servicoEs: null }), MIRANDA[0]);
  assert.equal(confirmacaoMiranda({ idioma: "en", inicio: "2026-11-27T19:00:00.000Z", nome: "Mary Jones", profissional: "Samuel", servico: "Limpeza de Pele Profunda", servicoEn: "Deep Facial Cleansing", servicoEs: null }), MIRANDA[1]);
  assert.equal(confirmacaoMiranda({ idioma: "es", inicio: "2026-11-28T14:00:00.000Z", nome: "Lucia", profissional: "Bruna", servico: "Depilação a Laser", servicoEn: null, servicoEs: "Depilación Láser" }), MIRANDA[2]);
});

test("Claudia: igual a textoConfirmacao (pt, en com a enfermeira, es laser, avaliação de dois laser)", () => {
  const facial = { categoria: "facial", nome: "Facial Classic", nome_en: "Classic Facial", nome_es: "Facial Clásico" };
  const inicio = "2026-11-27T15:30:00.000Z";
  assert.equal(confirmacaoClaudia({ avaliacao: false, idioma: "pt", inicio, nome: "Ana Souza", profissional: "Jessica", servico: facial }), CLAUDIA[0]);
  assert.equal(confirmacaoClaudia({ avaliacao: false, idioma: "en", inicio, nome: "Ana Souza", profissional: "Priscilla", servico: facial }), CLAUDIA[1]);
  assert.equal(confirmacaoClaudia({ avaliacao: false, idioma: "es", inicio, nome: "Ana Souza", profissional: "Claudia", servico: { categoria: "ipl_corpo", nome: "Under Arms", nome_en: "Under Arms", nome_es: null } }), CLAUDIA[2]);
  assert.equal(confirmacaoClaudia({ avaliacao: true, idioma: "pt", inicio, nome: "Ana Souza", profissional: "Suellen", servico: { categoria: "ipl_corpo", nome: "Under Arms + Bikini Line", nome_en: null, nome_es: null } }), CLAUDIA[3]);
});

test("Detail: igual a textoConfirmacao (sinal com MB WAY/IBAN, sem sinal abaixo de 70€, avaliação, sinal sem dados)", () => {
  const info = { sinal_iban: "PT50 0000 0000 0000", sinal_iban_titular: "Martim Cordeiro", sinal_mbway_numero: "912345678" };
  assert.equal(confirmacaoDetail({ avaliacao: false, carro: "BMW X1", info, inicio: "2026-11-27T10:00:00.000Z", nome: "João Silva", servico: "Full Detail", valor: 220 }), DETAIL[0]);
  assert.equal(confirmacaoDetail({ avaliacao: false, carro: "Clio", info, inicio: "2026-11-28T14:30:00.000Z", nome: "Rita", servico: "Lavagem - Lavagem Express", valor: 50 }), DETAIL[1]);
  assert.equal(confirmacaoDetail({ avaliacao: true, carro: "Golf", info: {}, inicio: "2026-11-28T09:00:00.000Z", nome: "Rui", servico: "Polimento", valor: 300 }), DETAIL[2]);
  assert.equal(confirmacaoDetail({ avaliacao: false, carro: "X", info: {}, inicio: "2026-11-27T10:00:00.000Z", nome: "João", servico: "Full Detail", valor: 220 }), DETAIL[3]);
});
