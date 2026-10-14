export type SettingsRefreshState = {
  refreshToken: string | null;
  type: "success" | "error" | null;
};

export function getSettingsRefreshTokenToApply(
  state: SettingsRefreshState,
  appliedToken: string | null,
) {
  if (
    state.type !== "success" ||
    !state.refreshToken ||
    state.refreshToken === appliedToken
  ) {
    return null;
  }

  return state.refreshToken;
}
