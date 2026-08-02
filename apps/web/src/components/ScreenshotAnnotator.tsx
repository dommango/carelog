'use client';

// Modal canvas annotator: draw freehand strokes over a captured screenshot, then
// save a flattened JPEG data URL. Pure React + canvas. The stroke palette is drawn
// from the design tokens so annotations read as part of the app, not a stock
// red-marker overlay.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/Icon';

interface Point {
  x: number;
  y: number;
}

interface Stroke {
  color: string;
  thickness: number;
  points: Point[];
}

// --alert, --caregiver-ink, --await, --covered-ink, --ink
const COLORS = ['#c2613f', '#3f5360', '#cf9442', '#4c6f3d', '#38332c'];
const THICKNESSES = [2, 4, 8];

export interface ScreenshotAnnotatorProps {
  imageDataUrl: string;
  onSave: (dataUrl: string) => void;
  onCancel: () => void;
}

export function ScreenshotAnnotator({ imageDataUrl, onSave, onCancel }: ScreenshotAnnotatorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [color, setColor] = useState<string>(COLORS[0]!);
  const [thickness, setThickness] = useState<number>(THICKNESSES[1]!);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    const image = new Image();
    image.onload = () => {
      setImg(image);
      setSize({ width: image.width, height: image.height });
    };
    image.src = imageDataUrl;
  }, [imageDataUrl]);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    for (const stroke of strokes) {
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.thickness;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      const first = stroke.points[0];
      if (!first) continue;
      ctx.moveTo(first.x, first.y);
      for (let i = 1; i < stroke.points.length; i++) {
        const point = stroke.points[i]!;
        ctx.lineTo(point.x, point.y);
      }
      ctx.stroke();
    }
  }, [img, strokes]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  // Map a pointer event in display coords to the canvas's natural pixel coords —
  // the canvas is downscaled with max-h/max-w CSS, so client and canvas pixels diverge.
  function toCanvasCoord(event: React.PointerEvent<HTMLCanvasElement>): Point | null {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  // Pointer events rather than mouse events: caregivers are on phones and tablets,
  // where a mouse-only annotator would simply not draw.
  function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    const point = toCanvasCoord(event);
    if (!point) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrawing(true);
    setStrokes((prev) => [...prev, { color, thickness, points: [point] }]);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing) return;
    event.preventDefault();
    const point = toCanvasCoord(event);
    if (!point) return;
    setStrokes((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1]!;
      return [...prev.slice(0, -1), { ...last, points: [...last.points, point] }];
    });
  }

  function handlePointerUp() {
    setDrawing(false);
  }

  function handleSave() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    onSave(canvas.toDataURL('image/jpeg', 0.85));
  }

  // Esc cancels without saving.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center bg-ink/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="annotator-title"
    >
      <div className="flex max-h-full w-full max-w-3xl flex-col gap-3 rounded-card bg-card p-4 shadow-lg">
        <div className="flex items-center justify-between">
          <h3 id="annotator-title" className="cc-serif text-[17px] text-ink">
            Mark up screenshot
          </h3>
          <button
            type="button"
            onClick={onCancel}
            className="text-ink-faint hover:text-ink"
            aria-label="Close annotator"
          >
            <Icon name="x" size={18} />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-ink-soft">Colour</span>
          {COLORS.map((swatch) => (
            <button
              key={swatch}
              type="button"
              onClick={() => setColor(swatch)}
              aria-label={`Colour ${swatch}`}
              aria-pressed={color === swatch}
              className={`h-5 w-5 rounded-pill border-2 ${color === swatch ? 'border-ink' : 'border-line'}`}
              style={{ background: swatch }}
            />
          ))}
          <span className="ml-3 text-ink-soft">Size</span>
          {THICKNESSES.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setThickness(value)}
              aria-label={`Thickness ${value}`}
              aria-pressed={thickness === value}
              className={`flex h-6 w-6 items-center justify-center rounded-md border ${
                thickness === value ? 'border-ink' : 'border-line'
              }`}
            >
              <span
                className="inline-block rounded-pill bg-ink"
                style={{ width: value, height: value }}
              />
            </button>
          ))}
          <button
            type="button"
            onClick={() => setStrokes((prev) => prev.slice(0, -1))}
            disabled={strokes.length === 0}
            className="cc-btn cc-btn--ghost cc-btn--sm ml-auto"
          >
            Undo
          </button>
          <button
            type="button"
            onClick={() => setStrokes([])}
            disabled={strokes.length === 0}
            className="cc-btn cc-btn--ghost cc-btn--sm"
          >
            Clear
          </button>
        </div>

        <div className="flex flex-1 items-center justify-center overflow-auto rounded-md border border-line bg-card-sunk">
          {size && (
            <canvas
              ref={canvasRef}
              width={size.width}
              height={size.height}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              className="max-h-[60vh] max-w-full cursor-crosshair touch-none"
            />
          )}
        </div>

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="cc-btn cc-btn--ghost cc-btn--sm">
            Cancel
          </button>
          <button type="button" onClick={handleSave} className="cc-btn cc-btn--primary cc-btn--sm">
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
