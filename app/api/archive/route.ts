import { NextRequest, NextResponse } from 'next/server';
import { getBriefingById, listBriefingIds, deleteBriefing } from '@/lib/kv';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  try {
    if (id) {
      const record = await getBriefingById(id);
      if (!record) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      return NextResponse.json(record);
    }

    const ids = await listBriefingIds(60);
    return NextResponse.json({ ids });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'KV unavailable';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  try {
    await deleteBriefing(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'KV unavailable';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
