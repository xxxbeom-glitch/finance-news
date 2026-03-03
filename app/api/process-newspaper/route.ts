import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const EXTRACT_PROMPT = `이 한국경제 신문 PDF 페이지에서 기사들을 추출하세요.

각 기사에 대해 아래 형식으로 출력하세요:

제목: [신문에 적힌 실제 기사 제목]
- [핵심 내용 요약]
- [핵심 내용 요약]
- [핵심 내용 요약]
---

규칙:
- 기사 제목은 신문에 실린 그대로 사용
- 경제·금융·산업·기업·증시·부동산·환율·금리·정책 관련 기사 위주로 추출
- 광고, 날씨, 스포츠, 연예 등 비경제 콘텐츠는 제외
- 이모지 사용 금지
- 기사가 없거나 읽기 어려운 페이지면 "내용 없음"이라고만 출력`;

export async function POST(req: NextRequest) {
  const client = new Anthropic();
  try {
    const formData = await req.formData();
    const type = formData.get('type') as string;

    if (type === 'url') {
      const url = formData.get('url') as string | null;
      const name = (formData.get('name') as string | null) ?? 'file';
      if (!url) {
        return NextResponse.json({ error: 'URL이 없습니다' }, { status: 400 });
      }

      const isPdf = name.toLowerCase().endsWith('.pdf');
      const msg = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1500,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: isPdf ? 'document' : 'image',
                source: { type: 'url', url },
              } as Anthropic.DocumentBlockParam | Anthropic.ImageBlockParam,
              { type: 'text', text: EXTRACT_PROMPT },
            ],
          },
        ],
      });

      const extracted = msg.content[0].type === 'text' ? msg.content[0].text : '';
      if (!extracted || extracted.trim() === '내용 없음') {
        return NextResponse.json({ extracted: '' });
      }
      return NextResponse.json({ extracted });

    } else if (type === 'pdf' || type === 'image') {
      const file = formData.get('file') as File | null;
      if (!file) {
        return NextResponse.json({ error: '파일이 없습니다' }, { status: 400 });
      }

      const bytes = await file.arrayBuffer();
      const base64 = Buffer.from(bytes).toString('base64');
      const isPdf = file.type === 'application/pdf';
      const mediaType = isPdf
        ? 'application/pdf'
        : (file.type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp');

      const msg = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1500,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: isPdf ? 'document' : 'image',
                source: { type: 'base64', media_type: mediaType, data: base64 },
              } as Anthropic.DocumentBlockParam | Anthropic.ImageBlockParam,
              { type: 'text', text: EXTRACT_PROMPT },
            ],
          },
        ],
      });

      const extracted = msg.content[0].type === 'text' ? msg.content[0].text : '';
      if (!extracted || extracted.trim() === '내용 없음') {
        return NextResponse.json({ extracted: '' });
      }
      return NextResponse.json({ extracted });

    } else {
      return NextResponse.json({ error: '잘못된 요청 형식' }, { status: 400 });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
