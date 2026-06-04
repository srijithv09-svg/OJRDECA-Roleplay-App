import { NextResponse } from "next/server";
import { requireAdminRequester } from "@/lib/server/api-auth";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import type { Profile, ProfileRole } from "@/lib/types";

const profileColumns = "id,email,role,created_at,updated_at";
const fallbackProfileColumns = "id,email,role,created_at";
const roles: ProfileRole[] = ["student", "admin", "advisor"];

type SafeAuthUser = {
  id: string;
  email: string | null;
  created_at: string | null;
  last_sign_in_at: string | null;
};

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

async function listProfilesSafely() {
  const supabase = getSupabaseAdminClient();
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

async function listAllAuthUsers() {
  const supabase = getSupabaseAdminClient();
  const users: SafeAuthUser[] = [];
  let page = 1;
  const perPage = 1000;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });

    if (error) {
      throw new Error(error.message);
    }

    users.push(
      ...data.users.map((user) => ({
        id: user.id,
        email: user.email ?? null,
        created_at: user.created_at ?? null,
        last_sign_in_at: user.last_sign_in_at ?? null,
      })),
    );

    if (data.users.length < perPage) {
      break;
    }

    page += 1;
  }

  return users;
}

export async function GET(request: Request) {
  const { error: authError, profile, user } = await requireAdminRequester(request);

  if (authError || !profile || !user) {
    return NextResponse.json({ error: authError }, { status: user ? 403 : 401 });
  }

  try {
    const [profiles, authUsers] = await Promise.all([
      listProfilesSafely(),
      listAllAuthUsers(),
    ]);

    const authUsersById = new Map(authUsers.map((authUser) => [authUser.id, authUser]));
    const users = profiles.map((nextProfile) => {
      const authUser = authUsersById.get(nextProfile.id);

      return {
        ...nextProfile,
        auth_created_at: authUser?.created_at ?? null,
        email: nextProfile.email ?? authUser?.email ?? null,
        last_sign_in_at: authUser?.last_sign_in_at ?? null,
      };
    });

    const counts = {
      total: users.length,
      byRole: Object.fromEntries(
        roles.map((role) => [role, users.filter((nextUser) => nextUser.role === role).length]),
      ) as Record<ProfileRole, number>,
    };

    return NextResponse.json({
      counts,
      currentUserId: user.id,
      requesterRole: profile.role,
      users,
    });
  } catch (caughtError) {
    return NextResponse.json(
      {
        error:
          caughtError instanceof Error ? caughtError.message : "Unable to load users.",
      },
      { status: 500 },
    );
  }
}
