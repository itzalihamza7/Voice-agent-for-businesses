// Language model: decides what the agent says next, based on the conversation so far.
// Real vendors (e.g. Claude, GPT) will each implement this interface in their own file.
// Tool calls and streaming tokens will be added here later.

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface CompletionResult {
  text: string;
}

export interface LanguageModelProvider {
  readonly name: string;
  complete(messages: ChatMessage[]): Promise<CompletionResult>;
}
