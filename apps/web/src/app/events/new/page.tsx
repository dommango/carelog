'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { EventCategory, AttachmentKind } from '@carelog/db';
import { localDb, getClientId, eventToLocal } from '@/lib/localDb';
import { queueOutbox, drainOutbox } from '@/lib/outbox';
import { Icon } from '@/components/Icon';
import { categoryMeta } from '@/lib/categoryTheme';
import { isAllowedUpload, MAX_UPLOAD_BYTES } from '@/lib/upload-limits';

const categories = Object.values(EventCategory);

type AttachmentDraft = {
  id: string;
  kind: AttachmentKind;
  mimeType: string;
  file: File;
};

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
  const [recording, setRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

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
      setAttachments((prev) => [...prev, ...accepted].slice(0, 5));
    }
    // Let the same file be re-picked after a rejection.
    e.target.value = '';
  };

  const startRecording = async () => {
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
      setAttachments((prev) =>
        [...prev, { id: crypto.randomUUID(), kind: AttachmentKind.audio, mimeType: file.type, file }].slice(0, 5)
      );
      stream.getTracks().forEach((track) => track.stop());
    };

    recorder.start();
    setRecording(true);
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
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

    const payload = {
      id: eventId,
      rawInput,
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
    <form onSubmit={submit} className="mx-auto flex max-w-xl flex-col gap-4">
      <div className="-mx-4 -mt-[18px] mb-1 flex items-center gap-2 border-b border-line bg-card px-4 py-3.5">
        <button type="button" onClick={() => router.back()} className="cc-btn cc-btn--ghost cc-btn--sm !pl-1.5">
          <Icon name="chevL" size={16} />
          Back
        </button>
        <h1 className="cc-serif text-[22px]">{templateName ? templateName : 'New log'}</h1>
      </div>

      <div>
        <label className="cc-field-label">What happened</label>
        <textarea
          value={rawInput}
          onChange={(e) => setRawInput(e.target.value)}
          required
          rows={4}
          className="cc-input resize-none"
          placeholder="Say it however you'd tell a nurse — we'll sort out the details."
        />
        <div className="cc-note cc-note--calm mt-2.5">
          <span className="cc-note-ic">
            <Icon name="check" size={16} />
          </span>
          <span>
            Just write plainly. CareLog reads it into meds, vitals, and mood for you — you confirm
            before it&apos;s final.
          </span>
        </div>
      </div>

      <div>
        <label className="cc-field-label">
          Category <span className="font-semibold text-ink-faint">· optional, auto-detected</span>
        </label>
        <div className="flex flex-wrap gap-[7px]">
          {categories.map((c) => {
            const meta = categoryMeta(c);
            const active = category === c;
            return (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(active ? '' : c)}
                className={`cc-btn cc-btn--sm ${active ? 'cc-btn--primary' : 'cc-btn--secondary'}`}
              >
                <Icon name={meta.icon} size={14} />
                {meta.label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className="cc-field-label">When</label>
        <input
          type="datetime-local"
          value={occurredAt}
          onChange={(e) => setOccurredAt(e.target.value)}
          required
          className="cc-input"
        />
      </div>

      <div className="space-y-2.5">
        <label className="cc-field-label">Attachments</label>
        <div className="flex gap-2.5">
          <label className="cc-btn cc-btn--secondary flex-1 cursor-pointer">
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => handleFileChange(e, AttachmentKind.photo)}
            />
            <Icon name="phone" size={17} />
            Photo
          </label>
          <label className="cc-btn cc-btn--secondary flex-1 cursor-pointer">
            <input
              type="file"
              accept="image/*"
              capture="user"
              className="hidden"
              onChange={(e) => handleFileChange(e, AttachmentKind.photo)}
            />
            <Icon name="phone" size={17} />
            Selfie
          </label>
          <button
            type="button"
            onClick={recording ? stopRecording : startRecording}
            className="cc-btn flex-1"
            style={
              recording
                ? { background: 'var(--accent-tint)', color: 'var(--accent-deep)', boxShadow: 'none' }
                : { background: 'var(--card)', color: 'var(--ink)', boxShadow: 'inset 0 0 0 1px var(--line)' }
            }
          >
            <Icon name="bell" size={17} />
            {recording ? 'Stop' : 'Voice memo'}
          </button>
        </div>

        {attachmentError && (
          <p role="alert" className="rounded-[var(--r-lg)] bg-alert-tint p-2.5 text-sm text-accent-deep">
            {attachmentError}
          </p>
        )}

        {attachments.length > 0 && (
          <ul className="space-y-1.5">
            {attachments.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between gap-2 rounded-[var(--r-lg)] bg-card-sunk p-2.5 text-sm text-ink-soft"
              >
                <span className="flex items-center gap-1.5">
                  <Icon name={a.kind === 'audio' ? 'bell' : 'phone'} size={14} className="text-ink-faint" />
                  {a.file.name} ({Math.round(a.file.size / 1024)} KB)
                </span>
                <button
                  type="button"
                  onClick={() => removeAttachment(a.id)}
                  className="font-bold text-ink-faint hover:text-accent-deep"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <button type="submit" disabled={loading} className="cc-btn cc-btn--primary cc-btn--block cc-btn--xl">
        <Icon name="send" size={18} />
        {loading ? 'Saving…' : 'Save log'}
      </button>
    </form>
  );
}
