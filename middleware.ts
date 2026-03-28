import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

/**
 * Edge Middleware må ikke importere @/auth (Prisma/bcrypt). Session tjekkes via JWT-cookie.
 */
export async function middleware(request: NextRequest) {
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET,
    secureCookie: process.env.NODE_ENV === "production",
  });

  const loggedIn = !!token;
  const path = request.nextUrl.pathname;
  const isLogin = path === "/login";

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
