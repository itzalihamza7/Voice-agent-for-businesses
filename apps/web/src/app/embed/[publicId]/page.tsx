import type { Metadata } from "next";
import { WidgetChat } from "@/features/widget/WidgetChat";
import { publicConfig } from "@/server/widget";

export const metadata: Metadata = { title: "Chat", robots: { index: false } };

// The chat window the website widget opens in a frame (only on the business's allowed sites:
// the proxy sends the frame-ancestors header). Public: visitors aren't signed in.
export default async function EmbedPage({
  params,
  searchParams,
}: {
  params: Promise<{ publicId: string }>;
  searchParams: Promise<{ preview?: string }>;
}) {
  const { publicId } = await params;
  const preview = (await searchParams).preview === "1";
  const config = await publicConfig(publicId);
  if (!config) {
    return (
      <div className="flex h-dvh items-center justify-center bg-white p-6 text-center text-sm text-slate-500">
        This chat isn&apos;t available right now.
      </div>
    );
  }
  return (
    <WidgetChat publicId={publicId} title={config.title} color={config.color} preview={preview} />
  );
}
