import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

export async function POST(req: NextRequest) {
  const client = new Anthropic();
  try {
    const formData = await req.formData();
    const type = formData.get('type') as string; // 'pdf' | 'image' | 'text'
    const text = formData.get('text') as string | null;

    let extractedTexts: string[] = [];

    if (type === 'text' && text) {
      extractedTexts = [text];
    } else if (type === 'pdf' || type === 'image') {
      // Collect all files: single 'file' field OR multiple 'file_0', 'file_1', ... fields
      const files: File[] = [];
      const singleFile = formData.get('file') as File | null;
      if (singleFile) {
        files.push(singleFile);
      } else {
        // Collect file_0, file_1, ...
        let i = 0;
        while (true) {
          const f = formData.get(`file_${i}`) as File | null;
          if (!f) break;
          files.push(f);
          i++;
        }
      }

      if (files.length === 0) {
        return NextResponse.json({ error: 'No files provided' }, { status: 400 });
      }

      // Extract text from each file in parallel
      const extractions = await Promise.allSettled(
        files.map(async (file) => {
          const bytes = await file.arrayBuffer();
          const base64 = Buffer.from(bytes).toString('base64');
          const isPdf = file.type === 'application/pdf';
          const mediaType = isPdf
            ? 'application/pdf'
            : (file.type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp');

          const visionMessage = await client.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 2048,
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: isPdf ? 'document' : 'image',
                    source: { type: 'base64', media_type: mediaType, data: base64 },
                  } as Anthropic.DocumentBlockParam | Anthropic.ImageBlockParam,
                  {
                    type: 'text',
                    text: '이 문서/이미지에서 경제/금융/투자 관련 핵심 내용을 모두 추출해주세요. 수치, 기업명, 날짜를 포함하여 최대한 상세하게 텍스트로 변환해주세요.',
                  },
                ],
              },
            ],
          });

          return visionMessage.content[0].type === 'text' ? visionMessage.content[0].text : '';
        })
      );

      extractedTexts = extractions
        .filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled')
        .map((r) => r.value)
        .filter(Boolean);

      if (extractedTexts.length === 0) {
        return NextResponse.json({ error: '파일 처리 실패' }, { status: 500 });
      }
    } else {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }

    const combinedText =
      extractedTexts.length === 1
        ? extractedTexts[0]
        : extractedTexts
            .map((t, i) => `[자료 ${i + 1}]\n${t}`)
            .join('\n\n---\n\n');

    // Summarize all extracted content together
    const summaryMessage = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `다음 경제/금융 자료를 10~12줄로 요약해주세요. 핵심 수치, 주요 기업, 시장 영향을 포함하세요:\n\n${combinedText}`,
        },
      ],
    });

    const summary =
      summaryMessage.content[0].type === 'text' ? summaryMessage.content[0].text : '';

    return NextResponse.json({ summary, rawText: combinedText });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
