import { isAllowedSchoolEmail } from "@/lib/auth";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types";

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

  return data;
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

  console.log("[admin access] current user id", user?.id ?? null);
  console.log("[admin access] current user email", user?.email ?? null);

  if (!user) {
    return null;
  }

  if (!isAllowedSchoolEmail(user.email)) {
    await supabase.auth.signOut();
    return null;
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id,email,role,created_at")
    .eq("id", user.id)
    .maybeSingle();

  console.log("[admin access] current profile", data ?? null);

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function listProfiles(): Promise<Profile[]> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("profiles")
    .select("id,email,role,created_at")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
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
