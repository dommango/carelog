'use client';

// Floating in-app feedback widget. Trigger: a fixed button OR Cmd/Ctrl+Shift+F
// (suppressed while typing). Lets the user pick a type, write a title +
// description, snip a screen region, mark it up, or upload images — then POSTs to
// /api/feedback, which persists to Postgres and mirrors the row to the shared
// Notion board out of the request path.
//
// CareLog has no global toast system, so submit status is reported inline in the
// panel rather than inventing one for a single caller.

import { useState, useRef, useCallback, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { ScreenshotAnnotator } from '@/components/ScreenshotAnnotator';
import { MAX_SCREENSHOTS } from '@/lib/feedback/limits';

interface SelectionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function rectFromPoints(a: { x: number; y: number }, b: { x: number; y: number }): SelectionRect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  };
}

// Capture the full document.body via html-to-image, then crop to the given
// viewport-relative rectangle at the same pixelRatio so coords line up on high-DPI.
async function captureRegion(rect: SelectionRect): Promise<string> {
  const { toJpeg } = await import('html-to-image');
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
  const absX = rect.x + window.scrollX;
  const absY = rect.y + window.scrollY;
  const fullDataUrl = await toJpeg(document.body, {
    quality: 0.6,
    pixelRatio,
    cacheBust: true,
    skipFonts: true,
  });
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Failed to load captured image'));
    img.src = fullDataUrl;
  });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(rect.width * pixelRatio);
  canvas.height = Math.round(rect.height * pixelRatio);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context not available');
  ctx.drawImage(
    img,
    Math.round(absX * pixelRatio),
    Math.round(absY * pixelRatio),
    canvas.width,
    canvas.height,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  return canvas.toDataURL('image/jpeg', 0.6);
}

type FeedbackType = 'bug' | 'feedback' | 'request';

const TYPE_CONFIG: Record<FeedbackType, { label: string; selected: string; placeholder: string }> = {
  bug: {
    label: 'Problem',
    selected: 'bg-alert-tint text-alert ring-1 ring-alert/30',
    placeholder: 'What went wrong?',
  },
  feedback: {
    label: 'Feedback',
    selected: 'bg-caregiver-tint text-caregiver-ink ring-1 ring-caregiver/30',
    placeholder: 'Your feedback…',
  },
  request: {
    label: 'Idea',
    selected: 'bg-covered-tint text-covered-ink ring-1 ring-covered/30',
    placeholder: 'What would you like?',
  },
};

export interface FeedbackWidgetProps {
  userEmail: string | null;
}

export function FeedbackWidget({ userEmail }: FeedbackWidgetProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<FeedbackType>('feedback');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [screenshots, setScreenshots] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<{ tone: 'error' | 'info'; message: string } | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragEnd, setDragEnd] = useState<{ x: number; y: number } | null>(null);
  const [annotatingIndex, setAnnotatingIndex] = useState<number | null>(null);
  const widgetRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) titleInputRef.current?.focus();
  }, [open]);

  const addScreenshot = useCallback((dataUrl: string) => {
    setScreenshots((prev) => {
      if (prev.length >= MAX_SCREENSHOTS) {
        setStatus({ tone: 'info', message: `Up to ${MAX_SCREENSHOTS} images per report.` });
        return prev;
      }
      return [...prev, dataUrl];
    });
  }, []);

  const handleFileUpload = useCallback(
    (files: FileList) => {
      const remaining = MAX_SCREENSHOTS - screenshots.length;
      if (remaining <= 0) {
        setStatus({ tone: 'info', message: `Up to ${MAX_SCREENSHOTS} images per report.` });
        return;
      }
      for (const file of Array.from(files).slice(0, remaining)) {
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === 'string') addScreenshot(reader.result);
        };
        reader.onerror = () => {
          setStatus({ tone: 'error', message: 'Could not read that image.' });
        };
        reader.readAsDataURL(file);
      }
    },
    [addScreenshot, screenshots.length],
  );

  // Region-select flow: click "Screenshot" → hide widget → mount overlay → user
  // drags a rectangle → capture + crop → preview.
  const priorDisplayRef = useRef<string>('');

  const startRegionSelect = useCallback(() => {
    const widget = widgetRef.current;
    priorDisplayRef.current = widget?.style.display ?? '';
    if (widget) widget.style.display = 'none';
    setDragStart(null);
    setDragEnd(null);
    setSelecting(true);
  }, []);

  const endRegionSelect = useCallback(() => {
    setSelecting(false);
    setDragStart(null);
    setDragEnd(null);
    const widget = widgetRef.current;
    if (widget) widget.style.display = priorDisplayRef.current;
  }, []);

  const performCapture = useCallback(
    async (rect: SelectionRect) => {
      setCapturing(true);
      setSelecting(false); // remove overlay before capturing so it's not baked in
      try {
        addScreenshot(await captureRegion(rect));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Screenshot capture failed';
        setStatus({ tone: 'error', message: `Screenshot failed: ${message}` });
      } finally {
        setCapturing(false);
        const widget = widgetRef.current;
        if (widget) widget.style.display = priorDisplayRef.current;
      }
    },
    [addScreenshot],
  );

  // Esc cancels the snipping overlay without capturing.
  useEffect(() => {
    if (!selecting) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        endRegionSelect();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selecting, endRegionSelect]);

  // Cmd/Ctrl+Shift+F opens the widget from anywhere (suppressed while typing).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.shiftKey && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f')) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable) {
        return;
      }
      event.preventDefault();
      setOpen(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  async function handleSubmit() {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;
    const trimmedDescription = description.trim();

    setSubmitting(true);
    setStatus(null);
    // Only include optional fields when they have a value — the server schema is
    // `.optional()` and rejects empty strings, which would 400 a text-only report.
    const payload: Record<string, unknown> = {
      type,
      title: trimmedTitle,
      pageUrl: window.location.href,
      userAgent: navigator.userAgent,
    };
    if (trimmedDescription) payload.description = trimmedDescription;
    if (screenshots.length > 0) payload.screenshots = screenshots;

    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        throw new Error(res.status === 429 ? 'Too many reports — try again shortly.' : `Server said ${res.status}`);
      }
      setOpen(false);
      setTitle('');
      setDescription('');
      setScreenshots([]);
      setType('feedback');
      setStatus(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to send';
      setStatus({ tone: 'error', message });
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-24 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-pill bg-accent-strong text-white shadow-card transition-transform hover:bg-accent-hov active:scale-95 sm:bottom-6"
        title="Send feedback (Ctrl/Cmd+Shift+F)"
        aria-label="Send feedback"
      >
        <Icon name="flag" size={19} />
      </button>
    );
  }

  const selectionRect = dragStart && dragEnd ? rectFromPoints(dragStart, dragEnd) : null;

  return (
    <>
      {/* Snipping overlay — only while selecting. */}
      {selecting && (
        <div
          className="fixed inset-0 z-[9999] cursor-crosshair touch-none bg-ink/10"
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            setDragStart({ x: event.clientX, y: event.clientY });
            setDragEnd({ x: event.clientX, y: event.clientY });
          }}
          onPointerMove={(event) => {
            if (!dragStart) return;
            setDragEnd({ x: event.clientX, y: event.clientY });
          }}
          onPointerUp={() => {
            if (!selectionRect || selectionRect.width < 10 || selectionRect.height < 10) {
              endRegionSelect();
              return;
            }
            void performCapture(selectionRect);
          }}
        >
          <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-pill bg-ink/85 px-4 py-1.5 text-xs font-semibold text-white">
            Drag to select an area · Esc to cancel
          </div>
          {selectionRect && (
            <div
              className="pointer-events-none absolute border-2 border-dashed border-accent bg-accent/10"
              style={{
                left: selectionRect.x,
                top: selectionRect.y,
                width: selectionRect.width,
                height: selectionRect.height,
              }}
            />
          )}
        </div>
      )}

      <div
        ref={widgetRef}
        className="fixed bottom-24 right-4 z-50 w-[min(22rem,calc(100vw-2rem))] rounded-card border border-line bg-card shadow-lg sm:bottom-6 sm:w-96"
      >
        <div className="flex items-center justify-between border-b border-line-soft px-4 py-3">
          <h3 className="cc-serif text-[17px] text-ink">Send feedback</h3>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-ink-faint hover:text-ink"
            aria-label="Close"
          >
            <Icon name="x" size={18} />
          </button>
        </div>

        <div className="space-y-3 p-4">
          <div className="flex gap-2">
            {(Object.keys(TYPE_CONFIG) as FeedbackType[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setType(key)}
                aria-pressed={type === key}
                className={`flex-1 rounded-md px-3 py-2 text-xs font-semibold transition-colors ${
                  type === key
                    ? TYPE_CONFIG[key].selected
                    : 'bg-card-sunk text-ink-soft hover:text-ink'
                }`}
              >
                {TYPE_CONFIG[key].label}
              </button>
            ))}
          </div>

          <input
            ref={titleInputRef}
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={TYPE_CONFIG[type].placeholder}
            className="cc-input w-full"
          />

          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="What were you doing, and what did you expect instead? (optional)"
            rows={3}
            className="cc-input w-full"
          />

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={startRegionSelect}
              disabled={capturing || selecting || screenshots.length >= MAX_SCREENSHOTS}
              className="cc-btn cc-btn--ghost cc-btn--sm"
            >
              {capturing ? 'Capturing…' : 'Screenshot'}
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={capturing || selecting || screenshots.length >= MAX_SCREENSHOTS}
              className="cc-btn cc-btn--ghost cc-btn--sm"
            >
              Upload
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              className="hidden"
              onChange={(event) => {
                if (event.target.files?.length) handleFileUpload(event.target.files);
                event.target.value = '';
              }}
            />
            <span className="text-[11px] text-ink-faint">
              {screenshots.length}/{MAX_SCREENSHOTS}
            </span>
          </div>

          {screenshots.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {screenshots.map((src, index) => (
                <div
                  key={`${index}-${src.slice(24, 56)}`}
                  className="group relative h-14 w-20 overflow-hidden rounded-md border border-line"
                >
                  <button
                    type="button"
                    onClick={() => setAnnotatingIndex(index)}
                    className="block h-full w-full"
                    aria-label={`Mark up image ${index + 1}`}
                    title="Mark up"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={src}
                      alt={`Attachment ${index + 1}`}
                      className="h-full w-full object-cover"
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => setScreenshots((prev) => prev.filter((_, i) => i !== index))}
                    className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-pill bg-ink/70 text-white"
                    aria-label={`Remove image ${index + 1}`}
                  >
                    <Icon name="x" size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {annotatingIndex !== null && screenshots[annotatingIndex] && (
            <ScreenshotAnnotator
              imageDataUrl={screenshots[annotatingIndex]!}
              onSave={(dataUrl) => {
                setScreenshots((prev) => prev.map((s, i) => (i === annotatingIndex ? dataUrl : s)));
                setAnnotatingIndex(null);
              }}
              onCancel={() => setAnnotatingIndex(null)}
            />
          )}

          {status && (
            <p
              role="status"
              className={`text-xs ${status.tone === 'error' ? 'text-alert' : 'text-ink-soft'}`}
            >
              {status.message}
            </p>
          )}

          <p className="text-[11px] text-ink-faint">
            {pathname} · {userEmail ?? 'Not signed in'}
          </p>

          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!title.trim() || submitting}
            className="cc-btn cc-btn--primary cc-btn--block"
          >
            {submitting ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>
    </>
  );
}
