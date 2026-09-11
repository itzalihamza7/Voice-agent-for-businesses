import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { CallSessions } from "@voice-agent/orchestrator";

// Test calls are LangGraph threads saved in Postgres, in their own "langgraph" schema so they
// stay out of Prisma's tables. The checkpointer creates its tables on first use.

const globalForCalls = globalThis as unknown as { callSessions?: Promise<CallSessions> };

export function getCallSessions(): Promise<CallSessions> {
  globalForCalls.callSessions ??= (async () => {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set.");
    const saver = PostgresSaver.fromConnString(url, { schema: "langgraph" });
    await saver.setup();
    return new CallSessions(saver);
  })();
  return globalForCalls.callSessions;
}
