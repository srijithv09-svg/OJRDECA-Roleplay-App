import { NextResponse } from "next/server";
import { AnswerKeyExtractionError, extractExamAnswerKey } from "@/lib/exams/answer-key-extraction";
import { extractPdfTextFromBuffer, PdfTextExtractionError } from "@/lib/pdf/server-text-extraction";
import { requireAdminRequester } from "@/lib/server/api-auth";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { error: authError, user } = await requireAdminRequester(request);

    if (authError) {
      return NextResponse.json({ error: authError }, { status: user ? 403 : 401 });
    }

    const { id } = await context.params;
    const supabase = getSupabaseAdminClient();
    const { data: resource, error: resourceError } = await supabase
      .from("resources")
      .select("resource_type,approval_status,storage_path")
      .eq("id", id)
      .maybeSingle();

    if (resourceError) {
      throw resourceError;
    }

    if (!resource) {
      return NextResponse.json({ error: "Exam not found." }, { status: 404 });
    }

    if (resource.resource_type !== "exam" || resource.approval_status !== "approved") {
      return NextResponse.json({ error: "Choose an approved exam PDF first." }, { status: 400 });
    }

    if (!resource.storage_path) {
      return NextResponse.json({ error: "This exam does not have an uploaded PDF." }, { status: 400 });
    }

    const objectPath = resource.storage_path.replace(/\\/g, "/").replace(/^\/+/, "").replace(/^resources\//i, "");
    const { data: pdf, error: downloadError } = await supabase.storage.from("resources").download(objectPath);

    if (downloadError || !pdf) {
      return NextResponse.json({ error: "Unable to open the uploaded exam PDF. Check that the file is available and try again." }, { status: 502 });
    }

    const { text } = await extractPdfTextFromBuffer(new Uint8Array(await pdf.arrayBuffer()));
    const rows = extractExamAnswerKey(text);

    // Extraction is a preview. The existing manual save is the only publication step.
    return NextResponse.json({ rows, source: "printed-key" }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AnswerKeyExtractionError || error instanceof PdfTextExtractionError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }

    console.error("[exam keys] PDF extraction failed", error);
    return NextResponse.json({ error: "Unable to read this answer key. Please try again or enter the answers manually." }, { status: 500 });
  }
}
