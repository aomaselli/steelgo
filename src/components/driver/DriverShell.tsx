import type { ReactNode } from "react";
import { DriverBottomNav } from "./DriverBottomNav";
import { OfflineIndicator } from "./OfflineIndicator";

type Tab = "home" | "docs" | "sos" | "history" | "profile";

export function DriverShell({
  children,
  activeTab,
  noNav = false,
}: {
  children: ReactNode;
  activeTab: Tab;
  noNav?: boolean;
}) {
  return (
    <div
      className="mx-auto w-full max-w-[430px] flex flex-col bg-bg-base text-graphite-50 relative"
      style={{
        minHeight: "100dvh",
        WebkitTapHighlightColor: "transparent",
        userSelect: "none",
      }}
    >
      <OfflineIndicator />
      <main
        className="flex-1 overflow-y-auto"
        style={{
          WebkitOverflowScrolling: "touch",
          overscrollBehaviorY: "contain",
          paddingBottom: noNav ? 0 : `calc(68px + env(safe-area-inset-bottom))`,
        }}
      >
        {children}
      </main>
      {!noNav && <DriverBottomNav active={activeTab} />}
    </div>
  );
}
