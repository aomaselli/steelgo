import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

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

function brandedErrorResponse(): Response {
    const error = consumeLastCapturedError();
    const html = renderErrorPage(error);
    return new Response(html, {
          status: 500,
          headers: { "Content-Type": "text/html; charset=utf-8" },
    });
}

export default async function handler(request: Request): Promise<Response> {
    try {
          const entry = await getServerEntry();
          const response = await entry.fetch(request);
          return response;
    } catch (err) {
          console.error("[server] unhandled error:", err);
          return brandedErrorResponse();
    }
}
export { handler as fetch };
