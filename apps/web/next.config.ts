import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source, so Next.js compiles them.
  // Every @voice-agent/* package the web app imports (directly or indirectly) must be listed.
  transpilePackages: [
    "@voice-agent/agent-config",
    "@voice-agent/db",
    "@voice-agent/evals",
    "@voice-agent/orchestrator",
    "@voice-agent/pipeline",
    "@voice-agent/rag",
    "@voice-agent/shared",
    "@voice-agent/tools",
  ],
  // Allow the dev server (hot reload) to be opened through the DDEV URL.
  allowedDevOrigins: ["*.ddev.site"],
};

export default nextConfig;
