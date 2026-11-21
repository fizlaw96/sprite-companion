function validateClip(clip) {
    return typeof clip?.file === 'string' && clip.file.trim()
        && ['columns', 'rows', 'frames', 'width', 'height'].every((key) => Number.isSafeInteger(clip[key]) && clip[key] > 0)
        && clip.frames <= clip.columns * clip.rows
        && Number.isFinite(clip.fps) && clip.fps > 0 && clip.fps <= 60
        && (clip.loop === undefined || typeof clip.loop === 'boolean');
}

export async function mountSprite(element, manifestUrl) {
    const response = await fetch(manifestUrl);
    if (!response.ok) throw new Error('Could not load the sprite manifest.');
    const manifest = await response.json();
    const clips = new Map(Object.entries(manifest.animations ?? {}));
    if (!clips.has('idle')) throw new Error('Add an idle clip to the sprite manifest.');
    const baseUrl = response.url || new URL(manifestUrl, document.baseURI);
    const images = new Map();
    for (const [name, clip] of clips) {
        if (!validateClip(clip)) throw new Error(`Invalid sprite clip: ${name}`);
        const url = new URL(clip.file, baseUrl).href;
        clips.set(name, { ...clip, url });
        if (!images.has(url)) {
            const image = new window.Image();
            image.src = url;
            images.set(url, image);
        }
    }

    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let active;
    let frame = 0;
    let interval;

    function draw(clip) {
        const column = frame % clip.columns;
        const row = Math.floor(frame / clip.columns);
        const x = clip.columns === 1 ? 0 : column * 100 / (clip.columns - 1);
        const y = clip.rows === 1 ? 0 : row * 100 / (clip.rows - 1);
        element.style.backgroundPosition = `${x}% ${y}%`;
    }

    function play(name) {
        clearInterval(interval);
        active = clips.has(name) ? name : 'idle';
        const clip = clips.get(active);
        element.style.aspectRatio = `${clip.width} / ${clip.height}`;
        element.style.backgroundImage = `url(${JSON.stringify(clip.url)})`;
        element.style.backgroundRepeat = 'no-repeat';
        element.style.backgroundSize = `${clip.columns * 100}% ${clip.rows * 100}%`;
        element.style.imageRendering = manifest.pixelArt ? 'pixelated' : '';
        element.dataset.animation = active;
        frame = 0;
        draw(clip);

        if (motion.matches || (clip.frames === 1 && clip.loop !== false)) return;
        interval = setInterval(() => {
            frame += 1;
            if (frame === clip.frames && clip.loop === false) {
                if (active === 'idle') {
                    frame -= 1;
                    clearInterval(interval);
                } else {
                    play('idle');
                    return;
                }
            }
            frame %= clip.frames;
            draw(clip);
        }, 1000 / clip.fps);
    }

    const updateMotion = () => play(active);
    motion.addEventListener('change', updateMotion);
    play('idle');

    return {
        name: manifest.name || 'Sprite Companion',
        play,
        destroy() {
            clearInterval(interval);
            motion.removeEventListener('change', updateMotion);
            images.clear();
        },
    };
}
