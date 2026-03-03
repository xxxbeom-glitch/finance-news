import { Redis } from '@upstash/redis';

let redis: Redis | null = null;

function getRedis(): Redis {
  if (!redis) {
    const url = process.env.KV_REST_API_URL;
    const token = process.env.KV_REST_API_TOKEN;
    if (!url || !token) {
      throw new Error('KV_REST_API_URL and KV_REST_API_TOKEN must be set');
    }
    redis = new Redis({ url, token });
  }
  return redis;
}

export interface BriefingRecord {
  id: string;        // ISO timestamp — unique key
  date: string;      // KST date string e.g. "2026-03-03"
  createdAt: string; // ISO timestamp
  briefing: string;
  hasManualInput: boolean;
}

export interface NewspaperRecord {
  id: string;        // ISO timestamp — unique key
  date: string;      // KST date string e.g. "2026-03-03"
  createdAt: string; // ISO timestamp
  content: string;   // Formatted newspaper summary
  fileCount: number; // Number of PDFs processed
}

// ── Market Briefing ────────────────────────────────────────────

/** Save a briefing. Uses createdAt as the unique ID. */
export async function saveBriefing(data: BriefingRecord): Promise<void> {
  const kv = getRedis();
  const id = data.id;
  await kv.set(`briefing:${id}`, JSON.stringify(data));
  await kv.zadd('briefing:index', { score: new Date(id).getTime(), member: id });
}

/** Fetch a single briefing by its id (ISO timestamp). */
export async function getBriefingById(id: string): Promise<BriefingRecord | null> {
  const kv = getRedis();
  const raw = await kv.get<string>(`briefing:${id}`);
  if (!raw) return null;
  return typeof raw === 'string' ? JSON.parse(raw) : (raw as BriefingRecord);
}

/** Delete a briefing by id. */
export async function deleteBriefing(id: string): Promise<void> {
  const kv = getRedis();
  await kv.del(`briefing:${id}`);
  await kv.zrem('briefing:index', id);
}

/** List briefing IDs (ISO timestamps), newest first. */
export async function listBriefingIds(limit = 60): Promise<string[]> {
  const kv = getRedis();
  const ids = await kv.zrange('briefing:index', 0, limit - 1, { rev: true });
  return ids as string[];
}

// ── Newspaper ──────────────────────────────────────────────────

/** Save a newspaper summary. */
export async function saveNewspaper(data: NewspaperRecord): Promise<void> {
  const kv = getRedis();
  const id = data.id;
  await kv.set(`newspaper:${id}`, JSON.stringify(data));
  await kv.zadd('newspaper:index', { score: new Date(id).getTime(), member: id });
}

/** Fetch a single newspaper record by its id. */
export async function getNewspaperById(id: string): Promise<NewspaperRecord | null> {
  const kv = getRedis();
  const raw = await kv.get<string>(`newspaper:${id}`);
  if (!raw) return null;
  return typeof raw === 'string' ? JSON.parse(raw) : (raw as NewspaperRecord);
}

/** Delete a newspaper record by id. */
export async function deleteNewspaper(id: string): Promise<void> {
  const kv = getRedis();
  await kv.del(`newspaper:${id}`);
  await kv.zrem('newspaper:index', id);
}

/** List newspaper IDs (ISO timestamps), newest first. */
export async function listNewspaperIds(limit = 60): Promise<string[]> {
  const kv = getRedis();
  const ids = await kv.zrange('newspaper:index', 0, limit - 1, { rev: true });
  return ids as string[];
}
