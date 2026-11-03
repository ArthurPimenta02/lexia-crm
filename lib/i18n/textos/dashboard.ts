import type { TextosDaArea } from "../traduzir";

/**
 * Textos da área "dashboard". A chave é o texto em português do Brasil, exatamente
 * como está no código dentro de t("…"). Variáveis entre chaves ({n}) têm de
 * aparecer com o mesmo nome nas três traduções.
 *
 * Chaves que o teste não vê (vêm de constantes partilhadas e são traduzidas
 * onde se desenham, com `t(item.label)`):
 * - períodos de `lib/dashboard/date-range` (Hoje, Esta semana, Este mês, Personalizada);
 * - "Todos os canais" (opções de canal do dashboard do admin);
 * - dias da semana de `lib/metrics/external-client-metrics` (Seg … Dom);
 * - nomes de fuso de `lib/clientes/timezone` (Brasília, Lisboa, Nova Iorque).
 */
const textos: TextosDaArea = {
  "pt-PT": {
    "1 workflow": "1 workflow",
    "{n} pendências": "{n} pendências",
    "Sem pendências": "Sem pendências",
    "{n} workflows": "{n} workflows",
    "conversas": "conversas",
    "agendamentos": "marcações",
    "{dia}, {hora}h: {n} mensagens": "{dia}, {hora}h: {n} mensagens",
    "Passe o mouse para ver cada horário.": "Passe o rato para ver cada horário.",
    "{n} conversas ativas": "{n} conversas ativas",
    "{n} conversas esperando resposta.": "{n} conversas à espera de resposta.",
    "1 conversa esperando resposta.": "1 conversa à espera de resposta.",
    "{taxa} das conversas": "{taxa} das conversas",
    "Conversas e agendamentos": "Conversas e marcações",
    "De onde vem cada conversa": "De onde vem cada conversa",
    "Mensagens recebidas por dia da semana e hora, no fuso do cliente. Quanto mais escuro, mais movimento.": "Mensagens recebidas por dia da semana e hora, no fuso do cliente. Quanto mais escuro, mais movimento.",
    "Ninguém esperando resposta.": "Ninguém à espera de resposta.",
    "Por dia, no período": "Por dia, no período",
    "Por hora, hoje": "Por hora, hoje",
    "Sem conversas no período.": "Sem conversas no período.",
    "visão geral": "visão geral",
    "Bom dia": "Bom dia",
    "Boa tarde": "Boa tarde",
    "Boa noite": "Boa noite",
    // Constantes partilhadas
    Hoje: "Hoje",
    "Esta semana": "Esta semana",
    "Este mês": "Este mês",
    Personalizada: "Personalizada",
    "Todos os canais": "Todos os canais",
    Seg: "Seg",
    Ter: "Ter",
    Qua: "Qua",
    Qui: "Qui",
    Sex: "Sex",
    Sáb: "Sáb",
    Dom: "Dom",
    Brasília: "Brasília",
    Lisboa: "Lisboa",
    "Nova Iorque": "Nova Iorque",

    // Dashboard do cliente e do admin
    Dashboard: "Dashboard",
    Conversas: "Conversas",
    Início: "Início",
    Fim: "Fim",
    "Aplicando...": "A aplicar...",
    Aplicar: "Aplicar",
    "no período": "no período",
    Resultado: "Resultado",
    "Conversas em que a primeira mensagem do cliente caiu dentro do período escolhido.":
      "Conversas em que a primeira mensagem do cliente caiu dentro do período escolhido.",
    "Conversas iniciadas": "Conversas iniciadas",
    "Agendamentos válidos criados no período, conforme o estado usado por este cliente.":
      "Marcações válidas criadas no período, conforme o estado usado por este cliente.",
    Agendamentos: "Marcações",
    "Agendamentos divididos pelas conversas iniciadas no mesmo período. Não é atribuição individual: não diz que foi aquela conversa que gerou aquele agendamento.":
      "Marcações a dividir pelas conversas iniciadas no mesmo período. Não é atribuição individual: não diz que foi aquela conversa que gerou aquela marcação.",
    "Agendam. / conversa": "Marcações / conversa",
    "{agendamentos} para {conversas} conversas": "{agendamentos} para {conversas} conversas",
    "Porcentagem de conversas que o agente fechou sozinho. Dados a partir de {data}.":
      "Percentagem de conversas que o agente fechou sozinho. Dados a partir de {data}.",
    "Dados de autonomia só existem a partir de {data}.":
      "Dados de autonomia só existem a partir de {data}.",
    "Autonomia do agente": "Autonomia do agente",
    "{n} com intervenção humana": "{n} com intervenção humana",
    "Volume no período": "Volume no período",
    "Conversas com pelo menos uma mensagem recebida ou enviada no período, mesmo que tenham começado antes.":
      "Conversas com pelo menos uma mensagem recebida ou enviada no período, mesmo que tenham começado antes.",
    "Conversas ativas": "Conversas activas",
    "Mensagens que os clientes finais enviaram.": "Mensagens que os clientes finais enviaram.",
    "Mensagens recebidas": "Mensagens recebidas",
    "Todas as mensagens enviadas: agente, equipe e follow-ups.":
      "Todas as mensagens enviadas: agente, equipa e follow-ups.",
    "Mensagens enviadas": "Mensagens enviadas",
    "Contatos distintos criados pela primeira vez no período.":
      "Contactos distintos criados pela primeira vez no período.",
    "Novos contatos": "Novos contactos",
    "Qualidade do atendimento": "Qualidade do atendimento",
    "Tempo médio até a primeira resposta automática, nas conversas iniciadas no período em que essa resposta chegou em menos de uma hora.":
      "Tempo médio até à primeira resposta automática, nas conversas iniciadas no período em que essa resposta chegou em menos de uma hora.",
    "Primeira resposta": "Primeira resposta",
    "{n} conversas": "{n} conversas",
    "Respostas do agente fora de 9h-19h ou no fim de semana. É o que o agente cobre e uma pessoa não cobriria.":
      "Respostas do agente fora das 9h-19h ou ao fim de semana. É o que o agente cobre e uma pessoa não cobriria.",
    "Fora do horário": "Fora do horário",
    "{fora} de {total} respostas": "{fora} de {total} respostas",
    "Mensagens automáticas de retomada efetivamente registradas no período.":
      "Mensagens automáticas de retoma efectivamente registadas no período.",
    "Follow-ups enviados": "Follow-ups enviados",
    "Das conversas que receberam follow-up rápido, quantas voltaram a responder.":
      "Das conversas que receberam follow-up rápido, quantas voltaram a responder.",
    "Recuperação por follow-up": "Recuperação por follow-up",
    "{voltaram} de {total} voltaram": "{voltaram} de {total} voltaram",
    "Conversas por canal": "Conversas por canal",
    "Sem canal": "Sem canal",
    "Sem conversas por canal no período.": "Sem conversas por canal no período.",
    "Serviços mais agendados": "Serviços mais marcados",
    "Sem agendamentos no período.": "Sem marcações no período.",
    "Agendamentos por dia": "Marcações por dia",
    "Horários de pico": "Horários de pico",
    "As oito horas com mais mensagens recebidas, no fuso do cliente.":
      "As oito horas com mais mensagens recebidas, no fuso do cliente.",
    "As conversas já estão conectadas. Agendamentos e follow-ups entram assim que a fonte de métricas deste cliente estiver conectada ao painel.":
      "As conversas já estão ligadas. Marcações e follow-ups entram assim que a fonte de métricas deste cliente estiver ligada ao painel.",
    "Canal não identificado": "Canal não identificado",
    "Ver conversas": "Ver conversas",
    Cliente: "Cliente",
    "Todos os clientes": "Todos os clientes",
    Canal: "Canal",
    "Aplicar filtros": "Aplicar filtros",
    "Vários fusos horários": "Vários fusos horários",
    "Primeira mensagem recebida de cada conversa dentro do período.":
      "Primeira mensagem recebida de cada conversa dentro do período.",
    "Os agendamentos não possuem canal associado e não podem ser filtrados com segurança.":
      "As marcações não têm canal associado e não podem ser filtradas com segurança.",
    "Agendamentos válidos criados no período, conforme o estado de cada cliente.":
      "Marcações válidas criadas no período, conforme o estado de cada cliente.",
    "Indisponível com filtro de canal, pois os agendamentos não registram essa origem.":
      "Indisponível com filtro de canal, pois as marcações não registam essa origem.",
    "Agendamentos divididos pelas conversas iniciadas no mesmo período; sem atribuição individual.":
      "Marcações a dividir pelas conversas iniciadas no mesmo período; sem atribuição individual.",
    "Conversas resolvidas sem ninguém da equipe escrever. Dados confiáveis a partir de {data}.":
      "Conversas resolvidas sem ninguém da equipa escrever. Dados fiáveis a partir de {data}.",
    "Dados de autonomia disponíveis a partir de {data}.":
      "Dados de autonomia disponíveis a partir de {data}.",
    "Captação e retomada": "Captação e retoma",
    "Conversas que receberam follow-up rápido e voltaram a responder.":
      "Conversas que receberam follow-up rápido e voltaram a responder.",
    "{voltaram} de {total} voltaram a responder": "{voltaram} de {total} voltaram a responder",
    "Respostas enviadas fora de 9h-19h ou no fim de semana.":
      "Respostas enviadas fora das 9h-19h ou ao fim de semana.",
    Atendimento: "Atendimento",
    "Conversas com pelo menos uma mensagem recebida ou enviada no período.":
      "Conversas com pelo menos uma mensagem recebida ou enviada no período.",
    "Tempo até a primeira resposta automática, nas conversas respondidas em menos de 1h.":
      "Tempo até à primeira resposta automática, nas conversas respondidas em menos de 1h.",
    "Mensagens recebidas dos clientes finais.": "Mensagens recebidas dos clientes finais.",
    "Todas as mensagens enviadas, incluindo agente, equipe e follow-ups.":
      "Todas as mensagens enviadas, incluindo agente, equipa e follow-ups.",
    "Handoffs reais ainda pendentes.": "Handoffs reais ainda pendentes.",
    "Handoffs pendentes": "Handoffs pendentes",
    "Feedbacks ainda pendentes de análise.": "Feedbacks ainda pendentes de análise.",
    "Feedbacks pendentes": "Feedbacks pendentes",
    "Conversas iniciadas por canal": "Conversas iniciadas por canal",
    "Mensagens recebidas por dia e hora. Na visão geral usa o fuso da plataforma; ao filtrar um cliente, o fuso do cliente.":
      "Mensagens recebidas por dia e hora. Na visão geral usa o fuso da plataforma; ao filtrar um cliente, o fuso do cliente.",
    "Clientes no período": "Clientes no período",
    Iniciadas: "Iniciadas",
    Canais: "Canais",
    Recebidas: "Recebidas",
    Enviadas: "Enviadas",
    Relação: "Relação",
    Autonomia: "Autonomia",
    "Follow-ups": "Follow-ups",
    Pendências: "Pendências",
    Workflows: "Workflows",
    Ações: "Acções",
    "Sem valor": "Sem valor",
    "Modo teste": "Modo de teste",
    Produção: "Produção",
    "{n} ativas": "{n} activas",
    "Não identificado: {n}": "Não identificado: {n}",
    "{n} com intervenção": "{n} com intervenção",
    Feedbacks: "Feedbacks",
    "Nenhum cliente encontrado com os filtros atuais.":
      "Nenhum cliente encontrado com os filtros actuais.",
    "Últimas conversas iniciadas": "Últimas conversas iniciadas",
    "Ver todas": "Ver todas",
    "Sem nome": "Sem nome",
    "Sem data": "Sem data",
    "Ainda não há conversas reais registradas neste período.":
      "Ainda não há conversas reais registadas neste período.",

    // Faixa de campanhas
    "O gasto da Meta é sincronizado uma vez por dia, às 06:00 UTC. O número de hoje é o que havia na hora da sincronização; para vê-lo em tempo real, use o Atualizar.":
      "O gasto da Meta é sincronizado uma vez por dia, às 06:00 UTC. O número de hoje é o que havia à hora da sincronização; para o ver ao minuto, usa o Atualizar.",
    Campanhas: "Campanhas",
    "Ver campanhas": "Ver campanhas",
    "Soma do que a Meta cobrou nos dias do período, no fuso da conta de anúncios.":
      "Soma do que a Meta cobrou nos dias do período, no fuso da conta de anúncios.",
    Investido: "Investido",
    "Investido dividido por todas as conversas iniciadas no período, e não só pelas que vieram de anúncio. Por isso é um limite superior do custo real de uma conversa paga.":
      "Investido a dividir por todas as conversas iniciadas no período, e não só pelas que vieram de anúncio. É por isso um limite superior do custo real de uma conversa paga.",
    "Custo por conversa": "Custo por conversa",
    "{n} conversa iniciada": "{n} conversa iniciada",
    "{n} conversas iniciadas": "{n} conversas iniciadas",
    "Cliques em qualquer parte do anúncio.": "Cliques em qualquer parte do anúncio.",
    Cliques: "Cliques",
    "{n} no link": "{n} no link",
    "Custo por mil impressões, recalculado do total do período.":
      "Custo por mil impressões, recalculado do total do período.",
    "A conta de anúncios da Meta está conectada, mas não há gasto sincronizado neste período.":
      "A conta de anúncios da Meta está ligada, mas não há gasto sincronizado neste período.",
    'Em Campanhas, você pode puxar o histórico com "Atualizar dados".':
      'Em Campanhas, podes puxar o histórico com "Atualizar dados".',
  },
  es: {
    "1 workflow": "1 workflow",
    "{n} pendências": "{n} pendientes",
    "Sem pendências": "Sin pendientes",
    "{n} workflows": "{n} workflows",
    "conversas": "conversaciones",
    "agendamentos": "citas",
    "{dia}, {hora}h: {n} mensagens": "{dia}, {hora}h: {n} mensajes",
    "Passe o mouse para ver cada horário.": "Pasa el cursor para ver cada horario.",
    "{n} conversas ativas": "{n} conversaciones activas",
    "{n} conversas esperando resposta.": "{n} conversaciones esperando respuesta.",
    "1 conversa esperando resposta.": "1 conversación esperando respuesta.",
    "{taxa} das conversas": "{taxa} de las conversaciones",
    "Conversas e agendamentos": "Conversaciones y citas",
    "De onde vem cada conversa": "De dónde viene cada conversación",
    "Mensagens recebidas por dia da semana e hora, no fuso do cliente. Quanto mais escuro, mais movimento.": "Mensajes recibidos por día de la semana y hora, en la zona horaria del cliente. Cuanto más oscuro, más movimiento.",
    "Ninguém esperando resposta.": "Nadie esperando respuesta.",
    "Por dia, no período": "Por día, en el período",
    "Por hora, hoje": "Por hora, hoy",
    "Sem conversas no período.": "Sin conversaciones en el período.",
    "visão geral": "resumen",
    "Bom dia": "Buenos días",
    "Boa tarde": "Buenas tardes",
    "Boa noite": "Buenas noches",
    // Constantes partilhadas
    Hoje: "Hoy",
    "Esta semana": "Esta semana",
    "Este mês": "Este mes",
    Personalizada: "Personalizado",
    "Todos os canais": "Todos los canales",
    Seg: "Lun",
    Ter: "Mar",
    Qua: "Mié",
    Qui: "Jue",
    Sex: "Vie",
    Sáb: "Sáb",
    Dom: "Dom",
    Brasília: "Brasilia",
    Lisboa: "Lisboa",
    "Nova Iorque": "Nueva York",

    // Dashboard do cliente e do admin
    Dashboard: "Panel",
    Conversas: "Conversaciones",
    Início: "Inicio",
    Fim: "Fin",
    "Aplicando...": "Aplicando...",
    Aplicar: "Aplicar",
    "no período": "en el período",
    Resultado: "Resultado",
    "Conversas em que a primeira mensagem do cliente caiu dentro do período escolhido.":
      "Conversaciones en las que el primer mensaje del cliente llegó dentro del período elegido.",
    "Conversas iniciadas": "Conversaciones iniciadas",
    "Agendamentos válidos criados no período, conforme o estado usado por este cliente.":
      "Citas válidas creadas en el período, según el estado que usa este cliente.",
    Agendamentos: "Citas",
    "Agendamentos divididos pelas conversas iniciadas no mesmo período. Não é atribuição individual: não diz que foi aquela conversa que gerou aquele agendamento.":
      "Citas divididas entre las conversaciones iniciadas en el mismo período. No es una atribución individual: no dice que fue esa conversación la que generó esa cita.",
    "Agendam. / conversa": "Citas / conversación",
    "{agendamentos} para {conversas} conversas": "{agendamentos} para {conversas} conversaciones",
    "Porcentagem de conversas que o agente fechou sozinho. Dados a partir de {data}.":
      "Porcentaje de conversaciones que el agente cerró solo. Datos a partir del {data}.",
    "Dados de autonomia só existem a partir de {data}.":
      "Los datos de autonomía solo existen a partir del {data}.",
    "Autonomia do agente": "Autonomía del agente",
    "{n} com intervenção humana": "{n} con intervención humana",
    "Volume no período": "Volumen en el período",
    "Conversas com pelo menos uma mensagem recebida ou enviada no período, mesmo que tenham começado antes.":
      "Conversaciones con al menos un mensaje recibido o enviado en el período, aunque hayan empezado antes.",
    "Conversas ativas": "Conversaciones activas",
    "Mensagens que os clientes finais enviaram.": "Mensajes que enviaron los clientes finales.",
    "Mensagens recebidas": "Mensajes recibidos",
    "Todas as mensagens enviadas: agente, equipe e follow-ups.":
      "Todos los mensajes enviados: agente, equipo y seguimientos.",
    "Mensagens enviadas": "Mensajes enviados",
    "Contatos distintos criados pela primeira vez no período.":
      "Contactos distintos creados por primera vez en el período.",
    "Novos contatos": "Contactos nuevos",
    "Qualidade do atendimento": "Calidad de la atención",
    "Tempo médio até a primeira resposta automática, nas conversas iniciadas no período em que essa resposta chegou em menos de uma hora.":
      "Tiempo medio hasta la primera respuesta automática, en las conversaciones iniciadas en el período en las que esa respuesta llegó en menos de una hora.",
    "Primeira resposta": "Primera respuesta",
    "{n} conversas": "{n} conversaciones",
    "Respostas do agente fora de 9h-19h ou no fim de semana. É o que o agente cobre e uma pessoa não cobriria.":
      "Respuestas del agente fuera de 9 a 19 h o en fin de semana. Es lo que cubre el agente y una persona no cubriría.",
    "Fora do horário": "Fuera de horario",
    "{fora} de {total} respostas": "{fora} de {total} respuestas",
    "Mensagens automáticas de retomada efetivamente registradas no período.":
      "Mensajes automáticos de seguimiento realmente registrados en el período.",
    "Follow-ups enviados": "Seguimientos enviados",
    "Das conversas que receberam follow-up rápido, quantas voltaram a responder.":
      "De las conversaciones que recibieron un seguimiento rápido, cuántas volvieron a responder.",
    "Recuperação por follow-up": "Recuperación por seguimiento",
    "{voltaram} de {total} voltaram": "{voltaram} de {total} volvieron",
    "Conversas por canal": "Conversaciones por canal",
    "Sem canal": "Sin canal",
    "Sem conversas por canal no período.": "Sin conversaciones por canal en el período.",
    "Serviços mais agendados": "Servicios más reservados",
    "Sem agendamentos no período.": "Sin citas en el período.",
    "Agendamentos por dia": "Citas por día",
    "Horários de pico": "Horas pico",
    "As oito horas com mais mensagens recebidas, no fuso do cliente.":
      "Las ocho horas con más mensajes recibidos, en la zona horaria del cliente.",
    "As conversas já estão conectadas. Agendamentos e follow-ups entram assim que a fonte de métricas deste cliente estiver conectada ao painel.":
      "Las conversaciones ya están conectadas. Las citas y los seguimientos aparecerán en cuanto la fuente de métricas de este cliente esté conectada al panel.",
    "Canal não identificado": "Canal no identificado",
    "Ver conversas": "Ver conversaciones",
    Cliente: "Cliente",
    "Todos os clientes": "Todos los clientes",
    Canal: "Canal",
    "Aplicar filtros": "Aplicar filtros",
    "Vários fusos horários": "Varias zonas horarias",
    "Primeira mensagem recebida de cada conversa dentro do período.":
      "Primer mensaje recibido de cada conversación dentro del período.",
    "Os agendamentos não possuem canal associado e não podem ser filtrados com segurança.":
      "Las citas no tienen un canal asociado y no se pueden filtrar con seguridad.",
    "Agendamentos válidos criados no período, conforme o estado de cada cliente.":
      "Citas válidas creadas en el período, según el estado de cada cliente.",
    "Indisponível com filtro de canal, pois os agendamentos não registram essa origem.":
      "No disponible con filtro de canal, porque las citas no registran ese origen.",
    "Agendamentos divididos pelas conversas iniciadas no mesmo período; sem atribuição individual.":
      "Citas divididas entre las conversaciones iniciadas en el mismo período; sin atribución individual.",
    "Conversas resolvidas sem ninguém da equipe escrever. Dados confiáveis a partir de {data}.":
      "Conversaciones resueltas sin que nadie del equipo escribiera. Datos fiables a partir del {data}.",
    "Dados de autonomia disponíveis a partir de {data}.":
      "Datos de autonomía disponibles a partir del {data}.",
    "Captação e retomada": "Captación y seguimiento",
    "Conversas que receberam follow-up rápido e voltaram a responder.":
      "Conversaciones que recibieron un seguimiento rápido y volvieron a responder.",
    "{voltaram} de {total} voltaram a responder": "{voltaram} de {total} volvieron a responder",
    "Respostas enviadas fora de 9h-19h ou no fim de semana.":
      "Respuestas enviadas fuera de 9 a 19 h o en fin de semana.",
    Atendimento: "Atención",
    "Conversas com pelo menos uma mensagem recebida ou enviada no período.":
      "Conversaciones con al menos un mensaje recibido o enviado en el período.",
    "Tempo até a primeira resposta automática, nas conversas respondidas em menos de 1h.":
      "Tiempo hasta la primera respuesta automática, en las conversaciones respondidas en menos de 1 h.",
    "Mensagens recebidas dos clientes finais.": "Mensajes recibidos de los clientes finales.",
    "Todas as mensagens enviadas, incluindo agente, equipe e follow-ups.":
      "Todos los mensajes enviados, incluidos agente, equipo y seguimientos.",
    "Handoffs reais ainda pendentes.": "Derivaciones reales aún pendientes.",
    "Handoffs pendentes": "Derivaciones pendientes",
    "Feedbacks ainda pendentes de análise.": "Comentarios aún pendientes de revisión.",
    "Feedbacks pendentes": "Comentarios pendientes",
    "Conversas iniciadas por canal": "Conversaciones iniciadas por canal",
    "Mensagens recebidas por dia e hora. Na visão geral usa o fuso da plataforma; ao filtrar um cliente, o fuso do cliente.":
      "Mensajes recibidos por día y hora. En la vista general usa la zona horaria de la plataforma; al filtrar un cliente, la del cliente.",
    "Clientes no período": "Clientes en el período",
    Iniciadas: "Iniciadas",
    Canais: "Canales",
    Recebidas: "Recibidos",
    Enviadas: "Enviados",
    Relação: "Relación",
    Autonomia: "Autonomía",
    "Follow-ups": "Seguimientos",
    Pendências: "Pendientes",
    Workflows: "Workflows",
    Ações: "Acciones",
    "Sem valor": "Sin valor",
    "Modo teste": "Modo de prueba",
    Produção: "Producción",
    "{n} ativas": "{n} activas",
    "Não identificado: {n}": "No identificado: {n}",
    "{n} com intervenção": "{n} con intervención",
    Feedbacks: "Comentarios",
    "Nenhum cliente encontrado com os filtros atuais.":
      "No se encontró ningún cliente con los filtros actuales.",
    "Últimas conversas iniciadas": "Últimas conversaciones iniciadas",
    "Ver todas": "Ver todas",
    "Sem nome": "Sin nombre",
    "Sem data": "Sin fecha",
    "Ainda não há conversas reais registradas neste período.":
      "Todavía no hay conversaciones reales registradas en este período.",

    // Faixa de campanhas
    "O gasto da Meta é sincronizado uma vez por dia, às 06:00 UTC. O número de hoje é o que havia na hora da sincronização; para vê-lo em tempo real, use o Atualizar.":
      "El gasto de Meta se sincroniza una vez al día, a las 06:00 UTC. La cifra de hoy es la que había a la hora de la sincronización; para verla al minuto, usa Actualizar.",
    Campanhas: "Campañas",
    "Ver campanhas": "Ver campañas",
    "Soma do que a Meta cobrou nos dias do período, no fuso da conta de anúncios.":
      "Suma de lo que Meta cobró en los días del período, en la zona horaria de la cuenta publicitaria.",
    Investido: "Invertido",
    "Investido dividido por todas as conversas iniciadas no período, e não só pelas que vieram de anúncio. Por isso é um limite superior do custo real de uma conversa paga.":
      "Lo invertido dividido entre todas las conversaciones iniciadas en el período, no solo las que vinieron de un anuncio. Por eso es un límite superior del costo real de una conversación pagada.",
    "Custo por conversa": "Costo por conversación",
    "{n} conversa iniciada": "{n} conversación iniciada",
    "{n} conversas iniciadas": "{n} conversaciones iniciadas",
    "Cliques em qualquer parte do anúncio.": "Clics en cualquier parte del anuncio.",
    Cliques: "Clics",
    "{n} no link": "{n} en el enlace",
    "Custo por mil impressões, recalculado do total do período.":
      "Costo por mil impresiones, recalculado con el total del período.",
    "A conta de anúncios da Meta está conectada, mas não há gasto sincronizado neste período.":
      "La cuenta publicitaria de Meta está conectada, pero no hay gasto sincronizado en este período.",
    'Em Campanhas, você pode puxar o histórico com "Atualizar dados".':
      'En Campañas puedes traer el historial con "Actualizar datos".',
  },
  en: {
    "1 workflow": "1 workflow",
    "{n} pendências": "{n} pending",
    "Sem pendências": "Nothing pending",
    "{n} workflows": "{n} workflows",
    "conversas": "conversations",
    "agendamentos": "appointments",
    "{dia}, {hora}h: {n} mensagens": "{dia}, {hora}h: {n} messages",
    "Passe o mouse para ver cada horário.": "Hover to see each time slot.",
    "{n} conversas ativas": "{n} active conversations",
    "{n} conversas esperando resposta.": "{n} conversations waiting for a reply.",
    "1 conversa esperando resposta.": "1 conversation waiting for a reply.",
    "{taxa} das conversas": "{taxa} of conversations",
    "Conversas e agendamentos": "Conversations and appointments",
    "De onde vem cada conversa": "Where each conversation comes from",
    "Mensagens recebidas por dia da semana e hora, no fuso do cliente. Quanto mais escuro, mais movimento.": "Messages received by weekday and hour, in the customer's time zone. The darker, the busier.",
    "Ninguém esperando resposta.": "No one waiting for a reply.",
    "Por dia, no período": "Per day, in this period",
    "Por hora, hoje": "Per hour, today",
    "Sem conversas no período.": "No conversations in this period.",
    "visão geral": "overview",
    "Bom dia": "Good morning",
    "Boa tarde": "Good afternoon",
    "Boa noite": "Good evening",
    // Constantes partilhadas
    Hoje: "Today",
    "Esta semana": "This week",
    "Este mês": "This month",
    Personalizada: "Custom",
    "Todos os canais": "All channels",
    Seg: "Mon",
    Ter: "Tue",
    Qua: "Wed",
    Qui: "Thu",
    Sex: "Fri",
    Sáb: "Sat",
    Dom: "Sun",
    Brasília: "Brasília",
    Lisboa: "Lisbon",
    "Nova Iorque": "New York",

    // Dashboard do cliente e do admin
    Dashboard: "Dashboard",
    Conversas: "Conversations",
    Início: "Start",
    Fim: "End",
    "Aplicando...": "Applying...",
    Aplicar: "Apply",
    "no período": "in this period",
    Resultado: "Results",
    "Conversas em que a primeira mensagem do cliente caiu dentro do período escolhido.":
      "Conversations where the customer's first message arrived within the selected period.",
    "Conversas iniciadas": "Conversations started",
    "Agendamentos válidos criados no período, conforme o estado usado por este cliente.":
      "Valid appointments created in this period, based on the status this business uses.",
    Agendamentos: "Appointments",
    "Agendamentos divididos pelas conversas iniciadas no mesmo período. Não é atribuição individual: não diz que foi aquela conversa que gerou aquele agendamento.":
      "Appointments divided by conversations started in the same period. This isn't one-to-one attribution: it doesn't say that a given conversation led to a given appointment.",
    "Agendam. / conversa": "Appts. / conversation",
    "{agendamentos} para {conversas} conversas": "{agendamentos} for {conversas} conversations",
    "Porcentagem de conversas que o agente fechou sozinho. Dados a partir de {data}.":
      "Share of conversations the agent closed on its own. Data from {data} onward.",
    "Dados de autonomia só existem a partir de {data}.":
      "Autonomy data is only available from {data} onward.",
    "Autonomia do agente": "Agent autonomy",
    "{n} com intervenção humana": "{n} with human help",
    "Volume no período": "Volume in this period",
    "Conversas com pelo menos uma mensagem recebida ou enviada no período, mesmo que tenham começado antes.":
      "Conversations with at least one message received or sent in this period, even if they started earlier.",
    "Conversas ativas": "Active conversations",
    "Mensagens que os clientes finais enviaram.": "Messages sent by your customers.",
    "Mensagens recebidas": "Messages received",
    "Todas as mensagens enviadas: agente, equipe e follow-ups.":
      "All messages sent: agent, team and follow-ups.",
    "Mensagens enviadas": "Messages sent",
    "Contatos distintos criados pela primeira vez no período.":
      "Unique contacts created for the first time in this period.",
    "Novos contatos": "New contacts",
    "Qualidade do atendimento": "Service quality",
    "Tempo médio até a primeira resposta automática, nas conversas iniciadas no período em que essa resposta chegou em menos de uma hora.":
      "Average time to the first automatic reply, for conversations started in this period where that reply came within an hour.",
    "Primeira resposta": "First reply",
    "{n} conversas": "{n} conversations",
    "Respostas do agente fora de 9h-19h ou no fim de semana. É o que o agente cobre e uma pessoa não cobriria.":
      "Agent replies outside 9am–7pm or on weekends. It's what the agent covers that a person wouldn't.",
    "Fora do horário": "After hours",
    "{fora} de {total} respostas": "{fora} of {total} replies",
    "Mensagens automáticas de retomada efetivamente registradas no período.":
      "Automatic follow-up messages actually logged in this period.",
    "Follow-ups enviados": "Follow-ups sent",
    "Das conversas que receberam follow-up rápido, quantas voltaram a responder.":
      "Of the conversations that got a quick follow-up, how many replied again.",
    "Recuperação por follow-up": "Follow-up recovery",
    "{voltaram} de {total} voltaram": "{voltaram} of {total} came back",
    "Conversas por canal": "Conversations by channel",
    "Sem canal": "No channel",
    "Sem conversas por canal no período.": "No conversations by channel in this period.",
    "Serviços mais agendados": "Most booked services",
    "Sem agendamentos no período.": "No appointments in this period.",
    "Agendamentos por dia": "Appointments by day",
    "Horários de pico": "Peak hours",
    "As oito horas com mais mensagens recebidas, no fuso do cliente.":
      "The eight hours with the most messages received, in the business's time zone.",
    "As conversas já estão conectadas. Agendamentos e follow-ups entram assim que a fonte de métricas deste cliente estiver conectada ao painel.":
      "Conversations are already connected. Appointments and follow-ups will show up as soon as this business's metrics source is connected to the dashboard.",
    "Canal não identificado": "Unknown channel",
    "Ver conversas": "View conversations",
    Cliente: "Customer",
    "Todos os clientes": "All customers",
    Canal: "Channel",
    "Aplicar filtros": "Apply filters",
    "Vários fusos horários": "Multiple time zones",
    "Primeira mensagem recebida de cada conversa dentro do período.":
      "First message received in each conversation within this period.",
    "Os agendamentos não possuem canal associado e não podem ser filtrados com segurança.":
      "Appointments have no channel attached, so they can't be filtered reliably.",
    "Agendamentos válidos criados no período, conforme o estado de cada cliente.":
      "Valid appointments created in this period, based on each customer's status.",
    "Indisponível com filtro de canal, pois os agendamentos não registram essa origem.":
      "Unavailable with a channel filter, because appointments don't record that source.",
    "Agendamentos divididos pelas conversas iniciadas no mesmo período; sem atribuição individual.":
      "Appointments divided by conversations started in the same period; no one-to-one attribution.",
    "Conversas resolvidas sem ninguém da equipe escrever. Dados confiáveis a partir de {data}.":
      "Conversations resolved without anyone on the team writing. Reliable data from {data} onward.",
    "Dados de autonomia disponíveis a partir de {data}.":
      "Autonomy data available from {data} onward.",
    "Captação e retomada": "Acquisition and follow-up",
    "Conversas que receberam follow-up rápido e voltaram a responder.":
      "Conversations that got a quick follow-up and replied again.",
    "{voltaram} de {total} voltaram a responder": "{voltaram} of {total} replied again",
    "Respostas enviadas fora de 9h-19h ou no fim de semana.":
      "Replies sent outside 9am–7pm or on weekends.",
    Atendimento: "Service",
    "Conversas com pelo menos uma mensagem recebida ou enviada no período.":
      "Conversations with at least one message received or sent in this period.",
    "Tempo até a primeira resposta automática, nas conversas respondidas em menos de 1h.":
      "Time to the first automatic reply, for conversations answered within 1 hour.",
    "Mensagens recebidas dos clientes finais.": "Messages received from end customers.",
    "Todas as mensagens enviadas, incluindo agente, equipe e follow-ups.":
      "All messages sent, including agent, team and follow-ups.",
    "Handoffs reais ainda pendentes.": "Real handoffs still pending.",
    "Handoffs pendentes": "Pending handoffs",
    "Feedbacks ainda pendentes de análise.": "Feedback still waiting for review.",
    "Feedbacks pendentes": "Pending feedback",
    "Conversas iniciadas por canal": "Conversations started by channel",
    "Mensagens recebidas por dia e hora. Na visão geral usa o fuso da plataforma; ao filtrar um cliente, o fuso do cliente.":
      "Messages received by day and hour. The overview uses the platform's time zone; when you filter a customer, it uses theirs.",
    "Clientes no período": "Customers in this period",
    Iniciadas: "Started",
    Canais: "Channels",
    Recebidas: "Received",
    Enviadas: "Sent",
    Relação: "Ratio",
    Autonomia: "Autonomy",
    "Follow-ups": "Follow-ups",
    Pendências: "Pending",
    Workflows: "Workflows",
    Ações: "Actions",
    "Sem valor": "No value",
    "Modo teste": "Test mode",
    Produção: "Live",
    "{n} ativas": "{n} active",
    "Não identificado: {n}": "Unknown: {n}",
    "{n} com intervenção": "{n} with human help",
    Feedbacks: "Feedback",
    "Nenhum cliente encontrado com os filtros atuais.":
      "No customers match the current filters.",
    "Últimas conversas iniciadas": "Latest conversations started",
    "Ver todas": "View all",
    "Sem nome": "No name",
    "Sem data": "No date",
    "Ainda não há conversas reais registradas neste período.":
      "No real conversations logged in this period yet.",

    // Faixa de campanhas
    "O gasto da Meta é sincronizado uma vez por dia, às 06:00 UTC. O número de hoje é o que havia na hora da sincronização; para vê-lo em tempo real, use o Atualizar.":
      "Meta spend syncs once a day, at 06:00 UTC. Today's number is what it was at sync time; to see it up to the minute, use Refresh.",
    Campanhas: "Campaigns",
    "Ver campanhas": "View campaigns",
    "Soma do que a Meta cobrou nos dias do período, no fuso da conta de anúncios.":
      "Total Meta charged on the days in this period, in the ad account's time zone.",
    Investido: "Spent",
    "Investido dividido por todas as conversas iniciadas no período, e não só pelas que vieram de anúncio. Por isso é um limite superior do custo real de uma conversa paga.":
      "Spend divided by all conversations started in this period, not just the ones from ads. So it's an upper bound on the real cost of a paid conversation.",
    "Custo por conversa": "Cost per conversation",
    "{n} conversa iniciada": "{n} conversation started",
    "{n} conversas iniciadas": "{n} conversations started",
    "Cliques em qualquer parte do anúncio.": "Clicks anywhere on the ad.",
    Cliques: "Clicks",
    "{n} no link": "{n} on the link",
    "Custo por mil impressões, recalculado do total do período.":
      "Cost per thousand impressions, recalculated from the period total.",
    "A conta de anúncios da Meta está conectada, mas não há gasto sincronizado neste período.":
      "The Meta ad account is connected, but there's no synced spend for this period.",
    'Em Campanhas, você pode puxar o histórico com "Atualizar dados".':
      'In Campaigns, you can pull the history with "Refresh data".',
  },
};

export default textos;
