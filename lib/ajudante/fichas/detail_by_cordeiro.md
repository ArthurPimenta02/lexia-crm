# Como funciona o agente do Detail by Cordeiro

Versão em produção de 24/11/2026. Horas no fuso de Lisboa.

## Canais e idiomas
- Atende no WhatsApp, no Instagram e no Messenger.
- Junta mensagens seguidas (cerca de 60 s).
- Entende áudio e fotos (a foto do carro e o comprovante do sinal).
- Fala português de Portugal (por "tu", na voz do Martim) ou inglês, conforme o cliente; outra língua é atendida em inglês. Vale para tudo o que envia.

## Agenda
- A fonte é a agenda Google do Martim. Lê também as marcações feitas à mão (telefone ou nome), para não remarcar quem já está marcado.
- Martim: de segunda a sexta das 9h às 18h, e no sábado das 9h às 13h.
- Fechado aos domingos e nos feriados nacionais.
- Almoço das 12h30 às 13h00; 15 minutos de margem no fim de cada serviço.
- Marca de amanhã até 60 dias à frente. Pedido para hoje passa para o Martim.
- Avaliações presenciais: 15 minutos, só com o Martim.
- Respeita o que o cliente disse que não pode (ex.: "saio às 17h").

## Preço e sinal
- O preço sai da tabela do Martim, pela categoria do carro. A IA nunca o calcula.
- Diz "a partir de". O valor máximo só se o cliente perguntar. Nunca dá desconto. Não repete preço já dito.
- Se recomenda um serviço, não pergunta "qual dos dois". Um "ok" não é escolha.
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
  - Vale para marcações à mão com o celular no evento.
  - Se o Martim mudar a hora, sai um lembrete novo com a hora certa.
  - Quem disse nos últimos dias que não pode vir não recebe o lembrete.
- **Lembrete do sinal**: se o sinal continua por pagar 24 h depois de ter sido pedido, sai uma mensagem (uma vez, das 8h às 20h). Não leva valores nem IBAN.
- **Aviso ao Martim, às 9h**: marcações dos próximos dias sem celular (ficam sem lembrete).
- **Vigia da agenda (de hora a hora)**: avisa se uma marcação do agente fica sobre outro evento.

## Remarcar e cancelar
- **Remarcar**: cria a nova, depois apaga a antiga; o resumo diz qual deixa de contar.
- **Cancelar**: pergunta uma vez e apaga com o sim (sem data nova, cancela logo). Avisa o Martim. Hoje: é com o Martim.
- Só nas que o agente marcou e seguem no horário dele; feitas ou movidas pelo Martim vão para ele.

## Follow-up (quem parou de responder)
- Nunca há follow-up de 1 h (desde 25/11). WhatsApp: 20 h, 3 dias e 7 dias (os longos pela temperatura, com o interruptor "follow-ups longos"; frio só o de 20 h). Os longos: até 10/dia, seg–sáb, 10h–18h.
- Instagram e Messenger: só o de ~20 h (janela de 24 h da Meta); depois o Martim recebe aviso.
- Na dúvida não sai. Não sai a quem: tem marcação na agenda, está com o Martim, disse que não quer, disse que ia pensar ou dizia depois sem data, respondeu "já respondi"/"outra vez?", fechou com "ok, obrigado", ou já levou 3 seguidos.
- Deu data ("semana que vem aviso"): uma mensagem nessa data e mais nenhuma.
- Nunca propõe horários nem repete nada da conversa (pergunta já respondida, o carro já dito, follow-up anterior).

## Escrita
- Não repete na conversa a abertura, a pergunta das vagas nem o emoji; pontuação solta. Sem o carro, dá a faixa de preço da tabela (citadino e carro grande).

## Pausas
- Quando passa a conversa ao Martim, o agente fica calado 24 h: o Martim assume. Escolha do Martim.
- Não pausa por marcar nem por mandar lembrete.
- Antes de cada mensagem confere se o Martim entrou na conversa. Se entrou, o resto não sai.

## Passa para o Martim (lista fechada)
- O cliente pediu o Martim; reclamação; cancelamento; não é cliente (ex.: fornecedor).
- Pedido para hoje ou à porta; negociação de preço; recolha do carro.

Fora desta lista, o agente responde ele próprio.

## Lista de espera
- Ligada (no servidor do agente).
- Quem queria um dia cheio é avisado se abrir vaga nesse dia: uma pessoa de cada vez, por ordem de chegada, com 2 h para responder. A vaga não fica reservada.

## O que nunca faz
- Dá desconto, diz um preço fora da tabela ou oferece horas que a agenda não deu.
- Diz "marcado" antes de a marcação existir.
- Fala como se fosse o Martim, promete "vou confirmar e te digo" ou recebe pagamentos.
