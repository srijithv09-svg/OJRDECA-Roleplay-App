"use client";

import { useEffect, useState } from "react";

export function PrepTimer() {
  const [minutes, setMinutes] = useState(10);
  const [remaining, setRemaining] = useState(600);
  const [deadline, setDeadline] = useState<number | null>(null);
  const finished = remaining === 0;

  useEffect(() => {
    if (deadline === null) return;
    const interval = window.setInterval(() => {
      const next = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setRemaining(next);
      if (next === 0) setDeadline(null);
    }, 250);
    return () => window.clearInterval(interval);
  }, [deadline]);

  function reset(duration = minutes) {
    setDeadline(null);
    setRemaining(duration * 60);
  }

  return (
    <div className="space-y-4">
      <label className="flex items-center justify-between gap-3 text-sm text-[var(--muted)]">
        Preparation time
        <select
          aria-label="Preparation time"
          className="rounded-md border border-border bg-card px-2 py-1"
          value={minutes}
          onChange={(e) => {
            const value = Number(e.target.value);
            setMinutes(value);
            reset(value);
          }}
        >
          {[5, 10, 15, 30].map((value) => (
            <option key={value} value={value}>
              {value} minutes
            </option>
          ))}
        </select>
      </label>
      <p
        aria-label="Time remaining"
        className="text-4xl font-medium tabular-nums tracking-tight"
      >
        {String(Math.floor(remaining / 60)).padStart(2, "0")}:
        {String(remaining % 60).padStart(2, "0")}
      </p>
      <p role="status" className="text-sm text-[var(--muted)]">
        {finished
          ? "Preparation time is up. Present your response when ready."
          : deadline
            ? "Preparation in progress"
            : "Ready when you are"}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          className="min-h-10 rounded-md bg-primary px-4 text-sm font-medium text-white"
          onClick={() => {
            if (deadline) {
              setRemaining(
                Math.max(0, Math.ceil((deadline - Date.now()) / 1000)),
              );
              setDeadline(null);
            } else {
              const seconds = remaining || minutes * 60;
              setRemaining(seconds);
              setDeadline(Date.now() + seconds * 1000);
            }
          }}
        >
          {deadline
            ? "Pause"
            : finished
              ? "Restart"
              : remaining === minutes * 60
                ? "Start timer"
                : "Resume"}
        </button>
        <button
          type="button"
          className="min-h-10 rounded-md border border-border px-4 text-sm font-medium"
          onClick={() => reset()}
        >
          Reset
        </button>
      </div>
    </div>
  );
}
