import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createChat, normalizeMessages, readConfig } from './chat.js';

const publicRoot = new URL('../public/', import.meta.url);
const mimeTypes = new Map(Object.entries({
    html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json',
    png: 'image/png', webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg',
}));

function sendJson(res, status, payload) {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(payload));
}

async function readMessages(req) {
    let length = 0;
    const chunks = [];
    for await (const chunk of req.iterator({ destroyOnReturn: false })) {
        length += chunk.length;
        if (length > 80_000) return { tooLarge: true };
        chunks.push(chunk);
    }
    const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    return { messages: normalizeMessages(data?.messages) };
}

export function createHandler(chat) {
    return async (req, res) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        const pathname = req.url.split('?')[0];
        if (pathname === '/api/chat') {
            if (req.method !== 'POST') {
                res.setHeader('Allow', 'POST');
                return sendJson(res, 405, { error: 'Use POST.' });
            }
            if (req.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') {
                return sendJson(res, 415, { error: 'Send application/json.' });
            }

            let input;
            try {
                input = await readMessages(req);
            } catch {
                return sendJson(res, 400, { error: 'Invalid JSON.' });
            }
            if (input.tooLarge) {
                res.setHeader('Connection', 'close');
                return sendJson(res, 413, { error: 'Request is too large.' });
            }
            if (!input.messages) {
                return sendJson(res, 422, { error: 'Send alternating user and assistant messages ending with a user message.' });
            }
            return sendJson(res, 200, await chat(input.messages));
        }

        if (req.method !== 'GET' && req.method !== 'HEAD') {
            res.setHeader('Allow', 'GET, HEAD');
            return sendJson(res, 405, { error: 'Use GET or HEAD.' });
        }

        const path = pathname === '/' ? '/index.html' : pathname;
        const type = mimeTypes.get(path.split('.').at(-1));
        if (type && /^\/(?:[\w-]+\/)*[\w-]+\.[a-z]+$/.test(path)) {
            try {
                const body = await readFile(new URL(path.slice(1), publicRoot));
                res.writeHead(200, { 'Content-Type': type, 'Content-Length': body.length });
                return res.end(req.method === 'HEAD' ? undefined : body);
            } catch (error) {
                if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') {
                    return sendJson(res, 500, { error: 'Could not read this file.' });
                }
            }
        }
        return sendJson(res, 404, { error: 'Page not found.' });
    };
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
    const envFile = fileURLToPath(new URL('../.env', import.meta.url));
    if (existsSync(envFile)) process.loadEnvFile(envFile);
    const config = readConfig(process.env);
    const chat = createChat(config, {
        onError: (error) => console.error('AI request failed:', error.message),
    });
    const host = process.env.HOST || '127.0.0.1';
    const port = Number(process.env.PORT || 3000);
    createServer(createHandler(chat)).listen(port, host, () => {
        console.log(`Sprite Companion running at http://${host}:${port} (AI: ${config.provider})`);
    });
}
