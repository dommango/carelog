'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { EventCategory, AttachmentKind } from '@carelog/db';
import { localDb, getClientId, eventToLocal } from '@/lib/localDb';
import { queueOutbox, drainOutbox } from '@/lib/outbox';
import { Icon } from '@/components/Icon';
import { isAllowedUpload, MAX_UPLOAD_BYTES } from '@/lib/upload-limits';
import { CategoryChips } from './CategoryChips';
import { AttachmentFields, AttachmentDraft } from './AttachmentFields';
import { validateEventDraft, hasDraftErrors, EventDraftErrors } from './validate';

export default function NewEventPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const templateId = searchParams.get('templateId');
  const scheduleId = searchParams.get('scheduleId');
  const dueAtParam = searchParams.get('dueAt');

  const [category, setCategory] = useState<string>('');
  const [rawInput, setRawInput] = useState('');
  const [occurredAt, setOccurredAt] = useState(() => {
    if (dueAtParam) {
      const d = new Date(dueAtParam);
      if (!isNaN(d.getTime())) return d.toISOString().slice(0, 16);
    }
    return new Date().toISOString().slice(0, 16);
  });
  const [templateName, setTemplateName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [attachments, setAttachments] = useState<AttachmentDraft[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [errors, setErrors] = useState<EventDraftErrors>({});
  const [recording, setRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const rawInputRef = useRef<HTMLTextAreaElement>(null);
  const occurredAtRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!templateId) return;
    fetch('/api/templates')
      .then((res) => res.json())
      .then((templates: Array<{ id: string; name: string; category: EventCategory }>) => {
        const match = templates.find((t) => t.id === templateId);
        if (match) {
          setTemplateName(match.name);
          setCategory(match.category);
        }
      })
      .catch(() => {
        // ignore; user can still submit manually
      });
  }, [templateId]);

  // An attachment satisfies the "say something" rule on its own, so adding one
  // clears the empty-draft error rather than leaving it stale on screen.
  const addAttachments = (drafts: AttachmentDraft[]) => {
    setAttachments((prev) => [...prev, ...drafts].slice(0, 5));
    setErrors((prev) => ({ ...prev, rawInput: undefined }));
  };

  // Validated here, against the same limits the upload route enforces, so a
  // file the server would refuse is reported now. Left to the server alone, the
  // rejection would surface only as a background outbox retry that gives up
  // silently — the event would persist with its photo permanently missing.
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, kind: AttachmentKind) => {
    const files = e.target.files;
    if (!files) return;

    const accepted: AttachmentDraft[] = [];
    const rejected: string[] = [];

    for (const file of Array.from(files)) {
      if (!isAllowedUpload(kind, file.type)) {
        rejected.push(`${file.name} — ${file.type || 'unrecognised format'} isn't supported`);
      } else if (file.size > MAX_UPLOAD_BYTES) {
        rejected.push(`${file.name} — too large (max ${Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)} MB)`);
      } else {
        accepted.push({ id: crypto.randomUUID(), kind, mimeType: file.type, file });
      }
    }

    setAttachmentError(rejected.length > 0 ? rejected.join('; ') : null);
    if (accepted.length > 0) {
      addAttachments(accepted);
    }
    // Let the same file be re-picked after a rejection.
    e.target.value = '';
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const file = new File([blob], `recording-${Date.now()}.webm`, { type: 'audio/webm' });
        addAttachments([
          { id: crypto.randomUUID(), kind: AttachmentKind.audio, mimeType: file.type, file },
        ]);
        stream.getTracks().forEach((track) => track.stop());
      };

      setAttachmentError(null);
      recorder.start();
      setRecording(true);
    } catch (error) {
      console.error('Microphone unavailable:', error);
      setRecording(false);
      setAttachmentError(
        "Couldn't start recording — check the microphone permission for this site, or type the note instead."
      );
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  };

  const toggleRecording = () => {
    if (recording) {
      stopRecording();
      return;
    }
    startRecording().catch((error) => console.error('Recording failed:', error));
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();

    const draftErrors = validateEventDraft({
      rawInput,
      occurredAt,
      attachmentCount: attachments.length,
    });
    setErrors(draftErrors);

    if (hasDraftErrors(draftErrors)) {
      if (draftErrors.rawInput) rawInputRef.current?.focus();
      else occurredAtRef.current?.focus();
      return;
    }

    setLoading(true);

    const eventId = crypto.randomUUID();
    const idempotencyKey = crypto.randomUUID();
    const clientId = getClientId();
    const now = new Date().toISOString();

    const attachmentInputs = attachments.map((a) => ({
      id: a.id,
      kind: a.kind,
      mimeType: a.mimeType,
      sizeBytes: a.file.size,
    }));

    const trimmedInput = rawInput.trim();

    const payload = {
      id: eventId,
      rawInput: trimmedInput.length > 0 ? trimmedInput : undefined,
      category: category || undefined,
      occurredAt: new Date(occurredAt).toISOString(),
      templateId: templateId ?? undefined,
      scheduleId: scheduleId ?? undefined,
      clientId,
      idempotencyKey,
      attachments: attachmentInputs,
    };

    // Store blobs locally for later upload.
    for (const attachment of attachments) {
      await localDb.blobs.put({
        id: `${eventId}:blob:${attachment.id}`,
        blob: attachment.file,
        mimeType: attachment.mimeType,
        eventId,
      });
    }

    // Optimistic local event.
    const localEvent = eventToLocal({
      ...payload,
      patientId: '', // unknown until sync; will be filled by delta pull
      authorId: '',
      status: 'pending_ai',
      capturedAt: now,
      hasConflict: false,
      version: 1,
      updatedAt: now,
      createdAt: now,
      deletedAt: null,
      attachments: attachmentInputs.map((a) => ({
        id: a.id,
        kind: a.kind,
        mimeType: a.mimeType,
        storageKey: null,
        sizeBytes: a.sizeBytes,
        uploadedAt: null,
        transcript: null,
        visionSummary: null,
        createdAt: now,
      })),
    }, false);
    await localDb.events.put(localEvent);

    await queueOutbox({
      id: eventId,
      type: 'event:create',
      payload,
      idempotencyKey,
      clientId,
    });

    // Drain asynchronously; don't block redirect on slow uploads.
    drainOutbox().catch((err) => console.error('Drain failed', err));

    setLoading(false);
    router.push('/');
  };

  return (
    <form noValidate onSubmit={submit} className="mx-auto flex max-w-xl flex-col gap-4 md:max-w-2xl">
      <div className="-mx-4 -mt-[18px] mb-1 flex items-center gap-2 border-b border-line bg-card px-4 py-3.5">
        <button type="button" onClick={() => router.back()} className="cc-btn cc-btn--ghost cc-btn--sm !pl-1.5">
          <Icon name="chevL" size={16} />
          Back
        </button>
        <h1 className="cc-serif text-[22px]">{templateName ? templateName : 'New log'}</h1>
      </div>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
        <div>
          <span id="category-label" className="cc-field-label">
            Category <span className="font-semibold text-ink-faint">· optional, auto-detected</span>
          </span>
          <CategoryChips labelId="category-label" value={category} onChange={setCategory} />
        </div>

        <div className="md:w-60">
          <label htmlFor="occurred-at" className="cc-field-label">
            When <span className="font-semibold text-ink-faint">· required</span>
          </label>
          <input
            id="occurred-at"
            ref={occurredAtRef}
            type="datetime-local"
            value={occurredAt}
            onChange={(e) => {
              setOccurredAt(e.target.value);
              setErrors((prev) => ({ ...prev, occurredAt: undefined }));
            }}
            aria-required
            aria-invalid={errors.occurredAt ? true : undefined}
            aria-describedby={errors.occurredAt ? 'occurred-at-error' : undefined}
            className="cc-input"
          />
          {errors.occurredAt && (
            <p
              id="occurred-at-error"
              role="alert"
              className="mt-2 rounded-[var(--r-lg)] bg-alert-tint p-2.5 text-sm font-semibold text-accent-deep"
            >
              {errors.occurredAt}
            </p>
          )}
        </div>
      </div>

      <div>
        <label htmlFor="raw-input" className="cc-field-label">
          What happened{' '}
          <span className="font-semibold text-ink-faint">
            · required, unless you add a photo or voice memo
          </span>
        </label>
        <textarea
          id="raw-input"
          ref={rawInputRef}
          value={rawInput}
          onChange={(e) => {
            setRawInput(e.target.value);
            setErrors((prev) => ({ ...prev, rawInput: undefined }));
          }}
          rows={4}
          aria-required={attachments.length === 0}
          aria-invalid={errors.rawInput ? true : undefined}
          aria-describedby={errors.rawInput ? 'raw-input-error raw-input-hint' : 'raw-input-hint'}
          className="cc-input resize-none md:min-h-[9.5rem]"
          placeholder="Say it however you'd tell a nurse — we'll sort out the details."
        />
        {errors.rawInput && (
          <p
            id="raw-input-error"
            role="alert"
            className="mt-2 rounded-[var(--r-lg)] bg-alert-tint p-2.5 text-sm font-semibold text-accent-deep"
          >
            {errors.rawInput}
          </p>
        )}
        <div id="raw-input-hint" className="cc-note cc-note--calm mt-2.5">
          <span className="cc-note-ic">
            <Icon name="check" size={16} />
          </span>
          <span>
            Just write plainly. CareLog reads it into meds, vitals, and mood for you — you confirm
            before it&apos;s final.
          </span>
        </div>
      </div>

      <AttachmentFields
        labelId="attachments-label"
        attachments={attachments}
        error={attachmentError}
        recording={recording}
        onPick={handleFileChange}
        onToggleRecording={toggleRecording}
        onRemove={removeAttachment}
      />

      <button type="submit" disabled={loading} className="cc-btn cc-btn--primary cc-btn--block cc-btn--xl">
        <Icon name="send" size={18} />
        {loading ? 'Saving…' : 'Save log'}
      </button>
    </form>
  );
}
