// Vercel serverless function: TanStack Start SSR handler.
// Uses entry.fetch() — the correct call pattern per src/server.ts (ServerEntry type).
// @tanstack/react-start/server-entry resolves to { fetch: (request: Request) => Response }.

import type { IncomingMessage, ServerResponse } from "node:http";

type ServerEntry = {
        fetch: (request: Request) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
        if (!serverEntryPromise) {
                  serverEntryPromise = import("@tanstack/react-start/server-entry").then(
                              (m) => ((m as { default?: ServerEntry }).default ?? (m as unknown as ServerEntry)),
                            );
        }
        return serverEntryPromise;
}

export default async function handler(
        req: IncomingMessage,
        res: ServerResponse,
      ) {
        try {
                  // Build full URL from host header + request URL
          const host = req.headers.host ?? "localhost";
                  const protocol = req.headers["x-forwarded-proto"] ?? "https";
                  const url = new URL(req.url ?? "/", `${protocol}://${host}`);

          // Convert IncomingMessage to Web API Request
          const headers = new Headers();
                  for (const [key, value] of Object.entries(req.headers)) {
                              if (value) {
                                            const values = Array.isArray(value) ? value : [value];
                                            for (const v of values) headers.append(key, v);
                              }
                  }

          const webRequest = new Request(url.toString(), {
                      method: req.method ?? "GET",
                      headers,
                      body:
                                    req.method !== "GET" && req.method !== "HEAD"
                          ? (req as unknown as ReadableStream)
                                      : undefined,
          });

          // Resolve TanStack Start server entry and call entry.fetch()
          const entry = await getServerEntry();

          if (typeof entry.fetch !== "function") {
                      console.error("[api/server] entry.fetch is not a function. Entry keys:", Object.keys(entry));
                      res.statusCode = 500;
                      res.end("Internal Server Error: server entry misconfigured");
                      return;
          }

          const response = await entry.fetch(webRequest);

          // Write Web API Response back to Node.js ServerResponse
          res.statusCode = response.status;
                  response.headers.forEach((value, key) => {
                              res.setHeader(key, value);
                  });
                  const body = await response.arrayBuffer();
                  res.end(Buffer.from(body));
        } catch (err) {
                  console.error("[api/server] unhandled error:", err);
                  res.statusCode = 500;
                  res.end("Internal Server Error");
        }
}
