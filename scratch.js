function isMobileDeviceScratch() {
  return window.matchMedia('(pointer: coarse)').matches;
}

const REF_W = 1920;
const REF_H = 1140;

const VALID_SCRATCH_PAGES = ['home', 'chomage', 'gastromaniac-sa', 'av-de-cour-42', '2020', 'colonnes', 'apropos', 'contact'];

const scratchCanvas = document.getElementById('scratchCanvas');
const scratchCtx = scratchCanvas.getContext('2d');

const MOBILE_ZOOM_FACTOR = 1.3;

function updateScratchTransform() {
  let scale = Math.max(screen.width / REF_W, screen.height / REF_H);
  if (isMobileDeviceScratch()) {
    scale *= MOBILE_ZOOM_FACTOR;
  }

  let offsetY = 0;
  if (!document.fullscreenElement) {
    const chromeHeight = window.outerHeight - window.innerHeight;
    const viewportTopOnScreen = (window.screenY || 0) + chromeHeight;
    const viewportCenterOnScreen = viewportTopOnScreen + window.innerHeight / 2;
    const trueScreenCenter = screen.height / 2;
    offsetY = trueScreenCenter - viewportCenterOnScreen;
  }

  scratchCanvas.style.transform = `translate(-50%, calc(-50% + ${offsetY}px)) scale(${scale})`;
}
window.addEventListener('resize', updateScratchTransform);
updateScratchTransform();

// --- Système multi-pages ---
let currentScratchPage = 'home';
let scratchTransitionInProgress = false;
let scratchPendingNextPage = null;
let scratchTransitionPromise = null;
let scratchPageLoadedResolve = null;
let scratchPageLoadedPromise = null;

function screenToFrameCoords(clientX, clientY) {
  const rect = scratchCanvas.getBoundingClientRect();
  return {
    x: (clientX - rect.left) / rect.width * REF_W,
    y: (clientY - rect.top) / rect.height * REF_H
  };
}

const deltaCanvas = document.createElement('canvas');
deltaCanvas.width = REF_W;
deltaCanvas.height = REF_H;
const deltaCtx = deltaCanvas.getContext('2d');

function fetchScratchImage(pageName, type) {
  return fetch('/scratch?page=' + encodeURIComponent(pageName) + '&type=' + type)
    .then(res => {
      if (res.status !== 200) return null;
      return res.blob();
    })
    .then(blob => {
      if (!blob || blob.size === 0) return null;
      return new Promise((resolve) => {
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => { resolve(img); URL.revokeObjectURL(url); };
        img.onerror = () => { resolve(null); URL.revokeObjectURL(url); };
        img.src = url;
      });
    })
    .catch(() => null);
}

function loadScratchPage(pageName) {
  scratchCtx.clearRect(0, 0, REF_W, REF_H);
  deltaCtx.clearRect(0, 0, REF_W, REF_H);

  scratchPageLoadedPromise = new Promise((resolve) => {
    scratchPageLoadedResolve = resolve;
  });

  fetchScratchImage(pageName, 'main').then(mainImg => {
    if (mainImg) {
      scratchCtx.globalCompositeOperation = 'source-over';
      scratchCtx.drawImage(mainImg, 0, 0);
    }
    return fetchScratchImage(pageName, 'delta');
  }).then(deltaImg => {
    if (deltaImg) {
      scratchCtx.globalCompositeOperation = 'lighter';
      scratchCtx.drawImage(deltaImg, 0, 0);
      deltaCtx.globalCompositeOperation = 'lighter';
      deltaCtx.drawImage(deltaImg, 0, 0);
      hasUnsavedScratchChanges = true;
      hasUnsavedDelta = true;
    }
    if (scratchPageLoadedResolve) scratchPageLoadedResolve();
  }).catch(() => {
    if (scratchPageLoadedResolve) scratchPageLoadedResolve();
  });
}

function postScratchBlob(pageName, type, canvasEl, keepalive) {
  return new Promise((resolve) => {
    canvasEl.toBlob((blob) => {
      if (!blob) { resolve(); return; }
      const opts = {
        method: 'POST',
        headers: { 'Content-Type': 'image/png' },
        body: blob
      };
      if (keepalive) opts.keepalive = true;
      fetch('/scratch?page=' + encodeURIComponent(pageName) + '&type=' + type, opts)
        .catch(() => {})
        .finally(resolve);
    }, 'image/png');
  });
}

function saveScratchPageNow(pageName) {
  const savedMain = hasUnsavedScratchChanges;
  const savedDelta = hasUnsavedDelta;
  const promises = [];

  if (savedMain) {
    promises.push(postScratchBlob(pageName, 'main', scratchCanvas, false));
  }
  if (savedDelta) {
    promises.push(postScratchBlob(pageName, 'delta', deltaCanvas, true));
  }

  hasUnsavedScratchChanges = false;
  hasUnsavedDelta = false;
  deltaCtx.clearRect(0, 0, deltaCanvas.width, deltaCanvas.height);

  return Promise.all(promises);
}

function switchScratchPage(nextPage) {
  if (!VALID_SCRATCH_PAGES.includes(nextPage)) {
    console.error('Page de rayures inconnue :', nextPage);
    return Promise.resolve();
  }
  if (nextPage === currentScratchPage && scratchPageLoadedPromise) {
    return scratchPageLoadedPromise;
  }

  if (scratchTransitionInProgress) {
    scratchPendingNextPage = nextPage;
    return scratchTransitionPromise || Promise.resolve();
  }

  scratchTransitionInProgress = true;
  bakeAllPending();
  const pageToSave = currentScratchPage;

  scratchTransitionPromise = saveScratchPageNow(pageToSave).then(() => {
    currentScratchPage = nextPage;
    loadScratchPage(nextPage);
    scratchTransitionInProgress = false;

    if (scratchPendingNextPage !== null) {
      const queued = scratchPendingNextPage;
      scratchPendingNextPage = null;
      return switchScratchPage(queued);
    }

    return scratchPageLoadedPromise;
  });

  return scratchTransitionPromise;
}

function fadeOutScratch(callback) {
  scratchCanvas.style.transition = 'opacity 0.15s ease';
  scratchCanvas.style.opacity = '0';
  setTimeout(() => {
    callback();

    const waitForLoad = scratchTransitionPromise || new Promise(resolve => setTimeout(resolve, 50));

    waitForLoad.then(() => {
      updateScratchTransform();
      scratchCanvas.style.opacity = '1';
    });
  }, 150);
}

const SCRATCH_SKIP_CHANCE = 0.4;
const SCRATCH_MAX_OPACITY = 0.04;
const SCRATCH_LINE_WIDTH = 1;
const SCRATCH_FADE_MS = 60;

const SCRATCH_INTRO_INACTIVITY_MS = 10;
const SCRATCH_RANDOM_BOOST_INACTIVITY_MS = 1000;
const SCRATCH_BOOST_OPACITY_MIN = 0.04;
const SCRATCH_BOOST_OPACITY_MAX = 0.14;
const SCRATCH_RANDOM_BOOST_CHANCE = 0.8;
const SCRATCH_BOOST_FADE_MS = 0;

const SCRATCH_STROKE_GROUP_SIZE_MIN = 1;
const SCRATCH_STROKE_GROUP_SIZE_MAX = 5;
let scratchGroupRemaining = 0;
let scratchGroupOpacity = 0;

let scratchIntroBoostDone = false;

let scratchLastScreenX = null;
let scratchLastScreenY = null;
let scratchLastFrameX = null;
let scratchLastFrameY = null;
let scratchLastMoveTime = null;
let hasUnsavedScratchChanges = false;
let hasUnsavedDelta = false;

const pendingStrokes = [];

// --- Tramage organique : dessine un segment dans un canvas donné, en sautant
// aléatoirement une partie des pixels (0% à 100%, propre à CHAQUE trait) et en
// compensant la luminosité des pixels survivants. Une légère ondulation fait
// varier ce pourcentage tout au long du trait, pour éviter un rendu trop uniforme.
const SCRATCH_WOBBLE_AMPLITUDE = 0.12;
const SCRATCH_WOBBLE_FREQUENCY = 11;
const SCRATCH_MAX_COMPENSATION = 4;

// Correlation vitesse -> % de saut : sous SCRATCH_SPEED_LOW (px/ms), on est au
// pourcentage le plus eleve (trait tres pointille) ; au-dessus de SCRATCH_SPEED_HIGH,
// au pourcentage le plus bas (trait presque plein). A ajuster apres test reel.
const SCRATCH_SPEED_LOW = 0.03;
const SCRATCH_SPEED_HIGH = 1.2;
const SCRATCH_SKIP_AT_SLOW = 0.92;
const SCRATCH_SKIP_AT_FAST = 0.05;
const SCRATCH_SPEED_JITTER = 0.2; // variation aleatoire ajoutee par-dessus, pour rester organique

function skipPctFromSpeed(speed) {
  const t = Math.min(Math.max((speed - SCRATCH_SPEED_LOW) / (SCRATCH_SPEED_HIGH - SCRATCH_SPEED_LOW), 0), 1);
  const base = SCRATCH_SKIP_AT_SLOW - t * (SCRATCH_SKIP_AT_SLOW - SCRATCH_SKIP_AT_FAST);
  const jitter = (Math.random() - 0.5) * SCRATCH_SPEED_JITTER;
  return Math.min(Math.max(base + jitter, 0), 1);
}

function drawDitheredLine(ctx, x1, y1, x2, y2, opacity, skipPct, wobbleSeed) {
  const canvasW = ctx.canvas.width;
  const canvasH = ctx.canvas.height;
  if (canvasW <= 0 || canvasH <= 0) return;

  const tmp = document.createElement('canvas');
  tmp.width = canvasW;
  tmp.height = canvasH;
  const tctx = tmp.getContext('2d');
  tctx.strokeStyle = `rgba(255,255,255,${opacity})`;
  tctx.lineWidth = SCRATCH_LINE_WIDTH;
  tctx.lineCap = 'round';
  tctx.beginPath();
  tctx.moveTo(x1, y1);
  tctx.lineTo(x2, y2);
  tctx.stroke();

  const imgData = tctx.getImageData(0, 0, canvasW, canvasH);
  const data = imgData.data;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = (dx * dx + dy * dy) || 1;

  for (let py = 0; py < canvasH; py++) {
    for (let px = 0; px < canvasW; px++) {
      const idx = (py * canvasW + px) * 4 + 3;
      if (data[idx] === 0) continue;

      const relX = px - x1;
      const relY = py - y1;
      const t = (relX * dx + relY * dy) / lenSq;
      const wobble = Math.sin(t * SCRATCH_WOBBLE_FREQUENCY + wobbleSeed) * SCRATCH_WOBBLE_AMPLITUDE;
      const localSkip = Math.min(Math.max(skipPct + wobble, 0), 0.97);

      if (Math.random() < localSkip) {
        data[idx] = 0;
      } else {
        const compensation = Math.min(1 / (1 - localSkip), SCRATCH_MAX_COMPENSATION);
        data[idx] = Math.min(255, data[idx] * compensation);
      }
    }
  }
  tctx.putImageData(imgData, 0, 0);
  ctx.drawImage(tmp, 0, 0);
}

function bakeStroke(stroke) {
  const pad = SCRATCH_LINE_WIDTH / 2 + 1;
  const minX = Math.floor(Math.min(stroke.x1, stroke.x2) - pad);
  const minY = Math.floor(Math.min(stroke.y1, stroke.y2) - pad);
  const maxX = Math.ceil(Math.max(stroke.x1, stroke.x2) + pad);
  const maxY = Math.ceil(Math.max(stroke.y1, stroke.y2) + pad);
  const bw = Math.max(maxX - minX, 1);
  const bh = Math.max(maxY - minY, 1);

  const tmp = document.createElement('canvas');
  tmp.width = bw;
  tmp.height = bh;
  const tctx = tmp.getContext('2d');
  drawDitheredLine(
    tctx,
    stroke.x1 - minX, stroke.y1 - minY, stroke.x2 - minX, stroke.y2 - minY,
    stroke.targetOpacity, stroke.skipPct, stroke.wobbleSeed
  );

  [scratchCtx, deltaCtx].forEach(ctx => {
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(tmp, minX, minY);
  });

  hasUnsavedScratchChanges = true;
  hasUnsavedDelta = true;
}

function bakeAllPending() {
  while (pendingStrokes.length > 0) {
    const stroke = pendingStrokes.pop();
    clearTimeout(stroke.timeoutId);
    if (!stroke.baked) {
      bakeStroke(stroke);
    }
    if (stroke.miniEl) stroke.miniEl.remove();
  }
}

function spawnFadingStroke(screenX1, screenY1, screenX2, screenY2, frameX1, frameY1, frameX2, frameY2, targetOpacity, fadeMs, skipPct) {
  // skipPct est calculé par l'appelant à partir de la vitesse du geste (voir
  // processScratchPoint) - tiré une seule fois, dès la naissance du trait : le
  // même % de saut et la même ondulation serviront à la fois pour l'aperçu
  // (ci-dessous) et pour le résultat figé (bakeStroke) - le style ne change donc
  // pas quand le trait se fige.
  const wobbleSeed = Math.random() * Math.PI * 2;

  const pad = SCRATCH_LINE_WIDTH / 2 + 2;
  const minX = Math.min(screenX1, screenX2) - pad;
  const minY = Math.min(screenY1, screenY2) - pad;
  const w = Math.abs(screenX2 - screenX1) + pad * 2;
  const h = Math.abs(screenY2 - screenY1) + pad * 2;

  const mini = document.createElement('canvas');
  mini.width = w;
  mini.height = h;
  mini.style.position = 'fixed';
  mini.style.left = minX + 'px';
  mini.style.top = minY + 'px';
  mini.style.width = w + 'px';
  mini.style.height = h + 'px';
  mini.style.pointerEvents = 'none';
  mini.style.zIndex = 2;
  mini.style.opacity = fadeMs > 0 ? '0' : '1';
  mini.style.transition = fadeMs > 0 ? `opacity ${fadeMs}ms linear` : 'none';
  document.body.appendChild(mini);

  const mctx = mini.getContext('2d');
  drawDitheredLine(
    mctx,
    screenX1 - minX, screenY1 - minY, screenX2 - minX, screenY2 - minY,
    targetOpacity, skipPct, wobbleSeed
  );

  if (fadeMs > 0) {
    requestAnimationFrame(() => {
      mini.style.opacity = '1';
    });
  }

  const strokeRecord = {
    x1: frameX1, y1: frameY1, x2: frameX2, y2: frameY2, targetOpacity, baked: false, miniEl: mini,
    skipPct, wobbleSeed
  };

  strokeRecord.timeoutId = setTimeout(() => {
    bakeStroke(strokeRecord);
    strokeRecord.baked = true;
    mini.remove();
    const idx = pendingStrokes.indexOf(strokeRecord);
    if (idx !== -1) pendingStrokes.splice(idx, 1);
  }, fadeMs + 30);

  pendingStrokes.push(strokeRecord);
}

function processScratchPoint(screenX, screenY) {
  const frame = screenToFrameCoords(screenX, screenY);
  const now = performance.now();
  const inactivityGap = scratchLastMoveTime !== null ? now - scratchLastMoveTime : null;

  if (scratchLastScreenX !== null) {
    let shouldDraw = Math.random() >= SCRATCH_SKIP_CHANCE;
    let targetOpacity = null;
    let fadeMs = SCRATCH_FADE_MS;

    const eligibleForIntro = inactivityGap !== null && inactivityGap >= SCRATCH_INTRO_INACTIVITY_MS && !scratchIntroBoostDone;
    const eligibleForRandomBoost = inactivityGap !== null && inactivityGap >= SCRATCH_RANDOM_BOOST_INACTIVITY_MS;

    if (eligibleForIntro) {
      targetOpacity = SCRATCH_BOOST_OPACITY_MIN + Math.random() * (SCRATCH_BOOST_OPACITY_MAX - SCRATCH_BOOST_OPACITY_MIN);
      fadeMs = SCRATCH_BOOST_FADE_MS;
      scratchIntroBoostDone = true;
      shouldDraw = true;
    } else if (eligibleForRandomBoost && Math.random() < SCRATCH_RANDOM_BOOST_CHANCE) {
      targetOpacity = SCRATCH_BOOST_OPACITY_MIN + Math.random() * (SCRATCH_BOOST_OPACITY_MAX - SCRATCH_BOOST_OPACITY_MIN);
      fadeMs = SCRATCH_BOOST_FADE_MS;
      shouldDraw = true;
    } else if (shouldDraw) {
      if (scratchGroupRemaining > 0) {
        targetOpacity = scratchGroupOpacity;
        scratchGroupRemaining--;
      } else {
        targetOpacity = Math.random() * SCRATCH_MAX_OPACITY;
        scratchGroupOpacity = targetOpacity;
        scratchGroupRemaining = Math.floor(
          SCRATCH_STROKE_GROUP_SIZE_MIN + Math.random() * (SCRATCH_STROKE_GROUP_SIZE_MAX - SCRATCH_STROKE_GROUP_SIZE_MIN)
        );
      }
    }

    if (shouldDraw && targetOpacity !== null) {
      const distance = Math.hypot(screenX - scratchLastScreenX, screenY - scratchLastScreenY);
      const dt = Math.max(inactivityGap || 1, 1); // ms, protege contre une division par ~0
      const speed = distance / dt; // px/ms
      const skipPct = skipPctFromSpeed(speed);

      spawnFadingStroke(
        scratchLastScreenX, scratchLastScreenY, screenX, screenY,
        scratchLastFrameX, scratchLastFrameY, frame.x, frame.y,
        targetOpacity, fadeMs, skipPct
      );
    }
  }

  scratchLastScreenX = screenX;
  scratchLastScreenY = screenY;
  scratchLastFrameX = frame.x;
  scratchLastFrameY = frame.y;
  scratchLastMoveTime = now;
}

if (!isMobileDeviceScratch()) {
  document.addEventListener('mousemove', (e) => {
    processScratchPoint(e.clientX, e.clientY);
  });
}

function saveMainState() {
  if (isMobileDeviceScratch()) return;
  if (scratchTransitionInProgress) return;
  if (!hasUnsavedScratchChanges) return;
  saveScratchPageNow(currentScratchPage);
}

setInterval(saveMainState, 10000);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    bakeAllPending();
    if (isMobileDeviceScratch()) return;
    saveScratchPageNow(currentScratchPage);
  }
});
window.addEventListener('pagehide', () => {
  bakeAllPending();
  if (isMobileDeviceScratch()) return;
  saveScratchPageNow(currentScratchPage);
});
