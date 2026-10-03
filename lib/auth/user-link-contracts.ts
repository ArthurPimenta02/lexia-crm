export type ClientUserLink = {
  cliente_slug: string | null;
  role: string;
  status: string;
};

export type DesiredClientUserLink = {
  cliente_slug: string;
  role: "cliente_admin" | "cliente_operador";
  status: "ativo" | "inativo";
};

function isSameLink(
  current: ClientUserLink,
  desired: DesiredClientUserLink,
) {
  return (
    current.cliente_slug === desired.cliente_slug &&
    current.role === desired.role &&
    current.status === desired.status
  );
}

export function getUserLinkRetryDecision(
  currentLinks: ClientUserLink[],
  desired: DesiredClientUserLink,
): "already_linked" | "conflict" | "create" {
  if (currentLinks.some((link) => !isSameLink(link, desired))) {
    return "conflict";
  }

  return currentLinks.some((link) => isSameLink(link, desired))
    ? "already_linked"
    : "create";
}
