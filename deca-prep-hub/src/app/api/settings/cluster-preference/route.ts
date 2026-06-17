import { NextResponse } from "next/server";
import { isDecaClusterPreference } from "@/lib/deca/clusters";
import { requireAuthenticatedSchoolUser } from "@/lib/server/api-auth";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

type RequestBody = {
  selected_cluster?: unknown;
};

export async function PATCH(request: Request) {
  const { error: authError, user } = await requireAuthenticatedSchoolUser(request);

  if (authError || !user) {
    return NextResponse.json({ error: authError ?? "Authentication required." }, { status: 401 });
  }

  let body: RequestBody;

  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const selectedCluster = body.selected_cluster === "" ? null : body.selected_cluster;

  if (selectedCluster !== null && !isDecaClusterPreference(selectedCluster)) {
    return NextResponse.json({ error: "Choose a valid DECA cluster." }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("profiles")
    .update({ selected_cluster: selectedCluster })
    .eq("id", user.id)
    .select("id,email,role,selected_cluster,created_at,updated_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, profile: data });
}
