function isMobileDevice() {
  return window.matchMedia('(pointer: coarse)').matches;
}

const REF_W = 1920;
const REF_H = 1140;

const referenceFrame = document.getElementById('referenceFrame');

let chromeHeightOffset = 0;

function updateFrameTransform() {
  const scale = Math.max(screen.width / REF_W, screen.height / REF_H);

  const chromeHeight = window.outerHeight - window.innerHeight;
  const chromeWidth = window.outerWidth - window.innerWidth;

  const viewportCenterAbsX = (window.screenX || 0) + chromeWidth / 2 + window.innerWidth / 2;
  const viewportCenterAbsY = (window.screenY || 0) + chromeHeight + window.innerHeight / 2;

  const offsetX = (screen.width / 2) - viewportCenterAbsX;
  const offsetY = (screen.height / 2) - viewportCenterAbsY;

  referenceFrame.style.transform = `translate(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px)) scale(${scale})`;
}
updateFrameTransform();
window.addEventListener('resize', updateFrameTransform);
document.addEventListener('fullscreenchange', () => {
  setTimeout(updateFrameTransform, 50);
});

function screenToFrameCoords(clientX, clientY) {
  const rect = referenceFrame.getBoundingClientRect();
  return {
    x: (clientX - rect.left) / rect.width * REF_W,
    y: (clientY - rect.top) / rect.height * REF_H
  };
}

const viewer = document.getElementById('viewer');
const gridView = document.getElementById('gridView');
const mainImage = document.getElementById('mainImage');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const closeBtn = document.getElementById('closeBtn');
const galleryBtn = document.getElementById('galleryBtn');

let images = [];
let currentIndex = 0;
let inGridView = false;
let hasSeenGrid = false;

document.querySelectorAll('.serie-link').forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const serieName = link.dataset.serie;
    if (!isMobileDevice() && document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
    openSerie(serieName);
  });
});

function openSerie(serieName) {
  fetch(`photos/${serieName}/liste.json`)
    .then(res => res.json())
    .then(list => {
      images = list.map(name => `photos/${serieName}/${name}`);
      currentIndex = 0;
      inGridView = false;
      hasSeenGrid = false;
      document.body.classList.add('viewing-serie');
      viewer.style.display = 'flex';
      gridView.style.display = 'none';
      showImage(0);
    })
    .catch(err => console.error("Impossible de charger la série :", err));
}

function closeEverything() {
  if (document.fullscreenElement) {
    document.exitFullscreen();
  }
  viewer.style.display = 'none';
  gridView.style.display = 'none';
  document.body.classList.remove('viewing-serie');
}

function ensureFullscreen() {
  if (isMobileDevice()) return;
  const isViewingSerie = viewer.style.display !== 'none' || gridView.style.display !== 'none';
  if (isViewingSerie && !document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
  }
}

function showImage(index) {
  inGridView = false;
  gridView.style.display = 'none';
  viewer.style.display = 'flex';
  currentIndex = index;
  mainImage.src = images[index];
  updateArrows();
  galleryBtn.style.display = hasSeenGrid ? 'block' : 'none';
  if (index === 0) {
    preloadRemaining(0);
  }
}

function computeGridLayout(n, containerW, containerH, gap) {
  let best = { cols: 1, rows: n, cellSize: 0 };
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const cellW = (containerW - gap * (cols - 1)) / cols;
    const cellH = (containerH - gap * (rows - 1)) / rows;
    const cellSize = Math.min(cellW, cellH);
    if (cellSize > best.cellSize) {
      best = { cols, rows, cellSize };
    }
  }
  return best;
}

function layoutGrid() {
  const gridInner = document.getElementById('gridInner');
  const cells = gridInner.querySelectorAll('.grid-cell');
  const n = cells.length;
  if (n === 0) return;

  const gap = 8;

  if (isMobileDevice()) {
    const containerW = window.innerWidth - 32;
    const cols = containerW < 500 ? 2 : 3;
    const cellSize = (containerW - gap * (cols - 1)) / cols;

    gridInner.style.width = (cols * cellSize + gap * (cols - 1)) + 'px';

    cells.forEach(cell => {
      cell.style.width = cellSize + 'px';
      cell.style.height = cellSize + 'px';
    });
    return;
  }

  const margin = 80;
  const containerW = window.innerWidth - margin * 2;
  const containerH = window.innerHeight - margin * 2;

  const { cols, cellSize } = computeGridLayout(n, containerW, containerH, gap);

  gridInner.style.width = (cols * cellSize + gap * (cols - 1)) + 'px';

  cells.forEach(cell => {
    cell.style.width = cellSize + 'px';
    cell.style.height = cellSize + 'px';
  });
}

function showGrid() {
  inGridView = true;
  hasSeenGrid = true;
  viewer.style.display = 'none';
  const gridInner = document.getElementById('gridInner');
  gridInner.innerHTML = '';
  images.forEach((src, i) => {
    const cell = document.createElement('div');
    cell.className = 'grid-cell';
    const img = document.createElement('img');
    img.src = src;
    cell.appendChild(img);
    cell.addEventListener('click', () => {
      ensureFullscreen();
      showImage(i);
    });
    gridInner.appendChild(cell);
  });
  gridView.style.display = 'flex';
  layoutGrid();
}

window.addEventListener('resize', () => {
  if (inGridView) layoutGrid();
});

function updateArrows() {
  prevBtn.style.visibility = currentIndex === 0 ? 'hidden' : 'visible';
  nextBtn.style.visibility = 'visible';
}

function preloadRemaining(fromIndex) {
  for (let i = fromIndex + 1; i < images.length; i++) {
    const img = new Image();
    img.src = images[i];
  }
}

function goNext() {
  ensureFullscreen();
  if (currentIndex < images.length - 1) {
    showImage(currentIndex + 1);
  } else {
    showGrid();
  }
}

function goPrev() {
  ensureFullscreen();
  if (inGridView) {
    showImage(images.length - 1);
  } else if (currentIndex > 0) {
    showImage(currentIndex - 1);
  }
}

nextBtn.addEventListener('click', goNext);
prevBtn.addEventListener('click', goPrev);

galleryBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  ensureFullscreen();
  showGrid();
});

closeBtn.addEventListener('click', (e) => {
  e.preventDefault();
  closeEverything();
});

document.getElementById('closeBtnGrid').addEventListener('click', (e) => {
  e.preventDefault();
  closeEverything();
});

document.addEventListener('keydown', (e) => {
  const isActive = viewer.style.display !== 'none' || gridView.style.display !== 'none';
  if (!isActive) return;
  if (e.key === 'ArrowRight') goNext();
  if (e.key === 'ArrowLeft') goPrev();
  if (e.key === 'Escape') closeEverything();
});

document.addEventListener('click', () => {
  ensureFullscreen();
});

// --- Navigation par balayage (swipe) sur mobile ---
let swipeStartX = null;
let swipeStartY = null;
const SWIPE_MIN_DISTANCE = 50;

document.addEventListener('touchstart', (e) => {
  const isActive = viewer.style.display !== 'none' || gridView.style.display !== 'none';
  if (!isActive) return;
  swipeStartX = e.touches[0].clientX;
  swipeStartY = e.touches[0].clientY;
}, { passive: true });

document.addEventListener('touchend', (e) => {
  if (swipeStartX === null) return;
  const isActive = viewer.style.display !== 'none' || gridView.style.display !== 'none';
  if (!isActive) {
    swipeStartX = null;
    swipeStartY = null;
    return;
  }

  const endX = e.changedTouches[0].clientX;
  const endY = e.changedTouches[0].clientY;
  const dx = endX - swipeStartX;
  const dy = endY - swipeStartY;

  if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > SWIPE_MIN_DISTANCE) {
    if (dx < 0 && !inGridView) {
      goNext();
    } else if (dx > 0) {
      goPrev();
    }
  }

  swipeStartX = null;
  swipeStartY = null;
});

let inactivityTimer;
function resetInactivityTimer() {
  if (inGridView) return;
  viewer.classList.remove('controls-hidden');
  clearTimeout(inactivityTimer);
  inactivityTimer = setTimeout(() => {
    viewer.classList.add('controls-hidden');
  }, 2000);
}
document.addEventListener('mousemove', resetInactivityTimer);
document.addEventListener('touchstart', resetInactivityTimer);
resetInactivityTimer();

// --- Effet de rayures lumineuses, résolution fixe 1920×1140 partout ---
const scratchCanvas = document.getElementById('scratchCanvas');
const scratchCtx = scratchCanvas.getContext('2d');

const deltaCanvas = document.createElement('canvas');
deltaCanvas.width = REF_W;
deltaCanvas.height = REF_H;
const deltaCtx = deltaCanvas.getContext('2d');

fetch('/scratch')
  .then(res => res.json())
  .then(({ main, delta }) => {
    if (main) {
      const img = new Image();
      img.onload = () => scratchCtx.drawImage(img, 0, 0);
      img.src = main;
    }
    if (delta) {
      const img = new Image();
      img.onload = () => {
        scratchCtx.globalCompositeOperation = 'lighter';
        scratchCtx.drawImage(img, 0, 0);
        deltaCtx.globalCompositeOperation = 'lighter';
        deltaCtx.drawImage(img, 0, 0);
        hasUnsavedScratchChanges = true;
        hasUnsavedDelta = true;
      };
      img.src = delta;
    }
  })
  .catch(() => {});

const SCRATCH_SKIP_CHANCE = 0.4;
const SCRATCH_MAX_OPACITY = 0.04;
const SCRATCH_LINE_WIDTH = 1;
const SCRATCH_FADE_MS = 60;

const SCRATCH_INTRO_MIN_MS = 4000;
const SCRATCH_INTRO_MAX_MS = 10000;
const SCRATCH_BOOST_OPACITY_MIN = 0.2;
const SCRATCH_BOOST_OPACITY_MAX = 0.28;
const SCRATCH_RANDOM_BOOST_CHANCE = 0.005;

const SCRATCH_STROKE_GROUP_SIZE_MIN = 3;
const SCRATCH_STROKE_GROUP_SIZE_MAX = 8;
let scratchGroupRemaining = 0;
let scratchGroupOpacity = 0;

const scratchPageLoadTime = performance.now();
let scratchIntroBoostDone = false;

let scratchLastScreenX = null;
let scratchLastScreenY = null;
let scratchLastFrameX = null;
let scratchLastFrameY = null;
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

function spawnFadingStroke(screenX1, screenY1, screenX2, screenY2, frameX1, frameY1, frameX2, frameY2, targetOpacity) {
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
  mini.style.opacity = '0';
  mini.style.transition = `opacity ${SCRATCH_FADE_MS}ms linear`;
  document.body.appendChild(mini);

  const mctx = mini.getContext('2d');
  mctx.strokeStyle = `rgba(255,255,255,${targetOpacity})`;
  mctx.lineWidth = SCRATCH_LINE_WIDTH;
  mctx.lineCap = 'round';
  mctx.beginPath();
  mctx.moveTo(screenX1 - minX, screenY1 - minY);
  mctx.lineTo(screenX2 - minX, screenY2 - minY);
  mctx.stroke();

  requestAnimationFrame(() => {
    mini.style.opacity = '1';
  });

  const strokeRecord = { x1: frameX1, y1: frameY1, x2: frameX2, y2: frameY2, targetOpacity, baked: false, miniEl: mini };

  strokeRecord.timeoutId = setTimeout(() => {
    bakeStroke(strokeRecord);
    strokeRecord.baked = true;
    mini.remove();
    const idx = pendingStrokes.indexOf(strokeRecord);
    if (idx !== -1) pendingStrokes.splice(idx, 1);
  }, SCRATCH_FADE_MS + 30);

  pendingStrokes.push(strokeRecord);
}

function processScratchPoint(screenX, screenY) {
  const frame = screenToFrameCoords(screenX, screenY);

  if (scratchLastScreenX !== null && Math.random() >= SCRATCH_SKIP_CHANCE) {
    let targetOpacity;

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

    const elapsedSincePageLoad = performance.now() - scratchPageLoadTime;
    const isInIntroWindow = elapsedSincePageLoad >= SCRATCH_INTRO_MIN_MS && elapsedSincePageLoad <= SCRATCH_INTRO_MAX_MS;

    if (isInIntroWindow && !scratchIntroBoostDone) {
      targetOpacity = SCRATCH_BOOST_OPACITY_MIN + Math.random() * (SCRATCH_BOOST_OPACITY_MAX - SCRATCH_BOOST_OPACITY_MIN);
      scratchIntroBoostDone = true;
    } else if (Math.random() < SCRATCH_RANDOM_BOOST_CHANCE) {
      targetOpacity = SCRATCH_BOOST_OPACITY_MIN + Math.random() * (SCRATCH_BOOST_OPACITY_MAX - SCRATCH_BOOST_OPACITY_MIN);
    }

    spawnFadingStroke(
      scratchLastScreenX, scratchLastScreenY, screenX, screenY,
      scratchLastFrameX, scratchLastFrameY, frame.x, frame.y,
      targetOpacity
    );
  }

  scratchLastScreenX = screenX;
  scratchLastScreenY = screenY;
  scratchLastFrameX = frame.x;
  scratchLastFrameY = frame.y;
}

if (!isMobileDevice()) {
  document.addEventListener('mousemove', (e) => {
    processScratchPoint(e.clientX, e.clientY);
  });
}

function saveMainState() {
  if (isMobileDevice()) return;
  if (!hasUnsavedScratchChanges) return;
  try {
    const dataUrl = scratchCanvas.toDataURL('image/png');
    fetch('/scratch', {
      method: 'POST',
      body: JSON.stringify({ type: 'main', dataUrl }),
      headers: { 'Content-Type': 'application/json' }
    }).catch(() => {});
    hasUnsavedScratchChanges = false;
    hasUnsavedDelta = false;
    deltaCtx.clearRect(0, 0, deltaCanvas.width, deltaCanvas.height);
  } catch (e) {}
}

setInterval(saveMainState, 10000);

function saveDeltaState() {
  if (isMobileDevice()) return;
  if (!hasUnsavedDelta) return;
  try {
    const dataUrl = deltaCanvas.toDataURL('image/png');
    fetch('/scratch', {
      method: 'POST',
      body: JSON.stringify({ type: 'delta', dataUrl }),
      headers: { 'Content-Type': 'application/json' },
      keepalive: true
    }).catch(() => {});
    hasUnsavedDelta = false;
  } catch (e) {}
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    bakeAllPending();
    saveDeltaState();
  }
});
window.addEventListener('pagehide', () => {
  bakeAllPending();
  saveDeltaState();
});
