import type { AIService, ChatMessage } from '../types';

export const openRouterArceService: AIService = {
    name: 'OpenRouter_Arce',
    async chat(messages: ChatMessage[]) {

        const model = 'arcee-ai/trinity-large-preview:free'

        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model,
                messages,
                stream: true,
                max_tokens: 4096,
            }),
        });

        if (!response.ok) {
            const err = await response.json() as { error?: { message?: string } };
            throw new Error(`OpenRouter error ${response.status}: ${err?.error?.message ?? 'Unknown error'}`);
        }

        return (async function* () {
            const reader = response.body!.getReader();
            const decoder = new TextDecoder();

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n').filter(l => l.startsWith('data: '));

                for (const line of lines) {
                    const data = line.replace('data: ', '');
                    if (data === '[DONE]') return;

                    try {
                        const parsed = JSON.parse(data);
                        yield parsed.choices[0]?.delta?.content ?? '';
                    } catch {
                    }
                }
            }
        })();
    }
}