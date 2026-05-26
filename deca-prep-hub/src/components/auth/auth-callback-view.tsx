"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { isAllowedSchoolEmail } from "@/lib/auth";
import { getCurrentProfile } from "@/lib/services/profiles";
import { getSupabaseClient } from "@/lib/supabase/client";

function loginWithAuthError(message: string) {
  const params = new URLSearchParams({
    error: "auth",
    message,
  });

  return `/login?${params.toString()}`;
}

export function AuthCallbackView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [statusMessage, setStatusMessage] = useState("Completing secure sign-in.");

  useEffect(() => {
    let isActive = true;

    async function completeSignIn() {
      const supabase = getSupabaseClient();
      const providerError =
        searchParams.get("error_description") ??
        searchParams.get("error") ??
        searchParams.get("error_code");

      if (providerError) {
        router.replace(loginWithAuthError(providerError));
        return;
      }

      const code = searchParams.get("code");

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);

        if (error) {
          router.replace(loginWithAuthError(error.message));
          return;
        }
      }

      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (!isActive) {
        return;
      }

      if (sessionError) {
        router.replace(loginWithAuthError(sessionError.message));
        return;
      }

      if (!session) {
        router.replace(loginWithAuthError("No session was returned after Google sign-in."));
        return;
      }

      if (!isAllowedSchoolEmail(session.user.email)) {
        await supabase.auth.signOut();
        router.replace("/login?error=domain");
        return;
      }

      setStatusMessage("Preparing your dashboard.");

      try {
        await getCurrentProfile();
      } catch {
        await supabase.auth.signOut();
        router.replace(loginWithAuthError("Your profile could not be prepared."));
        return;
      }

      router.replace("/dashboard");
    }

    void completeSignIn();

    return () => {
      isActive = false;
    };
  }, [router, searchParams]);

  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-4">
      <Card className="text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-700">
          DECA Prep Hub
        </p>
        <h1 className="mt-3 text-xl font-bold text-slate-950">Signing you in</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">{statusMessage}</p>
      </Card>
    </main>
  );
}
