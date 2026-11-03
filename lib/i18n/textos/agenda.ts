import type { TextosDaArea } from "../traduzir";

/**
 * Textos da área "agenda". A chave é o texto em português do Brasil, exatamente
 * como está no código dentro de t("…"). Variáveis entre chaves ({n}) têm de
 * aparecer com o mesmo nome nas três traduções.
 *
 * Inclui também chaves que o teste não vê, porque chegam ao `t()` por
 * variável e não por texto literal — confere-se à mão:
 * - erros e avisos de `lib/agenda/marcar.ts` e da `marcarNaAgendaAction`
 *   (traduzidos no formulário, em `agenda-marcar.tsx`);
 * - erros de leitura de `lib/agenda/read.ts` e `lib/pipeline/read.ts`
 *   (traduzidos nas páginas).
 */
const textos: TextosDaArea = {
  "pt-PT": {
    // Páginas
    Agenda: "Agenda",
    Pipeline: "Pipeline",
    "Sem cliente associado a esta conta.": "Sem cliente associado a esta conta.",
    "Não foi possível carregar a agenda.": "Não foi possível carregar a agenda.",
    "Não foi possível carregar o pipeline.": "Não foi possível carregar o pipeline.",

    // Agenda
    "Dia inteiro": "Dia todo",
    "Nada agendado neste dia.": "Nada marcado neste dia.",
    "1 agendamento, {agente} pelo agente.": "1 marcação, {agente} pelo agente.",
    "{n} agendamentos, {agente} pelo agente.": "{n} marcações, {agente} pelo agente.",
    "Sem título": "Sem título",
    Agente: "Agente",
    Manual: "À mão",
    "Agendar atendimento": "Marcar atendimento",
    Fechar: "Fechar",
    "Dia livre.": "Dia livre.",
    "Ver a semana deste dia": "Ver a semana deste dia",
    "Agendado pelo agente": "Marcado pelo agente",
    "Agendado manualmente": "Marcado à mão",
    Serviço: "Serviço",
    "Valor previsto": "Valor previsto",
    Telefone: "Telefone",
    Onde: "Onde",
    "Quem faz": "Quem faz",
    "No Google": "No Google",
    "Este evento foi criado manualmente no Google e não tem mais nada salvo além da hora e do título.":
      "Este evento foi escrito à mão no Google e não tem mais nada guardado além da hora e do título.",
    "Abrir no Google para alterar": "Abrir no Google para alterar",
    "+{n} mais": "+{n} mais",
    Livre: "Livre",
    Anterior: "Anterior",
    Hoje: "Hoje",
    Próximo: "Seguinte",
    Semana: "Semana",
    Mês: "Mês",
    Todos: "Todos",
    "Nada agendado neste mês.": "Nada marcado neste mês.",
    "Nada agendado nesta semana.": "Nada marcado nesta semana.",
    "Clique em um dia, ou em um atendimento, para ver os detalhes.":
      "Carrega num dia, ou num atendimento, para ver o detalhe.",

    // Formulário de agendar
    Cliente: "Cliente",
    "Trocar cliente": "Trocar cliente",
    "O agendamento fica no nome e no número desta ficha, por isso aparece no histórico dela.":
      "A marcação fica no nome e no número desta ficha, por isso aparece no histórico dela.",
    "Digite o nome ou o número": "Escreve o nome ou o número",
    "{n} clientes na base. Comece a digitar e as opções aparecem.":
      "{n} clientes na base. Começa a escrever e as opções aparecem.",
    "Nenhum cliente com esse nome ou número. Cadastre-o primeiro na aba Clientes.":
      "Nenhum cliente com esse nome ou número. Cria-o primeiro na aba Clientes.",
    "Clique no cliente certo para o agendamento ficar no nome dele.":
      "Carrega no cliente certo para a marcação ficar no nome dele.",
    "Já está na agenda do Google e aparece aqui assim que a página recarregar.":
      "Já está na agenda do Google e aparece aqui assim que a página recarregar.",
    "Abrir no Google": "Abrir no Google",
    Cancelar: "Cancelar",
    "Escolha o serviço": "Escolhe o serviço",
    "Nome do evento": "Nome do evento",
    "ex.: Lavagem Detalhada — Martim Cordeiro": "ex.: Lavagem Detalhada — Martim Cordeiro",
    Dia: "Dia",
    Hora: "Hora",
    "Duração (min)": "Duração (min)",
    Valor: "Valor",
    "Valor ({moeda})": "Valor ({moeda})",
    opcional: "opcional",
    Veículo: "Viatura",
    Observações: "Observações",
    "Agendando...": "A marcar...",
    "Agendar mesmo assim": "Marcar mesmo assim",
    "sem título": "sem título",
    "Agendar por cima deixa as duas coisas no mesmo horário. Se for de propósito, confirme; se não, mude a hora.":
      "Marcar por cima deixa as duas coisas à mesma hora. Se for de propósito, insiste; se não, muda a hora.",
    "Agendar no mesmo horário": "Marcar à mesma hora",
    Agendar: "Marcar",

    // Mensagens da server action e de lib/agenda/marcar.ts
    "Sessão sem permissão para agendar.": "Sessão sem permissão para marcar na agenda.",
    "Faltam dados para agendar.": "Faltam dados para marcar.",
    "Há uma coisa para confirmar antes de agendar.": "Há uma coisa a confirmar antes de marcar.",
    "Há {n} coisas para confirmar antes de agendar.": "Há {n} coisas a confirmar antes de marcar.",
    "{executor} já tem trabalho marcado neste horário.":
      "{executor} já tem trabalho marcado a esta hora.",
    '"{servico}" ficou agendado para {cliente}.': '"{servico}" ficou marcado para {cliente}.',
    "O agendamento não entrou.": "A marcação não entrou.",
    "Escolha o cliente.": "Escolhe o cliente.",
    "Escolha o serviço.": "Escolhe o serviço.",
    "Escolha o dia e a hora.": "Escolhe o dia e a hora.",
    "Não foi possível ler a ficha do cliente.": "Não foi possível ler a ficha do cliente.",
    "Cliente não encontrado na base.": "Cliente não encontrado na base.",
    "Esta ficha não tem nome. Coloque o nome primeiro.":
      "Esta ficha não tem nome. Põe o nome primeiro.",
    "Esta ficha não tem um número de telefone válido, e é o número que liga o agendamento ao histórico. Coloque o número primeiro.":
      "Esta ficha não tem um número de telefone a sério, e é o número que liga a marcação ao histórico. Põe o número primeiro.",
    "Não há serviços agendáveis configurados para este cliente, então não há nada para agendar.":
      "Não há serviços agendáveis configurados para este cliente, por isso não há nada para marcar.",
    "Serviço desconhecido.": "Serviço desconhecido.",
    'Escolha quem faz o serviço. "{servico}" é feito por {executores}.':
      'Escolhe quem faz o serviço. "{servico}" é feito por {executores}.',
    "Essa data e hora não existem.": "Essa data e hora não existem.",
    "A duração precisa ser um número de minutos acima de zero.":
      "A duração tem de ser um número de minutos acima de zero.",
    "O valor precisa ser um número igual ou maior que zero.":
      "O valor tem de ser um número igual ou maior que zero.",
    "Escreva o nome do evento.": "Escreve o nome do evento.",
    "Esta hora já passou.": "Esta hora já passou.",
    "{executor} não trabalha neste dia da semana.":
      "{executor} não trabalha neste dia da semana.",
    "Fica fora do horário de {executor} ({inicio}h–{fim}h).":
      "Fica fora do horário de {executor} ({inicio}h–{fim}h).",
    "São {horas} horas seguidas — este serviço costuma ser feito em mais de um dia.":
      "São {horas} horas seguidas — este serviço costuma ser feito em mais do que um dia.",
    "O agendamento pelo painel ainda não está ligado ao n8n.":
      "A marcação pelo painel ainda não está ligada ao n8n.",
    "A agenda não respondeu a tempo. Confirma no Google se o agendamento entrou antes de tentar de novo.":
      "A agenda não respondeu a tempo. Confirma no Google se a marcação entrou antes de tentares outra vez.",
    "A agenda recusou o agendamento. Tente de novo daqui a pouco.":
      "A agenda recusou a marcação. Tenta outra vez dentro de um instante.",
    "A agenda respondeu algo que não dá para ler. Confirma no Google antes de tentar de novo.":
      "A agenda respondeu uma coisa que não se consegue ler. Confirma no Google antes de tentares outra vez.",
    "A agenda não confirmou o agendamento. Confirma no Google antes de tentar de novo.":
      "A agenda não confirmou a marcação. Confirma no Google antes de tentares outra vez.",

    // Pipeline
    Esfriando: "A arrefecer",
    "Em andamento": "A decorrer",
    Agendado: "Agendado",
    Perdido: "Perdido",
    "Por responder": "Por responder",
    "Sem conversa há mais de uma semana e ainda dentro do mês. Ainda dá para recuperar.":
      "Sem falar há mais de uma semana e ainda dentro do mês. Ainda dá para recuperar.",
    "A conversa está ativa e a bola está com a gente.":
      "A conversa está viva e a bola está do nosso lado.",
    "Tem um agendamento por acontecer.": "Tem uma marcação por acontecer.",
    "Já foi atendido. Aqui se ganha a recompra.": "Já foi atendido. Aqui ganha-se a repetição.",
    "Um mês sem dizer nada. Fica fora da vista até alguém procurar.":
      "Um mês sem dizer nada. Fica fora da vista até alguém o procurar.",
    "Escreveram e ainda ninguém respondeu. Quem já tem agendamento fica em Agendado, com o aviso vermelho no cartão.":
      "Escreveram e ainda ninguém respondeu. Quem já tem marcação fica em Agendado, com o aviso vermelho no cartão.",
    "Escreveu hoje e ainda não teve resposta.": "Escreveu hoje e ainda não teve resposta.",
    "Escreveu há 1 dia e ainda não teve resposta.": "Escreveu há 1 dia e ainda não teve resposta.",
    "Escreveu há {n} dias e ainda não teve resposta.":
      "Escreveu há {n} dias e ainda não teve resposta.",
    "A conversa está ativa.": "A conversa está viva.",
    "Já foi atendido.": "Já foi atendido.",
    "Sem conversa há {n} dias.": "Sem falar há {n} dias.",
    "Nunca trocou mensagens.": "Nunca trocou mensagens.",
    "Falou em agendar": "Falou em marcar",
    "A verificar": "Por apurar",
    "Passou para a equipe": "Passou para a equipa",
    Interessado: "Interessado",
    "Pós-venda": "Pós-venda",
    "Sem desfecho": "Sem desfecho",
    "Sem nome": "Sem nome",
    "1 mensagem": "1 mensagem",
    "{n} mensagens": "{n} mensagens",
    "Nada aqui.": "Nada aqui.",
    "Buscar por nome ou telefone": "Procurar por nome ou telefone",
    "Ocultar perdidos": "Esconder perdidos",
    "Ver perdidos ({n})": "Ver perdidos ({n})",
  },
  es: {
    // Páginas
    Agenda: "Agenda",
    Pipeline: "Embudo",
    "Sem cliente associado a esta conta.": "No hay ningún cliente asociado a esta cuenta.",
    "Não foi possível carregar a agenda.": "No se pudo cargar la agenda.",
    "Não foi possível carregar o pipeline.": "No se pudo cargar el embudo.",

    // Agenda
    "Dia inteiro": "Todo el día",
    "Nada agendado neste dia.": "Nada agendado este día.",
    "1 agendamento, {agente} pelo agente.": "1 cita, {agente} por el agente.",
    "{n} agendamentos, {agente} pelo agente.": "{n} citas, {agente} por el agente.",
    "Sem título": "Sin título",
    Agente: "Agente",
    Manual: "Manual",
    "Agendar atendimento": "Agendar cita",
    Fechar: "Cerrar",
    "Dia livre.": "Día libre.",
    "Ver a semana deste dia": "Ver la semana de este día",
    "Agendado pelo agente": "Agendado por el agente",
    "Agendado manualmente": "Agendado manualmente",
    Serviço: "Servicio",
    "Valor previsto": "Valor previsto",
    Telefone: "Teléfono",
    Onde: "Dónde",
    "Quem faz": "Quién lo hace",
    "No Google": "En Google",
    "Este evento foi criado manualmente no Google e não tem mais nada salvo além da hora e do título.":
      "Este evento se creó a mano en Google y no tiene nada más guardado aparte de la hora y el título.",
    "Abrir no Google para alterar": "Abrir en Google para cambiarlo",
    "+{n} mais": "+{n} más",
    Livre: "Libre",
    Anterior: "Anterior",
    Hoje: "Hoy",
    Próximo: "Siguiente",
    Semana: "Semana",
    Mês: "Mes",
    Todos: "Todos",
    "Nada agendado neste mês.": "Nada agendado este mes.",
    "Nada agendado nesta semana.": "Nada agendado esta semana.",
    "Clique em um dia, ou em um atendimento, para ver os detalhes.":
      "Haz clic en un día, o en una cita, para ver los detalles.",

    // Formulário de agendar
    Cliente: "Cliente",
    "Trocar cliente": "Cambiar cliente",
    "O agendamento fica no nome e no número desta ficha, por isso aparece no histórico dela.":
      "La cita queda a nombre y con el número de esta ficha, por eso aparece en su historial.",
    "Digite o nome ou o número": "Escribe el nombre o el número",
    "{n} clientes na base. Comece a digitar e as opções aparecem.":
      "{n} clientes en la base. Empieza a escribir y aparecerán las opciones.",
    "Nenhum cliente com esse nome ou número. Cadastre-o primeiro na aba Clientes.":
      "Ningún cliente con ese nombre o número. Créalo primero en la pestaña Clientes.",
    "Clique no cliente certo para o agendamento ficar no nome dele.":
      "Haz clic en el cliente correcto para que la cita quede a su nombre.",
    "Já está na agenda do Google e aparece aqui assim que a página recarregar.":
      "Ya está en la agenda de Google y aparecerá aquí en cuanto se recargue la página.",
    "Abrir no Google": "Abrir en Google",
    Cancelar: "Cancelar",
    "Escolha o serviço": "Elige el servicio",
    "Nome do evento": "Nombre del evento",
    "ex.: Lavagem Detalhada — Martim Cordeiro": "p. ej.: Lavado Detallado — Martim Cordeiro",
    Dia: "Día",
    Hora: "Hora",
    "Duração (min)": "Duración (min)",
    Valor: "Importe",
    "Valor ({moeda})": "Importe ({moeda})",
    opcional: "opcional",
    Veículo: "Vehículo",
    Observações: "Observaciones",
    "Agendando...": "Agendando...",
    "Agendar mesmo assim": "Agendar de todos modos",
    "sem título": "sin título",
    "Agendar por cima deixa as duas coisas no mesmo horário. Se for de propósito, confirme; se não, mude a hora.":
      "Agendar encima deja las dos cosas a la misma hora. Si es a propósito, confirma; si no, cambia la hora.",
    "Agendar no mesmo horário": "Agendar a la misma hora",
    Agendar: "Agendar",

    // Mensagens da server action e de lib/agenda/marcar.ts
    "Sessão sem permissão para agendar.": "Tu sesión no tiene permiso para agendar.",
    "Faltam dados para agendar.": "Faltan datos para agendar.",
    "Há uma coisa para confirmar antes de agendar.": "Hay una cosa que confirmar antes de agendar.",
    "Há {n} coisas para confirmar antes de agendar.": "Hay {n} cosas que confirmar antes de agendar.",
    "{executor} já tem trabalho marcado neste horário.":
      "{executor} ya tiene trabajo agendado a esta hora.",
    '"{servico}" ficou agendado para {cliente}.': '"{servico}" quedó agendado para {cliente}.',
    "O agendamento não entrou.": "La cita no se registró.",
    "Escolha o cliente.": "Elige el cliente.",
    "Escolha o serviço.": "Elige el servicio.",
    "Escolha o dia e a hora.": "Elige el día y la hora.",
    "Não foi possível ler a ficha do cliente.": "No se pudo leer la ficha del cliente.",
    "Cliente não encontrado na base.": "Cliente no encontrado en la base.",
    "Esta ficha não tem nome. Coloque o nome primeiro.":
      "Esta ficha no tiene nombre. Ponle el nombre primero.",
    "Esta ficha não tem um número de telefone válido, e é o número que liga o agendamento ao histórico. Coloque o número primeiro.":
      "Esta ficha no tiene un número de teléfono válido, y es el número lo que une la cita con el historial. Pon el número primero.",
    "Não há serviços agendáveis configurados para este cliente, então não há nada para agendar.":
      "No hay servicios agendables configurados para este cliente, así que no hay nada que agendar.",
    "Serviço desconhecido.": "Servicio desconocido.",
    'Escolha quem faz o serviço. "{servico}" é feito por {executores}.':
      'Elige quién hace el servicio. "{servico}" lo hace {executores}.',
    "Essa data e hora não existem.": "Esa fecha y hora no existen.",
    "A duração precisa ser um número de minutos acima de zero.":
      "La duración tiene que ser un número de minutos mayor que cero.",
    "O valor precisa ser um número igual ou maior que zero.":
      "El importe tiene que ser un número igual o mayor que cero.",
    "Escreva o nome do evento.": "Escribe el nombre del evento.",
    "Esta hora já passou.": "Esta hora ya pasó.",
    "{executor} não trabalha neste dia da semana.":
      "{executor} no trabaja este día de la semana.",
    "Fica fora do horário de {executor} ({inicio}h–{fim}h).":
      "Queda fuera del horario de {executor} ({inicio}h–{fim}h).",
    "São {horas} horas seguidas — este serviço costuma ser feito em mais de um dia.":
      "Son {horas} horas seguidas — este servicio suele hacerse en más de un día.",
    "O agendamento pelo painel ainda não está ligado ao n8n.":
      "Agendar desde el panel todavía no está conectado a n8n.",
    "A agenda não respondeu a tempo. Confirma no Google se o agendamento entrou antes de tentar de novo.":
      "La agenda no respondió a tiempo. Comprueba en Google si la cita se creó antes de volver a intentarlo.",
    "A agenda recusou o agendamento. Tente de novo daqui a pouco.":
      "La agenda rechazó la cita. Vuelve a intentarlo en un momento.",
    "A agenda respondeu algo que não dá para ler. Confirma no Google antes de tentar de novo.":
      "La agenda respondió algo que no se puede leer. Comprueba en Google antes de volver a intentarlo.",
    "A agenda não confirmou o agendamento. Confirma no Google antes de tentar de novo.":
      "La agenda no confirmó la cita. Comprueba en Google antes de volver a intentarlo.",

    // Pipeline
    Esfriando: "Enfriándose",
    "Em andamento": "En curso",
    Agendado: "Agendado",
    Perdido: "Perdido",
    "Por responder": "Por responder",
    "Sem conversa há mais de uma semana e ainda dentro do mês. Ainda dá para recuperar.":
      "Sin hablar desde hace más de una semana y aún dentro del mes. Todavía se puede recuperar.",
    "A conversa está ativa e a bola está com a gente.":
      "La conversación está activa y nos toca responder a nosotros.",
    "Tem um agendamento por acontecer.": "Tiene una cita pendiente.",
    "Já foi atendido. Aqui se ganha a recompra.": "Ya fue atendido. Aquí se gana la repetición.",
    "Um mês sem dizer nada. Fica fora da vista até alguém procurar.":
      "Un mes sin decir nada. Queda fuera de la vista hasta que alguien lo busque.",
    "Escreveram e ainda ninguém respondeu. Quem já tem agendamento fica em Agendado, com o aviso vermelho no cartão.":
      "Escribieron y nadie ha respondido todavía. Quien ya tiene cita queda en Agendado, con el aviso rojo en la tarjeta.",
    "Escreveu hoje e ainda não teve resposta.": "Escribió hoy y aún no tiene respuesta.",
    "Escreveu há 1 dia e ainda não teve resposta.": "Escribió hace 1 día y aún no tiene respuesta.",
    "Escreveu há {n} dias e ainda não teve resposta.":
      "Escribió hace {n} días y aún no tiene respuesta.",
    "A conversa está ativa.": "La conversación está activa.",
    "Já foi atendido.": "Ya fue atendido.",
    "Sem conversa há {n} dias.": "Sin hablar desde hace {n} días.",
    "Nunca trocou mensagens.": "Nunca intercambió mensajes.",
    "Falou em agendar": "Habló de agendar",
    "A verificar": "Por confirmar",
    "Passou para a equipe": "Pasó al equipo",
    Interessado: "Interesado",
    "Pós-venda": "Posventa",
    "Sem desfecho": "Sin desenlace",
    "Sem nome": "Sin nombre",
    "1 mensagem": "1 mensaje",
    "{n} mensagens": "{n} mensajes",
    "Nada aqui.": "Nada aquí.",
    "Buscar por nome ou telefone": "Buscar por nombre o teléfono",
    "Ocultar perdidos": "Ocultar perdidos",
    "Ver perdidos ({n})": "Ver perdidos ({n})",
  },
  en: {
    // Páginas
    Agenda: "Calendar",
    Pipeline: "Pipeline",
    "Sem cliente associado a esta conta.": "No client is linked to this account.",
    "Não foi possível carregar a agenda.": "Couldn't load the calendar.",
    "Não foi possível carregar o pipeline.": "Couldn't load the pipeline.",

    // Agenda
    "Dia inteiro": "All day",
    "Nada agendado neste dia.": "Nothing booked on this day.",
    "1 agendamento, {agente} pelo agente.": "1 booking, {agente} by the agent.",
    "{n} agendamentos, {agente} pelo agente.": "{n} bookings, {agente} by the agent.",
    "Sem título": "Untitled",
    Agente: "Agent",
    Manual: "Manual",
    "Agendar atendimento": "Book appointment",
    Fechar: "Close",
    "Dia livre.": "Free day.",
    "Ver a semana deste dia": "See this day's week",
    "Agendado pelo agente": "Booked by the agent",
    "Agendado manualmente": "Booked manually",
    Serviço: "Service",
    "Valor previsto": "Expected amount",
    Telefone: "Phone",
    Onde: "Where",
    "Quem faz": "Done by",
    "No Google": "In Google",
    "Este evento foi criado manualmente no Google e não tem mais nada salvo além da hora e do título.":
      "This event was created by hand in Google and has nothing else saved besides the time and the title.",
    "Abrir no Google para alterar": "Open in Google to change it",
    "+{n} mais": "+{n} more",
    Livre: "Free",
    Anterior: "Previous",
    Hoje: "Today",
    Próximo: "Next",
    Semana: "Week",
    Mês: "Month",
    Todos: "All",
    "Nada agendado neste mês.": "Nothing booked this month.",
    "Nada agendado nesta semana.": "Nothing booked this week.",
    "Clique em um dia, ou em um atendimento, para ver os detalhes.":
      "Click a day, or an appointment, to see the details.",

    // Formulário de agendar
    Cliente: "Customer",
    "Trocar cliente": "Change customer",
    "O agendamento fica no nome e no número desta ficha, por isso aparece no histórico dela.":
      "The booking goes under this record's name and number, so it shows up in its history.",
    "Digite o nome ou o número": "Type the name or the number",
    "{n} clientes na base. Comece a digitar e as opções aparecem.":
      "{n} customers on file. Start typing and the options will appear.",
    "Nenhum cliente com esse nome ou número. Cadastre-o primeiro na aba Clientes.":
      "No customer with that name or number. Add them first in the Customers tab.",
    "Clique no cliente certo para o agendamento ficar no nome dele.":
      "Click the right customer so the booking goes under their name.",
    "Já está na agenda do Google e aparece aqui assim que a página recarregar.":
      "It's already in Google Calendar and will show up here as soon as the page reloads.",
    "Abrir no Google": "Open in Google",
    Cancelar: "Cancel",
    "Escolha o serviço": "Choose the service",
    "Nome do evento": "Event name",
    "ex.: Lavagem Detalhada — Martim Cordeiro": "e.g.: Detailed Wash — Martim Cordeiro",
    Dia: "Day",
    Hora: "Time",
    "Duração (min)": "Duration (min)",
    Valor: "Amount",
    "Valor ({moeda})": "Amount ({moeda})",
    opcional: "optional",
    Veículo: "Vehicle",
    Observações: "Notes",
    "Agendando...": "Booking...",
    "Agendar mesmo assim": "Book anyway",
    "sem título": "untitled",
    "Agendar por cima deixa as duas coisas no mesmo horário. Se for de propósito, confirme; se não, mude a hora.":
      "Booking over it leaves both at the same time. If that's on purpose, confirm; if not, change the time.",
    "Agendar no mesmo horário": "Book at the same time",
    Agendar: "Book",

    // Mensagens da server action e de lib/agenda/marcar.ts
    "Sessão sem permissão para agendar.": "This session isn't allowed to book.",
    "Faltam dados para agendar.": "Some details are missing to book.",
    "Há uma coisa para confirmar antes de agendar.": "There's one thing to confirm before booking.",
    "Há {n} coisas para confirmar antes de agendar.": "There are {n} things to confirm before booking.",
    "{executor} já tem trabalho marcado neste horário.":
      "{executor} already has work booked at this time.",
    '"{servico}" ficou agendado para {cliente}.': '"{servico}" is booked for {cliente}.',
    "O agendamento não entrou.": "The booking didn't go through.",
    "Escolha o cliente.": "Choose the customer.",
    "Escolha o serviço.": "Choose the service.",
    "Escolha o dia e a hora.": "Choose the day and time.",
    "Não foi possível ler a ficha do cliente.": "Couldn't read the customer's profile.",
    "Cliente não encontrado na base.": "Customer not found in the records.",
    "Esta ficha não tem nome. Coloque o nome primeiro.":
      "This record has no name. Add the name first.",
    "Esta ficha não tem um número de telefone válido, e é o número que liga o agendamento ao histórico. Coloque o número primeiro.":
      "This record doesn't have a valid phone number, and the number is what links the booking to the history. Add the number first.",
    "Não há serviços agendáveis configurados para este cliente, então não há nada para agendar.":
      "There are no bookable services set up for this client, so there's nothing to book.",
    "Serviço desconhecido.": "Unknown service.",
    'Escolha quem faz o serviço. "{servico}" é feito por {executores}.':
      'Choose who does the service. "{servico}" is done by {executores}.',
    "Essa data e hora não existem.": "That date and time don't exist.",
    "A duração precisa ser um número de minutos acima de zero.":
      "The duration must be a number of minutes above zero.",
    "O valor precisa ser um número igual ou maior que zero.":
      "The amount must be a number equal to or greater than zero.",
    "Escreva o nome do evento.": "Type the event name.",
    "Esta hora já passou.": "This time has already passed.",
    "{executor} não trabalha neste dia da semana.":
      "{executor} doesn't work on this day of the week.",
    "Fica fora do horário de {executor} ({inicio}h–{fim}h).":
      "It's outside {executor}'s hours ({inicio}h–{fim}h).",
    "São {horas} horas seguidas — este serviço costuma ser feito em mais de um dia.":
      "That's {horas} hours in a row — this service is usually done over more than one day.",
    "O agendamento pelo painel ainda não está ligado ao n8n.":
      "Booking from the dashboard isn't connected to n8n yet.",
    "A agenda não respondeu a tempo. Confirma no Google se o agendamento entrou antes de tentar de novo.":
      "The calendar didn't respond in time. Check in Google whether the booking went through before trying again.",
    "A agenda recusou o agendamento. Tente de novo daqui a pouco.":
      "The calendar refused the booking. Try again in a moment.",
    "A agenda respondeu algo que não dá para ler. Confirma no Google antes de tentar de novo.":
      "The calendar sent back something unreadable. Check in Google before trying again.",
    "A agenda não confirmou o agendamento. Confirma no Google antes de tentar de novo.":
      "The calendar didn't confirm the booking. Check in Google before trying again.",

    // Pipeline
    Esfriando: "Cooling off",
    "Em andamento": "Ongoing",
    Agendado: "Booked",
    Perdido: "Lost",
    "Por responder": "Awaiting reply",
    "Sem conversa há mais de uma semana e ainda dentro do mês. Ainda dá para recuperar.":
      "No contact for over a week but still within the month. Still recoverable.",
    "A conversa está ativa e a bola está com a gente.":
      "The conversation is active and the ball is in our court.",
    "Tem um agendamento por acontecer.": "Has an upcoming booking.",
    "Já foi atendido. Aqui se ganha a recompra.": "Already served. This is where repeat business is won.",
    "Um mês sem dizer nada. Fica fora da vista até alguém procurar.":
      "A month without a word. Stays out of sight until someone looks for it.",
    "Escreveram e ainda ninguém respondeu. Quem já tem agendamento fica em Agendado, com o aviso vermelho no cartão.":
      "They wrote and no one has replied yet. Anyone with a booking stays in Booked, with the red warning on the card.",
    "Escreveu hoje e ainda não teve resposta.": "Wrote today and hasn't had a reply yet.",
    "Escreveu há 1 dia e ainda não teve resposta.": "Wrote 1 day ago and hasn't had a reply yet.",
    "Escreveu há {n} dias e ainda não teve resposta.":
      "Wrote {n} days ago and hasn't had a reply yet.",
    "A conversa está ativa.": "The conversation is active.",
    "Já foi atendido.": "Already served.",
    "Sem conversa há {n} dias.": "No contact for {n} days.",
    "Nunca trocou mensagens.": "Never exchanged messages.",
    "Falou em agendar": "Mentioned booking",
    "A verificar": "To be confirmed",
    "Passou para a equipe": "Handed to the team",
    Interessado: "Interested",
    "Pós-venda": "After-sales",
    "Sem desfecho": "No outcome",
    "Sem nome": "No name",
    "1 mensagem": "1 message",
    "{n} mensagens": "{n} messages",
    "Nada aqui.": "Nothing here.",
    "Buscar por nome ou telefone": "Search by name or phone",
    "Ocultar perdidos": "Hide lost",
    "Ver perdidos ({n})": "Show lost ({n})",
  },
};

export default textos;
