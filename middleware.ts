import { auth } from "@/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const loggedIn = !!req.auth;
  const path = req.nextUrl.pathname;
  const isLogin = path === "/login";

  if (!loggedIn && !isLogin) {
    return NextResponse.redirect(new URL("/login", req.nextUrl.origin));
  }
  if (loggedIn && isLogin) {
    return NextResponse.redirect(new URL("/leads", req.nextUrl.origin));
  }
  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
