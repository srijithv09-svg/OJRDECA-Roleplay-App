"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Icon, type IconName } from "@/components/ui/icon";
import { DOMAIN_ERROR_MESSAGE, isAllowedSchoolEmail } from "@/lib/auth";
import { getCurrentProfile } from "@/lib/services/profiles";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types";
import { cn } from "@/lib/utils";

const navItems: Array<{ label: string; href: string; icon: IconName; adminOnly?: boolean }> = [
  { label: "Dashboard", href: "/dashboard", icon: "dashboard" },
  { label: "Roleplays", href: "/roleplays", icon: "roleplays" },
  { label: "Exams", href: "/exams", icon: "exams" },
  { label: "Analytics", href: "/analytics", icon: "analytics" },
  { label: "Calendar", href: "/calendar", icon: "calendar" },
  { label: "Upload", href: "/upload", icon: "upload", adminOnly: true },
  { label: "Admin Resources", href: "/admin/resources", icon: "exams", adminOnly: true },
  { label: "Admin Analytics", href: "/admin/analytics", icon: "analytics", adminOnly: true },
  { label: "Settings", href: "/settings", icon: "settings" },
];

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") {
    return pathname === "/" || pathname === "/dashboard";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isLoginPage = pathname === "/login";
  const [authState, setAuthState] = useState<"checking" | "allowed" | "blocked">("checking");
  const [profile, setProfile] = useState<Profile | null>(null);
  const visibleNavItems = navItems.filter((item) => !item.adminOnly || profile?.role === "admin");

  useEffect(() => {
    let isActive = true;
    const supabase = getSupabaseClient();

    async function validateSession() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!isActive) {
        return;
      }

      if (!session) {
        setAuthState(isLoginPage ? "allowed" : "blocked");

        if (!isLoginPage) {
          router.replace("/login");
        }

        return;
      }

      const email = session.user.email;

      if (!isAllowedSchoolEmail(email)) {
        await supabase.auth.signOut();

        if (!isActive) {
          return;
        }

        setAuthState(isLoginPage ? "allowed" : "blocked");
        router.replace(`/login?error=domain`);
        return;
      }

      try {
        const nextProfile = await getCurrentProfile();

        if (!isActive) {
          return;
        }

        setProfile(nextProfile);
      } catch {
        if (!isActive) {
          return;
        }

        await supabase.auth.signOut();
        setProfile(null);
        setAuthState(isLoginPage ? "allowed" : "blocked");
        router.replace("/login");
        return;
      }

      setAuthState("allowed");

      if (isLoginPage) {
        router.replace("/dashboard");
      }
    }

    void validateSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isActive) {
        return;
      }

      if (!session) {
        setProfile(null);
        setAuthState(isLoginPage ? "allowed" : "blocked");

        if (!isLoginPage) {
          router.replace("/login");
        }

        return;
      }

      if (!isAllowedSchoolEmail(session.user.email)) {
        void supabase.auth.signOut().finally(() => {
          if (isActive) {
            setProfile(null);
            setAuthState(isLoginPage ? "allowed" : "blocked");
            router.replace("/login?error=domain");
          }
        });
        return;
      }

      void getCurrentProfile()
        .then((nextProfile) => {
          if (!isActive) {
            return;
          }

          setProfile(nextProfile);
          setAuthState("allowed");

          if (isLoginPage) {
            router.replace("/dashboard");
          }
        })
        .catch(() => {
          void supabase.auth.signOut().finally(() => {
            if (isActive) {
              setProfile(null);
              setAuthState(isLoginPage ? "allowed" : "blocked");
              router.replace("/login");
            }
          });
        });
    });

    return () => {
      isActive = false;
      subscription.unsubscribe();
    };
  }, [isLoginPage, router]);

  if (isLoginPage) {
    return <>{children}</>;
  }

  if (authState !== "allowed") {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-50 px-4">
        <div className="rounded-lg border border-slate-200 bg-white p-6 text-center shadow-sm shadow-slate-200/60">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-700">
            DECA Prep Hub
          </p>
          <h1 className="mt-3 text-xl font-bold text-slate-950">Checking access</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {authState === "blocked" ? DOMAIN_ERROR_MESSAGE : "Loading your session."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 border-r border-blue-100 bg-white lg:flex lg:flex-col">
        <Link className="flex h-20 items-center gap-3 px-6" href="/dashboard">
          <span className="grid h-11 w-11 place-items-center rounded-lg bg-blue-700 text-sm font-black text-white">
            DH
          </span>
          <span>
            <span className="block text-base font-bold text-slate-950">DECA Prep Hub</span>
            <span className="block text-xs font-medium text-slate-500">
              Chapter practice workspace
            </span>
          </span>
        </Link>

        <nav className="flex flex-1 flex-col gap-1 px-3 py-2">
          {visibleNavItems.map((item) => {
            const active = isActive(pathname, item.href);

            return (
              <Link
                className={cn(
                  "flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-semibold transition",
                  active
                    ? "bg-blue-700 text-white shadow-sm shadow-blue-200"
                    : "text-slate-600 hover:bg-blue-50 hover:text-blue-700",
                )}
                href={item.href}
                key={item.href}
              >
                <Icon className="h-5 w-5" name={item.icon} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="m-4 rounded-lg border border-blue-100 bg-blue-50 p-4">
          <p className="text-sm font-semibold text-blue-950">MVP workspace</p>
          <p className="mt-1 text-xs leading-5 text-blue-800">
            Frontend routes and placeholder data are ready for Supabase and AI
            integrations later.
          </p>
        </div>
      </aside>

      <div className="lg:pl-72">
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="flex min-h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
            <Link className="flex items-center gap-3 lg:hidden" href="/dashboard">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-blue-700 text-xs font-black text-white">
                DH
              </span>
              <span className="text-sm font-bold text-slate-950">DECA Prep Hub</span>
            </Link>

            <div className="hidden lg:block">
              <p className="text-sm font-semibold text-slate-950">
                Oak Junction Ridge DECA
              </p>
              <p className="text-xs text-slate-500">Production-ready frontend MVP</p>
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden text-right sm:block">
                <p className="text-sm font-semibold text-slate-950">
                  {profile?.email ?? "Student Member"}
                </p>
                <p className="text-xs capitalize text-slate-500">{profile?.role ?? "student"}</p>
              </div>
              <div className="grid h-10 w-10 place-items-center rounded-lg border border-blue-100 bg-blue-50 text-sm font-bold text-blue-700">
                SM
              </div>
            </div>
          </div>

          <nav className="flex gap-2 overflow-x-auto border-t border-slate-100 px-4 py-2 lg:hidden">
            {visibleNavItems.map((item) => {
              const active = isActive(pathname, item.href);

              return (
                <Link
                  className={cn(
                    "inline-flex min-h-9 shrink-0 items-center gap-2 rounded-md px-3 text-xs font-semibold",
                    active
                      ? "bg-blue-700 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-blue-50 hover:text-blue-700",
                  )}
                  href={item.href}
                  key={item.href}
                >
                  <Icon className="h-4 w-4" name={item.icon} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </header>

        <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
