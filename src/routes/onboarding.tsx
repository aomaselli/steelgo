import { createFileRoute } from "@tanstack/react-router";
import { OnboardingPage } from "@/pages/OnboardingPage";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";

export const Route = createFileRoute("/onboarding")({ component: () => <ProtectedRoute><OnboardingPage /></ProtectedRoute> });
