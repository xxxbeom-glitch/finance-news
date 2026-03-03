import { NextRequest, NextResponse } from 'next/server';
import {
  getBriefingById, listBriefingIds, deleteBriefing,
  getNewspaperById, listNewspaperIds, deleteNewspaper,
} from '@/lib/kv';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  const type = searchParams.get('type') ?? 'briefing'; // 'briefing' | 'newspaper'

  try {
    if (id) {
      const record = type === 'newspaper'
        ? await getNewspaperById(id)
        : await getBriefingById(id);
      if (!record) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      return NextResponse.json(record);
    }

    const ids = type === 'newspaper'
      ? await listNewspaperIds(60)
      : await listBriefingIds(60);
    return NextResponse.json({ ids });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'KV unavailable';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  const type = searchParams.get('type') ?? 'briefing';
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  try {
    if (type === 'newspaper') {
      await deleteNewspaper(id);
    } else {
      await deleteBriefing(id);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'KV unavailable';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
