import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/supabase/server';

const client = new Anthropic();

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { title, category } = await req.json();

  if (!title || !category) {
    return NextResponse.json({ error: 'title and category required' }, { status: 400 });
  }

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 256,
    messages: [
      {
        role: 'user',
        content: `Write a 2-3 sentence listing description for a USC student marketplace item. Category: ${category}. Title: ${title}. Be specific, friendly, and concise. No emojis. No em dashes. Use a hyphen if you need a dash. Return only the description text, nothing else.`,
      },
    ],
  });

  const description = (message.content[0] as { type: string; text: string }).text;
  return NextResponse.json({ description });
}
