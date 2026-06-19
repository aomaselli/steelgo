// Vercel serverless function: TanStack Start SSR handler.
// Self-contained — imports only from npm packages so Vercel
// can bundle this function without needing src/ TypeScript sources.

import type { ServerEntry } from "@tanstack/react-start/server-entry";

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
    if (!serverEntryPromise) {
          serverEntryPromise = import("@tanstack/react-start/server-entry").then(
                  (m) => (m.default ?? m) as ServerEntry,
                );
    }
    return serverEntryPromise;
}

export default async function handler(request: Request): Promise<Response> {
    try {
          const entry = await getServerEntry();
          return await entry.fetch(request);
    } catch (err) {
          console.error("[api/server] unhandled error:", err);
          return new Response("<h1>500 Internal Server Error</h1>", {
                  status: 500,
                  headers: { "Content-Type": "text/html; charset=utf-8" },
          });
    }
}
