import type { Metadata } from "next";
import { Inbox } from "@/features/inbox/Inbox";

export const metadata: Metadata = { title: "Inbox" };

// The link in WhatsApp alerts: the Inbox with this chat open.
export default async function InboxChatPage({ params }: { params: Promise<{ chatId: string }> }) {
  return <Inbox chatId={(await params).chatId} />;
}
