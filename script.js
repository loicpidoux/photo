const home = document.getElementById('home');
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
    if (document.documentElement.requestFullscreen) {
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
      home.style.display = 'none';
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
  home.style.display = 'flex';
}

function ensureFullscreen() {
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
resetInactivityTimer();

// --- Effet de rayures lumineuses ---
const scratchCanvas = document.getElementById('scratchCanvas');
const scratchCtx = scratchCanvas.getContext('2d');

const deltaCanvas = document.createElement('canvas');
const deltaCtx = deltaCanvas.getContext('2d');

function resizeScratchCanvas() {
  let previousImage = null;
  if (scratchCanvas.width > 0 && scratchCanvas.height > 0) {
    try {
      previousImage = scratchCanvas.toDataURL('image/png');
    } catch (e) {}
  }
  scratchCanvas.width = window.innerWidth;
  scratchCanvas.height = window.innerHeight;
  deltaCanvas.width = window.innerWidth;
  deltaCanvas.height = window.innerHeight;
  if (previousImage) {
    const img = new Image();
    img.onload = () => {
      scratchCtx.drawImage(img, 0, 0, scratchCanvas.width, scratchCanvas.height);
    };
    img.src = previousImage;
  }
}
resizeScratchCanvas();
window.addEventListener('resize', resizeScratchCanvas);

fetch('/scratch')
  .then(res => res.json())
  .then(({ main, delta }) => {
    if (main) {
      const img = new Image();
      img.onload = () => scratchCtx.drawImage(img, 0, 0, scratchCanvas.width, scratchCanvas.height);
      img.src = main;
    }
    if (delta) {
      const img = new Image();
      img.onload = () => {
        scratchCtx.globalCompositeOperation = 'lighter';
        scratchCtx.drawImage(img, 0, 0, scratchCanvas.width, scratchCanvas.height);
        deltaCtx.globalCompositeOperation = 'lighter';
        deltaCtx.drawImage(img, 0, 0, deltaCanvas.width, deltaCanvas.height);
        hasUnsavedScratchChanges = true;
        hasUnsavedDelta = true;
      };
      img.src = delta;
    }
  })
  .catch(() => {});

const SCRATCH_SKIP_CHANCE = 0.4;
const SCRATCH_MAX_OPACITY = 0.035;
const SCRATCH_LINE_WIDTH = 1;
const SCRATCH_FADE_MS = 60;

const SCRATCH_INTRO_MIN_MS = 4000;
const SCRATCH_INTRO_MAX_MS = 10000;
const SCRATCH_BOOST_OPACITY_MIN = 0.05;
const SCRATCH_BOOST_OPACITY_MAX = 0.1;
const SCRATCH_RANDOM_BOOST_CHANCE = 0.005;

const SCRATCH_STROKE_GROUP_SIZE_MIN = 3;
const SCRATCH_STROKE_GROUP_SIZE_MAX = 8;
let scratchGroupRemaining = 0;
let scratchGroupOpacity = 0;

const scratchPageLoadTime = performance.now();
let scratchIntroBoostDone = false;

let scratchLastX = null;
let scratchLastY = null;
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

function spawnFadingStroke(x1, y1, x2, y2, targetOpacity) {
  const pad = SCRATCH_LINE_WIDTH / 2 + 2;
  const minX = Math.min(x1, x2) - pad;
  const minY = Math.min(y1, y2) - pad;
  const w = Math.abs(x2 - x1) + pad * 2;
  const h = Math.abs(y2 - y1) + pad * 2;

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
  mctx.moveTo(x1 - minX, y1 - minY);
  mctx.lineTo(x2 - minX, y2 - minY);
  mctx.stroke();

  requestAnimationFrame(() => {
    mini.style.opacity = '1';
  });

  const strokeRecord = { x1, y1, x2, y2, targetOpacity, baked: false, miniEl: mini };

  strokeRecord.timeoutId = setTimeout(() => {
    bakeStroke(strokeRecord);
    strokeRecord.baked = true;
    mini.remove();
    const idx = pendingStrokes.indexOf(strokeRecord);
    if (idx !== -1) pendingStrokes.splice(idx, 1);
  }, SCRATCH_FADE_MS + 30);

  pendingStrokes.push(strokeRecord);
}

document.addEventListener('mousemove', (e) => {
  const x = e.clientX;
  const y = e.clientY;

  if (scratchLastX !== null && Math.random() >= SCRATCH_SKIP_CHANCE) {
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

    spawnFadingStroke(scratchLastX, scratchLastY, x, y, targetOpacity);
  }

  scratchLastX = x;
  scratchLastY = y;
});

function saveMainState() {
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
