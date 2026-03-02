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
  date: string;
  createdAt: string;
  briefing: string;
  hasManualInput: boolean;
}

export async function saveBriefing(date: string, data: BriefingRecord): Promise<void> {
  const kv = getRedis();
  await kv.set(`briefing:${date}`, JSON.stringify(data));
  // maintain sorted date index
  await kv.zadd('briefing:index', { score: new Date(date).getTime(), member: date });
}

export async function getBriefing(date: string): Promise<BriefingRecord | null> {
  const kv = getRedis();
  const raw = await kv.get<string>(`briefing:${date}`);
  if (!raw) return null;
  return typeof raw === 'string' ? JSON.parse(raw) : raw as BriefingRecord;
}

export async function listBriefingDates(limit = 30): Promise<string[]> {
  const kv = getRedis();
  const dates = await kv.zrange('briefing:index', 0, limit - 1, { rev: true });
  return dates as string[];
}
