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

/** Só caminhos do próprio painel: um aviso nunca abre um site de fora. */
export function destinoDoAviso(url: unknown): string | null {
  return typeof url === "string" && /^\/app(\/|\?|$)/.test(url) ? url : null;
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
