import { NextResponse } from "next/server";
import { getFriendlyErrorMessage, logDeveloperError } from "@/lib/errors";
import { requireAuthenticatedSchoolUser } from "@/lib/server/api-auth";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{ attemptId: string }>;
};

const audioBucket = "roleplay-audio";
const maxAudioBytes = 25 * 1024 * 1024;

async function getOwnedAttempt(attemptId: string, userId: string) {
  const supabase = getSupabaseAdminClient();
  const { data: attempt, error } = await supabase
    .from("roleplay_attempts")
    .select("id,user_id,audio_path")
    .eq("id", attemptId)
    .maybeSingle();

  if (error) {
    logDeveloperError("[roleplay audio api] attempt lookup failed", error);
    return {
      attempt: null,
      error: NextResponse.json(
        { error: getFriendlyErrorMessage(error, "Unable to load this roleplay attempt.") },
        { status: 500 },
      ),
    };
  }

  if (!attempt) {
    return {
      attempt: null,
      error: NextResponse.json(
        { error: "This saved roleplay attempt could not be found." },
        { status: 404 },
      ),
    };
  }

  if (attempt.user_id !== userId) {
    return {
      attempt: null,
      error: NextResponse.json(
        { error: "You can only manage audio for your own roleplay attempts." },
        { status: 403 },
      ),
    };
  }

  return { attempt, error: null };
}

function getSafeContentType(file: File) {
  const type = file.type.toLowerCase();

  if (type.includes("webm")) {
    return "audio/webm";
  }

  if (type.includes("ogg")) {
    return "audio/ogg";
  }

  if (type.includes("mp4") || type.includes("mpeg") || type.includes("wav")) {
    return type.split(";")[0];
  }

  return "audio/webm";
}

export async function GET(request: Request, context: RouteContext) {
  const { error: authError, user } = await requireAuthenticatedSchoolUser(request);

  if (authError || !user) {
    return NextResponse.json({ error: authError }, { status: 401 });
  }

  try {
    const { attemptId } = await context.params;
    const { attempt, error } = await getOwnedAttempt(attemptId, user.id);

    if (error) {
      return error;
    }

    if (!attempt?.audio_path) {
      return NextResponse.json({ signedUrl: null });
    }

    const supabase = getSupabaseAdminClient();
    const { data, error: signedUrlError } = await supabase.storage
      .from(audioBucket)
      .createSignedUrl(attempt.audio_path, 60 * 10);

    if (signedUrlError) {
      logDeveloperError("[roleplay audio api] signed URL failed", signedUrlError);
      return NextResponse.json(
        { error: getFriendlyErrorMessage(signedUrlError, "Unable to load roleplay audio.") },
        { status: 500 },
      );
    }

    return NextResponse.json({ signedUrl: data.signedUrl });
  } catch (caughtError) {
    return NextResponse.json(
      {
        error:
          caughtError instanceof Error
            ? caughtError.message
            : "Unable to load roleplay attempt audio.",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request, context: RouteContext) {
  const { error: authError, user } = await requireAuthenticatedSchoolUser(request);

  if (authError || !user) {
    return NextResponse.json({ error: authError }, { status: 401 });
  }

  try {
    const { attemptId } = await context.params;
    const { attempt, error } = await getOwnedAttempt(attemptId, user.id);

    if (error) {
      return error;
    }

    const formData = await request.formData();
    const audio = formData.get("audio");

    if (!(audio instanceof File)) {
      return NextResponse.json({ error: "Upload must include an audio file." }, { status: 400 });
    }

    if (audio.size <= 0) {
      return NextResponse.json({ error: "Audio recording is empty." }, { status: 400 });
    }

    if (audio.size > maxAudioBytes) {
      return NextResponse.json(
        { error: "Audio recording must be 25 MB or smaller." },
        { status: 400 },
      );
    }

    const supabase = getSupabaseAdminClient();
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const audioPath = `roleplay-attempts/${user.id}/${attemptId}/${timestamp}.webm`;
    const { error: uploadError } = await supabase.storage
      .from(audioBucket)
      .upload(audioPath, audio, {
        contentType: getSafeContentType(audio),
        upsert: false,
      });

    if (uploadError) {
      logDeveloperError("[roleplay audio api] upload failed", uploadError);
      return NextResponse.json(
        { error: getFriendlyErrorMessage(uploadError, "Unable to upload roleplay audio.") },
        { status: 500 },
      );
    }

    const { error: updateError } = await supabase
      .from("roleplay_attempts")
      .update({ audio_path: audioPath })
      .eq("id", attemptId);

    if (updateError) {
      await supabase.storage.from(audioBucket).remove([audioPath]);
      logDeveloperError("[roleplay audio api] audio path update failed", updateError);
      return NextResponse.json(
        { error: getFriendlyErrorMessage(updateError, "Unable to attach roleplay audio.") },
        { status: 500 },
      );
    }

    if (attempt?.audio_path) {
      await supabase.storage.from(audioBucket).remove([attempt.audio_path]);
    }

    return NextResponse.json({ audioPath });
  } catch (caughtError) {
    return NextResponse.json(
      {
        error:
          caughtError instanceof Error
            ? caughtError.message
            : "Unable to upload roleplay attempt audio.",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const { error: authError, user } = await requireAuthenticatedSchoolUser(request);

  if (authError || !user) {
    return NextResponse.json({ error: authError }, { status: 401 });
  }

  try {
    const { attemptId } = await context.params;
    const { attempt, error } = await getOwnedAttempt(attemptId, user.id);

    if (error) {
      return error;
    }

    const supabase = getSupabaseAdminClient();

    if (attempt?.audio_path) {
      const { error: removeError } = await supabase.storage
        .from(audioBucket)
        .remove([attempt.audio_path]);

      if (removeError) {
        logDeveloperError("[roleplay audio api] remove failed", removeError);
        return NextResponse.json(
          { error: getFriendlyErrorMessage(removeError, "Unable to remove roleplay audio.") },
          { status: 500 },
        );
      }
    }

    const { error: updateError } = await supabase
      .from("roleplay_attempts")
      .update({ audio_path: null })
      .eq("id", attemptId);

    if (updateError) {
      logDeveloperError("[roleplay audio api] clear audio path failed", updateError);
      return NextResponse.json(
        { error: getFriendlyErrorMessage(updateError, "Unable to remove roleplay audio.") },
        { status: 500 },
      );
    }

    return NextResponse.json({ removed: true });
  } catch (caughtError) {
    return NextResponse.json(
      {
        error:
          caughtError instanceof Error
            ? caughtError.message
            : "Unable to remove roleplay attempt audio.",
      },
      { status: 500 },
    );
  }
}
