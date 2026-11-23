# Como funciona o agente do Detail by Cordeiro

Lido do agente em produção a 19/11/2026 (versão publicada a 19/11). Horas no fuso de Lisboa.

## Canais e idiomas
- Atende no WhatsApp, no Instagram e no Messenger.
- Junta as mensagens seguidas do cliente (cerca de 60 segundos).
- Entende áudio e fotos (a foto do carro e o comprovante do sinal).
- Escreve em português de Portugal, tratando o cliente por "tu", na voz do Martim.
- Os follow-ups saem em inglês ou espanhol quando o cliente escreveu nessa língua.

## Agenda
- A fonte é a agenda Google (Martim e Roberto). Lê também as marcações feitas à mão, pelo telefone ou pelo nome completo do cliente, para nunca oferecer uma marcação nova a quem já está marcado.
- Martim: de segunda a sexta das 9h às 18h, e no sábado das 9h às 13h.
- Roberto: de segunda a sexta das 9h às 17h.
- Fechado aos domingos e nos feriados nacionais.
- Almoço das 12h30 às 13h00; 15 minutos de margem no fim de cada serviço.
- Marca de amanhã até 60 dias à frente. Pedido para hoje passa para o Martim.
- Avaliações presenciais: 15 minutos, só com o Martim.
- Respeita o que o cliente disse que não pode (ex.: "saio às 17h").

## Preço e sinal
- O preço sai da tabela do Martim, pela categoria do carro. A IA nunca o calcula.
- Diz "a partir de". O valor máximo só se o cliente perguntar. Nunca dá desconto.
- Sinal de 40% para fechar a marcação. Os dados de pagamento (IBAN e MB WAY) vão na mensagem de confirmação, escrita pelo sistema.

## Marcação e confirmação
- Com horário, serviço, carro, nome e telefone, faz um resumo: "Então sexta-feira, 18/12 às 09:30, … a partir de 85€, certo?".
- Só o "sim" do cliente cria a marcação.
- Se o cliente não responde ao resumo, 15 minutos depois sai uma pergunta de confirmação. **Nunca marca sozinho.**
- Ao marcar: cria o evento na agenda, avisa o Martim (e o sócio) e manda a confirmação com o sinal.
- Quando chega o comprovante, avisa o Martim.
- Depois de marcar, o agente continua a responder ao cliente.

## Lembretes
- **Lembrete da marcação**: um por marcação, cerca de 48 h antes (entre 48 h e 2 h antes). Só sai das 8h às 20h, por WhatsApp.
  - Leva o dia, a hora, o serviço com o valor e o estado do sinal.
  - Pergunta "Está tudo certo do teu lado?".
  - Vale também para marcações feitas à mão, desde que o celular esteja escrito no evento.
  - Se o Martim mudar a hora, sai um lembrete novo com a hora certa.
  - Quem disse nos últimos dias que não pode vir não recebe o lembrete.
- **Lembrete do sinal**: se o sinal continua por pagar 24 h depois de ter sido pedido, sai uma mensagem (uma vez, das 8h às 20h). Não leva valores nem IBAN.
- **Aviso ao Martim, todos os dias às 9h**: lista das marcações dos próximos dias sem celular, que por isso não vão receber lembrete.
- **Vigia da agenda, de hora a hora**: avisa o Martim quando uma marcação do agente fica por cima de outro evento.

## Remarcar e cancelar
- **Remarcar**: o agente faz sozinho. Cria a marcação nova e só depois apaga a antiga. No resumo diz qual marcação deixa de contar.
- **Cancelar**: pergunta uma vez e, com o "sim", apaga e avisa o Martim. Quem diz que não vem e não tem data nova tem a marcação cancelada, e o Martim é avisado. Para hoje, é com o Martim.
- Só nas marcações que o próprio agente criou nessa conversa e que continuam no horário dele. Feita à mão pelo Martim, ou que ele mudou na agenda: passa para o Martim, sem mexer (desde 23/11).

## Follow-up (quem parou de responder)
- WhatsApp: 1 h, 24 h e 3 dias. Depois disso, a cadência depende da temperatura do lead (configurável, interruptor "follow-ups longos").
  - Frio: 1 h e 24 h.
  - Morno: mais um aos 7 dias.
  - Quente: mais um aos 3 dias e outro aos 7 dias.
  - Os de 3 e 7 dias saem devagar: no máximo 10 por dia, de segunda a sábado, das 10h às 18h.
- Instagram e Messenger: 1 h e cerca de 23 h. Fechada a janela de 24 h da Meta, o Martim recebe um aviso para retomar à mão.
- Quem adia ("vou pensar", "eu ligo"): no WhatsApp só recebe o follow-up de 3 dias; no Instagram e no Messenger, o de 24 h.
- Não sai a quem já tem marcação na agenda, a quem está com o Martim nem a quem disse que não quer.
- O follow-up nunca propõe horários. Cada um muda de abordagem e não repete a pergunta do anterior.

## Pausas
- Quando passa a conversa ao Martim, o agente fica calado 24 h: o Martim assume. Escolha do Martim.
- Não pausa por marcar nem por mandar lembrete.
- Antes de cada mensagem confere se o Martim entrou na conversa. Se entrou, o resto não sai.

## Passa para o Martim (lista fechada)
- O cliente pediu o Martim; reclamação; cancelamento; não é cliente (ex.: fornecedor).
- Pedido para hoje ou à porta; negociação de preço; recolha do carro.

Fora desta lista, o agente responde ele próprio.

## Lista de espera
- Ligada (o liga/desliga fica no servidor do agente, não no painel).
- Quem queria um dia cheio é avisado se abrir vaga nesse dia: uma pessoa de cada vez, por ordem de chegada, com 2 h para responder. A vaga não fica reservada.

## O que nunca faz
- Dá desconto, diz um preço fora da tabela ou oferece horas que a agenda não deu.
- Diz "marcado" antes de a marcação existir.
- Fala como se fosse o Martim, promete "vou confirmar e te digo" ou recebe pagamentos.
