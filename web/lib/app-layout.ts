const DEDICATED_APP_SHELL_PREFIXES = ["/workspace", "/admin"] as const;
const DEDICATED_APP_SHELL_ROUTES = new Set(["/login", "/workflows/new"]);

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
