"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Icon, type IconName } from "@/components/ui/icon";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import {
  DOMAIN_ERROR_MESSAGE,
  getRoleLabel,
  isAdminRole,
  isAllowedSchoolEmail,
} from "@/lib/auth";
import { getProfileDisplayName, getProfileInitials } from "@/lib/profile-display";
import { getCurrentProfile } from "@/lib/services/profiles";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types";

const navItems: Array<{ label: string; href: string; icon: IconName; adminOnly?: boolean }> = [
  { label: "Practice", href: "/dashboard", icon: "dashboard" },
  { label: "Roleplays", href: "/roleplays", icon: "roleplays" },
  { label: "Exams", href: "/exams", icon: "exams" },
  { label: "Reference", href: "/reference", icon: "search" },
  { label: "History & scores", href: "/analytics", icon: "analytics" },
  { label: "Settings", href: "/settings", icon: "settings" },
  { label: "Admin", href: "/admin", icon: "users", adminOnly: true },
];

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") {
    return pathname === "/" || pathname === "/dashboard";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

function FullPageAuthState({
  message = "Loading your DECA workspace...",
  detail = "Signing you in...",
}: {
  message?: string;
  detail?: string;
}) {
  return (
    <div className="grid min-h-screen place-items-center bg-background px-4">
      <div className="rounded-md border border-border bg-card p-8 text-center" role="status">
        <p className="text-sm font-semibold text-primary">
          OJR DECA
        </p>
        <h1 className="mt-3 text-xl font-bold text-slate-950">{message}</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">{detail}</p>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isLoginPage = pathname === "/login";
  const isRootPage = pathname === "/";
  const isAuthCallbackPage = pathname === "/auth/callback";
  const isAuthEntryPage = isLoginPage || isRootPage || isAuthCallbackPage;
  const [authState, setAuthState] = useState<"checking" | "allowed" | "blocked">("checking");
  const [profile, setProfile] = useState<Profile | null>(null);
  const visibleNavItems = navItems.filter((item) => !item.adminOnly || isAdminRole(profile?.role));
  const displayName = getProfileDisplayName(profile) ?? profile?.email ?? "Student";
  const profileInitials = getProfileInitials(profile);

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
        setAuthState(isAuthEntryPage ? "allowed" : "blocked");

        if (!isAuthEntryPage) {
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

        setAuthState(isAuthEntryPage ? "allowed" : "blocked");
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
        setAuthState(isAuthEntryPage ? "allowed" : "blocked");
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
        setAuthState(isAuthEntryPage ? "allowed" : "blocked");

        if (!isAuthEntryPage) {
          router.replace("/login");
        }

        return;
      }

      if (!isAllowedSchoolEmail(session.user.email)) {
        void supabase.auth.signOut().finally(() => {
          if (isActive) {
            setProfile(null);
            setAuthState(isAuthEntryPage ? "allowed" : "blocked");
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
              setAuthState(isAuthEntryPage ? "allowed" : "blocked");
              router.replace("/login");
            }
          });
        });
    });

    return () => {
      isActive = false;
      subscription.unsubscribe();
    };
  }, [isAuthEntryPage, isLoginPage, router]);

  async function handleSignOut() {
    const supabase = getSupabaseClient();

    await supabase.auth.signOut();
    setProfile(null);
    setAuthState("allowed");
    router.replace("/login");
  }

  if (isLoginPage && (authState === "checking" || profile)) {
    return <FullPageAuthState />;
  }

  if (isAuthEntryPage) {
    return <>{children}</>;
  }

  if (authState !== "allowed") {
    return (
      <FullPageAuthState
        detail={authState === "blocked" ? DOMAIN_ERROR_MESSAGE : "Signing you in..."}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <a className="skip-link ui-button ui-button-primary" href="#main-content">Skip to content</a>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 border-r border-border bg-card lg:flex lg:flex-col">
        <Link className="flex min-h-24 items-center gap-3 px-5" href="/dashboard">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-primary text-xs font-bold text-white">
            OJR
          </span>
          <span>
            <span className="block text-sm font-semibold leading-5 text-foreground">OJR DECA<br />Prep Database</span>
          </span>
        </Link>

        <nav aria-label="Main navigation" className="flex flex-1 flex-col gap-1 px-3 py-2">
          {visibleNavItems.map((item) => {
            const active = isActive(pathname, item.href);

            return (
              <Link
                aria-current={active ? "page" : undefined}
                className={`app-nav-link ${item.adminOnly ? "mt-5 border-t border-border" : ""}`}
                href={item.href}
                key={item.href}
              >
                <Icon className="h-5 w-5" name={item.icon} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-border px-5 py-5 text-xs leading-5 text-[var(--muted)]">
          Owen J. Roberts High School<br />DECA preparation library
        </div>
      </aside>

      <div className="lg:pl-60">
        <header className="sticky top-0 z-20 border-b border-border bg-card">
          <div className="flex min-h-16 items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
            <Link className="min-w-0 text-sm font-semibold leading-5 lg:hidden" href="/dashboard">
              OJR DECA<br /><span className="text-xs font-normal text-[var(--muted)]">Prep Database</span>
            </Link>

            <div className="hidden lg:block">
              <p className="text-sm font-medium text-[var(--muted)]">
                {pathname.startsWith("/admin") ? "Chapter management" : "Practice & reference"}
              </p>
            </div>

            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              <div className="hidden text-right sm:block">
                <p className="max-w-64 truncate text-sm font-medium text-foreground" title={profile?.email ?? displayName}>
                  {displayName}
                </p>
                <p className="text-xs text-slate-500">{getRoleLabel(profile?.role)}</p>
              </div>
              <ThemeToggle />
              <div aria-hidden="true" className="hidden h-9 w-9 place-items-center rounded-full bg-card-muted text-xs font-semibold text-[var(--muted-foreground)] sm:grid">
                {profileInitials}
              </div>
              <button
                className="ui-button ui-button-secondary"
                onClick={handleSignOut}
                type="button"
              >
                Sign out
              </button>
            </div>
          </div>

          <nav aria-label="Main navigation" className="flex gap-1 overflow-x-auto border-t border-border px-3 py-2 lg:hidden">
            {visibleNavItems.map((item) => {
              const active = isActive(pathname, item.href);

              return (
                <Link
                  aria-current={active ? "page" : undefined}
                  className="app-nav-link shrink-0"
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

        <main id="main-content" tabIndex={-1} className="mx-auto flex w-full min-w-0 max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
