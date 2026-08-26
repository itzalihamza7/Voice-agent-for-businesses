// POST /api/knowledge/extract: text from a web page ({ url } as JSON) or a PDF (form field "file").
import { extractFromPdf, extractFromUrl } from "@voice-agent/rag";
import { z } from "zod";
import { parseJsonBody } from "@/server/http";
import { allowPrivateHosts } from "@/server/knowledge";

const MAX_PDF_BYTES = 10_000_000;

export async function POST(request: Request) {
  try {
    if (request.headers.get("content-type")?.startsWith("multipart/form-data")) {
      const file = (await request.formData()).get("file");
      if (!(file instanceof File))
        return Response.json({ error: 'Send the PDF in a "file" field.' }, { status: 400 });
      if (file.size > MAX_PDF_BYTES)
        return Response.json({ error: "The PDF is larger than 10 MB." }, { status: 400 });
      const { text, pages } = await extractFromPdf(new Uint8Array(await file.arrayBuffer()));
      if (!text)
        return Response.json(
          { error: "No text found: is it a scanned PDF? That needs OCR." },
          { status: 422 },
        );
      return Response.json({ title: file.name.replace(/\.pdf$/i, ""), text, pages });
    }
    const parsed = await parseJsonBody(request, z.object({ url: z.url({ protocol: /^https?$/ }) }));
    if ("response" in parsed) return parsed.response;
    return Response.json(
      await extractFromUrl(parsed.data.url, { allowPrivateHosts: allowPrivateHosts() }),
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 422 },
    );
  }
}
