import { Card } from "@/components/ui/card";
import { getFriendlyErrorMessage } from "@/lib/errors";

export function ResourceLoadingState() {
  return (
    <div className="divide-y divide-border rounded-md border border-border bg-card" role="status">
      <span className="sr-only">Loading resources</span>
      {Array.from({ length: 4 }).map((_, index) => (
        <div aria-hidden="true" className="flex animate-pulse items-center justify-between gap-5 p-5" key={index}>
          <div className="w-3/4">
            <div className="h-4 w-3/4 rounded bg-card-muted" />
            <div className="mt-3 h-3 w-1/2 rounded bg-card-muted" />
          </div>
          <div className="h-10 w-24 rounded bg-card-muted" />
        </div>
      ))}
    </div>
  );
}

export function ResourceEmptyState({ label, filtered = false }: { label: string; filtered?: boolean }) {
  return (
    <Card className="grid min-h-48 place-items-center text-center">
      <div>
        <h2 className="text-base font-semibold text-foreground">{filtered ? `No matching ${label}` : `No ${label} yet`}</h2>
        <p className="mt-2 max-w-md text-sm leading-6 text-slate-600">
          {filtered ? "Try a different search or clear your filters to see all materials." : "Your chapter’s materials will appear here after an admin or advisor approves them."}
        </p>
      </div>
    </Card>
  );
}

export function ResourceErrorState({
  message,
  onRetry,
  title = "Unable to load resources",
}: {
  message: string;
  onRetry: () => void;
  title?: string;
}) {
  const friendlyMessage = getFriendlyErrorMessage(message);

  return (
    <Card className="border-red-200 bg-red-50">
      <h2 className="text-lg font-semibold text-red-950">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-red-800">{friendlyMessage}</p>
      <button
        className="ui-button ui-button-danger mt-4"
        onClick={onRetry}
        type="button"
      >
        Try again
      </button>
    </Card>
  );
}
