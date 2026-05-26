import { isAllowedSchoolEmail } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase/server";

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

  const supabase = getSupabaseServerClient();
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
