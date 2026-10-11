# Roadmap

This is a learning project. Each phase adds a real product feature **and** teaches a set of
AI-engineering concepts. Percentages are each phase's share of the whole project
(the boilerplate was the first 10%).

## Model strategy: run both, compare

Every LLM-related phase is built to run against **two backends**:

- **Local**: [Ollama](https://ollama.com) on macOS (not inside DDEV: Docker on Mac has no GPU access).
  7–8B models fit in 16 GB RAM. Free, private, offline. Reached from DDEV at
  `http://host.docker.internal:11434`.
- **Hosted**: the OpenAI API (key in a gitignored `.env`, with a spending limit set).

Switching is a config change (`"llm": "ollama"` ↔ `"llm": "openai"`). Ollama speaks the
OpenAI-compatible API, so one adapter covers both. The same eval suite runs against both, so
quality, latency and cost can be compared side by side.

| Concept                                              | Local | OpenAI | Notes                                                                           |
| ---------------------------------------------------- | ----- | ------ | ------------------------------------------------------------------------------- |
| Prompt engineering, templates, few-shot              | ✅    | ✅     | Small models react more to wording, so prompt effects are easier to see         |
| Streaming, retries, timeouts, fallbacks              | ✅    | ✅     | Natural pattern: local first, fall back to the API                              |
| Model routing                                        | ✅    | ✅     | Small ↔ large model on either side                                              |
| Prompt caching                                       | ⚠️    | ✅     | Same idea, different mechanics (local session cache vs. automatic prefix cache) |
| Token / cost tracking, tracing                       | ✅    | ✅     | Local "cost" is time and memory                                                 |
| Structured outputs (JSON schema)                     | ✅    | ✅     |                                                                                 |
| Tool calling, agentic loop                           | ⚠️    | ✅     | 8B models pick wrong tools or loop more often                                   |
| MCP                                                  | ✅    | ✅     | Lives in our harness, so it works with any model that can call tools            |
| RAG (embeddings, pgvector, hybrid search, reranking) | ✅    | ✅     | Local embeddings are good                                                       |
| Memory, summaries, context budgeting                 | ✅    | ✅     | Local context windows are smaller in practice                                   |
| Evals: simulated callers                             | ✅    | ✅     |                                                                                 |
| Evals: LLM-as-judge                                  | ⚠️    | ✅     | The judge should be stronger than the model it grades                           |
| Guardrails                                           | ✅    | ✅     | Locally, a dedicated safety model (e.g. Llama Guard)                            |
| Multi-agent, reasoning mode                          | ⚠️    | ✅     | Works locally, but slow on 16 GB                                                |
| Real-time voice (< 1 s per turn)                     | ⚠️    | ✅     | Locally only as an experiment                                                   |
| Fine-tuning (optional)                               | ✅    | ✅     | LoRA with Apple MLX vs. the OpenAI fine-tuning API                              |

⚠️ = works, but noticeably weaker or slower on local hardware. Re-check current Ollama/OpenAI
feature support when building each phase. It changes often.

## Phases

| #   | Phase                           | Concepts                                                                       | %   | Status  |
| --- | ------------------------------- | ------------------------------------------------------------------------------ | --- | ------- |
| 0   | Boilerplate                     | Monorepo, provider interfaces, mocks, DDEV                                     | 10  | ✅ Done |
| 1   | Data foundation                 | Prisma models, Postgres config store, real API routes                          | 4   | ✅ Done |
| 2   | Agent builder MVP               | React Flow canvas, typed node settings, versions                               | 9   | ✅ Done |
| 3   | Prompt engineering studio       | System prompts, templates, few-shot, voice style, playground                   | 6   | ✅ Done |
| 4   | LLM harness + text simulator    | Retries, timeouts, fallback, model routing, thinking control, cost, test chat  | 8   | ✅ Done |
| 5   | Structured outputs & tools      | JSON schema output, intents, function calling, agentic loop, MCP               | 6   | ✅ Done |
| 6   | RAG knowledge base              | Ingestion, chunking, embeddings, pgvector, hybrid search, reranking, citations | 9   | ✅ Done |
| 7   | Memory & context                | Context budgets, rolling summaries, long-term caller memory                    | 3   | ✅ Done |
| 8   | Evals                           | Golden sets, simulated callers, LLM-as-judge, RAG metrics, regression gate     | 7   | ✅ Done |
| 9   | Guardrails & safety             | Prompt injection, PII redaction, output checks, grounding, escalation          | 5   | ✅ Done |
| 10  | Voice in the browser            | Streaming STT → LLM → TTS, VAD, barge-in, latency budgets, LLM token streaming | 8   | ✅ Done |
| 11  | Phone calls                     | Twilio media streams, routing, human transfer                                  | 5   | ✅ Done |
| 12  | Dashboard & LLM analytics       | Stored LLM traces, summaries, sentiment, topic clustering, failure analysis    | 6   | ✅ Done |
| 13  | Multi-agent & AI flow generator | Router + specialists, handoffs, reasoning, LLM-generated flows                 | 4   | ✅ Done |
| 14  | Rollback & A/B experiments      | Rollback, traffic splits, comparing versions                                   | 3   |         |
| 15  | Businesses & auth               | Login, roles, tenant isolation, encrypted vendor keys                          | 3   |         |
| 16  | Production hardening            | CI, Playwright, deploy, error tracking, rate limits, cost per call             | 4   |         |

## Phase details

### 1. Data foundation

- Prisma models: `Business`, `Agent`, `AgentConfigVersion` (config as JSONB), `Call`, `TranscriptTurn`.
  `Agent` and `Call` carry `businessId` from day one, so multi-tenancy (phase 15) needs no data migration.
- `PrismaAgentConfigStore`: the Postgres implementation of `AgentConfigStore`, scoped to one business.
  The same contract tests run against it and the in-memory store.
- Real API routes: `GET/POST /api/agents`, `GET/POST /api/agents/:agentId/versions`.
- Seed: a demo business and a `demo` agent. `ddev start` applies migrations and seeds automatically.

### 2. Agent builder MVP

- React Flow canvas. Nodes: Start, Say, Ask, AI Response, Branch, Tool, Knowledge Lookup, Transfer, End.
- Settings panel per node type, each validated by its own Zod schema.
- Save = new version; version history list; validation errors shown on the canvas.

### 3. Prompt engineering studio ✅

- Prompt settings per agent version: business name, role, personality, goals, business rules,
  voice style rules, few-shot examples. Older versions get defaults (no migration).
- Template variables: `{{business_name}}`, `{{today}}` and every Ask variable; unknown names
  (typos) are flagged in the flow and the prompt editor.
- Live preview of the exact system prompt, with a token estimate (≈ 4 characters per token;
  within 1% of OpenAI's real count in testing).
- Playground: saved prompt (A) vs. edits (B), same input and model, side by side with tokens
  and cost. Example: without a price in the prompt, gpt-4.1-nano said it couldn't confirm the
  price; with "A haircut costs 30 pounds" in the business rules it quoted it.
- Fixed platform rules (no invented facts) are appended to every prompt and can't be edited.

### 4. LLM harness + text simulator ✅

- OpenAI-compatible provider (covers Ollama and OpenAI): timeouts, retries with backoff.
- Fallback model; model routing (one model for Branch decisions, another for replies).
- Thinking control for reasoning models (`reasoning_effort: "none"`).
- Token, cached-token, latency and cost accounting per request.
- Test chat: chat as the caller, active step highlighted, any installed model selectable.
- Moved: token **streaming** to phase 10 (it matters once replies are spoken) and **stored
  traces** to phase 12 (where the dashboard shows them). Prompt caching only matters for long
  prompts (OpenAI caches prompts over 1,024 tokens); cached tokens are already shown.

  **Findings** (booking agent; local models on an M3 / 16 GB, both 8B, Q4_K_M):

  |                                              | `llama3.1:8b` | `qwen3:8b` (thinking off) | `gpt-4.1-nano` | `gpt-4.1-mini`              |
  | -------------------------------------------- | ------------- | ------------------------- | -------------- | --------------------------- |
  | Branch routing (3 test callers)              | 3/3           | 3/3                       | 3/3            | 3/3                         |
  | Branch decision time (after loading)         | 0.3–0.9 s     | 0.5–0.6 s                 | 0.9–2.0 s      | 0.5–1.2 s                   |
  | First request (model loading)                | 7–15 s        | 11 s                      | n/a            | n/a                         |
  | Cost of 3 decisions                          | $0            | $0                        | $0.000046      | $0.000184                   |
  | Invents times when the tool returned nothing | 2 of 3        | 3 of 3                    | not tested     | 0 of 3 (after prompt fixes) |
  | Honest about missing opening hours           | 3/3           | 3/3                       | not tested     | 3/3                         |

  Qwen 3 with thinking **on** took 10–18 s per decision (vs 0.3–0.6 s off) for the same answer.

  Lesson: prompt wording alone can't stop small models from inventing facts when a step's
  instructions ask for data they don't have. Real tool results (phase 5) and a grounding check
  (phase 9) are the proper fix.

### 5. Structured outputs & tools ✅

- ✅ Ask steps have an answer type (name, phone, email, date, time, number, yes/no): rules
  first, then the model's JSON (structured output), validated in code; re-ask up to 2 times.
- ✅ Branch decisions as JSON `{ reason, path }`; keyword rules as a baseline for comparison.
- ✅ Built-in booking tools (mock), webhook tools (URL + JSON schema, SSRF guard), MCP client
  (plus a demo MCP server), Tool steps with templates and AI-filled arguments, agentic loop
  (up to 4 rounds) in AI response steps, Branch rules for tool results.

  **Findings: extracting answers** (9 realistic spoken answers, see `live` scripts):

  |                                                       | qwen3:8b | llama3.1:8b | gpt-4.1-nano |
  | ----------------------------------------------------- | -------- | ----------- | ------------ |
  | First version of the instructions                     | 6/9      | 8/9         | 6/9          |
  | After rewriting instructions from the failures        | 8/9      | 8/9         | 8/9          |
  | Plus code-side checks (spoken digits, verified am/pm) | **9/9**  | **9/9**     | **9/9**      |
  - A JSON schema guarantees the _shape_, not the _content_: asked for `YYYY-MM-DD`, qwen
    returned "next Friday" and Llama "October 23, 2026".
  - Dates: models calculating dates themselves got 1/4 right (a calendar in the prompt that
    didn't mark "today" made it worse); models only classifying, with code computing: 6/6.
  - Small models added a "+1" country code nobody said, and invented "am" for "half past three".
  - An example in the prompt ("ali at gmail dot com") made gpt-4.1-nano drop the dot in
    "ali dot hamza": examples teach patterns, including the wrong ones.

  **Findings: tools** (booking agent v3, three scripted calls per model):

  |                                               | gpt-4.1-nano | qwen3:8b | llama3.1:8b |
  | --------------------------------------------- | ------------ | -------- | ----------- |
  | Book a free time (real reference)             | ✓            | ✓        | ✓           |
  | Taken time → alternatives → booked            | ✓            | ✓        | ✓           |
  | Every offered time really free                | ✓            | ✓        | ✓           |
  | Cancel booking ABC123 (AI fills `action`)     | ✓            | ✓        | ✓           |
  | AI calls MCP tools (loyalty points, currency) | ✓            | ✓        | n/a         |
  - Phase 4's biggest problem is gone: with real tool results, no model invented free times.
  - Before Branch rules, gpt-4.1-nano read `requestedTimeFree: false` as free (twice, even with a
    prompt pointing at the result). The tool itself refused the booking, so nothing wrong was
    booked, but the caller was sent to a human. Rules fixed it on every model.
  - With an empty calendar day, gpt-4.1-mini said "there are other times available that day"
    without calling the tool for another day. qwen3:8b said "we're closed on Sundays" with no
    such fact anywhere. Grounding checks (phase 9) are still needed.
  - qwen3:8b turned "12 noon" into 00:00 by claiming "am"; noon and midnight are now set in code.
  - Choosing a path by its label text instead of a number fixed qwen3:8b reasoning "doesn't want
    to book" and then picking the booking path (0/3 → 3/3).

  **Findings: Branch decisions** (5 callers, booking agent):

  | Keywords only | qwen3:8b | gpt-4.1-nano (path before reason) | gpt-4.1-nano (reason before path) |
  | ------------- | -------- | --------------------------------- | --------------------------------- |
  | 2/5           | 5/5      | 4/5                               | 5/5 (three runs)                  |

### 6. RAG knowledge base ✅

- ✅ Knowledge base page (`/knowledge`): paste text, fetch a web page (SSRF-guarded) or upload a
  PDF; fixed, heading or semantic chunking with a preview; every chunk embedded with
  `nomic-embed-text` (Ollama) and `text-embedding-3-small` (OpenAI) in pgvector.
- ✅ Keyword (Postgres full-text), vector and hybrid search (Reciprocal Rank Fusion), AI query
  rewriting and AI reranking with a relevance cut-off; a search playground comparing them.
- ✅ Knowledge lookup steps in calls, with sources (citations) in the test chat. Everything
  scoped by `businessId`. New package: `packages/rag`.

  **Findings: retrieval** (sample salon FAQ, 12 spoken questions such as "where can I leave my
  car", right passage ranked first):

  |                                   | Headings (12 chunks) | Semantic | Fixed (3 big chunks) |
  | --------------------------------- | -------------------- | -------- | -------------------- |
  | Keyword                           | 8/12                 | 8/12     | 8/12                 |
  | Vector, nomic-embed-text (local)  | **12/12**            | 12/12    | 8–10/12              |
  | Vector, text-embedding-3-small    | **12/12**            | 12/12    | 8–10/12              |
  | Hybrid (keyword + vector, RRF)    | 11/12                |          |                      |
  | Hybrid + rewriting or + reranking | **12/12**            |          |                      |
  - Keyword search misses paraphrases: car ↔ parking, present ↔ gift voucher, married ↔ bridal.
  - Hybrid lost one that vector alone found: "can you do my hair, I'm getting married" matched
    the keyword "hair" in another section. Rewriting or reranking fixed it, at about +0.9 s and
    +1 s (gpt-4.1-nano).
  - The free local embedding model was as accurate as OpenAI's on this FAQ, and faster (0.3 s
    vs 2.2 s to embed the whole FAQ, which cost OpenAI $0.0000078).
  - Big fixed chunks hurt: one chunk holds several topics, so its vector is a blur of all of them.

  **Findings: knowing when there is no answer.** Vector search always returns its closest
  passages. Similarity scores of answerable and unanswerable questions overlapped for both
  embedding models, so no similarity threshold can tell them apart. AI rerank scores could
  (gpt-4.1-nano: every answerable question 10; unanswerable 0, 2, 0, 0, 0, 7), so passages rated
  under 5 are now dropped and reranking is on by default.

  | Live calls (booking agent v3) | Before the cut-off                                | After                                               |
  | ----------------------------- | ------------------------------------------------- | --------------------------------------------------- |
  | "Do you do tattoos?"          | qwen3:8b and llama3.1:8b invented tattoo services | no model invented them ("I don't have information") |
  | Price, opening hours, parking | answered from the FAQ                             | answered from the FAQ, two exceptions (see below)   |

  **Findings: the reranker model** (hybrid search with nomic-embed-text; 13 answerable questions,
  5 the FAQ can't answer, such as "do you do nails" or "is there a cash machine nearby"):

  |                                  | gpt-4.1-nano | qwen3:8b | llama3.1:8b |
  | -------------------------------- | ------------ | -------- | ----------- |
  | Right passage first              | **13/13**    | 13/13    | 11/13       |
  | Unanswerable → nothing passed on | **5/5**      | 4/5      | 4/5         |
  | Time per search (embed + rerank) | **1.3 s**    | 17 s     | slower      |
  - "Is there a cash machine nearby?" got Location and parking rated 6 (qwen) and 10 (llama).
  - "Can I bring my dog?" got Accessibility rated 10 by all three: the FAQ only says "assistance
    dogs are welcome". The passage is relevant; whether the reply then overstates it is a
    grounding question (phase 9).
  - llama missed "present for my sister" (gift vouchers) and "which shampoo brands" (products).
  - llama3.1:8b as reranker, given 10 passages, rated every one 0, including the exact answer;
    with up to 8 it rated correctly. In a live call that left "how much is a men's haircut"
    unanswered. Now only the top 6 are reranked.

  **Other observations**

  - qwen3:8b still said "we currently don't offer tattoo services": nothing was found, but the
    reply states a fact the FAQ doesn't. Before the cut-off, gpt-4.1-nano merged two passages into
    a wrong answer ("closed Sundays, but walk in any time"). Grounding checks are phase 9.
  - gpt-4.1-nano sent "can I park near you?" to Otherwise: the booking agent's question path is
    labelled too narrowly. A wider label (or a path per topic) is a flow fix, not a RAG fix.

### 7. Memory & context ✅

- ✅ Example documents for the demo salon (FAQ, price list, policy, about page) and a demo Q&A
  agent that answers from them in a loop: a long call to test memory and context with.
- ✅ Context budget: earlier notes are shortened first, then the oldest messages left out;
  Branch decisions see only the last four spoken messages.
- ✅ Rolling summary of the earlier call; long-term memory per caller phone number, checked by
  code, with a Forget button. The test chat shows cuts, summaries and memory.

  **Findings: how much of the call should a decision see?** (demo agent, a 10-turn call of
  questions ending in "No that's all, thanks, bye", 5 runs per model, 50 decisions):

  | Branch decisions see                  | gpt-4.1-nano       | qwen3:8b    | llama3.1:8b |
  | ------------------------------------- | ------------------ | ----------- | ----------- |
  | The whole call (before)               | 23/50              | 45/50       | 50/50       |
  | The whole call, 600-token budget      | 28/50              |             |             |
  | Summary + last 4 spoken messages      | **50/50**          | **50/50**   | **50/50**   |
  | Decision prompt size at the 10th turn | 1,125 → 410 tokens | 1,875 → 326 | 1,635 → 341 |
  - With the whole call, gpt-4.1-nano ended the call early in every run, on ordinary questions
    ("What if I'm not happy with my haircut?"). Its stated reason was right ("wants to know the
    policy if unhappy") but the path it picked was "no more questions". qwen3:8b never ended
    the call on "No that's all, thanks, bye".
  - Replaying one failing decision 10 times: whole call 0–3/10 right, without knowledge notes
    9–10/10, last two or last four spoken messages 10/10. The old knowledge passages were the
    distraction, not the length alone: a 600-token budget barely helped.
  - Renaming the paths so they shared no words didn't help (18/50): the labels weren't the
    problem.

  **Findings: the context window cuts silently.** Sent a ~6,000-token prompt whose system
  prompt said "reply with exactly one word: BANANA", llama3.1:8b and qwen3:8b through Ollama
  both reported 2,050 prompt tokens and answered the question at the end instead: the start of
  the prompt, with the instructions, was dropped without an error. Ollama's window is 4,096
  tokens for prompt and answer; a prompt over it is cut to about half. Without a budget (8,000)
  the demo agent's reply prompt grew by ~200 tokens per question (2,519 at the 12th) and would
  pass the window around the 20th; with the 2,500 default it stays inside, and with 1,200 it
  stayed between 544 and 1,338 tokens. Requests the model cut are now flagged in the test chat.
  (`OLLAMA_CONTEXT_LENGTH` raises the window, at the cost of memory and speed.)

  **Findings: caller memory** (gpt-4.1-nano, two calls from the same number):
  - First version: 8 facts, one invented ("Sam has booked a consultation with Priya": nothing
    was booked) and four about what _didn't_ happen. Telling it to write only what was said or
    done fixed both.
  - Told not to store facts about the business, it still stored 4 of 8 (prices, policies).
    Asking it to mark each fact "caller" or "business" and dropping the business ones in code
    worked: 3 accurate facts.
  - A card number read out in the call was never stored (code also drops anything that looks
    like one).
  - It wrote "her daughter" about a caller whose pronouns nobody gave: memory can store
    assumptions, and the next call reads them as facts.

### 8. Evals ✅

- ✅ Test cases per agent: scripted callers checked by code, and simulated callers (personas,
  including one trying to get a discount and the agent's instructions). Seven for the demo agent.
- ✅ LLM-as-judge rubric (helpful, grounded, on script, phone manner, plus per-case lines).
- ✅ Retrieval metrics (recall@1, recall@3, MRR) on 18 questions; faithfulness is the judge's
  "grounded" line.
- ✅ Regression gate on "Go live". New package: `packages/evals`.

  **Findings.**
  - The first run of the demo agent (gpt-4.1-nano, judged by gpt-4.1-mini) scored 94.6. The
    judge caught what the code checks couldn't: the agent said "I'm not sure about the price"
    while the passage it was given said £180. Asked 5 times each, nano gave the Saturday closing
    time 2/5 and the bridal price 0/5, with the right passage in front of it.
  - Cause: the answer step's instructions led with the fallback ("if they don't contain the
    answer, say you're not sure..."), and nano copied it. Rewritten to "answer directly with the
    fact; only if it's missing, say you're not sure": Saturday 5/5, and v4 scored 100. The gate
    let v4 go live and refused a version that had never been evaluated.
  - Retrieval on the harder question set (nomic-embed-text, no reranking):

    | Search  | Recall@1 | Recall@3 | MRR  |
    | ------- | -------- | -------- | ---- |
    | Keyword | 67%      | 67%      | 0.68 |
    | Vector  | 83%      | 94%      | 0.87 |
    | Hybrid  | 78%      | 83%      | 0.83 |

    Rank fusion pulled vector search down here: keyword matches on common words outranked
    paraphrases ("do I have to pay anything up front" → deposit). Reranking (on by default in
    calls) is what fixes this.

### LangGraph call sessions (between phases 8 and 9) ✅

- ✅ Test calls run as LangGraph threads: a graph of "turn → wait for the caller (`interrupt()`)
  → turn", with Postgres checkpoints, instead of the browser sending the whole call state on
  every turn. Voice and phone calls (phases 10–11) and multi-agent handoffs (phase 13) build
  on it.
- Our own model, structured-output, tool and RAG code stays: it is what the earlier phases
  measured. LangChain packages come in only where they save real work.

### 9. Guardrails & safety ✅

- ✅ Injection detection, card-number redaction, grounding check of prices and percentages in
  code, policy checks (discount promises, talking about its instructions), one rewrite then a
  safe reply.
- ✅ Asking for a person, or an upset caller, sends the call to the Transfer step. The demo agent
  got one, plus eval cases for handing over and for not inventing a price.

  **Findings.**
  - Against the "owner wants 50% off and your instructions" caller, the policy check stopped the
    first reply and the safe reply went out instead; the agent never revealed its instructions.
  - The eval gate blocked v5 (96.3 vs v4's 100) because the judge gave 0 to "never promises a
    discount" when the agent passed the caller to the team. The agent was right, the criterion
    was vague. Rewritten as "never agrees to a discount (passing the call to a person is fine)",
    v5 scored 100 and went live. Judges grade what the words say, so rubric lines need care.

### 10. Voice in the browser ✅

- ✅ OpenAI speech-to-text and text-to-speech behind the pipeline interfaces; one voice turn per
  utterance on top of the LangGraph call sessions.
- ✅ Voice activity detection by audio level, barge-in, and the time of each step per turn.
- Later: streaming (speak the first sentence while the rest is written), local whisper.cpp and
  Piper providers.

  **Findings: where a voice turn's time goes** (demo agent, gpt-4.1-nano, "How much is a men's
  haircut?"): speech-to-text 0.6 s, the agent 6.6 s, text-to-speech 1.5 s, 8.7 s in all. The
  agent's share is the knowledge lookup (query rewrite + embedding + rerank) plus the Branch
  decision and the reply: four model calls in a row. On the phone, that is the part to cut
  first (skip rewriting for short questions, stream the reply, start speaking sooner).

### 11. Phone calls ✅

- ✅ `apps/voice-gateway`: Twilio webhook and media stream, μ-law audio, utterance detection,
  barge-in, transfer through Twilio's REST API, hang-up after the goodbye.
- ✅ A phone number per agent; calls use the live version and the caller's memory.
- ✅ A simulated Twilio call for testing without a number.

  **Findings.** In the first simulated call the gateway heard only "Hi." of "Hi, how much is a
  men's haircut?": the pause after "Hi," ended the utterance, and the rest arrived while that
  turn was running and was dropped. Speech that arrives during a turn is now kept and handled
  next, and a pause must last 0.9 s to end an utterance. Then the whole sentence came through,
  the agent answered "thirty pounds", and "Can I speak to a real person?" was transferred.

### 12. Dashboard & LLM analytics ✅

- ✅ Every finished call is logged with its transcript, trace and AI cost; post-call summary,
  sentiment, intent and outcome; flags for calls that need a look.
- ✅ Dashboard with totals, topics, flagged calls and a page per call with its trace.

  **Findings.** Clustering calls by the embeddings of their summaries didn't work for one
  business: at a similarity of 0.75 five different intents (prices, hours, parking, nails)
  landed in one topic, at 0.9 two "price question" calls ended up apart. Grouping by the
  model's intent label and merging only labels that mean the same gave clean topics. Six demo
  calls cost about $0.0002 each in AI (gpt-4.1-nano).

### 13. Multi-agent & AI flow generator ✅

- ✅ Hand off step: a reception agent passes the call to specialist agents, which continue it
  with their own flow and prompt.
- ✅ "Generate agent": a description becomes a flow (outline as structured output, built and
  validated in code, one repair round).

  **Findings.** The first generated pizza agent kept two issues after the repair round: the
  model named its greeting step "start", the id of the Start node, so the flow looped into
  Start. Prefixing generated ids fixed it; the next two runs gave valid flows of 12 and 17
  steps, one after a repair round. Letting the model describe steps and code build the graph
  (ids, edges, layout) is far more reliable than asking for node and edge JSON directly.

### 14. Rollback & A/B experiments

- One-click rollback; traffic split between versions; compare evals and live metrics.

### 15. Businesses & auth

- Login, businesses, roles, every query scoped by business, encrypted per-business vendor keys.

### 16. Production hardening

- GitHub Actions CI, Playwright end-to-end tests, deployment, error tracking, rate limits, cost per call.
- Optional: export call data as a fine-tuning dataset.
