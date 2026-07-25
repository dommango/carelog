import Anthropic from '@anthropic-ai/sdk';
import { NormalizationOutput, normalizationOutputSchema } from './schemas.js';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY ?? '',
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
    model: 'claude-haiku-4-5',
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

  return parsed.data;
}
