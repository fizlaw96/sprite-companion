# Sprite manifest

Each character has a JSON manifest and at least one image. This example uses a single transparent still.

```json
{
  "name": "My Companion",
  "pixelArt": false,
  "animations": {
    "idle": {
      "file": "my-companion.png",
      "columns": 1,
      "rows": 1,
      "frames": 1,
      "width": 128,
      "height": 128,
      "fps": 1
    }
  }
}
```

| Field | Meaning |
| --- | --- |
| `name` | Display name in the demo. Update `src/profile.js` too if you change the AI’s name. |
| `pixelArt` | Set to `true` for crisp pixels when enlarged. |
| `file` | Image URL. A relative path resolves from the manifest’s folder. |
| `columns`, `rows` | Grid dimensions. Use equal cells with no gutters or margins around the sheet. |
| `frames` | Number of used cells. Frames run left to right, then top to bottom. Unused cells belong at the end. |
| `width`, `height` | Width and height of one frame in pixels. A 4 × 2 sheet with 32 × 32 cells is 128 × 64 pixels. |
| `fps` | Playback speed, greater than 0 and at most 60. |
| `loop` | Defaults to looping. Set to `false` for a one-shot clip that returns to idle. A one-shot idle holds on its final frame. |

With the demo server, use filenames like `my-companion.png`: letters, numbers, hyphens or underscores, followed by one lowercase extension.

The demo uses `thinking` while waiting for chat and `talking` briefly after a successful reply. You can add optional keys such as `celebrate`, `wave` or `sleep` and call `sprite.play('wave')` from a button or app event. Missing keys fall back to `idle`. When reduced motion is on, the renderer holds the first frame of the selected clip.

Keep the character on a consistent baseline between frames and clips. For distinct directions, export separate clips such as `turnLeft` and `turnRight`, then trigger those keys from your app. Each clip has its own grid and timing.
