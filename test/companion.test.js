import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import test from 'node:test';
import { createChat, normalizeMessages, readConfig } from '../src/chat.js';
import { createHandler } from '../src/server.js';
import { mountSprite } from '../public/sprite.js';

const messages = [{ role: 'user', content: 'Hai' }];

test('configuration rejects unknown providers, embedded credentials and invalid timeouts', () => {
    assert.throws(() => readConfig({ AI_PROVIDER: 'other' }), /AI_PROVIDER/);
    assert.throws(() => readConfig({
        AI_PROVIDER: 'ollama', AI_BASE_URL: 'https://user:password@example.test',
    }), /without credentials/);
    for (const invalidTimeout of ['0', '300001', '1.5', 'abc']) {
        assert.throws(() => readConfig({ AI_TIMEOUT_MS: invalidTimeout }), /AI_TIMEOUT_MS/);
    }
    assert.equal(readConfig({ AI_TIMEOUT_MS: '300000' }).timeout, 300_000);
});

test('message validation enforces the history and content limits', () => {
    const history = Array.from({ length: 11 }, (_, index) => (
        { role: index % 2 === 0 ? 'user' : 'assistant', content: 'Hello' }
    ));
    assert.deepEqual(normalizeMessages(history), history);
    const assistant = { role: 'assistant', content: 'Hello' };
    assert.equal(normalizeMessages([...history, assistant]), null);
    assert.equal(normalizeMessages([...history, assistant, messages[0]]), null);
    assert.equal(normalizeMessages([{ role: 'user', content: 'x'.repeat(1000) }])[0].content.length, 1000);
    assert.equal(normalizeMessages([{ role: 'user', content: 'x'.repeat(1001) }]), null);
});

test('Ollama uses native chat and returns a reply', async () => {
    const chat = createChat(readConfig({ AI_PROVIDER: 'ollama' }), {
        fetcher: async (url, request) => {
            assert.equal(url, 'http://127.0.0.1:11434/api/chat');
            const body = JSON.parse(request.body);
            assert.equal(body.model, 'qwen3:4b');
            assert.equal(body.think, false);
            assert.equal(body.messages[0].role, 'system');
            assert.deepEqual(body.messages.slice(1), messages);
            return Response.json({ message: { content: ' Apa khabar? ' } });
        },
    });
    assert.deepEqual(await chat(messages), { reply: 'Apa khabar?', source: 'ollama' });
});

test('compatible chat sends its model and optional bearer key', async () => {
    const chat = createChat(readConfig({
        AI_PROVIDER: 'openai-compatible', AI_BASE_URL: 'https://example.test/v1/',
        AI_MODEL: 'my-model', AI_API_KEY: 'test-key',
    }), {
        fetcher: async (url, request) => {
            assert.equal(url, 'https://example.test/v1/chat/completions');
            assert.equal(request.headers.Authorization, 'Bearer test-key');
            assert.equal(JSON.parse(request.body).model, 'my-model');
            return Response.json({ choices: [{ message: { content: 'Hello' } }] });
        },
    });
    assert.deepEqual(await chat(messages), { reply: 'Hello', source: 'openai-compatible' });
});

test('chat falls back on disabled AI or a provider failure', async () => {
    assert.equal((await createChat(readConfig({}))(messages)).source, 'fallback');
    const chat = createChat(readConfig({ AI_PROVIDER: 'ollama' }), {
        fetcher: async () => new Response(null, { status: 503 }),
    });
    assert.equal((await chat(messages)).source, 'fallback');
});

test('chat limits provider replies to the size accepted in conversation history', async () => {
    const chat = createChat(readConfig({ AI_PROVIDER: 'ollama' }), {
        fetcher: async () => Response.json({ message: { content: 'x'.repeat(2001) } }),
    });
    const { reply } = await chat(messages);
    assert.equal(reply, 'x'.repeat(2000));
    assert.ok(normalizeMessages([...messages, { role: 'assistant', content: reply }, messages[0]]));
});

async function dispatch(handler, method, url, body = '', contentType = 'application/json') {
    const req = Object.assign(Readable.from([Buffer.from(body)]), {
        method, url, headers: { 'content-type': contentType },
    });
    const headers = {};
    const result = {};
    const res = {
        setHeader(name, value) { headers[name] = value; },
        writeHead(status, extraHeaders) {
            result.status = status;
            Object.assign(headers, extraHeaders);
        },
        end(data) { result.body = data?.toString(); },
    };
    await handler(req, res);
    return { ...result, headers };
}

test('the HTTP handler validates requests and forwards valid history', async () => {
    const handler = createHandler(async (input) => {
        assert.deepEqual(input, messages);
        return { reply: 'Hello', source: 'ollama' };
    });
    const valid = await dispatch(handler, 'POST', '/api/chat', JSON.stringify({ messages }));
    assert.equal(valid.status, 200);
    assert.equal(JSON.parse(valid.body).reply, 'Hello');
    assert.equal((await dispatch(handler, 'GET', '/api/chat')).status, 405);
    assert.equal((await dispatch(handler, 'POST', '/api/chat', '{')).status, 400);
    assert.equal((await dispatch(handler, 'POST', '/api/chat', ' '.repeat(80_001))).status, 413);
    assert.equal((await dispatch(handler, 'POST', '/api/chat', '{}', 'text/plain')).status, 415);
    assert.equal((await dispatch(handler, 'POST', '/api/chat', JSON.stringify({
        messages: [{ role: 'system', content: 'invalid' }],
    }))).status, 422);
});

test('the HTTP handler serves demo assets and keeps private files outside the public root', async () => {
    const handler = createHandler(async () => {});
    assert.match((await dispatch(handler, 'GET', '/')).body, /data-manifest/);
    assert.equal((await dispatch(handler, 'GET', '/sprites/mochi.json')).status, 200);
    const head = await dispatch(handler, 'HEAD', '/sprite.js');
    assert.equal(head.status, 200);
    assert.equal(head.body, undefined);
    assert.equal((await dispatch(handler, 'GET', '/.env')).status, 404);
    assert.equal((await dispatch(handler, 'GET', '/%2e%2e/src/profile.js')).status, 404);
});

test('the bundled image dimensions match each clip grid', async () => {
    const manifestUrl = new URL('../public/sprites/mochi.json', import.meta.url);
    const manifest = JSON.parse(await readFile(manifestUrl, 'utf8'));
    for (const clip of Object.values(manifest.animations)) {
        const image = await readFile(new URL(clip.file, manifestUrl));
        assert.equal(image.readUInt32BE(16), clip.width * clip.columns);
        assert.equal(image.readUInt32BE(20), clip.height * clip.rows);
    }
});

test('the sprite renderer supports multiple rows, one-shots and a missing-clip fallback', async (t) => {
    const media = { matches: false, addEventListener() {}, removeEventListener() {} };
    t.mock.method(globalThis, 'fetch', async () => Response.json({
        name: 'Test sprite',
        animations: {
            idle: { file: 'still.png', columns: 1, rows: 1, frames: 1, width: 32, height: 24, fps: 1 },
            wave: { file: 'wave.png', columns: 2, rows: 2, frames: 3, width: 32, height: 24, fps: 10, loop: false },
        },
    }));
    const oldWindow = globalThis.window;
    const oldDocument = globalThis.document;
    const preloaded = [];
    globalThis.window = {
        matchMedia: () => media,
        Image: class { set src(url) { preloaded.push(url); } },
    };
    globalThis.document = { baseURI: 'http://example.test/' };
    t.after(() => {
        globalThis.window = oldWindow;
        globalThis.document = oldDocument;
    });
    let nextFrame;
    t.mock.method(globalThis, 'setInterval', (callback) => { nextFrame = callback; return 1; });
    t.mock.method(globalThis, 'clearInterval', () => {});
    const element = { style: {}, dataset: {} };
    const sprite = await mountSprite(element, '/sprites/test.json');
    t.after(sprite.destroy);
    assert.deepEqual(preloaded, ['http://example.test/sprites/still.png', 'http://example.test/sprites/wave.png']);
    assert.equal(sprite.name, 'Test sprite');
    assert.equal(element.style.aspectRatio, '32 / 24');
    sprite.play('missing');
    assert.equal(element.dataset.animation, 'idle');
    sprite.play('wave');
    assert.equal(element.style.backgroundImage, 'url("http://example.test/sprites/wave.png")');
    assert.equal(element.style.backgroundPosition, '0% 0%');
    nextFrame();
    assert.equal(element.style.backgroundPosition, '100% 0%');
    nextFrame();
    assert.equal(element.style.backgroundPosition, '0% 100%');
    nextFrame();
    assert.equal(element.dataset.animation, 'idle');
});
