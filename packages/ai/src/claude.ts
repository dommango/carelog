import Anthropic from '@anthropic-ai/sdk';
import { NormalizationOutput, normalizationOutputSchema } from './schemas.js';
import { capNormalizationOutput } from './limits.js';

/**
 * Single source of truth for the model. It was previously hardcoded here and
 * again in the worker's pipeline, which stamps `aiModelVersion` on every event
 * — so changing the model here would have quietly mislabelled every record with
 * the old name, and the audit trail would say a model that never ran.
 */
export const CLAUDE_MODEL = 'claude-haiku-4-5';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY ?? '',
  // Without an explicit ceiling a hung request holds a pg-boss job open until
  // the job itself expires, blocking that event's enrichment for far longer
  // than the AI step should ever take.
  timeout: 60_000,
  maxRetries: 2,
});

export type TextBlock = { type: 'text'; text: string };

export type ImageBlock = {
  type: 'image';
  source: {
    type: 'base64';
    media_type: string;
    data: string;
  };
};

export type ContentBlock = TextBlock | ImageBlock;

export type ClaudeMessage = {
  role: 'user' | 'assistant';
  content: string | ContentBlock[];
};

export type ClaudeCompleteInput = {
  system?: string;
  messages: ClaudeMessage[];
  tools?: Anthropic.Messages.Tool[];
};

function toAnthropicContent(content: string | ContentBlock[]): Anthropic.Messages.ContentBlockParam[] {
  if (typeof content === 'string') {
    return [{ type: 'text', text: content }];
  }
  return content.map((block): Anthropic.Messages.ContentBlockParam => {
    if (block.type === 'text') return { type: 'text', text: block.text };
    return {
      type: 'image',
      source: {
        type: 'base64',
        media_type: toAnthropicMediaType(block.source.media_type),
        data: block.source.data,
      },
    };
  });
}

function toAnthropicMediaType(mime: string): 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' {
  switch (mime) {
    case 'image/png':
      return 'image/png';
    case 'image/gif':
      return 'image/gif';
    case 'image/webp':
      return 'image/webp';
    case 'image/jpeg':
    default:
      return 'image/jpeg';
  }
}

export async function completeText({
  system,
  messages,
  tools,
}: ClaudeCompleteInput): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not configured');
  }

  const response = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 2048,
    system,
    messages: messages.map((m) => ({
      role: m.role,
      content: toAnthropicContent(m.content),
    })) as Anthropic.Messages.MessageParam[],
    tools,
  });

  const content = response.content.find((c) => c.type === 'text');
  if (!content || content.type !== 'text') {
    throw new Error('Claude returned no text content');
  }

  return content.text;
}

export async function complete({
  system,
  messages,
  tools,
}: ClaudeCompleteInput): Promise<unknown> {
  const text = await completeText({ system, messages, tools });
  return parseJsonFromText(text);
}

function parseJsonFromText(text: string): unknown {
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  return JSON.parse(cleaned);
}

export async function normalizeEvent(input: {
  system?: string;
  prompt: string;
}): Promise<NormalizationOutput> {
  const raw = await complete({
    system: input.system,
    messages: [{ role: 'user', content: input.prompt }],
  });

  const parsed = normalizationOutputSchema.safeParse(raw);
  if (!parsed.success) {
    const err = new Error(`Normalization schema mismatch: ${parsed.error.message}`);
    (err as Error & { raw?: unknown }).raw = raw;
    throw err;
  }

  // Capped here rather than at the call site so every consumer of a
  // normalization result gets the same limits, prompt compliance or not.
  return capNormalizationOutput(parsed.data);
}
