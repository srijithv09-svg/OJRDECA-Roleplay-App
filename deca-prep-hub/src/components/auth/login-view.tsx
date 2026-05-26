"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { DOMAIN_ERROR_MESSAGE, SCHOOL_EMAIL_DOMAIN } from "@/lib/auth";
import { getSiteOrigin } from "@/lib/site-url";
import { getSupabaseClient } from "@/lib/supabase/client";

export function LoginView() {
  const searchParams = useSearchParams();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loginError = searchParams.get("error");
  const callbackErrorMessage = searchParams.get("message");
  const domainError = loginError === "domain" || loginError === "unauthorized_domain";
  const authError = loginError === "auth" || loginError === "auth_callback_failed";

  useEffect(() => {
    if (
      authError &&
      callbackErrorMessage &&
      process.env.NODE_ENV !== "production"
    ) {
      console.error("[auth callback]", callbackErrorMessage);
    }
  }, [authError, callbackErrorMessage]);

  async function signInWithGoogle() {
    setIsSigningIn(true);
    setError(null);

    const supabase = getSupabaseClient();
    const origin = getSiteOrigin();
    const redirectTo = origin ? `${origin}/auth/callback` : undefined;

    const { error: signInError } = await supabase.auth.signInWithOAuth({
      options: {
        queryParams: {
          hd: SCHOOL_EMAIL_DOMAIN.replace("@", ""),
        },
        redirectTo,
      },
      provider: "google",
    });

    if (signInError) {
      setError(signInError.message);
      setIsSigningIn(false);
    }
  }

  return (
    <main className="grid min-h-screen bg-slate-50 px-4 py-8">
      <div className="fixed right-4 top-4 z-10">
        <ThemeToggle />
      </div>
      <section className="mx-auto grid w-full max-w-6xl items-center gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-700">
            OJR DECA
          </p>
          <h1 className="mt-3 text-4xl font-bold text-slate-950">
            DECA Prep Hub
          </h1>
          <p className="mt-4 text-base leading-7 text-slate-600">
            Sign in with your Owen J. Roberts school Google account to access
            roleplays, exams, analytics, calendar tools, and approved chapter resources.
          </p>
          <div className="mt-6 grid gap-3 text-sm text-slate-600 sm:grid-cols-3">
            {["Roleplay practice", "Cluster exams", "Progress analytics"].map((label) => (
              <div className="rounded-lg border border-slate-200 bg-white p-3 font-semibold" key={label}>
                {label}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/60">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-lg bg-blue-700 text-sm font-black text-white">
              OJR
            </span>
            <div>
              <h2 className="text-xl font-bold text-slate-950">Welcome back</h2>
              <p className="mt-1 text-sm text-slate-500">Owen J. Roberts DECA portal</p>
            </div>
          </div>

          {domainError ? (
            <div className="mt-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-medium leading-6 text-red-800">
              {DOMAIN_ERROR_MESSAGE}
            </div>
          ) : null}

          {authError ? (
            <div className="mt-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-medium leading-6 text-red-800">
              Google sign-in could not be completed. Please try again.
            </div>
          ) : null}

          {error ? (
            <div className="mt-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-medium leading-6 text-red-800">
              {error}
            </div>
          ) : null}

          <button
            className="mt-6 flex min-h-12 w-full items-center justify-center gap-3 rounded-md bg-blue-700 px-4 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-blue-300"
            disabled={isSigningIn}
            onClick={signInWithGoogle}
            type="button"
          >
            <span className="grid h-6 w-6 place-items-center rounded bg-white text-sm font-bold text-blue-700">
              G
            </span>
            {isSigningIn ? "Redirecting to Google..." : "Sign in with Google"}
          </button>

          <p className="mt-4 text-sm leading-6 text-slate-500">
            Access is limited to email addresses ending in {SCHOOL_EMAIL_DOMAIN}.
          </p>
        </div>
      </section>
    </main>
  );
}
