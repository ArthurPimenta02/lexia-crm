import type { TextosDaArea } from "../traduzir";

/**
 * Textos da Área de testes do app do iPhone (/m/testes). Só as chaves novas:
 * as que já existem noutra área (ex.: "Área de testes", "Enviar") ficam lá,
 * para a mesma chave nunca ter duas traduções.
 */
const textos: TextosDaArea = {
  "pt-PT": {
    "Sua sessão expirou. Entre de novo.": "A sua sessão expirou. Entre de novo.",
    "Conversa de teste nova. A anterior continua no painel.": "Conversa de teste nova. A anterior continua no painel.",
    "Escreva como se fosse um cliente. Nada é enviado a clientes reais.": "Escreva como se fosse um cliente. Nada é enviado a clientes reais.",
    "Nova conversa de teste": "Nova conversa de teste",
    "O agente ainda não respondeu. Toque para verificar de novo.": "O agente ainda não respondeu. Toque para verificar outra vez.",
    "O agente está pensando…": "O agente está a pensar…",
    "Teste do agente · {empresa}": "Teste do agente · {empresa}",
  },
  es: {
    "Sua sessão expirou. Entre de novo.": "Tu sesión ha caducado. Vuelve a entrar.",
    "Conversa de teste nova. A anterior continua no painel.": "Nueva conversación de prueba. La anterior sigue en el panel.",
    "Escreva como se fosse um cliente. Nada é enviado a clientes reais.": "Escribe como si fueras un cliente. No se envía nada a clientes reales.",
    "Nova conversa de teste": "Nueva conversación de prueba",
    "O agente ainda não respondeu. Toque para verificar de novo.": "El agente aún no ha respondido. Toca para comprobar de nuevo.",
    "O agente está pensando…": "El agente está pensando…",
    "Teste do agente · {empresa}": "Prueba del agente · {empresa}",
  },
  en: {
    "Sua sessão expirou. Entre de novo.": "Your session has expired. Please sign in again.",
    "Conversa de teste nova. A anterior continua no painel.": "New test chat. The previous one is still in the dashboard.",
    "Escreva como se fosse um cliente. Nada é enviado a clientes reais.": "Write as if you were a customer. Nothing is sent to real customers.",
    "Nova conversa de teste": "New test chat",
    "O agente ainda não respondeu. Toque para verificar de novo.": "The agent hasn't replied yet. Tap to check again.",
    "O agente está pensando…": "The agent is thinking…",
    "Teste do agente · {empresa}": "Agent test · {empresa}",
  },
};

export default textos;
