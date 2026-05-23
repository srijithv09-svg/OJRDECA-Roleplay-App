import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "./icon";
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
        "inline-flex min-h-10 items-center justify-center gap-2 rounded-md px-3 text-sm font-semibold transition",
        variant === "primary"
          ? "bg-blue-700 text-white hover:bg-blue-800"
          : "border border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:text-blue-700",
        className,
      )}
      href={href}
    >
      {children}
      <Icon className="h-4 w-4" name="chevronRight" />
    </Link>
  );
}
