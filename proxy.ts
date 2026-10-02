import { NextResponse, type NextRequest } from "next/server";
import { DEFAULT_LANG, LANGS } from "./lib/i18n/config";

const PREFIXED = LANGS.filter((l) => l !== DEFAULT_LANG);

/**
 * English is served without a prefix ("/object/sirius"); other languages live under
 * their prefix ("/ru/…", "/zh/…"). Unprefixed paths are rewritten to the internal "/en" tree, and "/en/…" URLs
 * redirect to their unprefixed form so every page has exactly one public address.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const prefix = `/${DEFAULT_LANG}`;
  if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.slice(prefix.length) || "/";
    return NextResponse.redirect(url, 308);
  }
  if (PREFIXED.some((l) => pathname === `/${l}` || pathname.startsWith(`/${l}/`))) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = `${prefix}${pathname === "/" ? "" : pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  // Pages only: skip API routes, Next internals and files (sitemap.xml, robots.txt, favicon.ico).
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};
