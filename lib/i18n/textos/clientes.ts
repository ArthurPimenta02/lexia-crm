import type { TextosDaArea } from "../traduzir";

/**
 * Textos da área "clientes". A chave é o texto em português do Brasil, exatamente
 * como está no código dentro de t("…"). Variáveis entre chaves ({n}) têm de
 * aparecer com o mesmo nome nas três traduções.
 *
 * Três grupos não aparecem como t("…") literal e o teste não os vê, por isso
 * conferem-se à mão:
 * - os rótulos de `lib/clientes/ficha.ts` (canais de aquisição e origens
 *   capturadas) e os países de `lib/clientes/telefone.ts`, traduzidos onde se
 *   desenham com t(rotulo);
 * - as mensagens do servidor (`lib/clientes/write.ts`, `marcacao.ts`), que
 *   continuam em pt-PT lá e são passadas a pt-BR em `traduzirMensagem`, no
 *   `clientes-panel.tsx` — essas sim são t("…") literais.
 */
const textos: TextosDaArea = {
  "pt-PT": {
    // Página
    Clientes: "Clientes",
    "Sessão sem permissão para editar clientes.": "Sessão sem permissão para editar clientes.",
    "Cliente não identificado.": "Cliente não identificado.",
    "Escolha o contato a juntar.": "Escolhe o contacto a juntar.",
    "Contato não identificado.": "Contacto não identificado.",

    // Mensagens do servidor
    "Escreva o nome do cliente.": "Escreve o nome do cliente.",
    "O nome é longo demais.": "O nome é demasiado comprido.",
    "Nome inválido.": "Nome inválido.",
    "Telefone inválido.": "Telefone inválido.",
    "Campos inválidos.": "Campos inválidos.",
    "Digite o telefone do cliente.": "Escreve o telefone do cliente.",
    "Escolha o país do número.": "Escolhe o país do número.",
    "O email é longo demais.": "O email é demasiado comprido.",
    "O endereço é longo demais.": "A morada é demasiado comprida.",
    "O carro é longo demais.": "O carro é demasiado comprido.",
    "As notas são longas demais.": "As notas são demasiado compridas.",
    "A explicação do canal é longa demais.": "A explicação do canal é demasiado comprida.",
    "A idade tem que ser um número entre 1 e 120.": "A idade tem de ser um número entre 1 e 120.",
    "Esse canal de aquisição não existe.": "Esse canal de aquisição não existe.",
    "Você escolheu 'Outro': escreva de onde veio.": "Escolheste 'Outro': escreve de onde veio.",
    "Este número já está no painel. Abra a ficha dele em vez de criar outra.":
      "Este número já está no painel. Abre a ficha dele em vez de criar outra.",
    "Já existe um contato com este número.": "Já existe um contacto com este número.",
    "Este número já está no painel. Abra a ficha dele.":
      "Este número já está no painel. Abre a ficha dele.",
    "Não foi possível criar o cliente.": "Não foi possível criar o cliente.",
    "Não foi possível ler a ficha do cliente.": "Não foi possível ler a ficha do cliente.",
    "Cliente não encontrado.": "Cliente não encontrado.",
    "Esta ficha não tem um número de telefone de verdade, e é o número que liga o serviço ao histórico. Coloque o número primeiro.":
      "Esta ficha não tem um número de telefone a sério, e é o número que liga o serviço ao histórico. Põe o número primeiro.",
    "Escolha o serviço que foi feito e a data.": "Escolhe o serviço que foi feito e a data.",
    "Não foi possível salvar a ficha.": "Não foi possível guardar a ficha.",
    "Ficha salva.": "Ficha guardada.",
    "Escolha dois contatos diferentes.": "Escolhe dois contactos diferentes.",
    "Não foi possível juntar os contatos.": "Não foi possível juntar os contactos.",
    "Contato não encontrado.": "Contacto não encontrado.",
    "Esse contato já está junto a outro. Junte ao contato principal.":
      "Esse contacto já está junto a outro. Junta ao contacto principal.",
    "Esse contato já tem outros juntos a ele. Separe-os primeiro, ou junte na outra direção.":
      "Esse contacto já tem outros juntos a ele. Separa-os primeiro, ou junta na outra direcção.",
    "Não foi possível separar os contatos.": "Não foi possível separar os contactos.",
    "Contatos separados.": "Contactos separados.",
    "Escolha o serviço que foi feito.": "Escolhe o serviço que foi feito.",
    "Escolha a data do serviço.": "Escolhe a data do serviço.",
    "Este cliente não tem agenda de serviços conectada.":
      "Este cliente não tem agenda de serviços ligada.",
    "A data do serviço não é válida.": "A data do serviço não é válida.",
    "A data do serviço não pode ser no futuro. Aqui se registra o que já foi feito — para agendar, use a agenda.":
      "A data do serviço não pode ser no futuro. Aqui regista-se o que já foi feito — para marcar, usa a agenda.",
    "O ticket tem que ser um número igual ou maior que zero.":
      "O ticket tem de ser um número igual ou maior que zero.",
    "Esse profissional não existe.": "Esse profissional não existe.",
    "Credenciais do banco de dados do cliente não configuradas.":
      "Credenciais da base de dados do cliente não configuradas.",
    "Não foi possível confirmar o serviço.": "Não foi possível confirmar o serviço.",
    "Serviço desconhecido.": "Serviço desconhecido.",
    "Não foi possível ler o que este cliente já comprou, então nada foi registrado. Tente de novo.":
      "Não foi possível ler o que este cliente já comprou, por isso não se registou nada. Tenta outra vez.",
    "a agenda do cliente recusou a gravação": "a agenda do cliente recusou a escrita",
    "Já existem {n} contatos com este número.": "Já existem {n} contactos com este número.",
    'Este número já está no painel como "{nome}". Abra a ficha dele em vez de criar outra.':
      'Este número já está no painel como "{nome}". Abre a ficha dele em vez de criar outra.',
    "{nome} ficou no painel, mas o serviço não foi registrado: {erro}. O contato está criado — não o crie de novo.":
      "{nome} ficou no painel, mas o serviço não foi registado: {erro}. O contacto está criado — não o cries outra vez.",
    '{nome} ficou no painel, com "{servico}" no histórico.':
      '{nome} ficou no painel, com "{servico}" no histórico.',
    "{nome} ficou no painel.": "{nome} ficou no painel.",
    "{nome} já tem um serviço registrado.": "{nome} já tem um serviço registado.",
    "Este cliente": "Este cliente",
    "{nome} já tem {n} serviços registrados.": "{nome} já tem {n} serviços registados.",
    "O serviço não foi registrado: {erro}.": "O serviço não foi registado: {erro}.",
    '"{servico}" entrou no histórico.': '"{servico}" entrou no histórico.',
    'Contatos juntos em "{nome}".': 'Contactos juntos em "{nome}".',
    "o principal": "o principal",
    "Isso não parece um número de telefone: ficaram {n} dígitos e um número tem entre {min} e {max}. Digite só o número, sem o código do país — o país se escolhe ao lado.":
      "Isso não parece um número de telefone: ficaram {n} dígitos e um número tem entre {min} e {max}. Escreve só o número, sem o indicativo — o país escolhe-se ao lado.",

    // Telefone
    Telefone: "Telefone",
    "Código do país": "Indicativo do país",
    "Número de telefone": "Número de telefone",
    "Digite o número sem o código do país. Se colar um número de outro país já completo, comece com {mais}.":
      "Escreve o número sem o indicativo. Se colares um número de outro país já completo, começa-o com {mais}.",
    "Vai ficar salvo como {numero}": "Vai ficar gravado como {numero}",

    // Campos da ficha
    "E-mail": "E-mail",
    opcional: "opcional",
    Endereço: "Morada",
    Carro: "Carro",
    "ex.: BMW Série 3 preto": "ex.: BMW Série 3 preto",
    Idade: "Idade",
    "Canal de aquisição": "Canal de aquisição",
    "Não sei": "Não sei",
    "De onde veio": "De onde veio",
    "ex.: feira de automóveis de Braga": "ex.: feira de automóveis de Braga",
    "Serviço já feito": "Serviço já feito",
    Serviço: "Serviço",
    Nenhum: "Nenhum",
    Data: "Data",
    "Ticket ({moeda})": "Ticket ({moeda})",
    "Quem fez": "Quem fez",
    Nome: "Nome",
    "ex.: Martim Cordeiro": "ex.: Martim Cordeiro",
    Notas: "Notas",
    "Preferências, o que deu certo ou errado.": "Preferências, o que correu bem ou mal.",

    // Criar
    "Criando...": "A criar...",
    "Criar cliente": "Criar cliente",
    "Este número já está no painel, em outro formato ou em outro canal:":
      "Este número já está no painel, noutro formato ou noutro canal:",
    "sem nome": "sem nome",
    "sem número": "sem número",
    'Se for mesmo outra pessoa, crie de novo. Se for a mesma, cancele e use o "Juntar a outro contato" na ficha dela — assim as conversas e o histórico ficam todos no mesmo lugar.':
      'Se for mesmo outra pessoa, cria de novo. Se for a mesma, cancela e usa o "Juntar a outro contacto" na ficha dela — assim as conversas e o histórico ficam todos no mesmo sítio.',
    "Criar mesmo assim": "Criar mesmo assim",
    "Novo cliente": "Novo cliente",
    "Fica no WhatsApp. É o único canal onde o número é também o identificador da conversa, por isso o contato se liga à conversa real assim que a pessoa escrever.":
      "Fica no WhatsApp. É o único canal onde o número é também o identificador da conversa, por isso o contacto liga-se à conversa real assim que a pessoa escrever.",

    // Ficha
    "Salvando...": "A guardar...",
    "Salvar ficha": "Guardar ficha",
    "Registrando...": "A registar...",
    "Registrar serviço": "Registar serviço",
    "{nome} já tem isto registrado:": "{nome} já tem isto registado:",
    "serviço não registrado": "serviço não registado",
    cancelada: "cancelada",
    "Se o serviço que você está registrando já está nesta lista, cancele — ele conta duas vezes para o total gasto e o número deixa de valer. Se é mesmo mais um, continue.":
      "Se o serviço que estás a registar já está nesta lista, cancela — ele conta duas vezes para o total gasto e o número deixa de valer. Se é mesmo mais um, continua.",
    "Registrar mesmo assim": "Registar mesmo assim",
    confirmado: "confirmado",
    indicado: "indicado",
    Campanha: "Campanha",
    Conjunto: "Conjunto",
    Criativo: "Criativo",
    "Abrir no WhatsApp": "Abrir no WhatsApp",
    "Ir para a conversa na plataforma": "Ir para a conversa na plataforma",
    "Última mensagem": "Última mensagem",
    Mensagens: "Mensagens",
    "Primeiro contato": "Primeiro contacto",
    Agendamentos: "Marcações",
    Histórico: "Histórico",
    "Os agendamentos ficam no banco de dados do cliente, e ele não está conectado neste ambiente.":
      "As marcações vivem na base de dados do cliente e ela não está ligada neste ambiente.",
    "Nunca agendou nada. Falou com o agente mas não fechou — é exatamente quem vale a pena contatar de novo.":
      "Nunca marcou nada. Falou com o agente mas não fechou — é exactamente quem vale a pena voltar a contactar.",
    "Fechar ficha": "Fechar ficha",

    // Juntar e separar
    "mesmo número": "mesmo número",
    "Juntar a outro contato": "Juntar a outro contacto",
    "{nome} passa a aparecer dentro da ficha de {principal}":
      "{nome} passa a aparecer dentro da ficha de {principal}",
    'Juntar "{nome}" a "{principal}"? Esta ficha deixa de aparecer sozinha. Pode ser desfeito.':
      'Juntar "{nome}" a "{principal}"? Esta ficha deixa de aparecer sozinha. Pode ser desfeito.',
    "Juntando...": "A juntar...",
    Juntar: "Juntar",
    "Escolher outro": "Escolher outro",
    "Há um contato com este mesmo número. É quase certeza que é a mesma pessoa.":
      "Há um contacto com este mesmo número. É quase de certeza a mesma pessoa.",
    "Há {n} contatos com este mesmo número.": "Há {n} contactos com este mesmo número.",
    "Buscar o contato principal": "Procurar o contacto principal",
    "Buscar por nome ou número...": "Procurar por nome ou número...",
    "Nenhum contato corresponde a essa busca.": "Nenhum contacto corresponde a essa procura.",
    "Separando...": "A separar...",
    Separar: "Separar",
    "Contatos juntos a este": "Contactos juntos a este",

    // Lista
    duplicado: "duplicado",
    "+{n} junto": "+{n} junto",
    "há 1 dia": "há 1 dia",
    "há {n} dias": "há {n} dias",
    "{n} msg": "{n} msg",
    Todos: "Todos",
    Duplicados: "Duplicados",
    "Sem falar há {n}+ dias": "Sem falar há {n}+ dias",
    "Sem notas": "Sem notas",
    Fechar: "Fechar",
    "{contatos} compartilham o número com outro. São a mesma pessoa duas vezes, porque a Meta entregou o número em dois formatos.":
      "{contatos} partilham o número com outro. São a mesma pessoa duas vezes, porque a Meta entregou o número em dois formatos.",
    "{n} contatos": "{n} contactos",
    "Ver só esses": "Ver só esses",
    "Buscar por nome ou número": "Procurar por nome ou número",
    "ex.: Martim, ou 912345678": "ex.: Martim, ou 912345678",
    "{n} de {total} clientes": "{n} de {total} clientes",
    "O histórico de agendamentos não está disponível: faltam as credenciais do banco de dados deste cliente neste ambiente. Os nomes, números e notas aparecem; os valores não.":
      "O histórico de marcações não está disponível: faltam as credenciais da base de dados deste cliente neste ambiente. Os nomes, números e notas aparecem; os valores não.",
    "Ainda não há clientes com nome e número de telefone.":
      "Ainda não há clientes com nome e número de telefone.",
    "Nenhum cliente corresponde a essa busca.": "Nenhum cliente corresponde a essa procura.",
    Gasto: "Gasto",
    Anterior: "Anterior",
    "Página {n} de {total}": "Página {n} de {total}",
    Próxima: "Seguinte",
    "Contatos que não entram na lista": "Contactos que não entram na lista",
    "{n} sem número de telefone válido. São quase todos de Instagram e Messenger: nesses canais a Meta não dá o celular, dá um identificador interno. Quem agendou por lá deu o número ao agente, e esse número está no agendamento — não no contato.":
      "{n} sem número de telefone utilizável. São quase todos de Instagram e Messenger: nesses canais a Meta não dá o telemóvel, dá um identificador interno. Quem marcou por lá deu o número ao agente, e esse número está na marcação — não no contacto.",
    "{n} com número mas sem nome: a conversa não chegou ao ponto de o agente perguntar como a pessoa se chama.":
      "{n} com número mas sem nome: a conversa não chegou ao ponto de o agente perguntar como a pessoa se chama.",

    // Rótulos de lib/clientes/ficha.ts (o teste não os vê)
    Indicação: "Indicação",
    Orgânico: "Orgânico",
    "Cliente antigo": "Cliente antigo",
    Outro: "Outro",
    "Anúncio para WhatsApp": "Anúncio para WhatsApp",
    "Anúncio no Instagram": "Anúncio no Instagram",
    "Publicação no Instagram": "Publicação no Instagram",
    // Redesenho das telas (06/11)
    "1 cliente": "1 cliente",
    "{n} clientes": "{n} clientes",
    "e {n} sem falar há mais de {dias} dias.": "e {n} sem falar há mais de {dias} dias.",
    "e todos falaram nos últimos {dias} dias.": "e todos falaram nos últimos {dias} dias.",
    "São a mesma pessoa duas vezes, porque a Meta entregou o número em dois formatos. Abra um deles e use Juntar.": "São a mesma pessoa duas vezes, porque a Meta entregou o número em dois formatos. Abre um deles e usa Juntar.",
    "{n} contatos aparecem duas vezes com o mesmo número.": "{n} contactos aparecem duas vezes com o mesmo número.",
    "Os valores gastos não aparecem: o histórico de agendamentos não está ligado.": "Os valores gastos não aparecem: o histórico de marcações não está ligado.",
    "Cada pessoa que conversar com o agente e der nome e número aparece aqui.": "Cada pessoa que falar com o agente e der nome e número aparece aqui.",
    "Tente outro nome ou número, ou escolha Todos no filtro.": "Experimenta outro nome ou número, ou escolhe Todos no filtro.",
    "{n} contatos não entram na lista. Ver por quê.": "{n} contactos não entram na lista. Ver porquê.",
  },

  es: {
    // Página
    Clientes: "Clientes",
    "Sessão sem permissão para editar clientes.": "Tu sesión no tiene permiso para editar clientes.",
    "Cliente não identificado.": "Cliente no identificado.",
    "Escolha o contato a juntar.": "Elige el contacto que quieres unir.",
    "Contato não identificado.": "Contacto no identificado.",

    // Mensagens do servidor
    "Escreva o nome do cliente.": "Escribe el nombre del cliente.",
    "O nome é longo demais.": "El nombre es demasiado largo.",
    "Nome inválido.": "Nombre no válido.",
    "Telefone inválido.": "Teléfono no válido.",
    "Campos inválidos.": "Campos no válidos.",
    "Digite o telefone do cliente.": "Escribe el teléfono del cliente.",
    "Escolha o país do número.": "Elige el país del número.",
    "O email é longo demais.": "El correo es demasiado largo.",
    "O endereço é longo demais.": "La dirección es demasiado larga.",
    "O carro é longo demais.": "El coche es demasiado largo.",
    "As notas são longas demais.": "Las notas son demasiado largas.",
    "A explicação do canal é longa demais.": "La explicación del canal es demasiado larga.",
    "A idade tem que ser um número entre 1 e 120.": "La edad tiene que ser un número entre 1 y 120.",
    "Esse canal de aquisição não existe.": "Ese canal de adquisición no existe.",
    "Você escolheu 'Outro': escreva de onde veio.": "Elegiste 'Otro': escribe de dónde vino.",
    "Este número já está no painel. Abra a ficha dele em vez de criar outra.":
      "Este número ya está en el panel. Abre su ficha en lugar de crear otra.",
    "Já existe um contato com este número.": "Ya existe un contacto con este número.",
    "Este número já está no painel. Abra a ficha dele.":
      "Este número ya está en el panel. Abre su ficha.",
    "Não foi possível criar o cliente.": "No se pudo crear el cliente.",
    "Não foi possível ler a ficha do cliente.": "No se pudo leer la ficha del cliente.",
    "Cliente não encontrado.": "Cliente no encontrado.",
    "Esta ficha não tem um número de telefone de verdade, e é o número que liga o serviço ao histórico. Coloque o número primeiro.":
      "Esta ficha no tiene un número de teléfono real, y es el número lo que une el servicio al historial. Pon el número primero.",
    "Escolha o serviço que foi feito e a data.": "Elige el servicio que se hizo y la fecha.",
    "Não foi possível salvar a ficha.": "No se pudo guardar la ficha.",
    "Ficha salva.": "Ficha guardada.",
    "Escolha dois contatos diferentes.": "Elige dos contactos diferentes.",
    "Não foi possível juntar os contatos.": "No se pudieron unir los contactos.",
    "Contato não encontrado.": "Contacto no encontrado.",
    "Esse contato já está junto a outro. Junte ao contato principal.":
      "Ese contacto ya está unido a otro. Únelo al contacto principal.",
    "Esse contato já tem outros juntos a ele. Separe-os primeiro, ou junte na outra direção.":
      "Ese contacto ya tiene otros unidos. Sepáralos primero, o únelos en la otra dirección.",
    "Não foi possível separar os contatos.": "No se pudieron separar los contactos.",
    "Contatos separados.": "Contactos separados.",
    "Escolha o serviço que foi feito.": "Elige el servicio que se hizo.",
    "Escolha a data do serviço.": "Elige la fecha del servicio.",
    "Este cliente não tem agenda de serviços conectada.":
      "Este cliente no tiene una agenda de servicios conectada.",
    "A data do serviço não é válida.": "La fecha del servicio no es válida.",
    "A data do serviço não pode ser no futuro. Aqui se registra o que já foi feito — para agendar, use a agenda.":
      "La fecha del servicio no puede ser futura. Aquí se registra lo que ya se hizo; para reservar, usa la agenda.",
    "O ticket tem que ser um número igual ou maior que zero.":
      "El importe tiene que ser un número igual o mayor que cero.",
    "Esse profissional não existe.": "Ese profesional no existe.",
    "Credenciais do banco de dados do cliente não configuradas.":
      "Las credenciales de la base de datos del cliente no están configuradas.",
    "Não foi possível confirmar o serviço.": "No se pudo confirmar el servicio.",
    "Serviço desconhecido.": "Servicio desconocido.",
    "Não foi possível ler o que este cliente já comprou, então nada foi registrado. Tente de novo.":
      "No se pudo leer lo que este cliente ya compró, así que no se registró nada. Inténtalo de nuevo.",
    "a agenda do cliente recusou a gravação": "la agenda del cliente rechazó el registro",
    "Já existem {n} contatos com este número.": "Ya existen {n} contactos con este número.",
    'Este número já está no painel como "{nome}". Abra a ficha dele em vez de criar outra.':
      'Este número ya está en el panel como "{nome}". Abre su ficha en lugar de crear otra.',
    "{nome} ficou no painel, mas o serviço não foi registrado: {erro}. O contato está criado — não o crie de novo.":
      "{nome} quedó en el panel, pero el servicio no se registró: {erro}. El contacto ya está creado; no lo crees otra vez.",
    '{nome} ficou no painel, com "{servico}" no histórico.':
      '{nome} quedó en el panel, con "{servico}" en el historial.',
    "{nome} ficou no painel.": "{nome} quedó en el panel.",
    "{nome} já tem um serviço registrado.": "{nome} ya tiene un servicio registrado.",
    "Este cliente": "Este cliente",
    "{nome} já tem {n} serviços registrados.": "{nome} ya tiene {n} servicios registrados.",
    "O serviço não foi registrado: {erro}.": "El servicio no se registró: {erro}.",
    '"{servico}" entrou no histórico.': '"{servico}" se añadió al historial.',
    'Contatos juntos em "{nome}".': 'Contactos unidos en "{nome}".',
    "o principal": "el principal",
    "Isso não parece um número de telefone: ficaram {n} dígitos e um número tem entre {min} e {max}. Digite só o número, sem o código do país — o país se escolhe ao lado.":
      "Eso no parece un número de teléfono: quedaron {n} dígitos y un número tiene entre {min} y {max}. Escribe solo el número, sin el prefijo; el país se elige al lado.",

    // Telefone
    Telefone: "Teléfono",
    "Código do país": "Prefijo del país",
    "Número de telefone": "Número de teléfono",
    "Digite o número sem o código do país. Se colar um número de outro país já completo, comece com {mais}.":
      "Escribe el número sin el prefijo. Si pegas un número completo de otro país, empiézalo con {mais}.",
    "Vai ficar salvo como {numero}": "Se guardará como {numero}",

    // Campos da ficha
    "E-mail": "Correo electrónico",
    opcional: "opcional",
    Endereço: "Dirección",
    Carro: "Coche",
    "ex.: BMW Série 3 preto": "ej.: BMW Serie 3 negro",
    Idade: "Edad",
    "Canal de aquisição": "Canal de adquisición",
    "Não sei": "No lo sé",
    "De onde veio": "De dónde vino",
    "ex.: feira de automóveis de Braga": "ej.: feria del automóvil de Braga",
    "Serviço já feito": "Servicio ya hecho",
    Serviço: "Servicio",
    Nenhum: "Ninguno",
    Data: "Fecha",
    "Ticket ({moeda})": "Importe ({moeda})",
    "Quem fez": "Quién lo hizo",
    Nome: "Nombre",
    "ex.: Martim Cordeiro": "ej.: Martim Cordeiro",
    Notas: "Notas",
    "Preferências, o que deu certo ou errado.": "Preferencias, qué salió bien o mal.",

    // Criar
    "Criando...": "Creando...",
    "Criar cliente": "Crear cliente",
    "Este número já está no painel, em outro formato ou em outro canal:":
      "Este número ya está en el panel, en otro formato o en otro canal:",
    "sem nome": "sin nombre",
    "sem número": "sin número",
    'Se for mesmo outra pessoa, crie de novo. Se for a mesma, cancele e use o "Juntar a outro contato" na ficha dela — assim as conversas e o histórico ficam todos no mesmo lugar.':
      'Si de verdad es otra persona, créala de nuevo. Si es la misma, cancela y usa "Unir a otro contacto" en su ficha; así las conversaciones y el historial quedan en el mismo sitio.',
    "Criar mesmo assim": "Crear de todos modos",
    "Novo cliente": "Nuevo cliente",
    "Fica no WhatsApp. É o único canal onde o número é também o identificador da conversa, por isso o contato se liga à conversa real assim que a pessoa escrever.":
      "Queda en WhatsApp. Es el único canal donde el número también identifica la conversación, así que el contacto se une a la conversación real en cuanto la persona escriba.",

    // Ficha
    "Salvando...": "Guardando...",
    "Salvar ficha": "Guardar ficha",
    "Registrando...": "Registrando...",
    "Registrar serviço": "Registrar servicio",
    "{nome} já tem isto registrado:": "{nome} ya tiene esto registrado:",
    "serviço não registrado": "servicio no registrado",
    cancelada: "cancelada",
    "Se o serviço que você está registrando já está nesta lista, cancele — ele conta duas vezes para o total gasto e o número deixa de valer. Se é mesmo mais um, continue.":
      "Si el servicio que estás registrando ya está en esta lista, cancela: contaría dos veces en el total gastado y el número dejaría de servir. Si de verdad es uno más, continúa.",
    "Registrar mesmo assim": "Registrar de todos modos",
    confirmado: "confirmado",
    indicado: "indicado",
    Campanha: "Campaña",
    Conjunto: "Conjunto",
    Criativo: "Creativo",
    "Abrir no WhatsApp": "Abrir en WhatsApp",
    "Ir para a conversa na plataforma": "Ir a la conversación en la plataforma",
    "Última mensagem": "Último mensaje",
    Mensagens: "Mensajes",
    "Primeiro contato": "Primer contacto",
    Agendamentos: "Citas",
    Histórico: "Historial",
    "Os agendamentos ficam no banco de dados do cliente, e ele não está conectado neste ambiente.":
      "Las citas están en la base de datos del cliente, y no está conectada en este entorno.",
    "Nunca agendou nada. Falou com o agente mas não fechou — é exatamente quem vale a pena contatar de novo.":
      "Nunca reservó nada. Habló con el agente pero no cerró; es justo a quien vale la pena volver a contactar.",
    "Fechar ficha": "Cerrar ficha",

    // Juntar e separar
    "mesmo número": "mismo número",
    "Juntar a outro contato": "Unir a otro contacto",
    "{nome} passa a aparecer dentro da ficha de {principal}":
      "{nome} pasa a aparecer dentro de la ficha de {principal}",
    'Juntar "{nome}" a "{principal}"? Esta ficha deixa de aparecer sozinha. Pode ser desfeito.':
      '¿Unir "{nome}" a "{principal}"? Esta ficha dejará de aparecer sola. Se puede deshacer.',
    "Juntando...": "Uniendo...",
    Juntar: "Unir",
    "Escolher outro": "Elegir otro",
    "Há um contato com este mesmo número. É quase certeza que é a mesma pessoa.":
      "Hay un contacto con este mismo número. Casi seguro que es la misma persona.",
    "Há {n} contatos com este mesmo número.": "Hay {n} contactos con este mismo número.",
    "Buscar o contato principal": "Buscar el contacto principal",
    "Buscar por nome ou número...": "Buscar por nombre o número...",
    "Nenhum contato corresponde a essa busca.": "Ningún contacto coincide con esa búsqueda.",
    "Separando...": "Separando...",
    Separar: "Separar",
    "Contatos juntos a este": "Contactos unidos a este",

    // Lista
    duplicado: "duplicado",
    "+{n} junto": "+{n} unido",
    "há 1 dia": "hace 1 día",
    "há {n} dias": "hace {n} días",
    "{n} msg": "{n} msj",
    Todos: "Todos",
    Duplicados: "Duplicados",
    "Sem falar há {n}+ dias": "Sin hablar hace {n}+ días",
    "Sem notas": "Sin notas",
    Fechar: "Cerrar",
    "{contatos} compartilham o número com outro. São a mesma pessoa duas vezes, porque a Meta entregou o número em dois formatos.":
      "{contatos} comparten el número con otro. Son la misma persona dos veces, porque Meta entregó el número en dos formatos.",
    "{n} contatos": "{n} contactos",
    "Ver só esses": "Ver solo esos",
    "Buscar por nome ou número": "Buscar por nombre o número",
    "ex.: Martim, ou 912345678": "ej.: Martim, o 912345678",
    "{n} de {total} clientes": "{n} de {total} clientes",
    "O histórico de agendamentos não está disponível: faltam as credenciais do banco de dados deste cliente neste ambiente. Os nomes, números e notas aparecem; os valores não.":
      "El historial de citas no está disponible: faltan las credenciales de la base de datos de este cliente en este entorno. Se ven los nombres, números y notas; los importes no.",
    "Ainda não há clientes com nome e número de telefone.":
      "Todavía no hay clientes con nombre y número de teléfono.",
    "Nenhum cliente corresponde a essa busca.": "Ningún cliente coincide con esa búsqueda.",
    Gasto: "Gastado",
    Anterior: "Anterior",
    "Página {n} de {total}": "Página {n} de {total}",
    Próxima: "Siguiente",
    "Contatos que não entram na lista": "Contactos que no entran en la lista",
    "{n} sem número de telefone válido. São quase todos de Instagram e Messenger: nesses canais a Meta não dá o celular, dá um identificador interno. Quem agendou por lá deu o número ao agente, e esse número está no agendamento — não no contato.":
      "{n} sin un número de teléfono válido. Casi todos son de Instagram y Messenger: en esos canales Meta no da el móvil, da un identificador interno. Quien reservó por ahí le dio el número al agente, y ese número está en la cita, no en el contacto.",
    "{n} com número mas sem nome: a conversa não chegou ao ponto de o agente perguntar como a pessoa se chama.":
      "{n} con número pero sin nombre: la conversación no llegó al punto en que el agente pregunta cómo se llama la persona.",

    // Rótulos de lib/clientes/ficha.ts (o teste não os vê)
    Indicação: "Recomendación",
    Orgânico: "Orgánico",
    "Cliente antigo": "Cliente antiguo",
    Outro: "Otro",
    "Anúncio para WhatsApp": "Anuncio para WhatsApp",
    "Anúncio no Instagram": "Anuncio en Instagram",
    "Publicação no Instagram": "Publicación en Instagram",

    // Países de lib/clientes/telefone.ts (o teste não os vê)
    Brasil: "Brasil",
    Espanha: "España",
    França: "Francia",
    "Reino Unido": "Reino Unido",
    Alemanha: "Alemania",
    Suíça: "Suiza",
    Itália: "Italia",
    "Países Baixos": "Países Bajos",
    Bélgica: "Bélgica",
    Luxemburgo: "Luxemburgo",
    Irlanda: "Irlanda",
    "EUA / Canadá": "EE. UU. / Canadá",
    "Cabo Verde": "Cabo Verde",
    Moçambique: "Mozambique",
    // Redesenho das telas (06/11)
    "1 cliente": "1 cliente",
    "{n} clientes": "{n} clientes",
    "e {n} sem falar há mais de {dias} dias.": "y {n} sin hablar hace más de {dias} días.",
    "e todos falaram nos últimos {dias} dias.": "y todos hablaron en los últimos {dias} días.",
    "São a mesma pessoa duas vezes, porque a Meta entregou o número em dois formatos. Abra um deles e use Juntar.": "Son la misma persona dos veces, porque Meta entregó el número en dos formatos. Abra uno y use Unir.",
    "{n} contatos aparecem duas vezes com o mesmo número.": "{n} contactos aparecen dos veces con el mismo número.",
    "Os valores gastos não aparecem: o histórico de agendamentos não está ligado.": "Los importes gastados no aparecen: el historial de citas no está conectado.",
    "Cada pessoa que conversar com o agente e der nome e número aparece aqui.": "Cada persona que hable con el agente y dé nombre y número aparece aquí.",
    "Tente outro nome ou número, ou escolha Todos no filtro.": "Pruebe otro nombre o número, o elija Todos en el filtro.",
    "{n} contatos não entram na lista. Ver por quê.": "{n} contactos no entran en la lista. Ver por qué.",
  },

  en: {
    // Página
    Clientes: "Customers",
    "Sessão sem permissão para editar clientes.": "Your session doesn't have permission to edit customers.",
    "Cliente não identificado.": "Customer not identified.",
    "Escolha o contato a juntar.": "Choose the contact to merge.",
    "Contato não identificado.": "Contact not identified.",

    // Mensagens do servidor
    "Escreva o nome do cliente.": "Enter the customer's name.",
    "O nome é longo demais.": "The name is too long.",
    "Nome inválido.": "Invalid name.",
    "Telefone inválido.": "Invalid phone number.",
    "Campos inválidos.": "Invalid fields.",
    "Digite o telefone do cliente.": "Enter the customer's phone number.",
    "Escolha o país do número.": "Choose the number's country.",
    "O email é longo demais.": "The email is too long.",
    "O endereço é longo demais.": "The address is too long.",
    "O carro é longo demais.": "The car is too long.",
    "As notas são longas demais.": "The notes are too long.",
    "A explicação do canal é longa demais.": "The channel explanation is too long.",
    "A idade tem que ser um número entre 1 e 120.": "Age must be a number between 1 and 120.",
    "Esse canal de aquisição não existe.": "That acquisition channel doesn't exist.",
    "Você escolheu 'Outro': escreva de onde veio.": "You chose 'Other': write where they came from.",
    "Este número já está no painel. Abra a ficha dele em vez de criar outra.":
      "This number is already in the panel. Open their profile instead of creating another.",
    "Já existe um contato com este número.": "A contact with this number already exists.",
    "Este número já está no painel. Abra a ficha dele.":
      "This number is already in the panel. Open their profile.",
    "Não foi possível criar o cliente.": "Couldn't create the customer.",
    "Não foi possível ler a ficha do cliente.": "Couldn't read the customer's profile.",
    "Cliente não encontrado.": "Customer not found.",
    "Esta ficha não tem um número de telefone de verdade, e é o número que liga o serviço ao histórico. Coloque o número primeiro.":
      "This profile doesn't have a real phone number, and the number is what links the service to the history. Add the number first.",
    "Escolha o serviço que foi feito e a data.": "Choose the service that was done and the date.",
    "Não foi possível salvar a ficha.": "Couldn't save the profile.",
    "Ficha salva.": "Profile saved.",
    "Escolha dois contatos diferentes.": "Choose two different contacts.",
    "Não foi possível juntar os contatos.": "Couldn't merge the contacts.",
    "Contato não encontrado.": "Contact not found.",
    "Esse contato já está junto a outro. Junte ao contato principal.":
      "That contact is already merged into another. Merge into the main contact.",
    "Esse contato já tem outros juntos a ele. Separe-os primeiro, ou junte na outra direção.":
      "That contact already has others merged into it. Split them first, or merge the other way around.",
    "Não foi possível separar os contatos.": "Couldn't split the contacts.",
    "Contatos separados.": "Contacts split.",
    "Escolha o serviço que foi feito.": "Choose the service that was done.",
    "Escolha a data do serviço.": "Choose the service date.",
    "Este cliente não tem agenda de serviços conectada.":
      "This customer doesn't have a service calendar connected.",
    "A data do serviço não é válida.": "The service date isn't valid.",
    "A data do serviço não pode ser no futuro. Aqui se registra o que já foi feito — para agendar, use a agenda.":
      "The service date can't be in the future. This is for recording what's already done — to book, use the calendar.",
    "O ticket tem que ser um número igual ou maior que zero.":
      "The amount must be a number equal to or greater than zero.",
    "Esse profissional não existe.": "That staff member doesn't exist.",
    "Credenciais do banco de dados do cliente não configuradas.":
      "The customer's database credentials aren't configured.",
    "Não foi possível confirmar o serviço.": "Couldn't confirm the service.",
    "Serviço desconhecido.": "Unknown service.",
    "Não foi possível ler o que este cliente já comprou, então nada foi registrado. Tente de novo.":
      "Couldn't read what this customer already bought, so nothing was recorded. Try again.",
    "a agenda do cliente recusou a gravação": "the customer's calendar rejected the write",
    "Já existem {n} contatos com este número.": "There are already {n} contacts with this number.",
    'Este número já está no painel como "{nome}". Abra a ficha dele em vez de criar outra.':
      'This number is already in the panel as "{nome}". Open their profile instead of creating another.',
    "{nome} ficou no painel, mas o serviço não foi registrado: {erro}. O contato está criado — não o crie de novo.":
      "{nome} was added to the panel, but the service wasn't recorded: {erro}. The contact is created — don't create it again.",
    '{nome} ficou no painel, com "{servico}" no histórico.':
      '{nome} was added to the panel, with "{servico}" in the history.',
    "{nome} ficou no painel.": "{nome} was added to the panel.",
    "{nome} já tem um serviço registrado.": "{nome} already has a service recorded.",
    "Este cliente": "This customer",
    "{nome} já tem {n} serviços registrados.": "{nome} already has {n} services recorded.",
    "O serviço não foi registrado: {erro}.": "The service wasn't recorded: {erro}.",
    '"{servico}" entrou no histórico.': '"{servico}" was added to the history.',
    'Contatos juntos em "{nome}".': 'Contacts merged into "{nome}".',
    "o principal": "the main one",
    "Isso não parece um número de telefone: ficaram {n} dígitos e um número tem entre {min} e {max}. Digite só o número, sem o código do país — o país se escolhe ao lado.":
      "That doesn't look like a phone number: it has {n} digits and a number has between {min} and {max}. Enter just the number, without the country code — pick the country next to it.",

    // Telefone
    Telefone: "Phone",
    "Código do país": "Country code",
    "Número de telefone": "Phone number",
    "Digite o número sem o código do país. Se colar um número de outro país já completo, comece com {mais}.":
      "Enter the number without the country code. If you paste a full number from another country, start it with {mais}.",
    "Vai ficar salvo como {numero}": "It will be saved as {numero}",

    // Campos da ficha
    "E-mail": "Email",
    opcional: "optional",
    Endereço: "Address",
    Carro: "Car",
    "ex.: BMW Série 3 preto": "e.g. black BMW 3 Series",
    Idade: "Age",
    "Canal de aquisição": "Acquisition channel",
    "Não sei": "Don't know",
    "De onde veio": "Where they came from",
    "ex.: feira de automóveis de Braga": "e.g. Braga car fair",
    "Serviço já feito": "Service already done",
    Serviço: "Service",
    Nenhum: "None",
    Data: "Date",
    "Ticket ({moeda})": "Amount ({moeda})",
    "Quem fez": "Done by",
    Nome: "Name",
    "ex.: Martim Cordeiro": "e.g. Martim Cordeiro",
    Notas: "Notes",
    "Preferências, o que deu certo ou errado.": "Preferences, what went well or badly.",

    // Criar
    "Criando...": "Creating...",
    "Criar cliente": "Create customer",
    "Este número já está no painel, em outro formato ou em outro canal:":
      "This number is already in the panel, in another format or on another channel:",
    "sem nome": "no name",
    "sem número": "no number",
    'Se for mesmo outra pessoa, crie de novo. Se for a mesma, cancele e use o "Juntar a outro contato" na ficha dela — assim as conversas e o histórico ficam todos no mesmo lugar.':
      'If it really is someone else, create it again. If it\'s the same person, cancel and use "Merge into another contact" on their profile — that way the conversations and history all stay in one place.',
    "Criar mesmo assim": "Create anyway",
    "Novo cliente": "New customer",
    "Fica no WhatsApp. É o único canal onde o número é também o identificador da conversa, por isso o contato se liga à conversa real assim que a pessoa escrever.":
      "It goes on WhatsApp. It's the only channel where the number is also the conversation's identifier, so the contact links to the real conversation as soon as the person writes.",

    // Ficha
    "Salvando...": "Saving...",
    "Salvar ficha": "Save profile",
    "Registrando...": "Recording...",
    "Registrar serviço": "Record service",
    "{nome} já tem isto registrado:": "{nome} already has this recorded:",
    "serviço não registrado": "service not recorded",
    cancelada: "canceled",
    "Se o serviço que você está registrando já está nesta lista, cancele — ele conta duas vezes para o total gasto e o número deixa de valer. Se é mesmo mais um, continue.":
      "If the service you're recording is already on this list, cancel — it would count twice toward the total spent and the number would stop being reliable. If it really is one more, go ahead.",
    "Registrar mesmo assim": "Record anyway",
    confirmado: "confirmed",
    indicado: "stated",
    Campanha: "Campaign",
    Conjunto: "Ad set",
    Criativo: "Creative",
    "Abrir no WhatsApp": "Open in WhatsApp",
    "Ir para a conversa na plataforma": "Go to the conversation on the platform",
    "Última mensagem": "Last message",
    Mensagens: "Messages",
    "Primeiro contato": "First contact",
    Agendamentos: "Appointments",
    Histórico: "History",
    "Os agendamentos ficam no banco de dados do cliente, e ele não está conectado neste ambiente.":
      "Appointments live in the customer's database, and it isn't connected in this environment.",
    "Nunca agendou nada. Falou com o agente mas não fechou — é exatamente quem vale a pena contatar de novo.":
      "Never booked anything. Talked to the agent but didn't close — exactly the kind of person worth reaching out to again.",
    "Fechar ficha": "Close profile",

    // Juntar e separar
    "mesmo número": "same number",
    "Juntar a outro contato": "Merge into another contact",
    "{nome} passa a aparecer dentro da ficha de {principal}":
      "{nome} will now appear inside {principal}'s profile",
    'Juntar "{nome}" a "{principal}"? Esta ficha deixa de aparecer sozinha. Pode ser desfeito.':
      'Merge "{nome}" into "{principal}"? This profile will no longer appear on its own. This can be undone.',
    "Juntando...": "Merging...",
    Juntar: "Merge",
    "Escolher outro": "Choose another",
    "Há um contato com este mesmo número. É quase certeza que é a mesma pessoa.":
      "There's a contact with this same number. It's almost certainly the same person.",
    "Há {n} contatos com este mesmo número.": "There are {n} contacts with this same number.",
    "Buscar o contato principal": "Search for the main contact",
    "Buscar por nome ou número...": "Search by name or number...",
    "Nenhum contato corresponde a essa busca.": "No contacts match that search.",
    "Separando...": "Splitting...",
    Separar: "Split",
    "Contatos juntos a este": "Contacts merged into this one",

    // Lista
    duplicado: "duplicate",
    "+{n} junto": "+{n} merged",
    "há 1 dia": "1 day ago",
    "há {n} dias": "{n} days ago",
    "{n} msg": "{n} msg",
    Todos: "All",
    Duplicados: "Duplicates",
    "Sem falar há {n}+ dias": "No contact in {n}+ days",
    "Sem notas": "No notes",
    Fechar: "Close",
    "{contatos} compartilham o número com outro. São a mesma pessoa duas vezes, porque a Meta entregou o número em dois formatos.":
      "{contatos} share their number with another. They're the same person twice, because Meta sent the number in two formats.",
    "{n} contatos": "{n} contacts",
    "Ver só esses": "Show only these",
    "Buscar por nome ou número": "Search by name or number",
    "ex.: Martim, ou 912345678": "e.g. Martim, or 912345678",
    "{n} de {total} clientes": "{n} of {total} customers",
    "O histórico de agendamentos não está disponível: faltam as credenciais do banco de dados deste cliente neste ambiente. Os nomes, números e notas aparecem; os valores não.":
      "Appointment history isn't available: this customer's database credentials are missing in this environment. Names, numbers and notes show; amounts don't.",
    "Ainda não há clientes com nome e número de telefone.":
      "There are no customers with a name and phone number yet.",
    "Nenhum cliente corresponde a essa busca.": "No customers match that search.",
    Gasto: "Spent",
    Anterior: "Previous",
    "Página {n} de {total}": "Page {n} of {total}",
    Próxima: "Next",
    "Contatos que não entram na lista": "Contacts not on the list",
    "{n} sem número de telefone válido. São quase todos de Instagram e Messenger: nesses canais a Meta não dá o celular, dá um identificador interno. Quem agendou por lá deu o número ao agente, e esse número está no agendamento — não no contato.":
      "{n} without a usable phone number. Almost all are from Instagram and Messenger: on those channels Meta doesn't give the phone number, it gives an internal ID. Whoever booked there gave their number to the agent, and that number is on the appointment — not on the contact.",
    "{n} com número mas sem nome: a conversa não chegou ao ponto de o agente perguntar como a pessoa se chama.":
      "{n} with a number but no name: the conversation didn't get to the point where the agent asks the person's name.",

    // Rótulos de lib/clientes/ficha.ts (o teste não os vê)
    Indicação: "Referral",
    Orgânico: "Organic",
    "Cliente antigo": "Returning customer",
    Outro: "Other",
    "Anúncio para WhatsApp": "WhatsApp ad",
    "Anúncio no Instagram": "Instagram ad",
    "Publicação no Instagram": "Instagram post",

    // Países de lib/clientes/telefone.ts (o teste não os vê)
    Brasil: "Brazil",
    Espanha: "Spain",
    França: "France",
    "Reino Unido": "United Kingdom",
    Alemanha: "Germany",
    Suíça: "Switzerland",
    Itália: "Italy",
    "Países Baixos": "Netherlands",
    Bélgica: "Belgium",
    Luxemburgo: "Luxembourg",
    Irlanda: "Ireland",
    "EUA / Canadá": "USA / Canada",
    "Cabo Verde": "Cape Verde",
    Moçambique: "Mozambique",
    // Redesenho das telas (06/11)
    "1 cliente": "1 customer",
    "{n} clientes": "{n} customers",
    "e {n} sem falar há mais de {dias} dias.": "and {n} silent for over {dias} days.",
    "e todos falaram nos últimos {dias} dias.": "and all of them talked in the last {dias} days.",
    "São a mesma pessoa duas vezes, porque a Meta entregou o número em dois formatos. Abra um deles e use Juntar.": "They are the same person twice, because Meta sent the number in two formats. Open one and use Merge.",
    "{n} contatos aparecem duas vezes com o mesmo número.": "{n} contacts appear twice with the same number.",
    "Os valores gastos não aparecem: o histórico de agendamentos não está ligado.": "Amounts spent don't show: the booking history isn't connected.",
    "Cada pessoa que conversar com o agente e der nome e número aparece aqui.": "Everyone who talks to the agent and gives a name and number shows up here.",
    "Tente outro nome ou número, ou escolha Todos no filtro.": "Try another name or number, or pick All in the filter.",
    "{n} contatos não entram na lista. Ver por quê.": "{n} contacts aren't on the list. See why.",
  },
};

export default textos;
