/**
 * Clientes que NÃO aparecem nas telas do admin (24/11, Arthur: "tira a Asteric daqui; deixa só se eu quiser logar
 * como Asteric"). Nada é apagado: os dados ficam, e o login da própria conta continua a abrir o painel dela.
 * Só sai das listas, do acesso rápido, dos seletores e dos painéis de visão geral do admin.
 */
/**
 * 28/11, Arthur: "remove esse Detail teste … remove também o demo" — as contas internas "Detail (teste)" (cliente_teste)
 * e "Demo Dev Lexia" (clinica_teste) saem também. O login da demo continua a funcionar.
 */
export const OCULTOS_NO_ADMIN: readonly string[] = ["asteric", "cliente_teste", "clinica_teste"];

/**
 * Filtro dos seletores de cliente do admin: os no ar E os que estão em teste (28/11: a Jessica, ainda "inativo"
 * na base, tem de aparecer). Para `.or(NO_AR_OU_EM_TESTE)`.
 */
export const NO_AR_OU_EM_TESTE = "status.eq.ativo,modo_teste.eq.true";

/** Para `.not("slug", "in", FILTRO_OCULTOS)` nas consultas a lexia_clientes. */
export const FILTRO_OCULTOS = `(${OCULTOS_NO_ADMIN.join(",")})`;

export const ocultoNoAdmin = (slug: string | null | undefined) => !!slug && OCULTOS_NO_ADMIN.includes(slug);
