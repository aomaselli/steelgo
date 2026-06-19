// Vercel serverless function entry point.
// Re-exports the TanStack Start handler from src/server.ts
// so Vercel detects /api/server as a valid function route.
export { default } from "../src/server";
