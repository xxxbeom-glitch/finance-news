import { NextResponse } from 'next/server';
import { RSS_SOURCES, NewsItem } from '@/lib/rss-sources';
import { parseStringPromise } from 'xml2js';

/** Returns true if the pubDate string is within the last 24 hours (KST-aware). */
function isWithin24HoursKST(pubDateStr: string): boolean {
  if (!pubDateStr) return true; // include if no date available
  try {
    const pubDate = new Date(pubDateStr);
    if (isNaN(pubDate.getTime())) return true; // include if unparseable
    // KST = UTC+9; we compare absolute timestamps so no conversion needed
    const nowMs = Date.now();
    const diff = nowMs - pubDate.getTime();
    return diff >= 0 && diff <= 24 * 60 * 60 * 1000;
  } catch {
    return true;
  }
}

async function fetchFeed(source: (typeof RSS_SOURCES)[0]): Promise<NewsItem[]> {
  try {
    const res = await fetch(source.url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FinanceNewsBot/1.0)' },
      next: { revalidate: 0 },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const parsed = await parseStringPromise(xml, { explicitArray: false, ignoreAttrs: false });

    const channel = parsed?.rss?.channel || parsed?.feed;
    if (!channel) return [];

    const rawItems = channel.item || channel.entry || [];
    const itemsArray = Array.isArray(rawItems) ? rawItems : [rawItems];

    return itemsArray
      .slice(0, 30)
      .map((item: Record<string, unknown>) => {
        const title = extractText(item.title) || '';
        const link = extractLink(item.link || item.guid) || '';
        const pubDate = extractText(item.pubDate || item.updated || item.published) || '';
        const description =
          extractText(item.description || item.summary || item['content:encoded']) || '';

        return {
          title: title.trim(),
          link,
          pubDate,
          description: description.replace(/<[^>]*>/g, '').slice(0, 300).trim(),
          source: source.name,
          lang: source.lang,
          category: source.category,
        } as NewsItem;
      })
      .filter((item) => item.title.length > 0 && isWithin24HoursKST(item.pubDate));
  } catch {
    return [];
  }
}

function extractText(val: unknown): string {
  if (!val) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'object') {
    const obj = val as Record<string, unknown>;
    if ('_' in obj) return String(obj._);
    if ('#text' in obj) return String(obj['#text']);
  }
  return String(val);
}

function extractLink(val: unknown): string {
  if (!val) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'object') {
    const obj = val as Record<string, unknown>;
    if ('$' in obj && obj.$ && typeof obj.$ === 'object') {
      const attrs = obj.$ as Record<string, string>;
      if (attrs.href) return attrs.href;
    }
    if ('_' in obj) return String(obj._);
    if ('#text' in obj) return String(obj['#text']);
  }
  return '';
}

export async function GET() {
  const results = await Promise.allSettled(RSS_SOURCES.map(fetchFeed));
  const allNews: NewsItem[] = [];

  results.forEach((result) => {
    if (result.status === 'fulfilled') {
      allNews.push(...result.value);
    }
  });

  // Deduplicate by similar titles
  const seen = new Set<string>();
  const deduped = allNews.filter((item) => {
    const key = item.title.toLowerCase().slice(0, 60);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return NextResponse.json({ items: deduped, count: deduped.length });
}
