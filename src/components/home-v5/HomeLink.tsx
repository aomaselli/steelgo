import { Link } from "@tanstack/react-router";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { destination } from "./routes";

type Props = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  /** Prototype path key, e.g. "login", "register", "solucoes/steelgo-pay". */
  to: string;
  children: ReactNode;
};

/** Same-tab navigation. Existing MVP routes go through the router; pending ones are plain anchors. */
export function HomeLink({ to, children, ...rest }: Props) {
  const d = destination(to);
  if (d.pending) {
    return (
      <a href={d.href} data-integration-pending="true" {...rest}>
        {children}
      </a>
    );
  }
  return (
    <Link to={d.href as "/"} {...rest}>
      {children}
    </Link>
  );
}
