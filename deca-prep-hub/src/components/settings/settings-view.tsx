"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { getRoleLabel } from "@/lib/auth";
import { decaClusters, getDecaClusterLabel, type DecaClusterPreference } from "@/lib/deca/clusters";
import { getProfileDisplayName } from "@/lib/profile-display";
import { getCurrentProfile, updateSelectedCluster } from "@/lib/services/profiles";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types";

export function SettingsView() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [selectedCluster, setSelectedCluster] = useState<DecaClusterPreference | "">("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [isSavingCluster, setIsSavingCluster] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const displayName = getProfileDisplayName(profile) ?? "Loading account";

  useEffect(() => {
    let isActive = true;

    void getCurrentProfile()
      .then((nextProfile) => {
        if (isActive) {
          setProfile(nextProfile);
          setSelectedCluster(nextProfile?.selected_cluster ?? "");
        }
      })
      .catch(() => {
        if (isActive) {
          setProfile(null);
        }
      });

    return () => {
      isActive = false;
    };
  }, []);

  async function handleSignOut() {
    setIsSigningOut(true);

    const supabase = getSupabaseClient();
    await supabase.auth.signOut();
    router.replace("/login");
  }

  async function handleSaveCluster() {
    setIsSavingCluster(true);
    setSaveError(null);
    setSaveMessage(null);

    try {
      const updatedProfile = await updateSelectedCluster(selectedCluster || null);
      setProfile(updatedProfile);
      setSelectedCluster(updatedProfile.selected_cluster ?? "");
      setSaveMessage(
        updatedProfile.selected_cluster
          ? `Saved. Your dashboard will prioritize ${getDecaClusterLabel(updatedProfile.selected_cluster)}.`
          : "Saved. Your dashboard will keep using the default recommendation order.",
      );
    } catch (caughtError) {
      setSaveError(caughtError instanceof Error ? caughtError.message : "Unable to save your DECA cluster.");
    } finally {
      setIsSavingCluster(false);
    }
  }

  return (
    <>
      <PageHeader
        actions={
          <button
            className="min-h-10 rounded-md bg-blue-700 px-4 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-blue-300"
            disabled={isSigningOut}
            onClick={handleSignOut}
            type="button"
          >
            {isSigningOut ? "Signing out..." : "Sign out"}
          </button>
        }
        description="Manage account details, chapter context, and integration readiness."
        eyebrow="Account"
        title="Settings"
      />

      <section className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader eyebrow="Profile" title="Student profile" />
          <div className="grid gap-4">
            {[
              ["Name", displayName],
              ["Email", profile?.email ?? "Loading account"],
              ["Role", getRoleLabel(profile?.role)],
              ["Chapter", "Owen J. Roberts DECA"],
              ["Primary cluster", getDecaClusterLabel(profile?.selected_cluster) ?? "Not selected"],
            ].map(([label, value]) => (
              <label className="grid gap-2 text-sm font-semibold text-slate-800" key={label}>
                {label}
                <input
                  className="h-11 rounded-md border border-slate-200 px-3 text-sm font-normal text-slate-700 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  readOnly
                  type="text"
                  value={value}
                />
              </label>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader eyebrow="Personalization" title="DECA Cluster" />
          <p className="text-sm leading-6 text-slate-600">
            Choose your main DECA cluster so your dashboard can recommend the most relevant practice first.
            You can still access all approved content.
          </p>
          <div className="mt-5 grid gap-3">
            <label className="grid gap-2 text-sm font-semibold text-slate-800">
              Main cluster
              <select
                className="min-h-11 rounded-md border border-slate-200 bg-white px-3 text-sm font-normal text-slate-700 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                onChange={(event) => setSelectedCluster(event.target.value as DecaClusterPreference | "")}
                value={selectedCluster}
              >
                <option value="">No cluster selected</option>
                {decaClusters.map((cluster) => (
                  <option key={cluster.value} value={cluster.value}>
                    {cluster.label}
                  </option>
                ))}
              </select>
            </label>
            {selectedCluster ? (
              <p className="rounded-lg bg-slate-50 p-3 text-sm leading-6 text-slate-600">
                {decaClusters.find((cluster) => cluster.value === selectedCluster)?.description}
              </p>
            ) : null}
            {saveError ? <p className="text-sm font-semibold text-red-700">{saveError}</p> : null}
            {saveMessage ? <p className="text-sm font-semibold text-green-700">{saveMessage}</p> : null}
            <button
              className="min-h-10 w-fit rounded-md bg-blue-700 px-4 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-blue-300"
              disabled={isSavingCluster || !profile}
              onClick={handleSaveCluster}
              type="button"
            >
              {isSavingCluster ? "Saving..." : "Save cluster"}
            </button>
          </div>
        </Card>

        <Card>
          <CardHeader eyebrow="Roadmap" title="Integration status" />
          <div className="space-y-3">
            {[
              ["Google authentication", "Connected"],
              ["School domain restriction", "@ojrsd.net only"],
              ["Supabase profiles", "Connected"],
              ["Resource approvals", "Admin ready"],
              ["OpenAI feedback", "Future"],
            ].map(([label, status]) => (
              <div
                className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 p-3"
                key={label}
              >
                <p className="text-sm font-semibold text-slate-800">{label}</p>
                <Badge
                  tone={
                    status === "Connected" || status === "Admin ready" ? "green" : "blue"
                  }
                >
                  {status}
                </Badge>
              </div>
            ))}
          </div>
        </Card>
      </section>
    </>
  );
}
