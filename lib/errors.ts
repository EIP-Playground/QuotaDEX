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

export function badRequestResponse(
  error: string,
  code = "BAD_REQUEST",
  details?: Record<string, unknown>
): NextResponse<ErrorPayload> {
  return errorResponse(400, { error, code, details });
}

export function notFoundResponse(
  error: string,
  code = "NOT_FOUND",
  details?: Record<string, unknown>
): NextResponse<ErrorPayload> {
  return errorResponse(404, { error, code, details });
}

export function serviceUnavailableResponse(
  error: string,
  code = "SERVICE_UNAVAILABLE",
  details?: Record<string, unknown>
): NextResponse<ErrorPayload> {
  return errorResponse(503, { error, code, details });
}

export function internalServerErrorResponse(
  error = "Internal Server Error",
  code = "INTERNAL_SERVER_ERROR",
  details?: Record<string, unknown>
): NextResponse<ErrorPayload> {
  return errorResponse(500, { error, code, details });
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
