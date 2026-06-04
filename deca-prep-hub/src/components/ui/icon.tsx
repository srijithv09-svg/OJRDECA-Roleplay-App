import { cn } from "@/lib/utils";

export type IconName =
  | "analytics"
  | "calendar"
  | "chevronRight"
  | "dashboard"
  | "exams"
  | "roleplays"
  | "search"
  | "settings"
  | "moon"
  | "streak"
  | "sun"
  | "upload"
  | "users";

const iconPaths: Record<IconName, string[]> = {
  analytics: [
    "M4 19V5",
    "M4 19h16",
    "M8 16v-5",
    "M12 16V8",
    "M16 16v-9",
  ],
  calendar: [
    "M7 3v4",
    "M17 3v4",
    "M4 9h16",
    "M6 5h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z",
  ],
  chevronRight: ["M9 6l6 6-6 6"],
  dashboard: [
    "M4 5a1 1 0 0 1 1-1h5v7H4V5Z",
    "M14 4h5a1 1 0 0 1 1 1v3h-6V4Z",
    "M4 15h6v5H5a1 1 0 0 1-1-1v-4Z",
    "M14 12h6v7a1 1 0 0 1-1 1h-5v-8Z",
  ],
  exams: [
    "M7 4h8l4 4v12H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z",
    "M15 4v5h5",
    "M8 13h8",
    "M8 17h6",
  ],
  roleplays: [
    "M8 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
    "M16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
    "M3 20a5 5 0 0 1 10 0",
    "M12 20a5 5 0 0 1 9 0",
  ],
  search: ["M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z", "M21 21l-5.2-5.2"],
  settings: [
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
    "M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-1.9 3.2-.2-.1a1.7 1.7 0 0 0-1.9.1 8 8 0 0 1-1.6.9 1.7 1.7 0 0 0-1.1 1.6V23H9v-.3a1.7 1.7 0 0 0-1.1-1.6 8 8 0 0 1-1.6-.9 1.7 1.7 0 0 0-1.9-.1l-.2.1-1.9-3.2.1-.1A1.7 1.7 0 0 0 2.6 15 8.7 8.7 0 0 1 2.5 12a1.7 1.7 0 0 0-.8-1.7l-.2-.1L3.4 7l.2.1a1.7 1.7 0 0 0 1.9-.1 8 8 0 0 1 1.6-.9A1.7 1.7 0 0 0 8.2 4.5V4h3.6v.5a1.7 1.7 0 0 0 1.1 1.6 8 8 0 0 1 1.6.9 1.7 1.7 0 0 0 1.9.1l.2-.1 1.9 3.2-.2.1a1.7 1.7 0 0 0-.8 1.7 8.7 8.7 0 0 1-.1 3Z",
  ],
  moon: ["M21 12.8A8.5 8.5 0 1 1 11.2 3a6.8 6.8 0 0 0 9.8 9.8Z"],
  streak: ["M12 2s5 5 5 10a5 5 0 0 1-10 0c0-5 5-10 5-10Z", "M12 14v4"],
  sun: [
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z",
    "M12 2v2",
    "M12 20v2",
    "M4.9 4.9l1.4 1.4",
    "M17.7 17.7l1.4 1.4",
    "M2 12h2",
    "M20 12h2",
    "M4.9 19.1l1.4-1.4",
    "M17.7 6.3l1.4-1.4",
  ],
  upload: [
    "M12 16V4",
    "M7 9l5-5 5 5",
    "M5 16v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3",
  ],
  users: [
    "M8 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
    "M2 21a6 6 0 0 1 12 0",
    "M17 11a3 3 0 1 0 0-6",
    "M15 21a5 5 0 0 1 7-4.6",
  ],
};

type IconProps = {
  name: IconName;
  className?: string;
  title?: string;
};

export function Icon({ name, className, title }: IconProps) {
  return (
    <svg
      aria-hidden={title ? undefined : true}
      className={cn("h-5 w-5 shrink-0", className)}
      fill="none"
      role={title ? "img" : undefined}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      {title ? <title>{title}</title> : null}
      {iconPaths[name].map((path) => (
        <path d={path} key={path} />
      ))}
    </svg>
  );
}
