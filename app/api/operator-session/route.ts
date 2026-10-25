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
