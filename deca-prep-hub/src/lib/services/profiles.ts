import { isAllowedSchoolEmail } from "@/lib/auth";
import { getFriendlyErrorMessage, logDeveloperError } from "@/lib/errors";
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
    logDeveloperError("[profiles] own profile lookup failed", error);
    throw new Error(getFriendlyErrorMessage(error, "Unable to load your profile."));
  }

  const { data: fallbackData, error: fallbackError } = await supabase
    .from("profiles")
    .select(fallbackProfileColumns)
    .eq("id", userId)
    .maybeSingle();

  if (fallbackError) {
    logDeveloperError("[profiles] own profile fallback lookup failed", fallbackError);
    throw new Error(getFriendlyErrorMessage(fallbackError, "Unable to load your profile."));
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
    logDeveloperError("[profiles] current user lookup failed", userError);
    throw new Error(getFriendlyErrorMessage(userError, "Unable to verify your session."));
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
    logDeveloperError("[profiles] ensure_current_profile failed", error);
    throw new Error(getFriendlyErrorMessage(error, "Unable to prepare your profile."));
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
    logDeveloperError("[profiles] current own user lookup failed", userError);
    throw new Error(getFriendlyErrorMessage(userError, "Unable to verify your session."));
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
    logDeveloperError("[profiles] profile list failed", error);
    throw new Error(getFriendlyErrorMessage(error, "Unable to load profiles."));
  }

  const { data: fallbackData, error: fallbackError } = await supabase
    .from("profiles")
    .select(fallbackProfileColumns)
    .order("created_at", { ascending: false });

  if (fallbackError) {
    logDeveloperError("[profiles] profile list fallback failed", fallbackError);
    throw new Error(getFriendlyErrorMessage(fallbackError, "Unable to load profiles."));
  }

  return (fallbackData ?? []).map(withFallbackUpdatedAt);
}

export async function countProfiles(): Promise<number> {
  const supabase = getSupabaseClient();

  const { count, error } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true });

  if (error) {
    logDeveloperError("[profiles] profile count failed", error);
    throw new Error(getFriendlyErrorMessage(error, "Unable to count profiles."));
  }

  return count ?? 0;
}
