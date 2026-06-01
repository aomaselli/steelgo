import type { ReactNode } from "react";
import { Sidebar, type ShellRole } from "./Sidebar";
import { Topbar } from "./Topbar";

export function AppShell({ role, children }: { role: ShellRole; children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-bg-base text-graphite-100">
      <Sidebar role={role} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="flex-1 overflow-x-hidden p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
