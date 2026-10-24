import { assertPublicUrl } from "@voice-agent/tools";

// Finding a website's pages from its sitemap, so a business can fill its knowledge base by
// typing its address. Only the site's own pages, in one language (sites often list every page
// once per language: /en/..., /es/...), most important first.

export interface SitemapOptions {
  allowPrivateHosts: boolean;
  fetch?: typeof fetch;
  /** At most this many pages. */
  limit?: number;
}

export async function sitemapPages(siteUrl: string, options: SitemapOptions): Promise<string[]> {
  const site = new URL(siteUrl);
  const read = async (url: string): Promise<string> => {
    await assertPublicUrl(url, options);
    const response = await (options.fetch ?? fetch)(url, {
      signal: AbortSignal.timeout(10_000),
      redirect: "manual",
    });
    return response.ok ? (await response.text()).slice(0, 2_000_000) : "";
  };
  const locs = (xml: string) => [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]!);

  let xml = await read(`${site.origin}/sitemap.xml`);
  // A sitemap index lists other sitemaps: read the first few.
  if (/<sitemapindex/i.test(xml)) {
    const parts = await Promise.all(locs(xml).slice(0, 5).map(read));
    xml = parts.join("\n");
  }
  const sameSite = [...new Set(locs(xml))].filter((url) => {
    try {
      return new URL(url).origin === site.origin;
    } catch {
      return false;
    }
  });
  return pickLanguage(sameSite, site.pathname).slice(0, options.limit ?? 25);
}

/**
 * Pages in one language: the one in the address the business typed (/en, /es…), else English,
 * else whichever has the most pages. Sites without language prefixes keep every page.
 */
export function pickLanguage(urls: string[], typedPath = "/"): string[] {
  const lang = (url: string) =>
    /^\/([a-z]{2})(?:[-_][a-z]{2})?(?:\/|$)/i.exec(new URL(url).pathname)?.[1]?.toLowerCase();
  const counts = new Map<string, number>();
  for (const url of urls) {
    const code = lang(url);
    if (code) counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  if (counts.size < 2) return urls;
  const typed = /^\/([a-z]{2})(?:\/|$)/i.exec(typedPath)?.[1]?.toLowerCase();
  const chosen =
    (typed && counts.has(typed) && typed) ||
    (counts.has("en") && "en") ||
    [...counts.entries()].sort((a, b) => b[1] - a[1])[0]![0];
  return urls.filter((url) => lang(url) === chosen);
}
