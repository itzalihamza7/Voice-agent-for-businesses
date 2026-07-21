import { describeAgentConfigStore } from "./store.contract";
import { InMemoryAgentConfigStore } from "./memory-store";

let counter = 0;
describeAgentConfigStore(
  "InMemoryAgentConfigStore",
  async () => new InMemoryAgentConfigStore(),
  () => `agent-${++counter}`,
);
