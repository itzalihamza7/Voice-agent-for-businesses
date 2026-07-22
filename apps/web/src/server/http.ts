import { AgentNotFoundError } from "@voice-agent/orchestrator";
import type { z } from "zod";

// Small helpers that keep the API route handlers thin and consistent.

/** Reads the JSON body and validates it. Returns the data, or a 400 response to send back. */
export async function parseJsonBody<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<{ data: z.infer<T> } | { response: Response }> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { response: Response.json({ error: "Body must be valid JSON" }, { status: 400 }) };
  }
  const result = schema.safeParse(body);
  if (!result.success) {
    return {
      response: Response.json(
        { error: "Invalid request body", issues: result.error.issues },
        { status: 400 },
      ),
    };
  }
  return { data: result.data };
}

/** Turns known errors into HTTP responses. Unknown errors are re-thrown (Next.js returns 500). */
export function errorResponse(error: unknown): Response {
  if (error instanceof AgentNotFoundError) {
    return Response.json({ error: error.message }, { status: 404 });
  }
  throw error;
}
