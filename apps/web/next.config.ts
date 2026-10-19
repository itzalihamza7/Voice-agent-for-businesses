import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Production: a self-contained server in .next/standalone (see Dockerfile). The tracing root is
  // the monorepo, so workspace packages are included.
  output: "standalone",
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
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
