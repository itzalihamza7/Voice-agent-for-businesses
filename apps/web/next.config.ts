import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source, so Next.js compiles them.
  // Add each @voice-agent/* package here when the web app starts importing it.
  transpilePackages: ["@voice-agent/shared"],
  // Allow the dev server (hot reload) to be opened through the DDEV URL.
  allowedDevOrigins: ["*.ddev.site"],
};

export default nextConfig;
