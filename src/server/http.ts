import { ZodError } from "zod";
import { DomainError } from "@/domain/types";
export function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}
export function failure(error: unknown) {
  if (error instanceof ZodError)
    return json(
      {
        error: {
          code: "VALIDATION",
          message: error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; "),
        },
      },
      400,
    );
  if (error instanceof DomainError)
    return json(
      { error: { code: error.code, message: error.message } },
      error.status,
    );
  const code = (error as { code?: string })?.code;
  if (code === "23505")
    return json(
      {
        error: {
          code: "CONFLICT",
          message: "This record already exists or membership changed.",
        },
      },
      409,
    );
  if (code === "23503" || code === "23514")
    return json(
      {
        error: {
          code: "CONFLICT",
          message: "This change conflicts with linked records.",
        },
      },
      409,
    );
  return json(
    {
      error: {
        code: "INTERNAL",
        message: "The request could not be completed. Please try again.",
      },
    },
    500,
  );
}
export async function body(request: Request) {
  if (Number(request.headers.get("content-length") ?? 0) > 100000)
    throw new DomainError("TOO_LARGE", "Request too large.", 413);
  const text = await request.text();
  if (text.length > 100000)
    throw new DomainError("TOO_LARGE", "Request too large.", 413);
  try {
    return JSON.parse(text);
  } catch {
    throw new DomainError("VALIDATION", "Invalid JSON.");
  }
}
