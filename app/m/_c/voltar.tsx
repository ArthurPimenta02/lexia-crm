"use client";

import { useRouter } from "next/navigation";

import { IcVoltar } from "./icones";

/** Volta à tela de onde se veio; sem histórico (aberto por um aviso), vai para `reserva`. */
export function BotaoVoltar({ reserva, rotulo }: { reserva: string; rotulo: string }) {
  const router = useRouter();
  return (
    <button aria-label={rotulo} className="m-redondo" onClick={() => (window.history.length > 1 ? router.back() : router.replace(reserva))} type="button">
      <IcVoltar tamanho={17} />
    </button>
  );
}
