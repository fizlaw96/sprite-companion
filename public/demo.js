import { mountSprite } from './sprite.js';

const element = document.querySelector('#sprite');
const name = document.querySelector('#name');
const form = document.querySelector('form');
const input = document.querySelector('#message');
const status = document.querySelector('#status');
const submit = form.querySelector('button');
const history = document.querySelector('#history');
const messages = [];
let sprite;
let talkingTimer;

mountSprite(element, element.dataset.manifest).then((mounted) => {
    sprite = mounted;
    name.textContent = sprite.name;
}).catch(() => {
    document.querySelector('#sprite-error').textContent = 'The sprite could not be loaded. Check the manifest.';
});

function showPose(pose) {
    clearTimeout(talkingTimer);
    sprite?.play(pose);
}

document.querySelectorAll('[data-pose]').forEach((button) => {
    button.addEventListener('click', () => showPose(button.dataset.pose));
});

function addMessage(speaker, content) {
    const item = document.createElement('li');
    const label = document.createElement('strong');
    const text = document.createElement('p');
    label.textContent = speaker;
    text.textContent = content;
    item.append(label, text);
    history.append(item);
    history.scrollTop = history.scrollHeight;
}

input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.isComposing) {
        event.preventDefault();
        if (!event.repeat && !submit.disabled) form.requestSubmit();
    }
});

form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const content = input.value.trim();
    if (!content || submit.disabled) return;

    const userMessage = { role: 'user', content };
    addMessage('You', content);
    input.value = '';
    submit.disabled = true;
    status.textContent = `${name.textContent} is thinking…`;
    showPose('thinking');

    try {
        const response = await fetch('./api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: [...messages.slice(-10), userMessage] }),
        });
        const result = await response.json();
        if (!response.ok || typeof result.reply !== 'string') throw new Error('Chat request failed.');

        addMessage(name.textContent, result.reply);
        if (result.source === 'fallback') {
            showPose('idle');
        } else {
            messages.push(userMessage, { role: 'assistant', content: result.reply });
            messages.splice(0, Math.max(0, messages.length - 10));
            showPose('talking');
            talkingTimer = setTimeout(() => showPose('idle'), 1300);
        }
    } catch {
        addMessage(name.textContent, 'The chat request failed. Please try again.');
        showPose('idle');
    } finally {
        status.textContent = '';
        submit.disabled = false;
    }
});
