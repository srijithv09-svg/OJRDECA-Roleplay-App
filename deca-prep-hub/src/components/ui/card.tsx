import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type CardProps = {
  children: ReactNode;
  className?: string;
};

export function Card({ children, className }: CardProps) {
  return (
    <section
      className={cn(
        "rounded-md border border-border bg-card p-5",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function CardHeader({
  eyebrow,
  title,
  action,
}: {
  eyebrow?: string;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-4">
      <div>
        {eyebrow ? (
          <p className="text-xs font-medium text-slate-500">
            {eyebrow}
          </p>
        ) : null}
        <h2 className="mt-1 text-base font-semibold text-foreground">{title}</h2>
      </div>
      {action}
    </div>
  );
}
