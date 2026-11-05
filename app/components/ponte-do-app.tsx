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
type Capacitor = {
  isNativePlatform?: () => boolean;
  Plugins?: { PushNotifications?: PushPlugin };
};

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
