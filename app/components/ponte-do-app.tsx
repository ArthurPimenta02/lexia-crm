"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * A ponte entre o painel e o app do iPhone.
 *
 * O app é uma casca (Capacitor) que abre este mesmo painel. Dentro dela existe
 * `window.Capacitor` com os plugins nativos; num navegador normal não existe e
 * este componente não faz nada.
 *
 * O que faz dentro do app:
 * 1. pede licença para avisos (a primeira vez) e regista o iPhone no painel;
 * 2. quando a pessoa toca num aviso, abre a tela que o aviso traz (`url`);
 * 3. põe a classe `no-app` no `<html>`, que liga o modo app (barra de abas).
 */

type Ouvinte = { remove: () => Promise<void> };
type PushPlugin = {
  addListener: (
    evento: string,
    funcao: (dados: never) => void,
  ) => Promise<Ouvinte>;
  checkPermissions: () => Promise<{ receive: string }>;
  register: () => Promise<void>;
  requestPermissions: () => Promise<{ receive: string }>;
};
type WidgetPlugin = {
  atualizarWidget?: () => Promise<void>;
  definirWidget?: (o: { base: string; token: string }) => Promise<{ ok: boolean }>;
};
type Capacitor = {
  isNativePlatform?: () => boolean;
  Plugins?: { LexiaNativo?: WidgetPlugin; PushNotifications?: PushPlugin };
};

/**
 * Liga o widget do iPhone (25/11): pede uma chave nova quando não há, quando
 * mudou a empresa ou passados 7 dias, e entrega-a ao nativo. Versões do app
 * sem widget não têm `definirWidget` e isto não faz nada.
 */
async function ligarWidget(nativo: WidgetPlugin | undefined) {
  if (!nativo?.definirWidget) return;
  let marca: { em: number; slug: string } | null = null;
  try { marca = JSON.parse(localStorage.getItem("lexia_widget") ?? "null"); } catch { marca = null; }
  if (marca && Date.now() - marca.em < 7 * 86_400_000) {
    void nativo.atualizarWidget?.();
    return;
  }
  const r = await fetch("/api/app/widget/token", { method: "POST" }).catch(() => null);
  if (!r?.ok) return;
  const d = (await r.json()) as { base: string; slug: string; token: string };
  const feito = await nativo.definirWidget({ base: d.base, token: d.token }).catch(() => null);
  if (feito?.ok) {
    try { localStorage.setItem("lexia_widget", JSON.stringify({ em: Date.now(), slug: d.slug })); } catch { /* sem armazenamento: pede de novo na próxima */ }
  }
}

/** Depois de marcar/remarcar/cancelar: o widget atualiza já, sem esperar 15 min. */
export function atualizarWidgetDoIphone() {
  const nativo = (window as unknown as { Capacitor?: Capacitor }).Capacitor?.Plugins?.LexiaNativo;
  void nativo?.atualizarWidget?.().catch(() => undefined);
}

/**
 * Para onde vai um toque num aviso. Só telas do próprio painel: um aviso nunca
 * abre um site de fora. Os avisos antigos apontam para o painel do computador
 * (/app/...); dentro do app vão para as telas do iPhone (/m/...).
 */
export function destinoDoAviso(url: unknown): string | null {
  if (typeof url !== "string" || url.includes("//") || url.includes("\\")) return null;
  if (/^\/m(\/|\?|$)/.test(url)) return url;
  if (!/^\/app(\/|\?|$)/.test(url)) return null;
  const [caminho, busca = ""] = url.split("?");
  const conversa = new URLSearchParams(busca).get("conversa");
  if (caminho === "/app/conversas" && conversa) return `/m/conversas/${encodeURIComponent(conversa)}`;
  if (caminho.startsWith("/app/agenda")) return "/m/agenda";
  if (caminho.startsWith("/app/conversas")) return "/m/conversas";
  return "/m";
}

/** Caminho do painel do computador → a tela equivalente do app; `null` se já está no app. */
export function paraAsTelasDoApp(caminho: string, busca = ""): string | null {
  if (!/^\/(app|admin)(\/|$)/.test(caminho)) return null;
  return destinoDoAviso(`${caminho.replace(/^\/admin/, "/app")}${busca}`) ?? "/m";
}

export function PonteDoApp() {
  const router = useRouter();

  useEffect(() => {
    const capacitor = (window as unknown as { Capacitor?: Capacitor })
      .Capacitor;
    const push = capacitor?.Plugins?.PushNotifications;

    if (!capacitor?.isNativePlatform?.()) {
      return;
    }

    // Marca o documento: o CSS mostra a barra de abas e ajusta o resto (globals.css).
    document.documentElement.classList.add("no-app");

    // Dentro do app, o painel do computador (/app, /admin) nunca aparece: vai
    // sempre para as telas do iPhone (/m). Acontecia ao sair e entrar de novo
    // numa versão do app que ainda abria o painel antigo.
    const destinoNoApp = paraAsTelasDoApp(window.location.pathname, window.location.search);
    if (destinoNoApp) {
      window.location.replace(destinoNoApp);
      return;
    }

    void ligarWidget(capacitor?.Plugins?.LexiaNativo);

    if (!push) {
      return;
    }

    const ouvintes: Promise<Ouvinte>[] = [
      push.addListener("registration", (token: { value: string }) => {
        void fetch("/api/app/aparelho", {
          body: JSON.stringify({ token: token.value }),
          headers: { "content-type": "application/json" },
          method: "POST",
        });
      }),
      push.addListener(
        "pushNotificationActionPerformed",
        (accao: { notification?: { data?: { url?: unknown } } }) => {
          const destino = destinoDoAviso(accao.notification?.data?.url);

          if (destino) {
            router.push(destino);
          }
        },
      ),
    ];

    void (async () => {
      let estado = (await push.checkPermissions()).receive;

      if (estado === "prompt" || estado === "prompt-with-rationale") {
        estado = (await push.requestPermissions()).receive;
      }

      if (estado === "granted") {
        await push.register();
      }
    })();

    return () => {
      for (const ouvinte of ouvintes) {
        void ouvinte.then((o) => o.remove());
      }
    };
  }, [router]);

  return null;
}
