import { NextResponse } from "next/server";
import { requireAdminRequester } from "@/lib/server/api-auth";
import { buildAdminReadinessSummary } from "@/lib/server/readiness";

export async function GET(request: Request) {
  const { error: authError, user } = await requireAdminRequester(request);

  if (authError || !user) {
    return NextResponse.json(
      { error: authError ?? "Admin or advisor access required." },
      { status: user ? 403 : 401 },
    );
  }

  try {
    return NextResponse.json(await buildAdminReadinessSummary());
  } catch (caughtError) {
    return NextResponse.json(
      {
        error:
          caughtError instanceof Error
            ? caughtError.message
            : "Unable to load admin readiness summary.",
      },
      { status: 500 },
    );
  }
}
