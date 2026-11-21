# Integrate Sprite Companion

## Website or dashboard

Copy `public/sprite.js` and the sprite folder to assets served by your site. Call the renderer from your own page.

```html
<div id="companion" style="width: 120px" aria-hidden="true"></div>
<button id="celebrate" type="button">Celebrate</button>
<script type="module">
  import { mountSprite } from "/assets/sprite.js";

  const sprite = await mountSprite(
    document.querySelector("#companion"),
    "/assets/sprites/mochi.json"
  );
  document.querySelector("#celebrate").onclick = () => sprite.play("celebrate");
</script>
```

In a component-based app, call `sprite.destroy()` when you unmount the sprite. You can connect your own form to the chat endpoint or use the demo in `public/demo.js`.

Call `mountSprite` in the browser after the element exists. In a server-rendered React app such as Next.js, call it from `useEffect` in a client component and dispose of the sprite on cleanup.

## Chat API for websites, games and desktop apps

Send `POST /api/chat` with `Content-Type: application/json`.

```json
{
  "messages": [
    { "role": "user", "content": "Macam mana nak mula buat sprite?" }
  ]
}
```

A successful response looks like this:

```json
{
  "reply": "Mula dengan satu watak dan animasi idle empat frame.",
  "source": "ollama"
}
```

`source` is `ollama`, `openai-compatible`, or `fallback`. The handler returns HTTP 200 with a fallback reply when AI is disabled or the provider fails. Invalid JSON returns 400, an oversized body returns 413, an unsupported content type returns 415, and invalid messages return 422. Message history can contain up to 11 alternating entries beginning and ending with a user message. User messages are limited to 1,000 characters and assistant messages to 2,000, measured in JavaScript string units.

The demo holds recent messages in memory until the tab is refreshed. Each request carries its own history. The server does not save transcripts. A configured hosted provider receives the messages included in its request.

For a native game or desktop app, import the same sprite sheets through the engine’s own grid or atlas loader and play the matching clips yourself. For example, set `thinking` when a request starts, set `talking` on a provider reply, and return to `idle` when the reaction is done or a fallback arrives. A desktop app with a WebView can also use the web renderer directly.

## Hosting and troubleshooting

Use a same-origin route or reverse proxy for browser chat. The demo server binds to loopback by default. Before giving public access, serve it behind HTTPS and add rate limits and any authentication your app needs. Keep Ollama reachable from the chat server on a private network. In a container or hosted deployment, 127.0.0.1 means the chat server’s own environment, so set `AI_BASE_URL` to the address that server can reach.

| Symptom | Check |
| --- | --- |
| Sprite is blank | Open the manifest and image URLs directly. Check the grid and filenames. |
| The animation jitters | Align frame canvases and ground lines in the art export. |
| AI always returns a fallback | Check the terminal for provider errors, and check `AI_PROVIDER`, `AI_MODEL`, `AI_BASE_URL` and the key if needed. For local Ollama, use `ollama list` to confirm the model is installed. |
| First response times out | Try a smaller model or set a higher `AI_TIMEOUT_MS` while the model warms up. |

Official references for the [Ollama chat API](https://docs.ollama.com/api/chat) and [OpenAI compatibility](https://docs.ollama.com/api/openai-compatibility).
