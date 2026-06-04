"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ResourceErrorState } from "@/components/resources/resource-states";
import { getRoleLabel, isAdminRole } from "@/lib/auth";
import { getCurrentOwnProfile } from "@/lib/services/profiles";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { Profile, ProfileRole } from "@/lib/types";

const roles: ProfileRole[] = ["student", "admin", "advisor"];

type AdminUser = Profile & {
  auth_created_at: string | null;
  last_sign_in_at: string | null;
};

type UsersPayload = {
  counts: {
    total: number;
    byRole: Record<ProfileRole, number>;
  };
  currentUserId: string;
  users: AdminUser[];
};

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "Never";
  }

  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

async function getAccessToken() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    throw new Error(error.message);
  }

  if (!data.session?.access_token) {
    throw new Error("You must be signed in as an admin or advisor.");
  }

  return data.session.access_token;
}

async function fetchAdminUsers() {
  const token = await getAccessToken();
  const response = await fetch("/api/admin/users", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const payload = (await response.json()) as UsersPayload & { error?: string };

  if (!response.ok) {
    throw new Error(payload.error ?? "Unable to load users.");
  }

  return payload;
}

async function updateUserRole(userId: string, role: ProfileRole) {
  const token = await getAccessToken();
  const response = await fetch(`/api/admin/users/${userId}/role`, {
    body: JSON.stringify({ role }),
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    method: "PATCH",
  });
  const payload = (await response.json()) as { error?: string; profile?: Profile };

  if (!response.ok) {
    throw new Error(
      payload.error ??
        "Unable to update role. Confirm the profiles.role database constraint allows student, admin, and advisor.",
    );
  }

  return payload.profile;
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">{label}</p>
      <p className="mt-4 text-4xl font-bold text-slate-950">{value}</p>
    </Card>
  );
}

export function AdminUsersView() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [payload, setPayload] = useState<UsersPayload | null>(null);
  const [draftRoles, setDraftRoles] = useState<Record<string, ProfileRole>>({});
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | ProfileRole>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  async function reloadUsers() {
    setIsLoading(true);
    setMessage(null);

    try {
      const nextPayload = await fetchAdminUsers();
      setPayload(nextPayload);
      setDraftRoles(
        Object.fromEntries(nextPayload.users.map((user) => [user.id, user.role])) as Record<
          string,
          ProfileRole
        >,
      );
    } catch (caughtError) {
      setMessage({
        tone: "error",
        text: caughtError instanceof Error ? caughtError.message : "Unable to load users.",
      });
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    let isActive = true;

    async function loadUsers() {
      let nextProfile: Profile | null = null;

      try {
        nextProfile = await getCurrentOwnProfile();

        if (!isActive) {
          return;
        }

        setProfile(nextProfile);
        setProfileError(null);
      } catch {
        if (!isActive) {
          return;
        }

        setProfile(null);
        setPayload(null);
        setProfileError("Unable to verify account role.");
        return;
      }

      if (!isAdminRole(nextProfile?.role)) {
        setPayload(null);
        return;
      }

      try {
        const nextPayload = await fetchAdminUsers();

        if (!isActive) {
          return;
        }

        setPayload(nextPayload);
        setDraftRoles(
          Object.fromEntries(nextPayload.users.map((user) => [user.id, user.role])) as Record<
            string,
            ProfileRole
          >,
        );
      } catch (caughtError) {
        if (isActive) {
          setMessage({
            tone: "error",
            text: caughtError instanceof Error ? caughtError.message : "Unable to load users.",
          });
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void loadUsers();

    return () => {
      isActive = false;
    };
  }, []);

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();

    return (payload?.users ?? []).filter((user) => {
      const matchesRole = roleFilter === "all" || user.role === roleFilter;
      const matchesSearch =
        !query ||
        (user.email ?? "").toLowerCase().includes(query) ||
        user.role.toLowerCase().includes(query);

      return matchesRole && matchesSearch;
    });
  }, [payload, roleFilter, search]);

  async function saveRole(user: AdminUser, nextRole = draftRoles[user.id]) {
    if (!nextRole || nextRole === user.role) {
      return;
    }

    const elevatedWarning = isAdminRole(nextRole)
      ? "\n\nThis user will be able to manage resources, exam keys, analytics, and users."
      : "";
    const selfWarning =
      user.id === payload?.currentUserId
        ? "\n\nYou are changing your own access. If this is the last admin/advisor, the app will block it."
        : "";
    const confirmed = window.confirm(
      `Change ${user.email ?? "this user"} from ${getRoleLabel(user.role)} to ${getRoleLabel(
        nextRole,
      )}?${elevatedWarning}${selfWarning}`,
    );

    if (!confirmed) {
      return;
    }

    setSavingUserId(user.id);
    setMessage(null);

    try {
      const updatedProfile = await updateUserRole(user.id, nextRole);

      setPayload((current) =>
        current
          ? {
              ...current,
              users: current.users.map((currentUser) =>
                currentUser.id === user.id && updatedProfile
                  ? { ...currentUser, ...updatedProfile }
                  : currentUser,
              ),
              counts: {
                total: current.counts.total,
                byRole: {
                  student:
                    current.users.filter((nextUser) =>
                      nextUser.id === user.id ? nextRole === "student" : nextUser.role === "student",
                    ).length,
                  admin:
                    current.users.filter((nextUser) =>
                      nextUser.id === user.id ? nextRole === "admin" : nextUser.role === "admin",
                    ).length,
                  advisor:
                    current.users.filter((nextUser) =>
                      nextUser.id === user.id ? nextRole === "advisor" : nextUser.role === "advisor",
                    ).length,
                },
              },
            }
          : current,
      );
      setMessage({ tone: "success", text: "Role updated." });
    } catch (caughtError) {
      setMessage({
        tone: "error",
        text: caughtError instanceof Error ? caughtError.message : "Unable to update role.",
      });
    } finally {
      setSavingUserId(null);
    }
  }

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <Card className="min-h-36 animate-pulse" key={index}>
            <div className="h-5 w-20 rounded bg-slate-100" />
            <div className="mt-6 h-10 w-16 rounded bg-slate-100" />
          </Card>
        ))}
      </div>
    );
  }

  if (profileError) {
    return (
      <ResourceErrorState
        message={profileError}
        onRetry={() => window.location.reload()}
        title="Unable to verify account role"
      />
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
          You must be an admin or advisor to manage users.
        </p>
      </Card>
    );
  }

  return (
    <>
      <PageHeader
        description="View logged-in OJR DECA users and assign student, admin, or advisor roles."
        eyebrow={getRoleLabel(profile?.role)}
        title="User management"
      />

      <Card className="border-amber-200 bg-amber-50">
        <p className="text-sm font-semibold text-amber-950">
          Advisor currently has the same permissions as admin.
        </p>
      </Card>

      {message ? (
        <Card
          className={
            message.tone === "success"
              ? "border-emerald-200 bg-emerald-50"
              : "border-red-200 bg-red-50"
          }
        >
          <p
            className={
              message.tone === "success"
                ? "text-sm font-semibold text-emerald-800"
                : "text-sm font-semibold text-red-800"
            }
          >
            {message.text}
          </p>
        </Card>
      ) : null}

      {!payload ? (
        <ResourceErrorState
          message="Unable to load users."
          onRetry={reloadUsers}
          title="Unable to load users"
        />
      ) : null}

      {payload ? (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Total users" value={payload.counts.total} />
            <StatCard label="Students" value={payload.counts.byRole.student} />
            <StatCard label="Admins" value={payload.counts.byRole.admin} />
            <StatCard label="Advisors" value={payload.counts.byRole.advisor} />
          </section>

          <Card>
            <CardHeader eyebrow="Directory" title="Logged-in users" />
            <div className="grid gap-3 md:grid-cols-[1fr_220px]">
              <input
                className="h-11 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by email or role"
                type="search"
                value={search}
              />
              <select
                className="h-11 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                onChange={(event) => setRoleFilter(event.target.value as "all" | ProfileRole)}
                value={roleFilter}
              >
                <option value="all">All roles</option>
                {roles.map((role) => (
                  <option key={role} value={role}>
                    {getRoleLabel(role)}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-[0.14em] text-slate-500">
                    <th className="py-3 pr-4 font-semibold">Email</th>
                    <th className="py-3 pr-4 font-semibold">Role</th>
                    <th className="py-3 pr-4 font-semibold">Created</th>
                    <th className="py-3 pr-4 font-semibold">Last sign-in</th>
                    <th className="py-3 pr-4 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user) => (
                    <tr className="border-b border-slate-100 align-top" key={user.id}>
                      <td className="py-4 pr-4">
                        <p className="font-semibold text-slate-950">
                          {user.email ?? "Email unavailable"}
                        </p>
                        <details className="mt-1 text-xs text-slate-500">
                          <summary className="cursor-pointer font-medium">Developer details</summary>
                          <span className="mt-1 block font-mono">{user.id}</span>
                        </details>
                      </td>
                      <td className="py-4 pr-4">
                        <Badge tone={isAdminRole(user.role) ? "blue" : "slate"}>
                          {getRoleLabel(user.role)}
                        </Badge>
                      </td>
                      <td className="py-4 pr-4 text-slate-600">
                        {formatDate(user.created_at ?? user.auth_created_at)}
                      </td>
                      <td className="py-4 pr-4 text-slate-600">
                        {formatDate(user.last_sign_in_at)}
                      </td>
                      <td className="py-4 pr-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <select
                            className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                            onChange={(event) =>
                              setDraftRoles((current) => ({
                                ...current,
                                [user.id]: event.target.value as ProfileRole,
                              }))
                            }
                            value={draftRoles[user.id] ?? user.role}
                          >
                            {roles.map((role) => (
                              <option key={role} value={role}>
                                {getRoleLabel(role)}
                              </option>
                            ))}
                          </select>
                          <button
                            className="min-h-10 rounded-md bg-blue-700 px-3 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-blue-300"
                            disabled={savingUserId === user.id || (draftRoles[user.id] ?? user.role) === user.role}
                            onClick={() => saveRole(user)}
                            type="button"
                          >
                            {savingUserId === user.id ? "Saving..." : "Save"}
                          </button>
                          {roles.map((role) => (
                            <button
                              className="min-h-9 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 transition hover:border-blue-200 hover:text-blue-700 disabled:opacity-50"
                              disabled={savingUserId === user.id || user.role === role}
                              key={role}
                              onClick={() => {
                                setDraftRoles((current) => ({ ...current, [user.id]: role }));
                                void saveRole(user, role);
                              }}
                              type="button"
                            >
                              Make {getRoleLabel(role)}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      ) : null}
    </>
  );
}
