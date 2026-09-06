// input: next/server, @/lib/operator-session/facade
// output: Console BFF session routes — POST login, GET identity, DELETE logout
// pos: thin HTTP adapter over the Operator Session facade
// note: if this file changes, update header and app/api/operator-session/README.md
import type { NextRequest, NextResponse } from "next/server";

import { login, logout, readIdentity } from "@/lib/operator-session/facade";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  return login(request);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  return readIdentity(request);
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  return logout(request);
}
