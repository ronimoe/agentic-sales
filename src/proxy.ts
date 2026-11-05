import { NextResponse, type NextRequest } from "next/server";

/** Password gate for the whole app. Webhooks verify their own signatures. In production a password is mandatory. */
export function proxy(req: NextRequest) {
  if (req.nextUrl.pathname.startsWith("/api/webhooks/")) return NextResponse.next();
  const password = process.env.APP_PASSWORD;
  if (!password) {
    if (process.env.NODE_ENV === "production") return new NextResponse("Set APP_PASSWORD before running in production", { status: 503 });
    return NextResponse.next();
  }
  const [scheme, value] = (req.headers.get("authorization") ?? "").split(" ");
  if (scheme === "Basic" && value) {
    const decoded = atob(value);
    if (decoded.slice(decoded.indexOf(":") + 1) === password) return NextResponse.next();
  }
  return new NextResponse("Authentication required", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="Laris"' } });
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
