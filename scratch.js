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
let scratchLoadGeneration = 0;
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
  scratchLoadGeneration++;
  const myGeneration = scratchLoadGeneration;

  scratchCtx.clearRect(0, 0, REF_W, REF_H);
  deltaCtx.clearRect(0, 0, REF_W, REF_H);

  scratchPageLoadedPromise = new Promise((resolve) => {
    scratchPageLoadedResolve = resolve;
  });

  fetchScratchImage(pageName, 'main').then(mainImg => {
    if (myGeneration !== scratchLoadGeneration) return null;
    if (mainImg) {
      scratchCtx.globalCompositeOperation = 'source-over';
      scratchCtx.drawImage(mainImg, 0, 0);
    }
    return fetchScratchImage(pageName, 'delta');
  }).then(deltaImg => {
    if (myGeneration !== scratchLoadGeneration) return;
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
    if (myGeneration === scratchLoadGeneration && scratchPageLoadedResolve) scratchPageLoadedResolve();
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

function bakeStroke(stroke) {
  [scratchCtx, deltaCtx].forEach(ctx => {
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = `rgba(255,255,255,${stroke.targetOpacity})`;
    ctx.lineWidth = SCRATCH_LINE_WIDTH;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(stroke.x1, stroke.y1);
    ctx.lineTo(stroke.x2, stroke.y2);
    ctx.stroke();
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

function spawnFadingStroke(screenX1, screenY1, screenX2, screenY2, frameX1, frameY1, frameX2, frameY2, targetOpacity, fadeMs) {
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
  mctx.strokeStyle = `rgba(255,255,255,${targetOpacity})`;
  mctx.lineWidth = SCRATCH_LINE_WIDTH;
  mctx.lineCap = 'round';
  mctx.beginPath();
  mctx.moveTo(screenX1 - minX, screenY1 - minY);
  mctx.lineTo(screenX2 - minX, screenY2 - minY);
  mctx.stroke();

  if (fadeMs > 0) {
    requestAnimationFrame(() => {
      mini.style.opacity = '1';
    });
  }

  const strokeRecord = { x1: frameX1, y1: frameY1, x2: frameX2, y2: frameY2, targetOpacity, baked: false, miniEl: mini };

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
      spawnFadingStroke(
        scratchLastScreenX, scratchLastScreenY, screenX, screenY,
        scratchLastFrameX, scratchLastFrameY, frame.x, frame.y,
        targetOpacity, fadeMs
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
