import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { NewsItem } from '@/lib/rss-sources';
import { saveBriefing } from '@/lib/kv';

interface IndexData {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
}

interface MoverData {
  symbol: string;
  name: string;
  changePercent: number;
}

interface MarketData {
  sp500: IndexData | null;
  nasdaq: IndexData | null;
  dow: IndexData | null;
  gainers: MoverData[];
  losers: MoverData[];
}

function getClient() {
  return new Anthropic();
}

const SYSTEM_PROMPT = `당신은 전문 경제 뉴스 애널리스트입니다. 수집된 RSS 뉴스를 분석하여 투자자에게 유용한 일일 경제 브리핑을 작성합니다.

## 포함 기준
- 미국 3대지수 (S&P500, 나스닥, 다우) 동향
- S&P500 기준 상승 TOP3 / 하락 TOP3 종목
- 빅테크 (엔비디아, 애플, 메타, 구글, 마이크로소프트, 테슬라)
- 반도체/AI 섹터
- 원자재 (유가, 금)
- 환율 (달러/원)
- 연준 금리/통화정책
- 무역/관세 정책 (미중, 미한)
- 지정학적 리스크 및 국제정세에 따른 경제흐름

## 제외 기준
- 어그로성 제목 (급등, 폭락, 반드시 등 자극적 표현)
- 중복 기사
- 광고성/매수유도성 기사
- 별 4개 미만 수준의 저퀄리티 기사

## 출력 형식 (반드시 이 형식을 정확히 따를 것)

📅 {날짜} 경제 브리핑

🇺🇸 미국 증시 마감
- S&P500: {수치} ({등락률})
- 나스닥: {수치} ({등락률})
- 다우: {수치} ({등락률})
- 📈 S&P500 상승 TOP3: {종목1}, {종목2}, {종목3}
- 📉 S&P500 하락 TOP3: {종목1}, {종목2}, {종목3}

🤖 빅테크/AI/반도체
- {핵심 내용을 1~2문장으로 요약} [🔗](기사URL)
- {핵심 내용을 1~2문장으로 요약} [🔗](기사URL)
- {핵심 내용을 1~2문장으로 요약} [🔗](기사URL)

🛢 원자재/환율
- {핵심 내용을 1~2문장으로 요약} [🔗](기사URL)
- {핵심 내용을 1~2문장으로 요약} [🔗](기사URL)

🌍 국제정세
- {핵심 내용을 1~2문장으로 요약} [🔗](기사URL)
- {핵심 내용을 1~2문장으로 요약} [🔗](기사URL)

🇰🇷 국내 경제
- {핵심 내용을 1~2문장으로 요약} [🔗](기사URL)
- {핵심 내용을 1~2문장으로 요약} [🔗](기사URL)

---
*수집된 뉴스 기반 AI 요약 | Claude AI 생성*

## bullet 작성 규칙
- 각 bullet은 1~2문장, 핵심 수치·기업명·시장 반응 포함
- 문장 끝에 반드시 [🔗](기사URL) 형식으로 해당 기사의 실제 URL 첨부
- 섹터별 관련 기사가 없으면 해당 섹션 생략
- URL은 반드시 뉴스 목록에 제공된 실제 URL만 사용 (임의 생성 금지)`;

function formatMarketData(md: MarketData): string {
  const fmt = (v: number, decimals = 2) => v.toFixed(decimals);
  const sign = (v: number) => (v >= 0 ? '+' : '');

  const lines: string[] = ['## 실시간 시장 마감 데이터'];

  if (md.sp500) {
    lines.push(
      `S&P500: ${fmt(md.sp500.price)} (${sign(md.sp500.change)}${fmt(md.sp500.change)}, ${sign(md.sp500.changePercent)}${fmt(md.sp500.changePercent)}%)`
    );
  }
  if (md.nasdaq) {
    lines.push(
      `나스닥: ${fmt(md.nasdaq.price)} (${sign(md.nasdaq.change)}${fmt(md.nasdaq.change)}, ${sign(md.nasdaq.changePercent)}${fmt(md.nasdaq.changePercent)}%)`
    );
  }
  if (md.dow) {
    lines.push(
      `다우: ${fmt(md.dow.price)} (${sign(md.dow.change)}${fmt(md.dow.change)}, ${sign(md.dow.changePercent)}${fmt(md.dow.changePercent)}%)`
    );
  }

  if (md.gainers.length > 0) {
    const list = md.gainers
      .map((g) => `${g.symbol}(${sign(g.changePercent)}${fmt(g.changePercent)}%)`)
      .join(', ');
    lines.push(`S&P500 상승 TOP3: ${list}`);
  }
  if (md.losers.length > 0) {
    const list = md.losers
      .map((l) => `${l.symbol}(${sign(l.changePercent)}${fmt(l.changePercent)}%)`)
      .join(', ');
    lines.push(`S&P500 하락 TOP3: ${list}`);
  }

  return lines.join('\n');
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { newsItems, manualContent, date, marketData } = body as {
      newsItems: NewsItem[];
      manualContent?: string;
      date: string;
      marketData?: MarketData;
    };

    const newsText = newsItems
      .map(
        (item, i) =>
          `[${i + 1}] [${item.source}] ${item.title}\nURL: ${item.link}\n${item.description}`
      )
      .join('\n\n');

    const marketSection = marketData ? `\n${formatMarketData(marketData)}\n` : '';

    const userMessage = `오늘 날짜: ${date}
${marketSection}
## 수집된 뉴스 (${newsItems.length}개)
${newsText}

${manualContent ? `## 추가 자료 (PDF/이미지/텍스트 업로드)\n${manualContent}` : ''}

위 뉴스와 시장 데이터를 분석하여 일일 경제 브리핑을 작성해주세요. 시장 마감 데이터가 제공된 경우 해당 수치를 그대로 사용하고, 없으면 "시장 마감 데이터 미수집"으로 표기하세요.`;

    const client = getClient();
    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    });

    const briefingText =
      message.content[0].type === 'text' ? message.content[0].text : '';

    const createdAt = new Date().toISOString();

    // Save to KV (non-fatal)
    try {
      await saveBriefing({
        id: createdAt,
        date,
        createdAt,
        briefing: briefingText,
        hasManualInput: !!manualContent,
      });
    } catch {
      // KV save failure is non-fatal
    }

    return NextResponse.json({ briefing: briefingText });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
