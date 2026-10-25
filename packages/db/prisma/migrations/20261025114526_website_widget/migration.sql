-- CreateTable
CREATE TABLE "agent_widgets" (
    "agent_id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "public_id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "allowed_hosts" TEXT[],
    "color" TEXT NOT NULL DEFAULT '#6d43f5',
    "title" TEXT,
    "daily_cost_cap_usd" DOUBLE PRECISION NOT NULL DEFAULT 2,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_widgets_pkey" PRIMARY KEY ("agent_id")
);

-- CreateTable
CREATE TABLE "widget_usage" (
    "agent_id" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "chats" INTEGER NOT NULL DEFAULT 0,
    "messages" INTEGER NOT NULL DEFAULT 0,
    "cost_usd" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "widget_usage_pkey" PRIMARY KEY ("agent_id","day")
);

-- CreateIndex
CREATE UNIQUE INDEX "agent_widgets_public_id_key" ON "agent_widgets"("public_id");

-- CreateIndex
CREATE INDEX "agent_widgets_business_id_idx" ON "agent_widgets"("business_id");

-- AddForeignKey
ALTER TABLE "agent_widgets" ADD CONSTRAINT "agent_widgets_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_widgets" ADD CONSTRAINT "agent_widgets_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "widget_usage" ADD CONSTRAINT "widget_usage_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agent_widgets"("agent_id") ON DELETE CASCADE ON UPDATE CASCADE;
