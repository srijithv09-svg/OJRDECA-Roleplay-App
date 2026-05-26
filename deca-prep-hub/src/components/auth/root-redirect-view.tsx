"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Card } from "@/components/ui/card";
import { getSupabaseClient } from "@/lib/supabase/client";

export function RootRedirectView() {
  const router = useRouter();

  useEffect(() => {
    let isActive = true;

    async function redirectFromRoot() {
      try {
        const supabase = getSupabaseClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!isActive) {
          return;
        }

        router.replace(session ? "/dashboard" : "/login");
      } catch {
        if (isActive) {
          router.replace("/login");
        }
      }
    }

    void redirectFromRoot();

    return () => {
      isActive = false;
    };
  }, [router]);

  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-4">
      <Card className="text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-700">
          OJR DECA
        </p>
        <h1 className="mt-3 text-xl font-bold text-slate-950">Opening your workspace</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Checking your session and sending you to the right page.
        </p>
      </Card>
    </main>
  );
}
