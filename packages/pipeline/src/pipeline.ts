import type { ChatMessage } from "./providers/llm/types";
import type { Providers } from "./registry";

// Runs one conversational turn: caller audio -> STT -> LLM -> TTS -> agent audio.
// Later: streaming between steps, interruptions (barge-in) and following the agent's flow.

export interface TurnResult {
  callerText: string;
  agentText: string;
  agentAudio: Uint8Array;
}

export async function runTurn(
  providers: Providers,
  callerAudio: Uint8Array,
  history: ChatMessage[] = [],
): Promise<TurnResult> {
  const { text: callerText } = await providers.stt.transcribe(callerAudio);
  const { text: agentText } = await providers.llm.complete([
    ...history,
    { role: "user", content: callerText },
  ]);
  const { audio: agentAudio } = await providers.tts.synthesize(agentText);
  return { callerText, agentText, agentAudio };
}
