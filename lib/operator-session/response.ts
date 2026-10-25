import { NextResponse } from "next/server";

/**
 * BFF-controlled JSON outcome. Every error and success mapping produced by
 * the BFF carries `Cache-Control: no-store` so sensitive proxied payloads
 * and authentication outcomes are never cached by browsers or intermediaries.
 *
 * Synthesized failures publish a snake_case Controlled Error Code on `error`
 * (hyphenated helper tokens become underscores) and keep `message` as the
 * existing safe token. Do not put internals in either field.
 */
export function bffJson(status: number, message: string): NextResponse {
  return NextResponse.json(
    { error: message.replaceAll("-", "_"), message },
    { status, headers: { "cache-control": "no-store" } },
  );
}
