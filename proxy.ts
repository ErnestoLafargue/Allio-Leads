import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

/**
 * Next.js 16: `proxy.ts` (Node.js) erstatter deprecated `middleware.ts` (Edge).
 * Session tjekkes via JWT-cookie — må ikke importere @/auth (Prisma).
 */
export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isLogin = path === "/login";

  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  const useSecureCookies =
    request.nextUrl.protocol === "https:" || process.env.NODE_ENV === "production";

  let loggedIn = false;
  if (secret) {
    try {
      const token = await getToken({
        req: request,
        secret,
        secureCookie: useSecureCookies,
      });
      loggedIn = !!token;
    } catch {
      loggedIn = false;
    }
  }

  if (!loggedIn && !isLogin) {
    return NextResponse.redirect(new URL("/login", request.nextUrl.origin));
  }
  if (loggedIn && isLogin) {
    return NextResponse.redirect(new URL("/leads", request.nextUrl.origin));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
