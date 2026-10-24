// POST /api/auth/signup { businessName, name, email, password }: creates a business with the
// person as its owner and signs them in.
import { z } from "zod";
import { sessionCookie, signUp } from "@/server/auth";
import { parseJsonBody } from "@/server/http";

const SignUpSchema = z.object({
  businessName: z.string().trim().min(2).max(80),
  name: z.string().trim().min(1).max(80),
  email: z.email(),
  password: z.string().min(10, "Use at least 10 characters.").max(200),
});

export async function POST(request: Request) {
  const parsed = await parseJsonBody(request, SignUpSchema);
  if ("response" in parsed) return parsed.response;
  const token = await signUp(parsed.data);
  if (!token)
    return Response.json(
      { error: "That email already has an account. Sign in instead." },
      { status: 409 },
    );
  const response = Response.json({ ok: true }, { status: 201 });
  response.headers.append("set-cookie", sessionCookie(token, request));
  return response;
}
