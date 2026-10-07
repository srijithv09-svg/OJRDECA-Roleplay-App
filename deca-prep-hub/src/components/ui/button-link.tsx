import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type ButtonLinkProps = {
  children: ReactNode;
  href: string;
  variant?: "primary" | "secondary";
  className?: string;
};

export function ButtonLink({
  children,
  href,
  variant = "secondary",
  className,
}: ButtonLinkProps) {
  return (
    <Link
      className={cn(
        "ui-button",
        variant === "primary"
          ? "ui-button-primary"
          : "ui-button-secondary",
        className,
      )}
      href={href}
    >
      {children}
    </Link>
  );
}
