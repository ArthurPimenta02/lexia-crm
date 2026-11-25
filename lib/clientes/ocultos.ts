/**
 * Clientes que NÃO aparecem nas telas do admin (24/11, Arthur: "tira a Asteric daqui; deixa só se eu quiser logar
 * como Asteric"). Nada é apagado: os dados ficam, e o login da própria conta continua a abrir o painel dela.
 * Só sai das listas, do acesso rápido, dos seletores e dos painéis de visão geral do admin.
 */
export const OCULTOS_NO_ADMIN: readonly string[] = ["asteric"];

/** Para `.not("slug", "in", FILTRO_OCULTOS)` nas consultas a lexia_clientes. */
export const FILTRO_OCULTOS = `(${OCULTOS_NO_ADMIN.join(",")})`;

export const ocultoNoAdmin = (slug: string | null | undefined) => !!slug && OCULTOS_NO_ADMIN.includes(slug);
