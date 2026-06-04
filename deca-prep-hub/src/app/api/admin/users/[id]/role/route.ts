import { NextResponse } from "next/server";
import { isAdminRole } from "@/lib/auth";
import { requireAdminRequester } from "@/lib/server/api-auth";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import type { ProfileRole } from "@/lib/types";

const allowedRoles = new Set<ProfileRole>(["student", "admin", "advisor"]);
const profileColumns = "id,email,role,created_at,updated_at";
const fallbackProfileColumns = "id,email,role,created_at";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function parseRole(value: unknown): ProfileRole | null {
  return typeof value === "string" && allowedRoles.has(value as ProfileRole)
    ? (value as ProfileRole)
    : null;
}

function isMissingUpdatedAtError(error: { code?: string; message?: string } | null) {
  return (
    error?.code === "42703" ||
    Boolean(error?.message?.toLowerCase().includes("profiles.updated_at"))
  );
}

function isProfileRoleConstraintError(error: Error) {
  const message = error.message.toLowerCase();

  return (
    message.includes("profiles_role_check") ||
    message.includes("violates check constraint") ||
    message.includes("role in")
  );
}

function withFallbackUpdatedAt(profile: { id: string; email: string | null; role: ProfileRole; created_at: string | null; updated_at?: string | null }) {
  return {
    ...profile,
    updated_at: profile.updated_at ?? null,
  };
}

async function selectProfileSafely(userId: string) {
  const supabase = getSupabaseAdminClient();
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

async function updateRoleSafely(userId: string, role: ProfileRole) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("profiles")
    .update({ role })
    .eq("id", userId)
    .select(profileColumns)
    .single();

  if (!error) {
    return withFallbackUpdatedAt(data);
  }

  if (!isMissingUpdatedAtError(error)) {
    throw new Error(error.message);
  }

  const { data: fallbackData, error: fallbackError } = await supabase
    .from("profiles")
    .update({ role })
    .eq("id", userId)
    .select(fallbackProfileColumns)
    .single();

  if (fallbackError) {
    throw new Error(fallbackError.message);
  }

  return withFallbackUpdatedAt(fallbackData);
}

export async function PATCH(request: Request, context: RouteContext) {
  const { error: authError, user } = await requireAdminRequester(request);

  if (authError || !user) {
    return NextResponse.json({ error: authError }, { status: user ? 403 : 401 });
  }

  let role: ProfileRole | null = null;

  try {
    const body = (await request.json()) as { role?: unknown };
    role = parseRole(body.role);
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  if (!role) {
    return NextResponse.json({ error: "Role must be student, admin, or advisor." }, { status: 400 });
  }

  try {
    const { id } = await context.params;
    const supabase = getSupabaseAdminClient();
    const targetProfile = await selectProfileSafely(id);

    if (!targetProfile) {
      return NextResponse.json({ error: "User profile not found." }, { status: 404 });
    }

    if (isAdminRole(targetProfile.role) && !isAdminRole(role)) {
      const { data: adminProfiles, error: adminProfilesError } = await supabase
        .from("profiles")
        .select("id,role")
        .in("role", ["admin", "advisor"]);

      if (adminProfilesError) {
        return NextResponse.json({ error: adminProfilesError.message }, { status: 500 });
      }

      if ((adminProfiles ?? []).length <= 1) {
        return NextResponse.json(
          { error: "At least one admin or advisor must remain." },
          { status: 409 },
        );
      }
    }

    const updatedProfile = await updateRoleSafely(id, role);

    return NextResponse.json({ profile: updatedProfile });
  } catch (caughtError) {
    if (caughtError instanceof Error && isProfileRoleConstraintError(caughtError)) {
      return NextResponse.json(
        {
          error:
            "The database role constraint does not allow advisor yet. Apply the latest Supabase migrations, then try again.",
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        error:
          caughtError instanceof Error ? caughtError.message : "Unable to update role.",
      },
      { status: 500 },
    );
  }
}

export const POST = PATCH;
