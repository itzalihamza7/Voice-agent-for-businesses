// GET /api/business/users: the business's users. POST { email, name, password, role }: add one.
// Owners only (the proxy checks).
import { z } from "zod";
import { createUser } from "@/server/auth";
import { currentBusinessId } from "@/server/business";
import { parseJsonBody } from "@/server/http";
import { getPrisma } from "@/server/store";

const NewUserSchema = z.object({
  email: z.email(),
  name: z.string().trim().min(1).max(100),
  password: z.string().min(10, "Use at least 10 characters."),
  role: z.enum(["owner", "editor", "viewer"]),
});

export async function GET() {
  const users = await getPrisma().user.findMany({
    where: { businessId: await currentBusinessId() },
    select: { id: true, email: true, name: true, role: true },
    orderBy: { createdAt: "asc" },
  });
  return Response.json({ users });
}

export async function POST(request: Request) {
  const parsed = await parseJsonBody(request, NewUserSchema);
  if ("response" in parsed) return parsed.response;
  if (await getPrisma().user.findUnique({ where: { email: parsed.data.email.toLowerCase() } })) {
    return Response.json({ error: "That email already has an account." }, { status: 409 });
  }
  const user = await createUser({ ...parsed.data, businessId: await currentBusinessId() });
  return Response.json({ user }, { status: 201 });
}
