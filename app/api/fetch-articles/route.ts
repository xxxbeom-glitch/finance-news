import { NextRequest, NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

const CONCURRENCY = 5;

// 한경 및 주요 국내 뉴스 사이트 기사 본문 셀렉터 (우선순위 순)
const ARTICLE_SELECTORS = [
  '#articleBodyContents', // 한국경제 (구 레이아웃)
  '#articletxt',          // 한국경제 (신 레이아웃)
  '#article-body',
  '#articleBody',
  '#newsEndContents',     // 연합뉴스
  '.article-body',
  '.articleCont',
  '.article_body',
  '.article-txt',
  '.news_cnt_detail_wrap',
  '[itemprop="articleBody"]',
  'article .content',
  'article',
];

// 브라우저처럼 보이는 헤더
const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
};

async function fetchArticle(url: string): Promise<{
  url: string;
  title: string;
  content: string;
  error?: string;
}> {
  try {
    const res = await fetch(url, {
      headers: BROWSER_HEADERS,
      redirect: 'follow',
      signal: AbortSignal.timeout(12000),
    });

    if (!res.ok) {
      return { url, title: '', content: '', error: `HTTP ${res.status} (${url})` };
    }

    const html = await res.text();
    const $ = cheerio.load(html);

    // 제목
    const title =
      $('meta[property="og:title"]').attr('content')?.trim() ||
      $('h1').first().text().trim() ||
      '';

    // 노이즈 제거
    $(
      'script, style, nav, header, footer, iframe, .ad, [class*="advertisement"], ' +
      '[class*="relate"], [id*="relate"], [class*="comment"], [class*="banner"], ' +
      '[id*="banner"], [class*="popular"], [class*="recommend"]'
    ).remove();

    // 전략 1: 알려진 기사 본문 셀렉터
    let content = '';
    for (const sel of ARTICLE_SELECTORS) {
      const el = $(sel).first();
      if (el.length) {
        const text = el.text().replace(/\s+/g, ' ').trim();
        if (text.length > 100) {
          content = text;
          break;
        }
      }
    }

    // 전략 2: <p> 태그 모아서 이어붙이기
    if (!content) {
      const paragraphs = $('p')
        .map((_, el) => $(el).text().trim())
        .get()
        .filter((s) => s.length > 40);
      if (paragraphs.length >= 2) {
        content = paragraphs.join(' ');
      }
    }

    // 전략 3: body 전체 텍스트 (최후 수단)
    if (!content) {
      content = $('body').text().replace(/\s+/g, ' ').trim();
    }

    if (!content) {
      return { url, title, content: '', error: '본문 추출 실패' };
    }

    return { url, title, content: content.slice(0, 4000) };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'fetch 실패';
    return { url, title: '', content: '', error: msg };
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
      results.push(...(await Promise.all(batch.map(fetchArticle))));
    }

    return NextResponse.json({ articles: results });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
