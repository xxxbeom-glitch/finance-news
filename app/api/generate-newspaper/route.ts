import { NextRequest, NextResponse } from 'next/server';
import { saveNewspaper } from '@/lib/kv';
import { generateText, type AIProvider } from '@/lib/ai-providers';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { extractedTexts, date, fileCount, provider = 'claude' } = body as {
      extractedTexts: string[];
      date: string;
      fileCount: number;
      provider?: AIProvider;
    };

    if (!extractedTexts || extractedTexts.length === 0) {
      return NextResponse.json({ error: '추출된 내용이 없습니다' }, { status: 400 });
    }

    const combined = extractedTexts
      .map((t, i) => `[페이지 ${i + 1}]\n${t}`)
      .join('\n\n');

    const prompt = `아래는 ${date} 한국경제 신문에서 추출한 기사 내용입니다.
중복되거나 유사한 기사는 하나로 통합하고, 다음 형식으로 주요 기사 요약을 작성해주세요.

출력 형식 (이 형식을 정확히 따를 것):

${date} 한국경제 요약

**[신문에 실린 실제 기사 제목]**
 - [핵심 내용 요약, 2줄 이내]
 - [핵심 내용 요약, 2줄 이내]
 - [핵심 내용 요약, 2줄 이내]
 - [핵심 내용 요약, 2줄 이내]
----------------------------------------
**[다음 기사 제목]**
 - [핵심 내용 요약, 2줄 이내]
 - [핵심 내용 요약, 2줄 이내]
 - [핵심 내용 요약, 2줄 이내]
 - [핵심 내용 요약, 2줄 이내]
----------------------------------------

규칙:
- 기사 제목은 신문에 실린 그대로 사용하고 **볼드체** 표시
- 각 기사당 3~4개 항목으로 요약
- 각 항목은 2줄 이내 (한 문장이어도 됨)
- 이모지 사용 금지
- 경제·금융·증시·부동산·환율·금리·기업실적·산업정책 기사 우선 선별
- 중복 기사는 하나로 통합
- "내용 없음" 페이지는 무시

추출된 내용:
${combined}`;

    const content = await generateText(provider, null, prompt, 4096);

    const createdAt = new Date().toISOString();
    let savedToArchive = false;
    try {
      await saveNewspaper({
        id: createdAt,
        date,
        createdAt,
        content,
        fileCount,
      });
      savedToArchive = true;
    } catch {
      // KV 저장 실패는 치명적이지 않음
    }

    return NextResponse.json({ content, savedToArchive });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
