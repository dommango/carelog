'use client';

import { useEffect, useMemo } from 'react';
import { AttachmentKind } from '@carelog/db';
import { Icon } from '@/components/Icon';

export type AttachmentDraft = {
  id: string;
  kind: AttachmentKind;
  mimeType: string;
  file: File;
};

type AttachmentFieldsProps = {
  labelId: string;
  attachments: AttachmentDraft[];
  error: string | null;
  recording: boolean;
  onPick: (event: React.ChangeEvent<HTMLInputElement>, kind: AttachmentKind) => void;
  onToggleRecording: () => void;
  onRemove: (id: string) => void;
};

// display:none would take the input out of the tab order, leaving the styled
// label unreachable by keyboard. sr-only keeps it focusable, and the ring on
// the label is what makes that focus visible.
const pickerClass =
  'cc-btn cc-btn--secondary relative w-full cursor-pointer focus-within:[outline:2px_solid_var(--accent-deep)] focus-within:[outline-offset:2px]';

function AudioPreview({ file }: { file: File }) {
  const url = useMemo(() => URL.createObjectURL(file), [file]);

  useEffect(() => () => URL.revokeObjectURL(url), [url]);

  // A memo recorded seconds ago has no transcript yet — the worker produces one
  // after upload — so there is no caption track to offer. Playback is still the
  // only way to check the clip before saving it.
  // eslint-disable-next-line jsx-a11y/media-has-caption
  return <audio controls src={url} className="w-full" aria-label={`Play ${file.name}`} />;
}

export function AttachmentFields({
  labelId,
  attachments,
  error,
  recording,
  onPick,
  onToggleRecording,
  onRemove,
}: AttachmentFieldsProps) {
  return (
    <div className="space-y-2.5" role="group" aria-labelledby={labelId}>
      <span id={labelId} className="cc-field-label">
        Attachments <span className="font-semibold text-ink-faint">· optional</span>
      </span>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        <label htmlFor="attachment-photo" className={pickerClass}>
          <input
            id="attachment-photo"
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={(e) => onPick(e, AttachmentKind.photo)}
          />
          <Icon name="camera" size={17} />
          Photo
        </label>
        <label htmlFor="attachment-selfie" className={pickerClass}>
          <input
            id="attachment-selfie"
            type="file"
            accept="image/*"
            capture="user"
            className="sr-only"
            onChange={(e) => onPick(e, AttachmentKind.photo)}
          />
          <Icon name="camera" size={17} />
          Selfie
        </label>
        <button
          type="button"
          onClick={onToggleRecording}
          aria-pressed={recording}
          className="cc-btn col-span-2 w-full sm:col-span-1"
          style={
            recording
              ? { background: 'var(--accent-tint)', color: 'var(--accent-deep)', boxShadow: 'none' }
              : { background: 'var(--card)', color: 'var(--ink)', boxShadow: 'inset 0 0 0 1px var(--line)' }
          }
        >
          <Icon name="mic" size={17} />
          {recording ? 'Stop recording' : 'Voice memo'}
        </button>
      </div>

      <p role="status" className="text-sm font-semibold text-accent-deep">
        {recording ? 'Recording — press Stop recording when you are done.' : ''}
      </p>

      {error && (
        <p role="alert" className="rounded-[var(--r-lg)] bg-alert-tint p-2.5 text-sm text-accent-deep">
          {error}
        </p>
      )}

      {attachments.length > 0 && (
        <ul className="space-y-1.5">
          {attachments.map((a) => (
            <li
              key={a.id}
              className="space-y-2 rounded-[var(--r-lg)] bg-card-sunk p-2.5 text-sm text-ink-soft"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5">
                  <Icon
                    name={a.kind === AttachmentKind.audio ? 'mic' : 'camera'}
                    size={14}
                    className="text-ink-faint"
                  />
                  {a.file.name} ({Math.round(a.file.size / 1024)} KB)
                </span>
                <button
                  type="button"
                  onClick={() => onRemove(a.id)}
                  aria-label={`Remove ${a.file.name}`}
                  className="font-bold text-ink-faint hover:text-accent-deep"
                >
                  Remove
                </button>
              </div>
              {a.kind === AttachmentKind.audio && <AudioPreview file={a.file} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
