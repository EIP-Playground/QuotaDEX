import { NextResponse } from "next/server";

export type ErrorPayload = {
  error: string;
  code: string;
  details?: Record<string, unknown>;
};

export function errorResponse(
  status: number,
  payload: ErrorPayload
): NextResponse<ErrorPayload> {
  return NextResponse.json(payload, { status });
}

export function notImplementedResponse(
  route: string,
  description: string
): NextResponse<ErrorPayload> {
  return errorResponse(501, {
    error: `${route} is scaffolded but not implemented yet.`,
    code: "NOT_IMPLEMENTED",
    details: {
      description
    }
  });
}
