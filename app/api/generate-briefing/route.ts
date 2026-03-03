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
  gold: IndexData | null;
  silver: IndexData | null;
  copper: IndexData | null;
  dollarIndex: IndexData | null;
  kospi: IndexData | null;
  kosdaq: IndexData | null;
  usdkrw: IndexData | null;
  gainers: MoverData[];
  losers: MoverData[];
}

function getClient() {
  return new Anthropic();
}

const SYSTEM_PROMPT = `당신은 전문 경제 뉴스 애널리스트입니다. 수집된 RSS 뉴스와 시장 데이터를 분석하여 투자자에게 유용한 일일 경제 브리핑을 작성합니다.

## 작성 규칙
- 이모지 사용 절대 금지
- 각 섹션 마지막에 "출처:" 줄을 추가 (형식: 출처: 소스명 (URL), 소스명 (URL))
- URL은 뉴스 목록에 제공된 실제 URL만 사용 (임의 생성 금지)
- 별다른 이슈가 없는 섹션은 과감히 생략
- 어그로성/광고성/중복 기사 제외
- 각 항목은 핵심 수치, 기업명, 시장 반응을 포함하여 간결하게 작성

## 출력 형식 (이 형식을 정확히 따를 것)

{날짜} 경제시장 Brief

## 주요 지수
- S&P500 : {수치} ({등락폭} / {등락률}%)
- 나스닥 : {수치} ({등락폭} / {등락률}%)
- 다우 : {수치} ({등락폭} / {등락률}%)
- 금 : {수치}
- 은 : {수치}
- 구리 : {수치}
- 달러 : {수치}

## 주요 이슈
(최대 5항목, 항목당 2줄 이내, 가장 시장에 영향력 있는 이슈 우선)
- {이슈 내용}
출처: {소스명} ({URL}), {소스명} ({URL})

---

## S&P500 상승/하락 기업 TOP3

상승 기업
1. {기업명} ({티커}) / +{등락률}% : {상승 이유 2~3줄}
2. {기업명} ({티커}) / +{등락률}% : {상승 이유 2~3줄}
3. {기업명} ({티커}) / +{등락률}% : {상승 이유 2~3줄}

하락 기업
1. {기업명} ({티커}) / -{등락률}% : {하락 이유 2~3줄}
2. {기업명} ({티커}) / -{등락률}% : {하락 이유 2~3줄}
3. {기업명} ({티커}) / -{등락률}% : {하락 이유 2~3줄}

출처: Yahoo Finance, {소스명} ({URL})

---

## 빅테크/AI/반도체/M7
(M7 우선 정리. 오라클, 팔란티어 등 시장이 주목하는 기업 포함. 별다른 뉴스 없는 기업은 생략)
- {기업명} ({티커}) / {등락률}% : {이슈 2줄 이내}
출처: {소스명} ({URL})

---

## 원자재 / 환율
(총 5항목 이내, 항목당 2줄 이내)
- {내용}
출처: {소스명} ({URL})

---

## 국제정세
(총 5항목 이내, 항목당 2줄 이내)
- {내용}
출처: {소스명} ({URL})

---

## 국내 경제

주요 지수
- 코스피 : {수치} ({등락폭} / {등락률}%)
- 코스닥 : {수치} ({등락폭} / {등락률}%)
- 환율 : {수치} 원/달러

섹터별 주요 뉴스 (이슈없는 섹터 스킵, 총 6항목 이내, 항목당 2줄 이내)
- {내용}

주요 기업 (삼성전자, 하이닉스, 현대차 등 대표 기업 중요 소식 우선 선별)
- {기업명} : {이슈}
출처: {소스명} ({URL})`;

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
  if (md.gold) {
    lines.push(`금(GC=F): ${fmt(md.gold.price)} (${sign(md.gold.changePercent)}${fmt(md.gold.changePercent)}%)`);
  }
  if (md.silver) {
    lines.push(`은(SI=F): ${fmt(md.silver.price)} (${sign(md.silver.changePercent)}${fmt(md.silver.changePercent)}%)`);
  }
  if (md.copper) {
    lines.push(`구리(HG=F): ${fmt(md.copper.price)} (${sign(md.copper.changePercent)}${fmt(md.copper.changePercent)}%)`);
  }
  if (md.dollarIndex) {
    lines.push(`달러인덱스: ${fmt(md.dollarIndex.price)} (${sign(md.dollarIndex.changePercent)}${fmt(md.dollarIndex.changePercent)}%)`);
  }
  if (md.kospi) {
    lines.push(`코스피: ${fmt(md.kospi.price)} (${sign(md.kospi.changePercent)}${fmt(md.kospi.changePercent)}%)`);
  }
  if (md.kosdaq) {
    lines.push(`코스닥: ${fmt(md.kosdaq.price)} (${sign(md.kosdaq.changePercent)}${fmt(md.kosdaq.changePercent)}%)`);
  }
  if (md.usdkrw) {
    lines.push(`환율(USD/KRW): ${fmt(md.usdkrw.price, 0)}원`);
  }

  if (md.gainers.length > 0) {
    const list = md.gainers
      .map((g) => `${g.symbol} ${g.name}(${sign(g.changePercent)}${fmt(g.changePercent)}%)`)
      .join(', ');
    lines.push(`S&P500 상승 TOP3: ${list}`);
  }
  if (md.losers.length > 0) {
    const list = md.losers
      .map((l) => `${l.symbol} ${l.name}(${sign(l.changePercent)}${fmt(l.changePercent)}%)`)
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

위 뉴스와 시장 데이터를 분석하여 일일 경제 브리핑을 작성해주세요. 시장 마감 데이터가 제공된 경우 해당 수치를 그대로 사용하고, 없으면 "데이터 미수집"으로 표기하세요.`;

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
