"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ResourceErrorState, ResourceLoadingState } from "@/components/resources/resource-states";
import { ResourcesService, type PublicResourceListItem } from "@/lib/services/resources";
import { RoleplayAttemptsService } from "@/lib/services/roleplay-attempts";

type PracticeForm = {
  responseNotes: string;
  wentWell: string;
  improve: string;
  judgeFeedback: string;
  confidenceRating: number | null;
};

type RecordingStatus = "idle" | "recording" | "recorded";

const emptyForm: PracticeForm = {
  responseNotes: "",
  wentWell: "",
  improve: "",
  judgeFeedback: "",
  confidenceRating: null,
};

function formatValue(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return "Not available";
  }

  return String(value);
}

function buildReflection(form: PracticeForm) {
  const sections = [
    form.wentWell.trim() ? `What went well:\n${form.wentWell.trim()}` : null,
    form.improve.trim() ? `What I would improve:\n${form.improve.trim()}` : null,
  ].filter(Boolean);

  return sections.length > 0 ? sections.join("\n\n") : null;
}

function splitReflection(value: string | null | undefined) {
  if (!value) {
    return { wentWell: "", improve: "" };
  }

  const wentWellMatch = value.match(/What went well:\n([\s\S]*?)(?:\n\nWhat I would improve:|$)/);
  const improveMatch = value.match(/What I would improve:\n([\s\S]*)$/);

  return {
    wentWell: wentWellMatch?.[1]?.trim() ?? "",
    improve: improveMatch?.[1]?.trim() ?? value,
  };
}

export function RoleplayPracticeView() {
  const params = useParams<{ id?: string | string[] }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const resourceId = Array.isArray(params.id) ? params.id[0] : params.id;
  const editAttemptId = searchParams.get("attemptId");
  const [resource, setResource] = useState<PublicResourceListItem | null>(null);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [form, setForm] = useState<PracticeForm>(emptyForm);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioPreviewUrl, setAudioPreviewUrl] = useState<string | null>(null);
  const [recordingStatus, setRecordingStatus] = useState<RecordingStatus>("idle");
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [existingAudioUrl, setExistingAudioUrl] = useState<string | null>(null);
  const [hasExistingAudio, setHasExistingAudio] = useState(false);
  const [removeExistingAudio, setRemoveExistingAudio] = useState(false);
  const [audioUploadWarning, setAudioUploadWarning] = useState<string | null>(null);
  const [savedAttemptId, setSavedAttemptId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    let isActive = true;

    async function loadPractice() {
      try {
        if (!resourceId) {
          throw new Error("Missing roleplay id.");
        }

        const nextResource = await ResourcesService.getApprovedPublicResourceById(resourceId);

        if (!nextResource || nextResource.resource_type !== "roleplay") {
          throw new Error("This approved roleplay could not be found.");
        }

        const [pdfLink, editAttempt] = await Promise.all([
          ResourcesService.getResourcePdfLink(nextResource.id).catch(() => null),
          editAttemptId
            ? RoleplayAttemptsService.getRoleplayAttemptResult(editAttemptId)
            : Promise.resolve(null),
        ]);

        if (!isActive) {
          return;
        }

        if (editAttempt && editAttempt.attempt.resource_id !== nextResource.id) {
          throw new Error("This attempt does not belong to the selected roleplay.");
        }

        setResource(nextResource);
        setSignedUrl(pdfLink?.signedUrl ?? null);
        setError(null);

        if (editAttempt) {
          const reflection = splitReflection(editAttempt.attempt.self_reflection);
          const nextExistingAudioUrl = editAttempt.attempt.audio_path
            ? await RoleplayAttemptsService.getRoleplayAttemptAudioSignedUrl(editAttempt.attempt.id).catch(
                () => null,
              )
            : null;

          setForm({
            responseNotes: editAttempt.attempt.response_notes ?? "",
            wentWell:
              editAttempt.attempt.performance_indicator_notes ?? reflection.wentWell,
            improve: reflection.improve,
            judgeFeedback: editAttempt.attempt.judge_feedback ?? "",
            confidenceRating: editAttempt.attempt.confidence_rating,
          });
          setHasExistingAudio(Boolean(editAttempt.attempt.audio_path));
          setExistingAudioUrl(nextExistingAudioUrl);
          setRemoveExistingAudio(false);
        }
      } catch (caughtError) {
        if (!isActive) {
          return;
        }

        setResource(null);
        setSignedUrl(null);
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Unable to load this roleplay practice page.",
        );
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void loadPractice();

    return () => {
      isActive = false;
    };
  }, [resourceId, editAttemptId, reloadKey]);

  useEffect(() => {
    return () => {
      if (audioPreviewUrl) {
        URL.revokeObjectURL(audioPreviewUrl);
      }

      stopMediaTracks();
    };
  }, [audioPreviewUrl]);

  function stopMediaTracks() {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
  }

  function getSupportedAudioMimeType() {
    if (typeof MediaRecorder === "undefined") {
      return "";
    }

    const preferredTypes = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];
    return preferredTypes.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
  }

  async function startRecording() {
    setRecordingError(null);

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setRecordingError("Audio recording is not supported in this browser.");
      return;
    }

    if (typeof MediaRecorder === "undefined") {
      setRecordingError("MediaRecorder is not supported in this browser.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = getSupportedAudioMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

      audioChunksRef.current = [];
      mediaStreamRef.current = stream;
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const type = recorder.mimeType || "audio/webm";
        const nextBlob = new Blob(audioChunksRef.current, { type });

        if (audioPreviewUrl) {
          URL.revokeObjectURL(audioPreviewUrl);
        }

        setAudioBlob(nextBlob);
        setAudioPreviewUrl(URL.createObjectURL(nextBlob));
        setRecordingStatus("recorded");
        stopMediaTracks();
      };

      recorder.start();
      setRecordingStatus("recording");
    } catch (caughtError) {
      stopMediaTracks();
      setRecordingError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to start recording. Check microphone permissions.",
      );
    }
  }

  function stopRecording() {
    const recorder = mediaRecorderRef.current;

    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
  }

  function clearRecordedAudio() {
    if (audioPreviewUrl) {
      URL.revokeObjectURL(audioPreviewUrl);
    }

    setAudioBlob(null);
    setAudioPreviewUrl(null);
    setRecordingStatus("idle");
    setRecordingError(null);
    audioChunksRef.current = [];
  }

  function retryLoad() {
    setIsLoading(true);
    setError(null);
    setReloadKey((currentKey) => currentKey + 1);
  }

  async function submitAttempt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!resourceId) {
      return;
    }

    setIsSaving(true);
    setError(null);
    setAudioUploadWarning(null);
    setSavedAttemptId(null);

    try {
      const payload = {
        response_notes: form.responseNotes,
        performance_indicator_notes: form.wentWell,
        self_reflection: buildReflection(form),
        judge_feedback: form.judgeFeedback,
        confidence_rating: form.confidenceRating,
      };

      let nextAttemptId = editAttemptId;

      if (editAttemptId) {
        await RoleplayAttemptsService.updateRoleplayAttempt(editAttemptId, payload);
      } else {
        const result = await RoleplayAttemptsService.createRoleplayAttempt(resourceId, payload);
        nextAttemptId = result.attemptId;
      }

      if (!nextAttemptId) {
        throw new Error("Attempt was saved, but the attempt id was not returned.");
      }

      try {
        if (removeExistingAudio) {
          await RoleplayAttemptsService.removeRoleplayAttemptAudio(nextAttemptId);
        }

        if (audioBlob) {
          await RoleplayAttemptsService.uploadRoleplayAttemptAudio(nextAttemptId, audioBlob);
        }
      } catch (uploadError) {
        setSavedAttemptId(nextAttemptId);
        setHasExistingAudio(hasExistingAudio && !removeExistingAudio);
        setAudioUploadWarning(
          uploadError instanceof Error
            ? `Your written attempt was saved, but the audio upload failed: ${uploadError.message}`
            : "Your written attempt was saved, but the audio upload failed.",
        );
        return;
      }

      router.push(`/roleplays/attempts/${nextAttemptId}`);
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to save attempt.");
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return <ResourceLoadingState />;
  }

  if (error && !resource) {
    return <ResourceErrorState message={error} onRetry={retryLoad} />;
  }

  if (!resource) {
    return null;
  }

  return (
    <>
      <PageHeader
        actions={
          <>
            <LinkButton href={`/resources/${resource.id}`}>Back to resource</LinkButton>
            {signedUrl ? <AnchorButton href={signedUrl}>Open / Download PDF</AnchorButton> : null}
          </>
        }
        description="Save your written response and reflection now. Audio, transcription, and AI feedback are ready to plug in later."
        eyebrow={editAttemptId ? "Edit practice attempt" : "Roleplay practice"}
        title={resource.title}
      />

      {error ? (
        <Card className="border-red-200 bg-red-50">
          <p className="font-semibold text-red-950">Unable to complete that action</p>
          <p className="mt-2 text-sm leading-6 text-red-800">{error}</p>
        </Card>
      ) : null}

      <section className="grid gap-5 xl:grid-cols-[0.85fr_1.15fr]">
        <div className="space-y-5">
          <Card>
            <CardHeader eyebrow="Metadata" title="Roleplay details" />
            <div className="flex flex-wrap gap-2">
              {resource.event_code ? <Badge>{resource.event_code}</Badge> : null}
              <Badge tone="blue">{resource.event_category ?? "Roleplay"}</Badge>
              <Badge>{resource.year ?? "Year TBD"}</Badge>
            </div>
            <dl className="mt-4 grid gap-3 text-sm">
              {[
                ["Event name", resource.event_name],
                ["Cluster", resource.cluster],
                ["Event category", resource.event_category],
                ["Year", resource.year],
              ].map(([label, value]) => (
                <div className="rounded-lg bg-slate-50 p-3" key={label}>
                  <dt className="font-semibold text-slate-800">{label}</dt>
                  <dd className="mt-1 text-slate-600">{formatValue(value)}</dd>
                </div>
              ))}
            </dl>
          </Card>

          <Card>
            <CardHeader eyebrow="Prep" title="Preparation" />
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4">
              <p className="font-semibold text-slate-950">Prep timer coming soon</p>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Use the PDF button and your usual DECA prep timing for now.
              </p>
              {signedUrl ? <AnchorButton className="mt-4" href={signedUrl}>Open PDF</AnchorButton> : null}
            </div>
          </Card>

          <Card>
            <CardHeader eyebrow="Optional audio" title="Record spoken response" />
            <p className="text-sm leading-6 text-slate-600">
              Your browser may ask for microphone access. Audio is uploaded only when you save
              the attempt.
            </p>

            {recordingError ? (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                {recordingError}
              </div>
            ) : null}

            {hasExistingAudio && !removeExistingAudio && !audioPreviewUrl ? (
              <div className="mt-4 rounded-lg border border-slate-100 bg-slate-50 p-3">
                <p className="text-sm font-semibold text-slate-950">Attached audio</p>
                {existingAudioUrl ? (
                  <audio className="mt-3 w-full" controls src={existingAudioUrl}>
                    <track kind="captions" />
                  </audio>
                ) : (
                  <p className="mt-2 text-sm text-slate-600">
                    Audio is attached, but the playback link could not be loaded.
                  </p>
                )}
                <button
                  className="mt-3 min-h-10 rounded-md border border-red-200 bg-white px-3 text-sm font-semibold text-red-700 transition hover:bg-red-50"
                  onClick={() => setRemoveExistingAudio(true)}
                  type="button"
                >
                  Remove attached audio
                </button>
              </div>
            ) : null}

            {removeExistingAudio && !audioPreviewUrl ? (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                Attached audio will be removed when you save.
                <button
                  className="ml-2 font-semibold underline"
                  onClick={() => setRemoveExistingAudio(false)}
                  type="button"
                >
                  Keep audio
                </button>
              </div>
            ) : null}

            {audioPreviewUrl ? (
              <div className="mt-4 rounded-lg border border-slate-100 bg-slate-50 p-3">
                <p className="text-sm font-semibold text-slate-950">Recording ready</p>
                <audio className="mt-3 w-full" controls src={audioPreviewUrl}>
                  <track kind="captions" />
                </audio>
                <button
                  className="mt-3 min-h-10 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-blue-200 hover:text-blue-700"
                  onClick={clearRecordedAudio}
                  type="button"
                >
                  Delete and re-record
                </button>
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-2">
              {recordingStatus === "recording" ? (
                <button
                  className="min-h-10 rounded-md bg-red-700 px-3 text-sm font-semibold text-white transition hover:bg-red-800"
                  onClick={stopRecording}
                  type="button"
                >
                  Stop recording
                </button>
              ) : (
                <button
                  className="min-h-10 rounded-md bg-blue-700 px-3 text-sm font-semibold text-white transition hover:bg-blue-800"
                  onClick={() => void startRecording()}
                  type="button"
                >
                  {audioPreviewUrl ? "Record again" : "Start recording"}
                </button>
              )}
              <button className="min-h-10 rounded-md border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-500" disabled type="button">
                Generate AI feedback - Coming soon
              </button>
            </div>
          </Card>
        </div>

        <form className="space-y-5" onSubmit={(event) => void submitAttempt(event)}>
          {audioUploadWarning ? (
            <Card className="border-amber-200 bg-amber-50">
              <p className="font-semibold text-amber-900">Attempt saved without audio</p>
              <p className="mt-2 text-sm leading-6 text-amber-800">{audioUploadWarning}</p>
              {savedAttemptId ? (
                <LinkButton href={`/roleplays/attempts/${savedAttemptId}`}>
                  Open saved attempt
                </LinkButton>
              ) : null}
            </Card>
          ) : null}

          <Card>
            <CardHeader eyebrow="Response" title="Written response" />
            <label className="text-sm font-semibold text-slate-800" htmlFor="response-notes">
              Paste or write your roleplay response/transcript
            </label>
            <textarea
              className="mt-2 min-h-56 w-full rounded-md border border-slate-200 bg-white p-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              id="response-notes"
              onChange={(event) =>
                setForm((current) => ({ ...current, responseNotes: event.target.value }))
              }
              value={form.responseNotes}
            />
          </Card>

          <Card>
            <CardHeader eyebrow="Reflection" title="Practice notes" />
            <div className="grid gap-4">
              <TextareaField
                label="What went well?"
                onChange={(value) => setForm((current) => ({ ...current, wentWell: value }))}
                value={form.wentWell}
              />
              <TextareaField
                label="What would you improve?"
                onChange={(value) => setForm((current) => ({ ...current, improve: value }))}
                value={form.improve}
              />
              <TextareaField
                label="Judge/partner feedback"
                onChange={(value) =>
                  setForm((current) => ({ ...current, judgeFeedback: value }))
                }
                value={form.judgeFeedback}
              />
            </div>
          </Card>

          <Card>
            <CardHeader eyebrow="Confidence" title="How ready did you feel?" />
            <div className="flex flex-wrap gap-2">
              {[1, 2, 3, 4, 5].map((rating) => (
                <button
                  className={
                    form.confidenceRating === rating
                      ? "h-11 w-11 rounded-md bg-blue-700 text-sm font-bold text-white"
                      : "h-11 w-11 rounded-md border border-slate-200 bg-white text-sm font-bold text-slate-700 transition hover:border-blue-200 hover:text-blue-700"
                  }
                  key={rating}
                  onClick={() => setForm((current) => ({ ...current, confidenceRating: rating }))}
                  type="button"
                >
                  {rating}
                </button>
              ))}
            </div>
            <button
              className="mt-6 min-h-12 w-full rounded-md bg-blue-700 px-4 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:bg-slate-300 sm:w-auto"
              disabled={isSaving}
              type="submit"
            >
              {isSaving ? "Saving..." : editAttemptId ? "Save changes" : "Save practice attempt"}
            </button>
          </Card>
        </form>
      </section>
    </>
  );
}

function TextareaField({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  const id = label.toLowerCase().replace(/[^a-z0-9]+/g, "-");

  return (
    <div>
      <label className="text-sm font-semibold text-slate-800" htmlFor={id}>
        {label}
      </label>
      <textarea
        className="mt-2 min-h-28 w-full rounded-md border border-slate-200 bg-white p-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
        id={id}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </div>
  );
}

function LinkButton({ children, href }: { children: ReactNode; href: string }) {
  return (
    <Link
      className="inline-flex min-h-10 items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-blue-200 hover:text-blue-700"
      href={href}
    >
      {children}
    </Link>
  );
}

function AnchorButton({
  children,
  className = "",
  href,
}: {
  children: ReactNode;
  className?: string;
  href: string;
}) {
  return (
    <a
      className={`inline-flex min-h-10 items-center justify-center rounded-md bg-blue-700 px-3 text-sm font-semibold text-white transition hover:bg-blue-800 ${className}`}
      href={href}
      rel="noreferrer"
      target="_blank"
    >
      {children}
    </a>
  );
}
