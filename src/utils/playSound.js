// Pre-load audio objects — files must exist in public/sounds/
const clickAudio = new Audio('/sounds/click.mp3');
clickAudio.volume = 1.0;

const hoverAudio = new Audio('/sounds/hover.mp3');
hoverAudio.volume = 0.5;

const quitAudio = new Audio('/sounds/quit.mp3');
quitAudio.volume = 1.0;

export const playClickSound = () => {
    clickAudio.currentTime = 0; // Reset to start for rapid clicking
    clickAudio.play().catch(err => {
        if (err.name !== 'NotAllowedError') {
            console.error("Click Audio Error:", err);
        }
    });
};

export const playHover = () => {
    hoverAudio.currentTime = 0;
    hoverAudio.play().catch(err => {
        if (err.name !== 'NotAllowedError') {
            console.error("Hover Audio Error:", err);
        }
    });
};

export const playQuitSound = () => {
    if (!quitAudio) return;
    quitAudio.currentTime = 0;
    quitAudio.play().catch(err => {
        if (err.name !== 'NotAllowedError') {
            console.error("Quit Audio Error:", err);
        }
    });
};
