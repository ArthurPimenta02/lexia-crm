/**
 * Ícones do app (traço 2, cantos redondos), com tamanho fixo para nunca
 * crescerem com o contentor. Todos decorativos: o texto ao lado diz o que é.
 */
type P = { tamanho?: number };
const base = (t = 20) => ({ "aria-hidden": true, height: t, viewBox: "0 0 24 24", width: t });
const traco = { fill: "none", stroke: "currentColor", strokeLinecap: "round" as const, strokeLinejoin: "round" as const, strokeWidth: 2 };

export const IcCasa = ({ tamanho }: P) => <svg {...base(tamanho)} {...traco}><path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z" /></svg>;
export const IcConversa = ({ tamanho }: P) => <svg {...base(tamanho)} {...traco}><path d="M20.5 11.5c0 4.4-3.8 7.5-8.5 7.5-1.2 0-2.3-.2-3.3-.6L4 20l1.2-3.6c-1-1.3-1.7-3-1.7-4.9C3.5 7.1 7.3 4 12 4s8.5 3.1 8.5 7.5z" /></svg>;
export const IcCalendario = ({ tamanho }: P) => <svg {...base(tamanho)} {...traco}><rect height="15.5" rx="3" width="17" x="3.5" y="5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></svg>;
export const IcBarras = ({ tamanho }: P) => <svg {...base(tamanho)} {...traco}><path d="M5 20V12M10 20V5M15 20v-9M20 20v-5" /></svg>;
export const IcBusca = ({ tamanho }: P) => <svg {...base(tamanho)} {...traco}><circle cx="11" cy="11" r="7" /><path d="m16.5 16.5 4 4" /></svg>;
export const IcSino = ({ tamanho }: P) => <svg {...base(tamanho)} {...traco}><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" /></svg>;
export const IcVoltar = ({ tamanho }: P) => <svg {...base(tamanho)} {...traco} strokeWidth={2.4}><path d="m15 5-7 7 7 7" /></svg>;
export const IcSeta = ({ tamanho = 14 }: P) => <svg {...base(tamanho)} {...traco} strokeWidth={2.4}><path d="m9 6 6 6-6 6" /></svg>;
export const IcMais = ({ tamanho }: P) => <svg {...base(tamanho)} {...traco} strokeWidth={2.2}><path d="M12 5v14M5 12h14" /></svg>;
export const IcPausa = ({ tamanho }: P) => <svg {...base(tamanho)} fill="currentColor"><rect height="14" rx="1.5" width="4" x="6" y="5" /><rect height="14" rx="1.5" width="4" x="14" y="5" /></svg>;
export const IcPlay = ({ tamanho = 14 }: P) => <svg {...base(tamanho)} fill="currentColor"><path d="M7 4.5v15l13-7.5z" /></svg>;
export const IcMic = ({ tamanho }: P) => <svg {...base(tamanho)} {...traco} strokeWidth={2.2}><rect height="12" rx="3" width="6" x="9" y="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>;
export const IcEnviar = ({ tamanho }: P) => <svg {...base(tamanho)} fill="currentColor"><path d="M3.4 20.4 21 12 3.4 3.6l.1 6.5L15 12l-11.5 1.9z" /></svg>;
export const IcTelefone = ({ tamanho }: P) => <svg {...base(tamanho)} {...traco}><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" /></svg>;
export const IcCamara = ({ tamanho }: P) => <svg {...base(tamanho)} {...traco}><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>;
export const IcGaleria = ({ tamanho }: P) => <svg {...base(tamanho)} {...traco}><rect height="15" rx="3" width="17" x="3.5" y="4.5" /><circle cx="9" cy="10" r="1.8" /><path d="m4 17 5-4.5 4 3.5 3-2.5 4 3.5" /></svg>;
export const IcDocumento = ({ tamanho }: P) => <svg {...base(tamanho)} {...traco}><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4" /></svg>;
export const IcPessoa = ({ tamanho }: P) => <svg {...base(tamanho)} {...traco}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>;
export const IcRobo = ({ tamanho = 12 }: P) => <svg {...base(tamanho)} fill="currentColor"><rect height="12" rx="4" width="16" x="4" y="7" /><rect height="4" width="2" x="11" y="3" /></svg>;
export const IcCheck = ({ tamanho }: P) => <svg {...base(tamanho)} {...traco} strokeWidth={2.4}><path d="M5 12.5l4.2 4.2L19 7" /></svg>;
export const IcRelogio = ({ tamanho }: P) => <svg {...base(tamanho)} {...traco}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>;
export const IcLua = ({ tamanho }: P) => <svg {...base(tamanho)} {...traco}><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" /></svg>;
export const IcEuro = ({ tamanho }: P) => <svg {...base(tamanho)} {...traco} strokeWidth={2.2}><path d="M17 6.5A7 7 0 1 0 17 17.5M4 10h9M4 14h9" /></svg>;
export const IcSair = ({ tamanho }: P) => <svg {...base(tamanho)} {...traco}><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H4" /></svg>;
export const IcGlobo = ({ tamanho }: P) => <svg {...base(tamanho)} {...traco}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.7 2.5 15.3 0 18M12 3c-2.5 2.7-2.5 15.3 0 18" /></svg>;
export const IcRosto = ({ tamanho }: P) => <svg {...base(tamanho)} {...traco}><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2M9 9.5v1M15 9.5v1M12 9.5V13h-1M9.5 16a4 4 0 0 0 5 0" /></svg>;
export const IcBloquear = ({ tamanho }: P) => <svg {...base(tamanho)} {...traco}><circle cx="12" cy="12" r="8.5" /><path d="M6 6l12 12" /></svg>;
export const IcEmpresa = ({ tamanho }: P) => <svg {...base(tamanho)} {...traco}><path d="M4 20V8l8-4 8 4v12M9 20v-5h6v5M4 20h16" /></svg>;
export const IcWhatsapp = ({ tamanho = 20 }: P) => <svg {...base(tamanho)} fill="currentColor"><path d="M12 2.5a9.5 9.5 0 0 0-8.2 14.3L2.5 21.5l4.9-1.3A9.5 9.5 0 1 0 12 2.5zm5.3 13.3c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.2-.7-2.7-1.1-4.4-3.8-4.5-4-.1-.2-1.1-1.4-1.1-2.7s.7-1.9.9-2.2c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.3 0 .5l-.4.6-.3.4c-.1.1-.3.3-.1.6.2.3.7 1.2 1.6 2 1.1 1 2 1.3 2.3 1.4.3.1.5.1.6-.1l.9-1c.2-.3.4-.2.6-.1l1.9.9c.3.1.5.2.5.3.1.2.1.7-.1 1.3z" /></svg>;
export const IcInstagram = ({ tamanho = 20 }: P) => <svg {...base(tamanho)} {...traco}><rect height="17" rx="5" width="17" x="3.5" y="3.5" /><circle cx="12" cy="12" r="3.8" /><circle cx="17.2" cy="6.8" fill="currentColor" r="1" stroke="none" /></svg>;
export const IcMessenger = ({ tamanho = 20 }: P) => <svg {...base(tamanho)} fill="currentColor"><path d="M12 2.8c-5.1 0-9.2 3.8-9.2 8.7 0 2.7 1.3 5.1 3.4 6.7v3.3l3.1-1.7c.9.2 1.8.4 2.7.4 5.1 0 9.2-3.9 9.2-8.7S17.1 2.8 12 2.8zm1 11.7-2.4-2.5-4.6 2.5 5-5.4 2.4 2.5 4.6-2.5z" /></svg>;
export const IcCanal = ({ canal, tamanho }: { canal: string; tamanho?: number }) =>
  canal === "instagram" ? <IcInstagram tamanho={tamanho} /> : canal === "messenger" ? <IcMessenger tamanho={tamanho} /> : <IcWhatsapp tamanho={tamanho} />;
