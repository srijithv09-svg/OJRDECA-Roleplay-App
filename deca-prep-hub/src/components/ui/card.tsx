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
        "rounded-lg border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/60",
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
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">
            {eyebrow}
          </p>
        ) : null}
        <h2 className="mt-1 text-lg font-semibold text-slate-950">{title}</h2>
      </div>
      {action}
    </div>
  );
}
