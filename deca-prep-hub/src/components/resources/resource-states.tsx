import { Card } from "@/components/ui/card";
import { getFriendlyErrorMessage } from "@/lib/errors";

export function ResourceLoadingState() {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {Array.from({ length: 4 }).map((_, index) => (
        <Card className="min-h-64 animate-pulse" key={index}>
          <div className="flex gap-2">
            <div className="h-7 w-24 rounded-md bg-slate-100" />
            <div className="h-7 w-16 rounded-md bg-slate-100" />
          </div>
          <div className="mt-6 h-6 w-3/4 rounded bg-slate-100" />
          <div className="mt-3 h-4 w-1/2 rounded bg-slate-100" />
          <div className="mt-8 space-y-3">
            <div className="h-4 rounded bg-slate-100" />
            <div className="h-4 w-5/6 rounded bg-slate-100" />
          </div>
        </Card>
      ))}
    </div>
  );
}

export function ResourceEmptyState({ label }: { label: string }) {
  return (
    <Card className="grid min-h-64 place-items-center text-center">
      <div>
        <h2 className="text-lg font-semibold text-slate-950">No {label} found</h2>
        <p className="mt-2 max-w-md text-sm leading-6 text-slate-600">
          Resources from Supabase will appear here once matching rows are available
          in the resources table.
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
        className="mt-5 h-10 rounded-md bg-red-700 px-3 text-sm font-semibold text-white transition hover:bg-red-800"
        onClick={onRetry}
        type="button"
      >
        Try again
      </button>
    </Card>
  );
}
