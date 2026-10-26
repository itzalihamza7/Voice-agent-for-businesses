-- AlterTable
ALTER TABLE "agent_widgets" ADD COLUMN     "alert_whatsapp" TEXT,
ADD COLUMN     "live_chat" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "phone_number" TEXT,
ADD COLUMN     "whatsapp_number" TEXT;

-- CreateTable
CREATE TABLE "web_chats" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "title" TEXT,
    "mode" TEXT NOT NULL DEFAULT 'bot',
    "handoff" TEXT,
    "reference" TEXT,
    "summary" TEXT,
    "visitor_name" TEXT,
    "visitor_contact" TEXT,
    "needs_attention" BOOLEAN NOT NULL DEFAULT false,
    "assigned_to" TEXT,
    "handoff_at" TIMESTAMP(3),
    "last_message_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "web_chats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "web_chat_messages" (
    "id" TEXT NOT NULL,
    "chat_id" TEXT NOT NULL,
    "sender" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "author" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "web_chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "web_chats_reference_key" ON "web_chats"("reference");

-- CreateIndex
CREATE INDEX "web_chats_business_id_last_message_at_idx" ON "web_chats"("business_id", "last_message_at");

-- CreateIndex
CREATE INDEX "web_chats_business_id_needs_attention_idx" ON "web_chats"("business_id", "needs_attention");

-- CreateIndex
CREATE INDEX "web_chat_messages_chat_id_created_at_idx" ON "web_chat_messages"("chat_id", "created_at");

-- AddForeignKey
ALTER TABLE "web_chats" ADD CONSTRAINT "web_chats_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "web_chats" ADD CONSTRAINT "web_chats_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "web_chat_messages" ADD CONSTRAINT "web_chat_messages_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "web_chats"("id") ON DELETE CASCADE ON UPDATE CASCADE;
