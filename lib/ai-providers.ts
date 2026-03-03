import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';

export type AIProvider = 'claude' | 'openai' | 'gemini';

// Model used per provider for the main (heavy) generation task
export const MAIN_MODELS: Record<AIProvider, string> = {
  claude: 'claude-sonnet-4-20250514',
  openai: 'gpt-4o',
  gemini: 'gemini-1.5-flash',
};

export const PROVIDER_LABELS: Record<AIProvider, string> = {
  claude: 'Claude',
  openai: 'GPT-4o',
  gemini: 'Gemini',
};

/**
 * Generate text using the specified provider.
 * @param provider  - Which AI to use
 * @param systemPrompt - Optional system/instruction prompt (null to skip)
 * @param userContent  - The user message
 * @param maxTokens    - Max output tokens
 */
export async function generateText(
  provider: AIProvider,
  systemPrompt: string | null,
  userContent: string,
  maxTokens = 4096
): Promise<string> {
  if (provider === 'openai') {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    messages.push({ role: 'user', content: userContent });

    const response = await client.chat.completions.create({
      model: MAIN_MODELS.openai,
      messages,
      max_tokens: maxTokens,
    });
    return response.choices[0].message.content ?? '';

  } else if (provider === 'gemini') {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? '');
    const model = genAI.getGenerativeModel({
      model: MAIN_MODELS.gemini,
      ...(systemPrompt ? { systemInstruction: systemPrompt } : {}),
    });
    const result = await model.generateContent(userContent);
    return result.response.text();

  } else {
    // Claude (default)
    const client = new Anthropic();
    const message = await client.messages.create({
      model: MAIN_MODELS.claude,
      max_tokens: maxTokens,
      ...(systemPrompt ? { system: systemPrompt } : {}),
      messages: [{ role: 'user', content: userContent }],
    });
    return message.content[0].type === 'text' ? message.content[0].text : '';
  }
}
