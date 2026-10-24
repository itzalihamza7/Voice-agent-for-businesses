import type { Metadata } from "next";
import { ConnectWizard } from "@/features/onboarding/ConnectWizard";
import { PageHeader } from "@/features/ui/PageHeader";
import { currentUser } from "@/server/auth";

export const metadata: Metadata = { title: "Connect your website" };

export default async function ConnectPage() {
  const user = await currentUser();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Set up from your website"
        description="Type your website's address. We read its pages and look for the booking system it uses, with read-only requests: nothing on your site changes."
      />
      <ConnectWizard businessName={user?.businessName ?? ""} />
    </div>
  );
}
