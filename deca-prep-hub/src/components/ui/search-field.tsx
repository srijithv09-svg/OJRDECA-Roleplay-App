import { Icon } from "./icon";

export function SearchField({ placeholder }: { placeholder: string }) {
  return (
    <label className="relative block">
      <span className="sr-only">Search</span>
      <Icon
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
        name="search"
      />
      <input
        className="h-11 w-full rounded-md border border-slate-200 bg-white pl-10 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
        placeholder={placeholder}
        type="search"
      />
    </label>
  );
}
