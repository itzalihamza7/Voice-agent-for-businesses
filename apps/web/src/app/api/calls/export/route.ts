// GET /api/calls/export: good calls as a fine-tuning dataset (JSONL, OpenAI chat format): calls
// that were resolved and where the caller wasn't unhappy. One line per call: the caller's lines
// are "user" messages, the agent's are "assistant" messages.
import { currentBusinessId } from "@/server/business";
import { getPrisma } from "@/server/store";

export async function GET() {
  const businessId = await currentBusinessId();
  const calls = await getPrisma().call.findMany({
    where: { businessId, outcome: "resolved", NOT: { sentiment: "negative" } },
    include: { agent: { select: { name: true } }, turns: { orderBy: { atMs: "asc" } } },
    orderBy: { startedAt: "asc" },
  });
  const lines = calls
    .filter((call) => call.turns.some((t) => t.speaker === "caller"))
    .map((call) =>
      JSON.stringify({
        messages: [
          { role: "system", content: `You are ${call.agent.name}, answering the phone.` },
          ...call.turns.map((t) => ({
            role: t.speaker === "agent" ? "assistant" : "user",
            content: t.text,
          })),
        ],
      }),
    );
  return new Response(lines.join("\n") + (lines.length ? "\n" : ""), {
    headers: {
      "content-type": "application/jsonl",
      "content-disposition": 'attachment; filename="calls-fine-tuning.jsonl"',
    },
  });
}
