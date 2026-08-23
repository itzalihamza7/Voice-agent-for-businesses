import { assertPublicUrl } from "@voice-agent/tools";
import { extractText, getDocumentProxy } from "unpdf";

// Getting plain text out of sources: web pages and PDFs. (Pasted text needs nothing.)

const MAX_BYTES = 2_000_000;
const MAX_REDIRECTS = 3;

/**
 * Downloads a web page and turns its HTML into text, keeping headings as "# Heading" so the
 * headings chunker can use them. URLs are user input, so every hop goes through the SSRF guard.
 */
export async function extractFromUrl(
  url: string,
  options: { allowPrivateHosts: boolean; fetch?: typeof fetch },
): Promise<{ title: string; text: string }> {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicUrl(current, options);
    const response = await (options.fetch ?? fetch)(current, {
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
      headers: { accept: "text/html, text/plain" },
    });
    // Follow redirects ourselves, so each new address is checked too.
    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location) {
      current = new URL(location, current).toString();
      continue;
    }
    if (!response.ok) throw new Error(`The page answered HTTP ${response.status}.`);
    const type = response.headers.get("content-type") ?? "";
    if (!/text\/(html|plain)/.test(type))
      throw new Error(`Not a web page (${type || "unknown type"}).`);
    const body = await response.text();
    if (body.length > MAX_BYTES) throw new Error("The page is too large.");
    if (type.includes("text/plain")) return { title: new URL(current).hostname, text: body };
    return htmlToText(body, new URL(current).hostname);
  }
  throw new Error("Too many redirects.");
}

export function htmlToText(
  html: string,
  fallbackTitle = "Web page",
): { title: string; text: string } {
  const title =
    decode(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim() ?? "") || fallbackTitle;
  const text = html
    // Parts that aren't content (the title is returned separately).
    .replace(/<(head|script|style|noscript|svg|nav|footer|form)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    // Structure we want to keep.
    .replace(
      /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi,
      (_, level: string, inner: string) => `\n${"#".repeat(Number(level))} ${inner}\n`,
    )
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<(br|\/p|\/div|\/tr|\/li|\/section|\/article)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return {
    title,
    text: decode(text)
      .split("\n")
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .join("\n"),
  };
}

function decode(text: string): string {
  const named: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
    pound: "£",
    euro: "€",
    ndash: "–",
    mdash: "—",
    lsquo: "‘",
    rsquo: "’",
    ldquo: "“",
    rdquo: "”",
    hellip: "…",
  };
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, code: string) => {
    if (code.startsWith("#x") || code.startsWith("#X"))
      return String.fromCodePoint(parseInt(code.slice(2), 16));
    if (code.startsWith("#")) return String.fromCodePoint(Number(code.slice(1)));
    return named[code.toLowerCase()] ?? match;
  });
}

/** Text of every page of a PDF. Scanned PDFs (images only) have no text: that needs OCR. */
export async function extractFromPdf(bytes: Uint8Array): Promise<{ text: string; pages: number }> {
  const pdf = await getDocumentProxy(bytes);
  const { text, totalPages } = await extractText(pdf, { mergePages: false });
  const pages = Array.isArray(text) ? text : [text];
  return {
    text: pages
      .map((page) => page.trim())
      .filter(Boolean)
      .join("\n\n"),
    pages: totalPages,
  };
}
