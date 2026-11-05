"use client";

import { ChevronLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * Puxar da borda esquerda para voltar, dentro do app do iPhone.
 *
 * O gesto nativo do WKWebView (allowsBackForwardNavigationGestures) não pegou
 * nas trocas de página do painel (navegação do Next sem recarregar). Este
 * faz o mesmo em JavaScript: o dedo começa a menos de 24 px da borda, anda
 * para a direita mais do que para cima/baixo, e ao soltar depois de 70 px a
 * página volta. Uma setinha acompanha o dedo, para se ver que vai voltar.
 *
 * Só liga dentro do app (classe `no-app`, posta pela PonteDoApp).
 */
export const BORDA_PX = 24;
export const DISTANCIA_PX = 70;

export function decideVoltar(inicioX: number, dx: number, dy: number) {
  return inicioX <= BORDA_PX && dx >= DISTANCIA_PX && Math.abs(dy) < dx * 0.6;
}

export function GestoVoltar() {
  const router = useRouter();
  const [puxado, setPuxado] = useState(0);
  const toque = useRef<{ x: number; y: number; activo: boolean } | null>(null);

  useEffect(() => {
    const noApp = () => document.documentElement.classList.contains("no-app");

    const inicio = (e: TouchEvent) => {
      const t = e.touches[0];
      toque.current = noApp() && t && t.clientX <= BORDA_PX ? { activo: true, x: t.clientX, y: t.clientY } : null;
    };
    const mover = (e: TouchEvent) => {
      const c = toque.current, t = e.touches[0];
      if (!c?.activo || !t) return;
      const dx = t.clientX - c.x, dy = t.clientY - c.y;
      if (Math.abs(dy) > Math.max(30, dx)) { c.activo = false; setPuxado(0); return; }
      setPuxado(Math.max(0, Math.min(dx, 120)));
    };
    const fim = (e: TouchEvent) => {
      const c = toque.current, t = e.changedTouches[0];
      toque.current = null;
      setPuxado(0);
      if (c?.activo && t && decideVoltar(c.x, t.clientX - c.x, t.clientY - c.y)) router.back();
    };

    document.addEventListener("touchstart", inicio, { passive: true });
    document.addEventListener("touchmove", mover, { passive: true });
    document.addEventListener("touchend", fim, { passive: true });
    document.addEventListener("touchcancel", fim, { passive: true });
    return () => {
      document.removeEventListener("touchstart", inicio);
      document.removeEventListener("touchmove", mover);
      document.removeEventListener("touchend", fim);
      document.removeEventListener("touchcancel", fim);
    };
  }, [router]);

  if (!puxado) return null;
  const pronto = puxado >= DISTANCIA_PX;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed left-0 top-1/2 z-[60] flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-sidebar-border bg-[var(--ds-vidro)] text-sidebar-foreground shadow-lg backdrop-blur-xl transition-[background-color,color] duration-100"
      style={{ transform: `translate(${puxado * 0.6 - 44}px, -50%)`, ...(pronto ? { background: "var(--primary)", color: "var(--primary-foreground)" } : {}) }}
    >
      <ChevronLeft className="h-5 w-5" />
    </div>
  );
}
