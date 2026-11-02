import { NextRequest, NextResponse } from "next/server";

// Simple demo auth: stores a display name in an httpOnly cookie session.
const COOKIE = "cineora_session";

export async function GET(req: NextRequest) {
  const raw = req.cookies.get(COOKIE)?.value;
  if (!raw) return NextResponse.json({ user: null });
  try {
    const user = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    return NextResponse.json({ user });
  } catch {
    return NextResponse.json({ user: null });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { name?: string };
    const name = (body.name || "").trim().slice(0, 24);
    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    const user = { name };
    const res = NextResponse.json({ user });
    res.cookies.set(COOKIE, Buffer.from(JSON.stringify(user)).toString("base64url"), {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return res;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}
