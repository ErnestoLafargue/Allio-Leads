import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

/**
 * Edge Middleware må ikke importere @/auth (Prisma/bcrypt).
 * Session tjekkes via JWT-cookie med getToken — fejl må ikke kaste 500 (Vercel: MIDDLEWARE_INVOCATION_FAILED).
 */
export async function middleware(request: NextRequest) {
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
