import type { Metadata } from "next";
import { Inbox } from "@/features/inbox/Inbox";

export const metadata: Metadata = { title: "Inbox" };

export default function InboxPage() {
  return <Inbox chatId={null} />;
}
