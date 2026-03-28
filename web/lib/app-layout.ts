const DEDICATED_APP_SHELL_PREFIXES = ["/workspace", "/admin", "/workflows", "/workspace-starters"] as const;
const DEDICATED_APP_SHELL_ROUTES = new Set(["/login"]);

export function shouldBypassGlobalAppLayout(pathname: string | null | undefined) {
  if (!pathname) {
    return false;
  }

  if (DEDICATED_APP_SHELL_ROUTES.has(pathname)) {
    return true;
  }

  return DEDICATED_APP_SHELL_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}
