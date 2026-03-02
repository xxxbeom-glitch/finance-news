import { NextRequest, NextResponse } from 'next/server';
import { getBriefing, listBriefingDates } from '@/lib/kv';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get('date');

  try {
    if (date) {
      const record = await getBriefing(date);
      if (!record) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      return NextResponse.json(record);
    }

    const dates = await listBriefingDates(30);
    return NextResponse.json({ dates });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'KV unavailable';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
