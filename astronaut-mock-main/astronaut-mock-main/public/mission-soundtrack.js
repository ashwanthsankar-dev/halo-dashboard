(() => {
    function parentHasSoundtrack() {
        if (window.parent === window) return false;
        try {
            return Boolean(window.parent.document.querySelector('[data-halo-soundtrack]'));
        } catch (error) {
            if (error instanceof DOMException && error.name === 'SecurityError') return false;
            throw error;
        }
    }

    if (parentHasSoundtrack()) return;

    const existingAudio = document.querySelector('#soundtrack, #archive-soundtrack');
    const audio = existingAudio instanceof HTMLAudioElement ? existingAudio : document.createElement('audio');
    const script = document.currentScript;
    audio.dataset.haloSoundtrack = 'true';
    audio.autoplay = true;
    audio.loop = true;
    audio.preload = 'auto';
    audio.volume = 0.32;

    if (!existingAudio) {
        if (!(script instanceof HTMLScriptElement)) {
            throw new Error('Unable to resolve the mission soundtrack asset path.');
        }
        const scriptUrl = new URL(script.src);
        audio.src = scriptUrl.pathname === '/api/mission-soundtrack'
            ? '/mission-soundtrack.mp3'
            : new URL('./Cornfield%20Chase%20%E2%80%A2%20Hans%20Zimmer).mp3', scriptUrl).href;
        document.body.append(audio);
    }

    const existingButton = document.getElementById('soundtrack-toggle');
    const button = existingButton instanceof HTMLButtonElement ? existingButton : document.createElement('button');
    const isCustomButton = !existingButton;
    const existingIcon = existingButton?.querySelector('.soundtrack-icon, #soundtrack-icon');

    if (isCustomButton) {
        const style = document.createElement('style');
        style.textContent = `
            .halo-soundtrack-control {
                position: fixed;
                right: 18px;
                bottom: 18px;
                z-index: 9999;
                min-height: 42px;
                padding: 0 15px;
                border: 1px solid rgba(180, 193, 224, .38);
                border-radius: 999px;
                background: rgba(8, 14, 30, .92);
                color: #edf4ff;
                font: 600 12px/1.2 "Segoe UI", Tahoma, sans-serif;
                box-shadow: 0 8px 28px rgba(0, 0, 0, .3);
                cursor: pointer;
            }
            .halo-soundtrack-control:hover,
            .halo-soundtrack-control:focus-visible {
                border-color: #9dcaff;
                background: rgba(16, 29, 52, .98);
            }
        `;
        document.head.append(style);
        button.type = 'button';
        button.className = 'halo-soundtrack-control';
        button.setAttribute('aria-pressed', 'false');
        document.body.append(button);
    }

    function updateButton() {
        const isPlaying = !audio.paused;
        if (isCustomButton) {
            button.textContent = isPlaying ? '♫ Soundtrack on' : '♪ Enable soundtrack';
            button.setAttribute('aria-label', isPlaying ? 'Pause mission soundtrack' : 'Enable mission soundtrack');
        } else {
            button.setAttribute('aria-label', isPlaying ? 'Turn soundtrack off' : 'Play soundtrack');
            button.title = isPlaying ? 'Turn soundtrack off' : 'Play soundtrack';
            if (existingIcon) existingIcon.textContent = isPlaying ? '♫' : '♪';
        }
        button.setAttribute('aria-pressed', String(isPlaying));
    }

    function handlePlaybackError(error) {
        if (error instanceof DOMException && error.name === 'NotAllowedError') return;
        console.error('Unable to play the mission soundtrack.', error);
    }

    function removeInteractionListeners() {
        document.removeEventListener('pointerdown', retryAfterInteraction, true);
        document.removeEventListener('keydown', retryAfterInteraction, true);
        audio.removeEventListener('playing', removeInteractionListeners);
    }

    function retryAfterInteraction(event) {
        if (event.target instanceof Element && event.target.closest('#soundtrack-toggle, .halo-soundtrack-control')) return;
        if (audio.paused) void audio.play().catch(handlePlaybackError);
    }

    if (isCustomButton) {
        button.addEventListener('click', () => {
            if (audio.paused) {
                void audio.play().catch(handlePlaybackError);
            } else {
                audio.pause();
            }
        });
    }

    audio.addEventListener('play', updateButton);
    audio.addEventListener('pause', updateButton);
    updateButton();
    audio.addEventListener('error', () => {
        console.error('Unable to load the local mission soundtrack.');
    });
    document.addEventListener('pointerdown', retryAfterInteraction, true);
    document.addEventListener('keydown', retryAfterInteraction, true);
    audio.addEventListener('playing', removeInteractionListeners);
    if (!audio.paused) removeInteractionListeners();
    void audio.play().catch(handlePlaybackError);
})();
