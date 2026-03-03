import { NextRequest, NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

const CONCURRENCY = 5;

// 한경 및 일반 뉴스 사이트 기사 본문 셀렉터 (우선순위 순)
const ARTICLE_SELECTORS = [
  '#articleBodyContents',
  '#article-body',
  '#articleBody',
  '.article-body',
  '.articleCont',
  '.article_body',
  '[itemprop="articleBody"]',
  'article',
];

async function fetchArticle(url: string): Promise<{
  url: string;
  title: string;
  content: string;
  error?: string;
}> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
      },
      signal: AbortSignal.timeout(12000),
    });

    if (!res.ok) return { url, title: '', content: '', error: `HTTP ${res.status}` };

    const html = await res.text();
    const $ = cheerio.load(html);

    // 제목 추출
    const title =
      $('meta[property="og:title"]').attr('content')?.trim() ||
      $('h1').first().text().trim() ||
      '';

    // 노이즈 제거
    $('script, style, nav, header, footer, iframe, .ad, [class*="advertisement"], [class*="relate"], [id*="relate"], [class*="comment"]').remove();

    // 기사 본문 추출
    let content = '';
    for (const sel of ARTICLE_SELECTORS) {
      const el = $(sel).first();
      if (el.length) {
        content = el.text().replace(/\s+/g, ' ').trim();
        if (content.length > 200) break;
      }
    }

    // 폴백: body 전체 텍스트
    if (!content || content.length < 200) {
      content = $('body').text().replace(/\s+/g, ' ').trim();
    }

    return { url, title, content: content.slice(0, 4000) };
  } catch (err) {
    return {
      url,
      title: '',
      content: '',
      error: err instanceof Error ? err.message : 'fetch 실패',
    };
  }
}

export async function POST(req: NextRequest) {
  try {
    const { urls } = (await req.json()) as { urls: string[] };

    if (!urls?.length) {
      return NextResponse.json({ error: 'URL이 없습니다' }, { status: 400 });
    }

    const results: Awaited<ReturnType<typeof fetchArticle>>[] = [];
    for (let i = 0; i < urls.length; i += CONCURRENCY) {
      const batch = urls.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.all(batch.map(fetchArticle));
      results.push(...batchResults);
    }

    return NextResponse.json({ articles: results });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
