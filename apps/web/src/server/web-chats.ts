import { randomInt } from "node:crypto";
import { createLanguageModel } from "@voice-agent/pipeline";
import type { HandoffChannel, WebChatMessageView, WebChatView } from "@voice-agent/shared";
import { modelEnv } from "./auth";
import { alertTeam, whatsappLink } from "./notify";
import { getPrisma } from "./store";
import { widgetModel } from "./widget";

// Website chats as visitors and the team see them: every visible message in order, saved as it
// happens, so a visitor can reopen any earlier chat and the team has the whole context when a
// visitor asks for a person, WhatsApp or a call.

type Sender = WebChatMessageView["sender"];

/** Creates the chat's record the first time (the LangGraph thread has the same id). */
export async function ensureWebChat(chatId: string, businessId: string, agentId: string) {
  await getPrisma().webChat.upsert({
    where: { id: chatId },
    create: { id: chatId, businessId, agentId },
    update: {},
  });
}

/** Saves messages in order. The visitor's first message becomes the chat's title. */
export async function addMessages(
  chatId: string,
  messages: { sender: Sender; text: string; author?: string | null }[],
) {
  const prisma = getPrisma();
  const kept = messages.filter((m) => m.text.trim());
  if (kept.length === 0) return;
  const now = Date.now();
  await prisma.$transaction([
    // A millisecond apart, so messages saved together keep their order.
    ...kept.map((m, i) =>
      prisma.webChatMessage.create({
        data: {
          chatId,
          sender: m.sender,
          text: m.text.trim().slice(0, 4000),
          author: m.author ?? null,
          createdAt: new Date(now + i),
        },
      }),
    ),
    prisma.webChat.update({ where: { id: chatId }, data: { lastMessageAt: new Date(now) } }),
  ]);
  const firstVisitor = kept.find((m) => m.sender === "visitor");
  if (firstVisitor) {
    await prisma.webChat.updateMany({
      where: { id: chatId, title: null },
      data: { title: firstVisitor.text.trim().slice(0, 120) },
    });
  }
}

const view = (m: {
  id: string;
  sender: string;
  text: string;
  author: string | null;
  createdAt: Date;
}) =>
  ({
    id: m.id,
    sender: m.sender as Sender,
    text: m.text,
    author: m.author,
    at: m.createdAt.toISOString(),
  }) satisfies WebChatMessageView;

/** The chat with its messages (all, or only those after a time, for polling). */
export async function webChatView(
  chatId: string,
  { ended, after }: { ended: boolean; after?: Date },
): Promise<WebChatView | null> {
  const chat = await getPrisma().webChat.findUnique({
    where: { id: chatId },
    include: {
      messages: {
        where: after ? { createdAt: { gt: after } } : {},
        orderBy: { createdAt: "asc" },
        take: 500,
      },
    },
  });
  if (!chat) return null;
  return {
    id: chat.id,
    title: chat.title,
    mode: chat.mode as WebChatView["mode"],
    ended,
    reference: chat.reference,
    handoff: (chat.handoff as HandoffChannel | null) ?? null,
    messages: chat.messages.map(view),
  };
}

export async function webChatMode(chatId: string) {
  const chat = await getPrisma().webChat.findUnique({
    where: { id: chatId },
    select: { mode: true },
  });
  return (chat?.mode ?? "bot") as WebChatView["mode"];
}

// ----- Hand-offs ----------------------------------------------------------------------------

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const newReference = () =>
  `VS-${Array.from({ length: 5 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("")}`;

/** The chat's reference, created the first time it is needed. */
async function referenceFor(chatId: string): Promise<string> {
  const prisma = getPrisma();
  const chat = await prisma.webChat.findUniqueOrThrow({ where: { id: chatId } });
  if (chat.reference) return chat.reference;
  for (let attempt = 0; ; attempt++) {
    try {
      const reference = newReference();
      await prisma.webChat.update({ where: { id: chatId }, data: { reference } });
      return reference;
    } catch (error) {
      if (attempt >= 4) throw error;
    }
  }
}

export interface HandoffWidget {
  agentId: string;
  businessId: string;
  title: string | null;
  whatsappNumber: string | null;
  phoneNumber: string | null;
  liveChat: boolean;
  alertWhatsapp: string | null;
  business: { name: string };
}

export interface HandoffResult {
  reference: string;
  mode: WebChatView["mode"];
  /** WhatsApp, opened with the reference and the visitor's question. */
  whatsappUrl?: string;
  /** The number to call. */
  phoneNumber?: string;
  /** What the visitor is told. */
  message: string;
}

/**
 * The visitor asks to reach the team. Every way carries the chat's context: a reference the
 * team can look up in the Inbox (with the whole conversation and a summary), and for WhatsApp
 * the visitor's question, ready to send. The team is alerted for live chats and call-backs.
 */
export async function requestHandoff(
  widget: HandoffWidget,
  chatId: string,
  channel: HandoffChannel,
  visitor: { name?: string; contact?: string },
): Promise<HandoffResult | { error: string }> {
  const prisma = getPrisma();
  const businessName = widget.title || widget.business.name;
  if (channel === "whatsapp" && !widget.whatsappNumber) return { error: "WhatsApp isn't offered." };
  if (channel === "call" && !widget.phoneNumber) return { error: "Calls aren't offered." };
  if (channel === "person" && !widget.liveChat) return { error: "Live chat isn't offered." };
  if (channel === "callback" && !visitor.contact)
    return { error: "Leave a number to call you on." };

  const reference = await referenceFor(chatId);
  const needsTeam = channel === "person" || channel === "callback";
  const chat = await prisma.webChat.update({
    where: { id: chatId },
    data: {
      handoff: channel,
      handoffAt: new Date(),
      ...(channel === "person" ? { mode: "waiting" } : {}),
      ...(needsTeam ? { needsAttention: true } : {}),
      ...(visitor.name ? { visitorName: visitor.name } : {}),
      ...(visitor.contact ? { visitorContact: visitor.contact } : {}),
    },
  });

  const lastQuestion =
    (
      await prisma.webChatMessage.findFirst({
        where: { chatId, sender: "visitor" },
        orderBy: { createdAt: "desc" },
      })
    )?.text ?? "";

  const notes: Record<HandoffChannel, string> = {
    person: "Asked to talk to a person.",
    whatsapp: "Continued on WhatsApp.",
    call: "Was given the number to call.",
    callback: `Asked to be called back on ${visitor.contact ?? ""}.`,
  };
  await addMessages(chatId, [
    { sender: "system", text: `${notes[channel]} Reference ${reference}.` },
  ]);

  // The summary and the alert don't keep the visitor waiting.
  void summarise(widget.businessId, chatId).then(async (summary) => {
    if (!needsTeam) return;
    const appUrl = process.env.APP_URL ?? "";
    const who = visitor.name ? `${visitor.name}` : "A website visitor";
    const what =
      channel === "person"
        ? `${who} wants to talk to a person`
        : `${who} asks to be called back on ${visitor.contact}`;
    await alertTeam(
      widget.alertWhatsapp,
      [
        `${businessName}: ${what} (ref ${reference}).`,
        summary ?? (lastQuestion ? `Last message: "${lastQuestion.slice(0, 200)}"` : ""),
        appUrl ? `Open the chat: ${appUrl}/inbox/${chatId}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    );
  });

  if (channel === "whatsapp") {
    const text = [
      `Hi ${businessName}, I was chatting with your assistant on your website (ref ${reference}).`,
      lastQuestion ? `My question: ${lastQuestion.slice(0, 300)}` : "",
    ]
      .filter(Boolean)
      .join(" ");
    return {
      reference,
      mode: chat.mode as WebChatView["mode"],
      whatsappUrl: whatsappLink(widget.whatsappNumber!, text),
      message: `Opening WhatsApp with your question and reference ${reference}.`,
    };
  }
  if (channel === "call") {
    return {
      reference,
      mode: chat.mode as WebChatView["mode"],
      phoneNumber: widget.phoneNumber!,
      message: `Call ${widget.phoneNumber} and mention reference ${reference}: the team will see this chat.`,
    };
  }
  if (channel === "callback") {
    return {
      reference,
      mode: chat.mode as WebChatView["mode"],
      message: `Thanks! The team will call you on ${visitor.contact} (reference ${reference}).`,
    };
  }
  return {
    reference,
    mode: "waiting",
    message: "Connecting you with the team. Someone will reply here as soon as they can.",
  };
}

/** Two short sentences for the team: who wants what, and what's been done. */
async function summarise(businessId: string, chatId: string): Promise<string | null> {
  const prisma = getPrisma();
  try {
    const messages = await prisma.webChatMessage.findMany({
      where: { chatId, sender: { in: ["visitor", "agent", "staff"] } },
      orderBy: { createdAt: "asc" },
      take: 60,
    });
    if (messages.length === 0) return null;
    const transcript = messages
      .map(
        (m) =>
          `${m.sender === "visitor" ? "Visitor" : m.sender === "staff" ? "Team" : "Assistant"}: ${m.text}`,
      )
      .join("\n");
    const model = createLanguageModel(widgetModel(), await modelEnv(businessId));
    const result = await Promise.race([
      model.complete(
        [
          {
            role: "system",
            content:
              "You summarise a website chat for the business's team, who will take over. In at most two short sentences: who the visitor is (if they said), what they want, and anything already agreed or quoted. Plain text, no greeting.",
          },
          { role: "user", content: transcript },
        ],
        { temperature: 0 },
      ),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 8_000)),
    ]);
    const summary = result?.text.trim().slice(0, 600) || null;
    if (summary) await prisma.webChat.update({ where: { id: chatId }, data: { summary } });
    return summary;
  } catch (error) {
    console.warn(`Chat summary failed: ${String(error)}`);
    return null;
  }
}

// ----- The team's side (Inbox) ----------------------------------------------------------------

export interface InboxItem {
  id: string;
  title: string | null;
  agentName: string;
  mode: WebChatView["mode"];
  handoff: HandoffChannel | null;
  reference: string | null;
  summary: string | null;
  visitorName: string | null;
  visitorContact: string | null;
  needsAttention: boolean;
  lastMessage: string | null;
  lastMessageAt: string;
}

export async function inboxList(
  businessId: string,
  filter: "attention" | "all",
  search?: string,
): Promise<InboxItem[]> {
  const q = search?.trim();
  const chats = await getPrisma().webChat.findMany({
    where: {
      businessId,
      AND: [
        filter === "attention"
          ? { OR: [{ needsAttention: true }, { mode: { in: ["waiting", "live"] } }] }
          : // Chats where the visitor never wrote aren't conversations yet.
            { title: { not: null } },
        q
          ? {
              OR: [
                { reference: { contains: q.toUpperCase() } },
                { title: { contains: q, mode: "insensitive" as const } },
                { visitorContact: { contains: q } },
                { visitorName: { contains: q, mode: "insensitive" as const } },
              ],
            }
          : {},
      ],
    },
    orderBy: { lastMessageAt: "desc" },
    take: 100,
    include: {
      agent: { select: { name: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  return chats.map((c) => ({
    id: c.id,
    title: c.title,
    agentName: c.agent.name,
    mode: c.mode as WebChatView["mode"],
    handoff: (c.handoff as HandoffChannel | null) ?? null,
    reference: c.reference,
    summary: c.summary,
    visitorName: c.visitorName,
    visitorContact: c.visitorContact,
    needsAttention: c.needsAttention,
    lastMessage: c.messages[0]?.text ?? null,
    lastMessageAt: c.lastMessageAt.toISOString(),
  }));
}

/** Hand-offs waiting for the team: the Inbox badge. */
export async function attentionCount(businessId: string): Promise<number> {
  return getPrisma().webChat.count({
    where: { businessId, OR: [{ needsAttention: true }, { mode: "waiting" }] },
  });
}

export async function inboxChat(businessId: string, chatId: string) {
  const prisma = getPrisma();
  const chat = await prisma.webChat.findFirst({
    where: { id: chatId, businessId },
    include: { agent: { select: { name: true } }, messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!chat) return null;
  const [assigned, call] = await Promise.all([
    chat.assignedTo
      ? prisma.user.findUnique({ where: { id: chat.assignedTo }, select: { name: true } })
      : null,
    prisma.call.findUnique({ where: { threadId: chatId }, select: { id: true } }),
  ]);
  return {
    id: chat.id,
    title: chat.title,
    agentName: chat.agent.name,
    mode: chat.mode as WebChatView["mode"],
    handoff: (chat.handoff as HandoffChannel | null) ?? null,
    reference: chat.reference,
    summary: chat.summary,
    visitorName: chat.visitorName,
    visitorContact: chat.visitorContact,
    needsAttention: chat.needsAttention,
    assignedTo: assigned?.name ?? null,
    callId: call?.id ?? null,
    createdAt: chat.createdAt.toISOString(),
    messages: chat.messages.map(view),
  };
}

type Staff = { userId: string; name: string };

async function ownChat(businessId: string, chatId: string) {
  return getPrisma().webChat.findFirst({ where: { id: chatId, businessId } });
}

/** A team member takes the chat: the AI stops answering until they hand it back. */
export async function joinChat(businessId: string, chatId: string, staff: Staff) {
  const chat = await ownChat(businessId, chatId);
  if (!chat) return false;
  await getPrisma().webChat.update({
    where: { id: chatId },
    data: { mode: "live", assignedTo: staff.userId, needsAttention: false },
  });
  if (chat.mode !== "live") {
    await addMessages(chatId, [{ sender: "system", text: `${staff.name} joined the chat.` }]);
  }
  return true;
}

export async function staffReply(businessId: string, chatId: string, staff: Staff, text: string) {
  const chat = await ownChat(businessId, chatId);
  if (!chat) return false;
  if (chat.mode !== "live") await joinChat(businessId, chatId, staff);
  await addMessages(chatId, [{ sender: "staff", text, author: staff.name }]);
  return true;
}

/** The team member hands the chat back to the AI (or closes a call-back / WhatsApp hand-off). */
export async function finishHandoff(businessId: string, chatId: string, staff: Staff) {
  const chat = await ownChat(businessId, chatId);
  if (!chat) return false;
  await getPrisma().webChat.update({
    where: { id: chatId },
    data: { mode: "bot", needsAttention: false, assignedTo: null },
  });
  if (chat.mode === "live" || chat.mode === "waiting") {
    await addMessages(chatId, [
      { sender: "system", text: `${staff.name} left the chat. The assistant can help again.` },
    ]);
  }
  return true;
}
