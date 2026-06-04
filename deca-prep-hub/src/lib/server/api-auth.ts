import { isAdminRole, isAllowedSchoolEmail } from "@/lib/auth";
import { getSupabaseAdminClient, getSupabaseServerClient } from "@/lib/supabase/server";
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

export function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization");
  const match = authorization?.match(/^Bearer\s+(.+)$/i);

  return match?.[1] ?? null;
}

export async function requireAuthenticatedSchoolUser(request: Request) {
  const token = getBearerToken(request);

  if (!token) {
    return { error: "Missing authorization token.", user: null };
  }

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    return {
      error: error?.message ?? "Unable to verify the current user.",
      user: null,
    };
  }

  if (!isAllowedSchoolEmail(data.user.email)) {
    return { error: "A valid @ojrsd.net account is required.", user: null };
  }

  return { error: null, user: data.user };
}

export async function requireAdminRequester(request: Request) {
  const { error: authError, user } = await requireAuthenticatedSchoolUser(request);

  if (authError || !user) {
    return {
      error: authError ?? "Unauthorized.",
      profile: null,
      user: null,
    };
  }

  const supabase = getSupabaseAdminClient();
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select(profileColumns)
    .eq("id", user.id)
    .maybeSingle();

  let safeProfile = profile ? withFallbackUpdatedAt(profile) : null;

  if (profileError && isMissingUpdatedAtError(profileError)) {
    const { data: fallbackProfile, error: fallbackError } = await supabase
      .from("profiles")
      .select(fallbackProfileColumns)
      .eq("id", user.id)
      .maybeSingle();

    if (fallbackError) {
      return { error: fallbackError.message, profile: null, user };
    }

    safeProfile = fallbackProfile ? withFallbackUpdatedAt(fallbackProfile) : null;
  } else if (profileError) {
    return { error: profileError.message, profile: null, user };
  }

  if (!isAdminRole(safeProfile?.role)) {
    return { error: "Admin access is required.", profile: null, user };
  }

  return { error: null, profile: safeProfile, user };
}
