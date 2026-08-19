import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

// Guard against SSRF (server-side request forgery). Webhook and MCP URLs are entered by users,
// but our server makes the request, from inside our network. Without a check, a URL like
// http://169.254.169.254/ (cloud metadata) or http://db:5432/ would let anyone use our server
// to reach internal services. Public addresses only, unless explicitly allowed for local testing
// (TOOLS_ALLOW_PRIVATE_HOSTS=true).
//
// Known limit: the address is checked before the request; a DNS name that changes between the
// check and the request (DNS rebinding) could still slip through. Production would also pin the
// checked address or route tool traffic through an egress proxy.

export type HostLookup = (hostname: string) => Promise<string[]>;

const defaultLookup: HostLookup = async (hostname) =>
  (await lookup(hostname, { all: true })).map((entry) => entry.address);

export async function assertPublicUrl(
  url: string,
  options: { allowPrivateHosts: boolean; lookup?: HostLookup },
): Promise<void> {
  const parsed = new URL(url);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http and https URLs are allowed.");
  }
  if (options.allowPrivateHosts) return;

  const hostname = parsed.hostname.replace(/^\[|\]$/g, "");
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw new Error(`${hostname} is a private address.`);
  }
  const addresses = isIP(hostname) ? [hostname] : await (options.lookup ?? defaultLookup)(hostname);
  const blocked = addresses.find(isPrivateAddress);
  if (blocked) throw new Error(`${hostname} resolves to a private address (${blocked}).`);
}

export function isPrivateAddress(address: string): boolean {
  const v4 = address.startsWith("::ffff:") ? address.slice(7) : address;
  if (isIP(v4) === 4) {
    const [a = 0, b = 0] = v4.split(".").map(Number);
    return (
      a === 0 || // "this" network
      a === 10 ||
      a === 127 || // loopback
      (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
      (a === 169 && b === 254) || // link-local, incl. cloud metadata
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224 // multicast and reserved
    );
  }
  const lower = address.toLowerCase();
  return (
    lower === "::" ||
    lower === "::1" ||
    lower.startsWith("fc") ||
    lower.startsWith("fd") || // unique local
    lower.startsWith("fe80") // link-local
  );
}
