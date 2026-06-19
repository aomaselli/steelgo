// Vercel serverless function: TanStack Start SSR handler.
// Fixes the URL issue: Vercel passes a Request with a relative URL path,
// but TanStack Start (via srvx) requires a full absolute URL.

import type { IncomingMessage, ServerResponse } from "node:http";

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

        // Dynamically import TanStack Start server entry
        const { default: handle } = await import(
                  "@tanstack/react-start/server-entry"
                );
              const response = await (handle as (r: Request) => Promise<Response>)(
                        webRequest,
                      );

        // Write response back to Node.js response
        res.statusCode = response.status;
              response.headers.forEach((value: string, key: string) => {
                        res.setHeader(key, value);
              });
              const body = await response.arrayBuffer();
              res.end(Buffer.from(body));
      } catch (err) {
              console.error("[api/server] unhandled error:", err);
              res.statusCode = 500;
              res.setHeader("Content-Type", "text/html; charset=utf-8");
              res.end("<h1>500 Internal Server Error</h1>");
      }
}
