import { profile } from './profile.js';

export function readConfig(env) {
    const provider = env.AI_PROVIDER || 'off';
    if (!['off', 'ollama', 'openai-compatible'].includes(provider)) {
        throw new Error('AI_PROVIDER must be off, ollama, or openai-compatible.');
    }

    const model = env.AI_MODEL || (provider === 'ollama' ? 'qwen3:4b' : '');
    const baseUrl = env.AI_BASE_URL || (provider === 'ollama' ? 'http://127.0.0.1:11434' : '');
    const timeout = Number(env.AI_TIMEOUT_MS || 60_000);
    if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 300_000) {
        throw new Error('AI_TIMEOUT_MS must be between 1 and 300000.');
    }

    if (provider !== 'off') {
        if (!model || !baseUrl) {
            throw new Error('Set AI_MODEL and AI_BASE_URL for the selected provider.');
        }
        const url = new URL(baseUrl);
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
            throw new Error('AI_BASE_URL must be an HTTP(S) base URL without credentials, a query or a fragment.');
        }
    }

    return { provider, model, baseUrl: baseUrl.replace(/\/+$/, ''), timeout, apiKey: env.AI_API_KEY };
}

export function normalizeMessages(input) {
    if (!Array.isArray(input) || input.length < 1 || input.length > 11 || input.length % 2 === 0) {
        return null;
    }
    const messages = [];
    for (const [index, message] of input.entries()) {
        const role = index % 2 === 0 ? 'user' : 'assistant';
        const content = typeof message?.content === 'string' ? message.content.trim() : '';
        if (message?.role !== role || !content || content.length > (role === 'user' ? 1000 : 2000)) {
            return null;
        }
        messages.push({ role, content });
    }
    return messages;
}

export function createChat(config, { fetcher = fetch, onError = () => {} } = {}) {
    return async (messages) => {
        const fallback = { reply: profile.fallback, source: 'fallback' };
        if (config.provider === 'off') return fallback;

        const system = [
            `You are ${profile.name}.`,
            profile.purpose,
            profile.personality,
            `Reference facts: ${profile.facts}`,
            'Be honest about uncertainty. Return a short plain-text reply.',
        ].join('\n');
        const body = {
            model: config.model,
            stream: false,
            messages: [{ role: 'system', content: system }, ...messages],
        };
        const local = config.provider === 'ollama';
        const endpoint = local ? '/api/chat' : '/chat/completions';
        if (local) {
            body.think = false;
            body.options = { num_predict: 250 };
        }

        try {
            const response = await fetcher(config.baseUrl + endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(config.apiKey && { Authorization: `Bearer ${config.apiKey}` }),
                },
                body: JSON.stringify(body),
                signal: AbortSignal.timeout(config.timeout),
                redirect: 'error',
            });
            if (!response.ok) throw new Error(`Provider HTTP ${response.status}`);
            const data = await response.json();
            const reply = local ? data?.message?.content : data?.choices?.[0]?.message?.content;
            if (typeof reply !== 'string' || !reply.trim()) throw new Error('Provider returned an empty reply');
            return { reply: reply.trim().slice(0, 2000), source: config.provider };
        } catch (error) {
            onError(error);
            return fallback;
        }
    };
}
