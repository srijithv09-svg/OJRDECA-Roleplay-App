"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Icon, type IconName } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";
import { ResourceLoadingState } from "@/components/resources/resource-states";
import { isAdminRole } from "@/lib/auth";
import { getCurrentOwnProfile } from "@/lib/services/profiles";
import type { Profile } from "@/lib/types";

type AdminTool = {
  description: string;
  href: string;
  icon: IconName;
  label: string;
};

const adminTools: AdminTool[] = [
  {
    description: "Approve, reject, and manage uploaded resources.",
    href: "/admin/resources",
    icon: "exams",
    label: "Resource Management",
  },
  {
    description: "Upload PDFs and run AI extraction.",
    href: "/admin/upload",
    icon: "upload",
    label: "Upload Resources",
  },
  {
    description: "Review AI-extracted questions, roleplays, rubrics, and answer keys.",
    href: "/admin/ai-review",
    icon: "analytics",
    label: "AI Review",
  },
  {
    description: "Manage official/admin-reviewed answer keys.",
    href: "/admin/exam-keys",
    icon: "exams",
    label: "Exam Keys",
  },
  {
    description: "Manage student, advisor, and admin roles.",
    href: "/admin/users",
    icon: "users",
    label: "Users & Roles",
  },
  {
    description: "View chapter-level analytics.",
    href: "/admin/analytics",
    icon: "analytics",
    label: "Admin Analytics",
  },
];

export function AdminWorkspaceView() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isCheckingAccess, setIsCheckingAccess] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    void getCurrentOwnProfile()
      .then((nextProfile) => {
        if (!isActive) {
          return;
        }

        setProfile(nextProfile);
        setError(null);
      })
      .catch((caughtError) => {
        if (!isActive) {
          return;
        }

        setProfile(null);
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Unable to verify admin access.",
        );
      })
      .finally(() => {
        if (isActive) {
          setIsCheckingAccess(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, []);

  if (isCheckingAccess) {
    return <ResourceLoadingState />;
  }

  if (error) {
    return (
      <Card className="border-red-200 bg-red-50">
        <p className="font-semibold text-red-950">Unable to load admin workspace</p>
        <p className="mt-2 text-sm leading-6 text-red-800">{error}</p>
      </Card>
    );
  }

  if (!isAdminRole(profile?.role)) {
    return (
      <Card className="border-red-200 bg-red-50">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-700">
          Admin only
        </p>
        <h1 className="mt-2 text-2xl font-bold text-red-950">Access Denied</h1>
        <p className="mt-2 text-sm leading-6 text-red-800">
          You must be an admin or advisor to open the admin workspace.
        </p>
      </Card>
    );
  }

  return (
    <>
      <PageHeader
        description="Manage resource approvals, AI extraction review, answer keys, users, and chapter-level analytics from one workspace."
        eyebrow="Admin"
        title="Admin Workspace"
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {adminTools.map((tool) => (
          <Link
            className="group rounded-lg border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/60 transition hover:border-blue-200 hover:shadow-md hover:shadow-blue-100"
            href={tool.href}
            key={tool.href}
          >
            <div className="flex items-start gap-4">
              <span className="grid h-11 w-11 place-items-center rounded-lg bg-blue-50 text-blue-700 transition group-hover:bg-blue-700 group-hover:text-white">
                <Icon className="h-5 w-5" name={tool.icon} />
              </span>
              <span>
                <span className="block text-base font-bold text-slate-950">{tool.label}</span>
                <span className="mt-2 block text-sm leading-6 text-slate-600">
                  {tool.description}
                </span>
              </span>
            </div>
          </Link>
        ))}
      </section>
    </>
  );
}
