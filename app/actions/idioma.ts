"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import { COOKIE_IDIOMA, eIdioma } from "@/lib/i18n/idiomas";
import { COOKIE_TEMA, eTema } from "@/lib/tema";

/** Guarda a escolha neste navegador por um ano e redesenha o painel. */
export async function mudarIdiomaAction(idioma: string) {
  if (!eIdioma(idioma)) return;
  (await cookies()).set(COOKIE_IDIOMA, idioma, {
    httpOnly: false,
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
    sameSite: "lax",
  });
  revalidatePath("/", "layout");
}

/** Guarda o tema neste navegador por um ano. */
export async function mudarTemaAction(tema: string) {
  if (!eTema(tema)) return;
  (await cookies()).set(COOKIE_TEMA, tema, {
    httpOnly: false,
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
    sameSite: "lax",
  });
}
