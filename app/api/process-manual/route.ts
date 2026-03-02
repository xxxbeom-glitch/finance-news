import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const type = formData.get('type') as string; // 'pdf' | 'image' | 'text'
    const text = formData.get('text') as string | null;
    const file = formData.get('file') as File | null;

    let extractedText = '';

    if (type === 'text' && text) {
      // Direct text summarization
      extractedText = text;
    } else if ((type === 'pdf' || type === 'image') && file) {
      const bytes = await file.arrayBuffer();
      const base64 = Buffer.from(bytes).toString('base64');
      const mediaType = type === 'pdf' ? 'application/pdf' : file.type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

      const visionMessage = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: type === 'pdf' ? 'document' : 'image',
                source: {
                  type: 'base64',
                  media_type: mediaType,
                  data: base64,
                },
              } as Anthropic.DocumentBlockParam | Anthropic.ImageBlockParam,
              {
                type: 'text',
                text: '이 문서/이미지에서 경제/금융/투자 관련 핵심 내용을 모두 추출해주세요. 수치, 기업명, 날짜를 포함하여 최대한 상세하게 텍스트로 변환해주세요.',
              },
            ],
          },
        ],
      });

      extractedText =
        visionMessage.content[0].type === 'text' ? visionMessage.content[0].text : '';
    } else {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }

    // Summarize extracted content
    const summaryMessage = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `다음 경제/금융 자료를 10~12줄로 요약해주세요. 핵심 수치, 주요 기업, 시장 영향을 포함하세요:\n\n${extractedText}`,
        },
      ],
    });

    const summary =
      summaryMessage.content[0].type === 'text' ? summaryMessage.content[0].text : '';

    return NextResponse.json({ summary, rawText: extractedText });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
