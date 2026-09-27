import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { PhoneCall } from "./phone-call";
import { WebClient } from "./web-client";

// The voice gateway: the door for phone calls. Twilio calls POST /twilio/voice when someone
// dials one of our numbers; we answer with TwiML that streams the call's audio to
// wss://<host>/twilio/stream, where each connection is one PhoneCall.

const port = Number(process.env.GATEWAY_PORT ?? 8080);
const web = new WebClient(
  process.env.WEB_URL ?? "http://localhost:3000",
  process.env.GATEWAY_SECRET ?? "",
);

const server = createServer(async (request, response) => {
  if (request.method === "POST" && request.url?.startsWith("/twilio/voice")) {
    let body = "";
    for await (const chunk of request) body += chunk;
    const form = new URLSearchParams(body);
    // Twilio sends the public host it called; the stream goes back to the same host.
    const host = process.env.PUBLIC_HOST ?? request.headers.host ?? `localhost:${port}`;
    const escape = (value: string) => value.replace(/[<>&"]/g, "");
    response.writeHead(200, { "content-type": "text/xml" });
    response.end(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Connect><Stream url="wss://${escape(host)}/twilio/stream">` +
        `<Parameter name="to" value="${escape(form.get("To") ?? "")}"/>` +
        `<Parameter name="from" value="${escape(form.get("From") ?? "")}"/>` +
        `</Stream></Connect></Response>`,
    );
    return;
  }
  if (request.url === "/health") {
    response.writeHead(200).end("ok");
    return;
  }
  response.writeHead(404).end();
});

const sockets = new WebSocketServer({ server, path: "/twilio/stream" });
sockets.on("connection", (socket) => new PhoneCall(socket, web));

server.listen(port, () => console.log(`voice gateway listening on :${port}`));
