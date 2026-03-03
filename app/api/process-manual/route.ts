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
    } else if (type === 'url') {
      // Dropbox Chooser (or other) direct download links
      const urlEntries: Array<{ url: string; name: string }> = [];
      const singleUrl = formData.get('url') as string | null;
      if (singleUrl) {
        const name = (formData.get('name') as string | null) ?? 'file';
        urlEntries.push({ url: singleUrl, name });
      } else {
        let i = 0;
        while (true) {
          const u = formData.get(`url_${i}`) as string | null;
          if (!u) break;
          const n = (formData.get(`name_${i}`) as string | null) ?? `file_${i}`;
          urlEntries.push({ url: u, name: n });
          i++;
        }
      }

      if (urlEntries.length === 0) {
        return NextResponse.json({ error: 'No URLs provided' }, { status: 400 });
      }

      const extractions = await Promise.allSettled(
        urlEntries.map(async ({ url, name }) => {
          const isPdf = name.toLowerCase().endsWith('.pdf');

          const msg = await client.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 1024,
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: isPdf ? 'document' : 'image',
                    source: { type: 'url', url },
                  } as Anthropic.DocumentBlockParam | Anthropic.ImageBlockParam,
                  {
                    type: 'text',
                    text: '이 문서/이미지의 경제/금융/투자 관련 핵심 내용을 10~12줄로 요약해주세요. 수치, 기업명, 날짜, 시장 영향을 포함하세요.',
                  },
                ],
              },
            ],
          });
          return msg.content[0].type === 'text' ? msg.content[0].text : '';
        })
      );

      extractedTexts = extractions
        .filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled')
        .map((r) => r.value)
        .filter(Boolean);

      if (extractedTexts.length === 0) {
        return NextResponse.json({ error: 'URL 파일 처리 실패' }, { status: 500 });
      }
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

      // Extract + summarize each file in a single API call (parallel)
      const extractions = await Promise.allSettled(
        files.map(async (file) => {
          const bytes = await file.arrayBuffer();
          const base64 = Buffer.from(bytes).toString('base64');
          const isPdf = file.type === 'application/pdf';
          const mediaType = isPdf
            ? 'application/pdf'
            : (file.type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp');

          const msg = await client.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 1024,
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
                    text: '이 문서/이미지의 경제/금융/투자 관련 핵심 내용을 10~12줄로 요약해주세요. 수치, 기업명, 날짜, 시장 영향을 포함하세요.',
                  },
                ],
              },
            ],
          });

          return msg.content[0].type === 'text' ? msg.content[0].text : '';
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

    // For text input or multi-file batches, do a final summarization pass
    const needsSummary = extractedTexts.length > 1 || (extractedTexts.length === 1 && extractedTexts[0].length > 2000);
    let summary: string;

    if (needsSummary) {
      const combinedText = extractedTexts
        .map((t, i) => (extractedTexts.length > 1 ? `[자료 ${i + 1}]\n${t}` : t))
        .join('\n\n---\n\n');
      const summaryMessage = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: `다음 경제/금융 자료를 10~12줄로 요약해주세요. 핵심 수치, 주요 기업, 시장 영향을 포함하세요:\n\n${combinedText}`,
          },
        ],
      });
      summary = summaryMessage.content[0].type === 'text' ? summaryMessage.content[0].text : '';
    } else {
      summary = extractedTexts[0] ?? '';
    }

    return NextResponse.json({ summary });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
