"use client";

import { LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";

type SidebarNavItem = {
  label: string;
  href: string;
};

type SidebarNavProps = {
  groupLabel: string;
  items: SidebarNavItem[];
  onNavigate?: () => void;
  variant?: "light" | "dark";
};

function SidebarLinkStatus() {
  const { pending } = useLinkStatus();

  return (
    <span
      aria-hidden="true"
      className="flex h-4 w-4 shrink-0 items-center justify-center"
    >
      <LoaderCircle
        className={`h-4 w-4 animate-spin transition-opacity ${
          pending ? "opacity-100" : "opacity-0"
        }`}
      />
    </span>
  );
}

export function SidebarNav({
  groupLabel,
  items,
  onNavigate,
  variant = "light",
}: SidebarNavProps) {
  const pathname = usePathname();
  const isDark = variant === "dark";

  return (
    <nav className="flex flex-1 flex-col gap-3">
      <div>
        <p className="mb-3 px-3 text-xs font-semibold tracking-[0.28em] text-zinc-500 uppercase">
          {groupLabel}
        </p>
        <div className="flex flex-col gap-1.5">
          {items.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/app" &&
                item.href !== "/admin" &&
                pathname.startsWith(`${item.href}/`));

            return (
              <Link
                className={`flex min-h-11 items-center justify-between gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition ${
                  isActive
                    ? isDark
                      ? "bg-zinc-50 text-zinc-950 shadow-sm"
                      : "bg-zinc-950 text-white shadow-sm"
                    : isDark
                      ? "text-zinc-300 hover:bg-white/10 hover:text-white"
                      : "text-zinc-600 hover:bg-[#ecebe7] hover:text-zinc-950"
                }`}
                href={item.href}
                key={item.href}
                onClick={onNavigate}
              >
                <span>{item.label}</span>
                <SidebarLinkStatus />
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
