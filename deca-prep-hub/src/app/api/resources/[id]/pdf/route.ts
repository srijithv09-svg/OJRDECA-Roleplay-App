import { NextResponse } from "next/server";
import { getSupabaseAdminClient, getSupabaseServerClient } from "@/lib/supabase/server";
import {
  createStoredResourcePdfSignedUrl,
  repairResourcePdfPath,
} from "@/lib/services/resource-pdf-repair";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization");
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

async function requireUser(request: Request) {
  const token = getBearerToken(request);

  if (!token) {
    return { error: "Missing authorization token.", userId: null };
  }

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    return { error: error?.message ?? "Unable to verify the current user.", userId: null };
  }

  return { error: null, userId: data.user.id };
}

async function requireAdmin(request: Request) {
  const { error, userId } = await requireUser(request);

  if (error || !userId) {
    return { error: error ?? "Unable to verify the current user.", userId: null };
  }

  const supabase = getSupabaseAdminClient();
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();

  if (profileError || profile?.role !== "admin") {
    return { error: "Admin access is required to repair PDF paths.", userId: null };
  }

  return { error: null, userId };
}

async function isAdminUser(userId: string) {
  const supabase = getSupabaseAdminClient();
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();

  return !error && profile?.role === "admin";
}

export async function GET(request: Request, context: RouteContext) {
  const { error: authError, userId } = await requireUser(request);

  if (authError || !userId) {
    return NextResponse.json({ error: authError }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const supabase = getSupabaseAdminClient();
    const { data: resource, error } = await supabase
      .from("resources")
      .select("id,approval_status,storage_path")
      .eq("id", id)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    if (resource.approval_status !== "approved" && !(await isAdminUser(userId))) {
      return NextResponse.json(
        { error: "This resource is not approved for student access." },
        { status: 403 },
      );
    }

    const { signedUrl } = await createStoredResourcePdfSignedUrl(supabase, resource);

    return NextResponse.json({ signedUrl });
  } catch (caughtError) {
    return NextResponse.json(
      {
        error:
          caughtError instanceof Error
            ? caughtError.message
            : "Unable to create a signed PDF link.",
      },
      { status: 422 },
    );
  }
}

export async function POST(request: Request, context: RouteContext) {
  const { error: authError } = await requireAdmin(request);

  if (authError) {
    return NextResponse.json({ error: authError }, { status: 403 });
  }

  try {
    const { id } = await context.params;
    const supabase = getSupabaseAdminClient();
    const result = await repairResourcePdfPath(supabase, id, { update: true });

    if (!result.signedUrlPath) {
      return NextResponse.json(
        {
          candidates: result.candidates,
          error: "No matching Storage object could be signed.",
          signingAttempts: result.signingAttempts,
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      resource: result.resource,
      signedUrl: result.signedUrl,
      storagePath: result.signedUrlPath,
      updated: result.updated,
    });
  } catch (caughtError) {
    return NextResponse.json(
      {
        error:
          caughtError instanceof Error
            ? caughtError.message
            : "Unable to repair the PDF path.",
      },
      { status: 500 },
    );
  }
}
