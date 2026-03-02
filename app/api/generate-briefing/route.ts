import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { NewsItem } from '@/lib/rss-sources';
import { saveBriefing } from '@/lib/kv';

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
**{헤드라인}**
{10~12줄 요약: 어떤 이슈인지, 왜 중요한지, 주가/시장 반응, 향후 영향}

🛢 원자재/환율
**{헤드라인}**
{10~12줄 요약: 유가/금 동향, 달러/원 환율, 원인 분석, 시장 영향}

🌍 국제정세
**{헤드라인}**
{10~12줄 요약: 상황 배경, 경제적 영향, 관련 국가/기업 영향}

🇰🇷 국내 경제
**{헤드라인}**
{10~12줄 요약}

---
*수집된 뉴스 기반 AI 요약 | Claude AI 생성*`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { newsItems, manualContent, date } = body as {
      newsItems: NewsItem[];
      manualContent?: string;
      date: string;
    };

    const newsText = newsItems
      .map((item, i) => `[${i + 1}] [${item.source}] ${item.title}\n${item.description}`)
      .join('\n\n');

    const userMessage = `오늘 날짜: ${date}

## 수집된 뉴스 (${newsItems.length}개)
${newsText}

${manualContent ? `## 추가 자료 (PDF/이미지/텍스트 업로드)\n${manualContent}` : ''}

위 뉴스를 분석하여 일일 경제 브리핑을 작성해주세요. 수치 데이터가 없으면 "시장 마감 데이터 미수집"으로 표기하세요.`;

    const client = getClient();
    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    });

    const briefingText =
      message.content[0].type === 'text' ? message.content[0].text : '';

    // Save to KV
    try {
      await saveBriefing(date, {
        date,
        createdAt: new Date().toISOString(),
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
