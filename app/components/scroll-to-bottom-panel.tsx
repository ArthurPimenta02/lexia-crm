"use client";

import { useEffect, useRef, type ReactNode } from "react";

type ScrollToBottomPanelProps = {
  children: ReactNode;
  className: string;
  scrollKey: string;
};

export function ScrollToBottomPanel({
  children,
  className,
  scrollKey,
}: ScrollToBottomPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    const scrollToBottom = () => {
      container.scrollTop = container.scrollHeight;
    };

    scrollToBottom();
    const frame = requestAnimationFrame(scrollToBottom);
    const shortTimer = window.setTimeout(scrollToBottom, 120);
    const imageTimer = window.setTimeout(scrollToBottom, 450);

    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(shortTimer);
      window.clearTimeout(imageTimer);
    };
  }, [scrollKey]);

  return (
    <div className={className} ref={containerRef}>
      {children}
    </div>
  );
}
