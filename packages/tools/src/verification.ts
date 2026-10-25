import { resolveTxt } from "node:dns/promises";
import { VERIFICATION_FILE_PATH, VERIFICATION_TXT_PREFIX } from "@voice-agent/shared";
import { assertPublicUrl } from "./network";
import type { NetworkOptions } from "./webhook";

// Proof that a business owns the domain of an API it connects, before agents may change data
// through it: a DNS TXT record "vesper-verify=<token>" on the API's host (or a parent domain),
// or the token in https://<host>/.well-known/vesper-verify.txt. Only reads, nothing changes.

export interface VerificationOptions extends NetworkOptions {
  resolveTxt?: (host: string) => Promise<string[][]>;
}

export interface VerificationResult {
  verified: boolean;
  /** How it was proven, or null. */
  method: "dns" | "file" | null;
  /** Where it was found or what was checked, for the UI. */
  checked: string[];
}

/** The host and its parent domains, down to two labels: api.example.com, example.com. */
export function candidateHosts(url: string): string[] {
  const labels = new URL(url).hostname.split(".");
  const hosts: string[] = [];
  for (let i = 0; i <= labels.length - 2; i++) hosts.push(labels.slice(i).join("."));
  return hosts.length ? hosts : [new URL(url).hostname];
}

export async function verifyDomain(
  apiUrl: string,
  token: string,
  options: VerificationOptions,
): Promise<VerificationResult> {
  const hosts = candidateHosts(apiUrl);
  const expected = VERIFICATION_TXT_PREFIX + token;
  const checked: string[] = [];

  for (const host of hosts) {
    checked.push(`TXT ${host}`);
    try {
      const records = await (options.resolveTxt ?? resolveTxt)(host);
      if (records.some((chunks) => chunks.join("").trim() === expected)) {
        return { verified: true, method: "dns", checked: [`TXT ${host}`] };
      }
    } catch {
      // No record (or no such name): try the next way.
    }
  }

  for (const host of hosts) {
    const url = `https://${host}${VERIFICATION_FILE_PATH}`;
    checked.push(url);
    try {
      await assertPublicUrl(url, options);
      const response = await (options.fetch ?? fetch)(url, {
        signal: AbortSignal.timeout(8_000),
        redirect: "manual",
      });
      if (!response.ok) continue;
      const text = (await response.text()).slice(0, 1_000);
      if (text.split(/\s+/).includes(token))
        return { verified: true, method: "file", checked: [url] };
    } catch {
      // Unreachable: try the next host.
    }
  }
  return { verified: false, method: null, checked };
}
