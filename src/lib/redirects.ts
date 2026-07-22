import type { UserRole } from "@/types/database";

export const ROLE_HOME: Record<UserRole, string> = {
  shipper: "/shipper",
  carrier: "/carrier",
  driver: "/driver",
  admin: "/admin",
};

export const roleHome = (role: UserRole | null | undefined): string =>
  role ? ROLE_HOME[role] : "/onboarding";
