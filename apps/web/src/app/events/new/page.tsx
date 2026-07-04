'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { EventCategory } from '@carelog/db';

const categories = Object.values(EventCategory);

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

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const idempotencyKey = crypto.randomUUID();
    const res = await fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rawInput,
        category: category || undefined,
        occurredAt: new Date(occurredAt).toISOString(),
        templateId: templateId ?? undefined,
        clientId: 'web',
        idempotencyKey,
      }),
    });

    setLoading(false);

    if (res.ok) {
      router.push('/');
    } else {
      const body = await res.json().catch(() => ({ error: 'Failed to log event' }));
      alert(body.error?.formErrors?.join('\n') || 'Failed to log event');
    }
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

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? 'Saving...' : 'Save'}
      </button>
    </form>
  );
}
