const video = document.getElementById('mainVideo');
const container = document.getElementById('videoContainer');
const loadingOverlay = document.getElementById('loadingOverlay');
const captionDisplay = document.getElementById('captionDisplay');

const panelTab = document.getElementById('panelTab');
const panelClose = document.getElementById('panelClose');
const sidePanel = document.getElementById('sidePanel');
const panelBackdrop = document.getElementById('panelBackdrop');

const muteBtn = document.getElementById('muteBtn');
const volumeRange = document.getElementById('volumeRange');
const volumeValue = document.getElementById('volumeValue');
const micSelect = document.getElementById('micSelect');
const speakerSelect = document.getElementById('speakerSelect');
const micHint = document.getElementById('micHint');
const speakerHint = document.getElementById('speakerHint');
const captionToggle = document.getElementById('captionToggle');
const refreshDevices = document.getElementById('refreshDevices');
const fullscreenBtn = document.getElementById('fullscreenBtn');
const pipBtn = document.getElementById('pipBtn');
const panelPipBtn = document.getElementById('panelPipBtn');

let lastVolume = 0.8;
let captionsOn = false;
let micStream = null;
let pipVideoElement = null;

function ensurePlaying() {
  if (video && video.paused) {
    video.play().catch((err) => {
      console.log('Autoplay waiting for interaction:', err);
    });
  }
}

function updateMediaSession() {
  if (!('mediaSession' in navigator)) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: 'AeroPlayer - Live Stream',
      artist: 'Live Broadcast',
      album: 'Live Feed'
    });
    navigator.mediaSession.playbackState = 'playing';
    ['seekto', 'seekbackward', 'seekforward', 'skipad'].forEach((act) => {
      try { navigator.mediaSession.setActionHandler(act, null); } catch (e) {}
    });
    try {
      navigator.mediaSession.setActionHandler('play', () => ensurePlaying());
      navigator.mediaSession.setActionHandler('pause', () => ensurePlaying());
    } catch (e) {}
    try {
      navigator.mediaSession.setPositionState({
        duration: Infinity,
        playbackRate: 1,
        position: 0
      });
    } catch (e) {}
  } catch (err) {}
}

function setPanelOpen(open) {
  sidePanel.classList.toggle('open', open);
  panelTab.classList.toggle('open', open);
  sidePanel.setAttribute('aria-hidden', String(!open));
  panelTab.setAttribute('aria-expanded', String(open));
  panelBackdrop.hidden = !open;
}

function syncMuteIcons() {
  const muted = video.muted || video.volume === 0;
  muteBtn.querySelector('.icon-unmuted').classList.toggle('hidden', muted);
  muteBtn.querySelector('.icon-muted').classList.toggle('hidden', !muted);
}

function setVolume(vol, { unmute = true } = {}) {
  const clamped = Math.max(0, Math.min(1, vol));
  video.volume = clamped;
  if (unmute) {
    video.muted = clamped === 0;
  }
  if (clamped > 0) lastVolume = clamped;
  volumeRange.value = String(Math.round(clamped * 100));
  volumeValue.textContent = `${Math.round(clamped * 100)}%`;
  syncMuteIcons();
}

function syncFullscreenIcons() {
  const isFs = Boolean(document.fullscreenElement || document.webkitFullscreenElement);
  fullscreenBtn.querySelector('.icon-expand').classList.toggle('hidden', isFs);
  fullscreenBtn.querySelector('.icon-shrink').classList.toggle('hidden', !isFs);
}

async function toggleFullscreen() {
  const isFs = document.fullscreenElement || document.webkitFullscreenElement;
  try {
    if (!isFs) {
      if (container.requestFullscreen) await container.requestFullscreen();
      else if (container.webkitRequestFullscreen) container.webkitRequestFullscreen();
    } else if (document.exitFullscreen) {
      await document.exitFullscreen();
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    }
  } catch (err) {
    console.log('Fullscreen failed:', err);
  }
}

// Native Picture-in-Picture without timeline or slidebar
async function togglePictureInPicture() {
  try {
    // If standard Picture-in-Picture is active, exit it
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture();
      if (pipBtn) pipBtn.classList.remove('active');
      return;
    }

    ensurePlaying();

    // Capture the active stream from the video element
    const captureFn = video.captureStream || video.mozCaptureStream;
    let stream = null;
    if (typeof captureFn === 'function') {
      try {
        stream = captureFn.call(video);
      } catch (err) {
        console.warn('captureStream call error:', err);
      }
    }

    // Stream-based native PiP:
    // When a video element plays a MediaStream, its duration is positive Infinity.
    // The browser recognizes it as a live stream and hides the timeline slider, progress bar, and seek controls!
    if (stream) {
      if (!pipVideoElement) {
        pipVideoElement = document.createElement('video');
        pipVideoElement.muted = true;
        pipVideoElement.playsInline = true;
        pipVideoElement.setAttribute('playsinline', '');
        pipVideoElement.setAttribute('webkit-playsinline', '');
        // Keep in DOM with minimal size so browser compositor active-stream pipe renders
        pipVideoElement.style.cssText = 'position:fixed;bottom:0;right:0;width:4px;height:4px;opacity:0.01;pointer-events:none;z-index:-10;';
        document.body.appendChild(pipVideoElement);
      }

      pipVideoElement.srcObject = stream;
      await pipVideoElement.play();
      await pipVideoElement.requestPictureInPicture();

      if (pipBtn) pipBtn.classList.add('active');
      pipVideoElement.addEventListener('leavepictureinpicture', () => {
        if (pipBtn) pipBtn.classList.remove('active');
      }, { once: true });
      return;
    }

    // Direct native PiP fallback
    if (typeof video.requestPictureInPicture === 'function') {
      await video.requestPictureInPicture();
      if (pipBtn) pipBtn.classList.add('active');
    }
  } catch (err) {
    console.log('PiP toggle failed:', err);
    // Direct native fallback
    if (typeof video.requestPictureInPicture === 'function' && !document.pictureInPictureElement) {
      try {
        await video.requestPictureInPicture();
        if (pipBtn) pipBtn.classList.add('active');
      } catch (e) {}
    }
  }
}

function fillSelect(select, devices, emptyLabel) {
  const previous = select.value;
  select.innerHTML = '';
  if (!devices.length) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = emptyLabel;
    select.appendChild(opt);
    return;
  }
  devices.forEach((device, index) => {
    const opt = document.createElement('option');
    opt.value = device.deviceId;
    opt.textContent = device.label || `${device.kind} ${index + 1}`;
    select.appendChild(opt);
  });
  if (previous && [...select.options].some((o) => o.value === previous)) {
    select.value = previous;
  }
}

async function ensureAudioPermission() {
  if (!navigator.mediaDevices?.getUserMedia) return false;
  try {
    if (micStream) {
      micStream.getTracks().forEach((t) => t.stop());
    }
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    micStream.getTracks().forEach((t) => t.stop());
    micStream = null;
    return true;
  } catch (err) {
    console.log('Mic permission denied:', err);
    return false;
  }
}

async function refreshAudioDevices() {
  if (!navigator.mediaDevices?.enumerateDevices) {
    micHint.textContent = 'Device listing is not supported in this browser.';
    speakerHint.textContent = 'Speaker selection is not supported in this browser.';
    return;
  }

  const allowed = await ensureAudioPermission();
  const devices = await navigator.mediaDevices.enumerateDevices();
  const mics = devices.filter((d) => d.kind === 'audioinput');
  const speakers = devices.filter((d) => d.kind === 'audiooutput');

  fillSelect(
    micSelect,
    mics,
    allowed ? 'No microphones found' : 'Allow mic access to list devices'
  );
  fillSelect(speakerSelect, speakers, 'Default system speaker');

  micHint.textContent = allowed
    ? `${mics.length} microphone${mics.length === 1 ? '' : 's'} detected.`
    : 'Permission needed to show real mic names.';

  const sinkSupported = typeof video.setSinkId === 'function';
  speakerSelect.disabled = !sinkSupported;
  speakerHint.textContent = sinkSupported
    ? `${speakers.length} speaker${speakers.length === 1 ? '' : 's'} available from your system.`
    : 'Speaker routing needs Chrome/Edge (setSinkId). Default output is used.';
}

async function applySpeaker(deviceId) {
  if (typeof video.setSinkId !== 'function') return;
  try {
    await video.setSinkId(deviceId || '');
    speakerHint.textContent = deviceId
      ? 'Output routed to selected speaker.'
      : 'Using default system speaker.';
  } catch (err) {
    console.log('setSinkId failed:', err);
    speakerHint.textContent = 'Could not switch speaker. Try another device.';
  }
}

function getCaptionTrack() {
  return [...video.textTracks].find((t) => t.kind === 'captions' || t.kind === 'subtitles') || null;
}

function setCaptions(on) {
  captionsOn = on;
  captionToggle.setAttribute('aria-checked', String(on));
  captionToggle.classList.toggle('on', on);

  const track = getCaptionTrack();
  if (track) {
    track.mode = on ? 'hidden' : 'disabled';
  }

  if (!on) {
    captionDisplay.hidden = true;
    captionDisplay.textContent = '';
  }
}

function bindCaptionCues() {
  const track = getCaptionTrack();
  if (!track) return;

  track.addEventListener('cuechange', () => {
    if (!captionsOn) return;
    const cues = track.activeCues;
    if (cues && cues.length > 0) {
      captionDisplay.textContent = [...cues].map((c) => c.text).join(' ');
      captionDisplay.hidden = false;
    } else {
      captionDisplay.textContent = '';
      captionDisplay.hidden = true;
    }
  });
}

// Playback continuity
video.addEventListener('pause', ensurePlaying);
video.addEventListener('waiting', () => loadingOverlay.classList.add('active'));
video.addEventListener('playing', () => {
  loadingOverlay.classList.remove('active');
  updateMediaSession();
});
video.addEventListener('canplay', () => {
  loadingOverlay.classList.remove('active');
  ensurePlaying();
});

// Block seeking attempts to enforce unbroken live stream experience
video.addEventListener('seeking', () => {
  ensurePlaying();
  updateMediaSession();
});

// Disable browser context menu to prevent "Show controls"
video.addEventListener('contextmenu', (e) => e.preventDefault());
container.addEventListener('contextmenu', (e) => e.preventDefault());

video.addEventListener('enterpictureinpicture', () => {
  if (pipBtn) pipBtn.classList.add('active');
  updateMediaSession();
});

video.addEventListener('leavepictureinpicture', () => {
  if (pipBtn) pipBtn.classList.remove('active');
});

// Keyboard controls: prevent seeking keys, support live shortcuts
window.addEventListener('keydown', (e) => {
  const tag = document.activeElement ? document.activeElement.tagName : '';
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(tag)) return;

  // Block seek keys
  if (['ArrowLeft', 'ArrowRight', 'Home', 'End', 'j', 'l', 'J', 'L'].includes(e.key)) {
    e.preventDefault();
    return;
  }

  if (e.key === 'Escape' && sidePanel.classList.contains('open')) {
    setPanelOpen(false);
    return;
  }
  if (e.key === ' ' || e.code === 'Space' || e.key.toLowerCase() === 'k') {
    e.preventDefault();
    ensurePlaying();
  }
  if (e.key.toLowerCase() === 'f') {
    e.preventDefault();
    toggleFullscreen();
  }
  if (e.key.toLowerCase() === 'p') {
    e.preventDefault();
    togglePictureInPicture();
  }
  if (e.key.toLowerCase() === 'm') {
    e.preventDefault();
    muteBtn.click();
  }
});

panelTab.addEventListener('click', () => {
  setPanelOpen(!sidePanel.classList.contains('open'));
  if (sidePanel.classList.contains('open')) {
    refreshAudioDevices();
  }
});
panelClose.addEventListener('click', () => setPanelOpen(false));
panelBackdrop.addEventListener('click', () => setPanelOpen(false));

volumeRange.addEventListener('input', () => {
  setVolume(Number(volumeRange.value) / 100);
});

muteBtn.addEventListener('click', () => {
  if (video.muted || video.volume === 0) {
    setVolume(lastVolume > 0 ? lastVolume : 0.8);
  } else {
    lastVolume = video.volume || lastVolume;
    video.muted = true;
    volumeRange.value = '0';
    volumeValue.textContent = '0%';
    syncMuteIcons();
  }
});

speakerSelect.addEventListener('change', () => {
  applySpeaker(speakerSelect.value);
});

micSelect.addEventListener('change', () => {
  const label = micSelect.options[micSelect.selectedIndex]?.textContent || 'Microphone';
  micHint.textContent = micSelect.value ? `Selected: ${label}` : 'No microphone selected.';
});

captionToggle.addEventListener('click', () => {
  setCaptions(!captionsOn);
});

refreshDevices.addEventListener('click', () => {
  refreshAudioDevices();
});

if (pipBtn) pipBtn.addEventListener('click', togglePictureInPicture);
if (panelPipBtn) panelPipBtn.addEventListener('click', togglePictureInPicture);

fullscreenBtn.addEventListener('click', toggleFullscreen);
document.addEventListener('fullscreenchange', syncFullscreenIcons);
document.addEventListener('webkitfullscreenchange', syncFullscreenIcons);

if (navigator.mediaDevices?.addEventListener) {
  navigator.mediaDevices.addEventListener('devicechange', () => {
    refreshAudioDevices();
  });
}

window.addEventListener('DOMContentLoaded', () => {
  video.muted = true;
  video.loop = true;
  setVolume(0, { unmute: false });
  video.muted = true;
  syncMuteIcons();
  setCaptions(false);
  bindCaptionCues();
  ensurePlaying();
  updateMediaSession();
});

['click', 'touchstart', 'keydown'].forEach((eventName) => {
  window.addEventListener(
    eventName,
    () => {
      ensurePlaying();
    },
    { once: true, passive: true }
  );
});
