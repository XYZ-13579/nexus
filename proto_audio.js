// --- Audio Setup & Volume Management ---

const sounds = {
    footsteps: new Audio('../backrooms/アスファルトの上を歩く1.mp3'),
    creatureDamage: new Audio('ダメージ①.mp3'),
    playerDamage: new Audio('打撃8.mp3'),
    zombieVoice: new Audio('ゾンビの声1.mp3'),
    zombieDeath: new Audio('ゾンビの断末魔.mp3'),
    gunshot: new Audio('se_gun_fire09.mp3'),
    doorOpen: new Audio('ドアを開ける3.mp3')
};
sounds.footsteps.loop = true;
sounds.zombieVoice.loop = true;

const volumeSettings = {
    master: parseFloat(document.getElementById('vol-master').value),
    gunshot: parseFloat(document.getElementById('vol-gunshot').value),
    footsteps: parseFloat(document.getElementById('vol-footsteps').value),
    sfx: parseFloat(document.getElementById('vol-sfx').value)
};

let audioCtx;
let footstepGain;
let audioInitialized = false;
let currentIdleSound = 'ゾンビの声1.mp3'; // Default idle sound

const initAudio = () => {
    if (audioInitialized) return;

    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const footstepSource = audioCtx.createMediaElementSource(sounds.footsteps);
    footstepGain = audioCtx.createGain();
    footstepGain.gain.value = volumeSettings.footsteps * volumeSettings.master;
    footstepSource.connect(footstepGain);
    footstepGain.connect(audioCtx.destination);

    sounds.footsteps.playbackRate = 2.0;
    sounds.footsteps.volume = 1.0;
    sounds.footsteps.play().then(() => {
        sounds.footsteps.pause();
        sounds.footsteps.currentTime = 0;
    }).catch((err) => { console.error("Footsteps initial play error:", err); });

    // Unlock other sounds
    const unlockSounds = ['creatureDamage', 'playerDamage', 'zombieVoice', 'zombieDeath', 'gunshot', 'doorOpen'];
    unlockSounds.forEach(name => {
        sounds[name].play().then(() => {
            if (name !== 'zombieVoice') {
                sounds[name].pause();
                sounds[name].currentTime = 0;
            } else {
                sounds[name].volume = 0;
            }
        }).catch(() => { });
    });

    audioInitialized = true;
    document.removeEventListener('click', initAudio);
    document.removeEventListener('keydown', initAudio);
};

document.addEventListener('click', initAudio);
document.addEventListener('keydown', initAudio);

// Volume Listeners
document.getElementById('vol-master').addEventListener('input', (e) => {
    volumeSettings.master = parseFloat(e.target.value);
    if (footstepGain && audioCtx) {
        footstepGain.gain.setValueAtTime(volumeSettings.footsteps * volumeSettings.master, audioCtx.currentTime);
    }
});

document.getElementById('vol-gunshot').addEventListener('input', (e) => {
    volumeSettings.gunshot = parseFloat(e.target.value);
});

document.getElementById('vol-footsteps').addEventListener('input', (e) => {
    volumeSettings.footsteps = parseFloat(e.target.value);
    if (footstepGain && audioCtx) {
        footstepGain.gain.setValueAtTime(volumeSettings.footsteps * volumeSettings.master, audioCtx.currentTime);
    } else {
        sounds.footsteps.volume = Math.min(volumeSettings.footsteps * volumeSettings.master, 1.0);
    }
});

document.getElementById('vol-sfx').addEventListener('input', (e) => {
    volumeSettings.sfx = parseFloat(e.target.value);
});

// Function to set idle sound dynamically
function setIdleSound(audioSrc) {
    if (currentIdleSound === audioSrc) return; // No change needed
    const wasPlaying = !sounds.zombieVoice.paused;
    const currentVolume = sounds.zombieVoice.volume;
    sounds.zombieVoice.pause();
    sounds.zombieVoice.src = audioSrc;
    sounds.zombieVoice.loop = true;
    sounds.zombieVoice.volume = currentVolume;
    currentIdleSound = audioSrc;
    if (wasPlaying) {
        sounds.zombieVoice.play().catch(() => {});
    }
}
