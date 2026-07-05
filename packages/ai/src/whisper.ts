import { readFile } from 'fs/promises';
import path from 'path';
import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY ?? '',
});

export async function transcribeAudioFile(filePath: string): Promise<string> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  const buffer = await readFile(filePath);
  const file = new File([buffer], path.basename(filePath), {
    type: 'audio/webm',
  });

  const response = await client.audio.transcriptions.create({
    file,
    model: 'whisper-1',
  });

  return response.text;
}
