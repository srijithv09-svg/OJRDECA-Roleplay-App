import { isAllowedSchoolEmail } from "@/lib/auth";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types";

const profileColumns = "id,email,role,created_at,updated_at";
const fallbackProfileColumns = "id,email,role,created_at";

function isMissingUpdatedAtError(error: { code?: string; message?: string } | null) {
  return (
    error?.code === "42703" ||
    Boolean(error?.message?.toLowerCase().includes("profiles.updated_at"))
  );
}

function withFallbackUpdatedAt(profile: Omit<Profile, "updated_at"> & { updated_at?: string | null }) {
  return {
    ...profile,
    updated_at: profile.updated_at ?? null,
  } satisfies Profile;
}

async function selectOwnProfile(userId: string): Promise<Profile | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("profiles")
    .select(profileColumns)
    .eq("id", userId)
    .maybeSingle();

  if (!error) {
    return data ? withFallbackUpdatedAt(data) : null;
  }

  if (!isMissingUpdatedAtError(error)) {
    throw new Error(error.message);
  }

  const { data: fallbackData, error: fallbackError } = await supabase
    .from("profiles")
    .select(fallbackProfileColumns)
    .eq("id", userId)
    .maybeSingle();

  if (fallbackError) {
    throw new Error(fallbackError.message);
  }

  return fallbackData ? withFallbackUpdatedAt(fallbackData) : null;
}

export async function getCurrentProfile(): Promise<Profile | null> {
  const supabase = getSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    throw new Error(userError.message);
  }

  if (!user) {
    return null;
  }

  if (!isAllowedSchoolEmail(user.email)) {
    await supabase.auth.signOut();
    return null;
  }

  const { data, error } = await supabase.rpc("ensure_current_profile");

  if (error) {
    throw new Error(error.message);
  }

  return data ? withFallbackUpdatedAt(data) : null;
}

export async function getCurrentOwnProfile(): Promise<Profile | null> {
  const supabase = getSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    throw new Error(userError.message);
  }

  if (!user) {
    return null;
  }

  if (!isAllowedSchoolEmail(user.email)) {
    await supabase.auth.signOut();
    return null;
  }

  return selectOwnProfile(user.id);
}

export async function listProfiles(): Promise<Profile[]> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("profiles")
    .select(profileColumns)
    .order("created_at", { ascending: false });

  if (!error) {
    return (data ?? []).map(withFallbackUpdatedAt);
  }

  if (!isMissingUpdatedAtError(error)) {
    throw new Error(error.message);
  }

  const { data: fallbackData, error: fallbackError } = await supabase
    .from("profiles")
    .select(fallbackProfileColumns)
    .order("created_at", { ascending: false });

  if (fallbackError) {
    throw new Error(fallbackError.message);
  }

  return (fallbackData ?? []).map(withFallbackUpdatedAt);
}

export async function countProfiles(): Promise<number> {
  const supabase = getSupabaseClient();

  const { count, error } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true });

  if (error) {
    throw new Error(error.message);
  }

  return count ?? 0;
}
