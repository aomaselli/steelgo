import { createFileRoute } from "@tanstack/react-router";
import { CallbackPage } from "@/pages/auth/CallbackPage";

export const Route = createFileRoute("/auth/callback")({ component: CallbackPage });
