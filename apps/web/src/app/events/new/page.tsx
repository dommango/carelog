'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { EventCategory, AttachmentKind } from '@carelog/db';
import { localDb, getClientId, eventToLocal } from '@/lib/localDb';
import { queueOutbox, drainOutbox } from '@/lib/outbox';

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

  const [category, setCategory] = useState<string>('');
  const [rawInput, setRawInput] = useState('');
  const [occurredAt, setOccurredAt] = useState(() =>
    new Date().toISOString().slice(0, 16)
  );
  const [templateName, setTemplateName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [attachments, setAttachments] = useState<AttachmentDraft[]>([]);
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, kind: AttachmentKind) => {
    const files = e.target.files;
    if (!files) return;

    const next = Array.from(files).map((file) => ({
      id: crypto.randomUUID(),
      kind,
      mimeType: file.type,
      file,
    }));
    setAttachments((prev) => [...prev, ...next].slice(0, 5));
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
    <form
      onSubmit={submit}
      className="max-w-xl mx-auto space-y-4 bg-white p-4 rounded-lg border"
    >
      <h1 className="text-lg font-semibold">
        {templateName ? `Log: ${templateName}` : 'New log'}
      </h1>

      <div>
        <label className="block text-sm font-medium">Category</label>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="mt-1 w-full border rounded p-2"
        >
          <option value="">Auto (optional)</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium">What happened</label>
        <textarea
          value={rawInput}
          onChange={(e) => setRawInput(e.target.value)}
          required
          rows={4}
          className="mt-1 w-full border rounded p-2"
        />
      </div>

      <div>
        <label className="block text-sm font-medium">When</label>
        <input
          type="datetime-local"
          value={occurredAt}
          onChange={(e) => setOccurredAt(e.target.value)}
          required
          className="mt-1 w-full border rounded p-2"
        />
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium">Attachments</label>
        <div className="flex flex-wrap gap-2">
          <label className="px-3 py-1.5 bg-gray-100 rounded cursor-pointer hover:bg-gray-200">
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => handleFileChange(e, AttachmentKind.photo)}
            />
            📷 Photo
          </label>
          <label className="px-3 py-1.5 bg-gray-100 rounded cursor-pointer hover:bg-gray-200">
            <input
              type="file"
              accept="image/*"
              capture="user"
              className="hidden"
              onChange={(e) => handleFileChange(e, AttachmentKind.photo)}
            />
            🤳 Selfie
          </label>
          <button
            type="button"
            onClick={recording ? stopRecording : startRecording}
            className={`px-3 py-1.5 rounded ${recording ? 'bg-red-100 text-red-700' : 'bg-gray-100 hover:bg-gray-200'}`}
          >
            {recording ? '⏹ Stop' : '🎙 Voice memo'}
          </button>
        </div>

        {attachments.length > 0 && (
          <ul className="space-y-1">
            {attachments.map((a) => (
              <li key={a.id} className="flex items-center justify-between text-sm bg-gray-50 p-2 rounded">
                <span>
                  {a.kind === 'audio' ? '🔊' : '📷'} {a.file.name} ({Math.round(a.file.size / 1024)} KB)
                </span>
                <button
                  type="button"
                  onClick={() => removeAttachment(a.id)}
                  className="text-red-600 hover:underline"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? 'Saving…' : 'Save'}
      </button>
    </form>
  );
}
