import { NextResponse } from "next/server";
import { requireAuthenticatedSchoolUser } from "@/lib/server/api-auth";
import { buildStudentReadinessSummary } from "@/lib/server/readiness";

export async function GET(request: Request) {
  const { error: authError, user } = await requireAuthenticatedSchoolUser(request);

  if (authError || !user) {
    return NextResponse.json({ error: authError ?? "Authentication required." }, { status: 401 });
  }

  try {
    return NextResponse.json(await buildStudentReadinessSummary(user.id));
  } catch (caughtError) {
    return NextResponse.json(
      {
        error:
          caughtError instanceof Error
            ? caughtError.message
            : "Unable to load readiness summary.",
      },
      { status: 500 },
    );
  }
}
