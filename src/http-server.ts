import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

export interface OAuthCallbackInput {
  code: string;
  state: string;
}

export interface OAuthCallbackResult {
  status: number;
  title: string;
  message: string;
}

export type OAuthCallbackHandler = (input: OAuthCallbackInput) => Promise<OAuthCallbackResult>;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function sendHtml(response: ServerResponse, status: number, title: string, message: string): void {
  response.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY"
  });
  response.end(`<!doctype html>
<html lang="en" dir="ltr">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)} · SoliChess</title>
    <style>
      :root { color-scheme: dark; font-family: system-ui, sans-serif; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #111318; color: #f4f5f7; }
      main { width: min(34rem, calc(100% - 2rem)); padding: 2rem; border: 1px solid #30333b; border-radius: 1rem; background: #1b1e24; box-sizing: border-box; }
      h1 { margin-top: 0; color: #72d58b; }
      p { line-height: 1.6; color: #c9ccd3; }
    </style>
  </head>
  <body><main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p></main></body>
</html>`);
}

export class AppHttpServer {
  private server: Server | null = null;

  constructor(private readonly oauthCallback?: OAuthCallbackHandler) {}

  async start(port: number): Promise<number> {
    if (this.server) throw new Error("HTTP server is already running");
    this.server = createServer((request, response) => {
      void this.handle(request, response).catch((error: unknown) => {
        console.error("HTTP request failed", error);
        if (!response.headersSent) sendHtml(response, 500, "Something went wrong", "Return to Discord and try again.");
        else response.end();
      });
    });

    await new Promise<void>((resolve, reject) => {
      this.server!.once("error", reject);
      this.server!.listen(port, "0.0.0.0", () => {
        this.server!.off("error", reject);
        resolve();
      });
    });

    const address = this.server.address();
    if (!address || typeof address === "string") throw new Error("Unable to determine HTTP server port");
    return address.port;
  }

  async stop(): Promise<void> {
    const activeServer = this.server;
    this.server = null;
    if (!activeServer) return;
    await new Promise<void>((resolve, reject) => {
      activeServer.close((error) => error ? reject(error) : resolve());
    });
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (request.method !== "GET") {
      response.writeHead(405, { Allow: "GET", "Content-Type": "text/plain; charset=utf-8" });
      response.end("Method Not Allowed");
      return;
    }

    const url = new URL(request.url ?? "/", "http://localhost");
    if (url.pathname === "/health") {
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
      response.end(JSON.stringify({ status: "ok", service: "solichess" }));
      return;
    }

    if (url.pathname !== "/oauth/chesscom/callback") {
      sendHtml(response, 404, "Not found", "This SoliChess endpoint does not exist.");
      return;
    }

    const oauthError = url.searchParams.get("error");
    if (oauthError) {
      const description = url.searchParams.get("error_description") ?? "Authorization was cancelled or denied.";
      sendHtml(response, 400, "Connection cancelled", description);
      return;
    }

    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (!code || !state) {
      sendHtml(response, 400, "Invalid callback", "The authorization response is missing a code or state value.");
      return;
    }

    if (!this.oauthCallback) {
      sendHtml(
        response,
        503,
        "OAuth setup pending",
        "SoliChess has received the callback, but Chess.com client credentials have not been configured yet."
      );
      return;
    }

    const result = await this.oauthCallback({ code, state });
    sendHtml(response, result.status, result.title, result.message);
  }
}
