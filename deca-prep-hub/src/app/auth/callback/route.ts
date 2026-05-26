import { type NextRequest, NextResponse } from "next/server";
import { isAllowedSchoolEmail } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase/server";

function redirectToLogin(
  request: NextRequest,
  error: "auth_callback_failed" | "unauthorized_domain",
  message?: string,
) {
  const url = new URL("/login", request.url);
  url.searchParams.set("error", error);

  if (message) {
    url.searchParams.set("message", message);
  }

  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const providerError =
    request.nextUrl.searchParams.get("error_description") ??
    request.nextUrl.searchParams.get("error") ??
    request.nextUrl.searchParams.get("error_code");

  if (providerError) {
    return redirectToLogin(request, "auth_callback_failed", providerError);
  }

  if (!code) {
    return redirectToLogin(
      request,
      "auth_callback_failed",
      "The OAuth callback did not include an authorization code.",
    );
  }

  const supabase = await getSupabaseServerClient();
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    return redirectToLogin(request, "auth_callback_failed", exchangeError.message);
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return redirectToLogin(
      request,
      "auth_callback_failed",
      userError?.message ?? "No user was returned after Google sign-in.",
    );
  }

  if (!isAllowedSchoolEmail(user.email)) {
    await supabase.auth.signOut();
    return redirectToLogin(request, "unauthorized_domain");
  }

  const { error: profileError } = await supabase.rpc("ensure_current_profile");

  if (profileError) {
    await supabase.auth.signOut();
    return redirectToLogin(request, "auth_callback_failed", profileError.message);
  }

  return NextResponse.redirect(new URL("/dashboard", request.url));
}
