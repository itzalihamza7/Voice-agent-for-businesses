// GET /api/business/secrets: which of the business's own API keys are set (names only).
// PUT { name: "OPENAI_API_KEY", value | null }: set (encrypted) or remove one. Owners only.
import { z } from "zod";
import { businessSecretNames, setBusinessSecret } from "@/server/auth";
import { currentBusinessId } from "@/server/business";
import { parseJsonBody } from "@/server/http";

const SecretSchema = z.object({
  name: z.enum(["OPENAI_API_KEY"]),
  value: z.string().trim().min(10).max(300).nullable(),
});

export async function GET() {
  return Response.json({ set: await businessSecretNames(await currentBusinessId()) });
}

export async function PUT(request: Request) {
  const parsed = await parseJsonBody(request, SecretSchema);
  if ("response" in parsed) return parsed.response;
  await setBusinessSecret(await currentBusinessId(), parsed.data.name, parsed.data.value);
  return Response.json({ set: await businessSecretNames(await currentBusinessId()) });
}
