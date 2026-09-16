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

function showGrid() {
  inGridView = true;
  hasSeenGrid = true;
  viewer.style.display = 'none';
  const gridContainer = document.getElementById('gridContainer');
  gridContainer.innerHTML = '';
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
    gridContainer.appendChild(cell);
  });
  gridView.style.display = 'block';
}

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

// --- Effet de rayures lumineuses, sur tout le site sauf par-dessus les photos ---
const scratchCanvas = document.getElementById('scratchCanvas');
const scratchCtx = scratchCanvas.getContext('2d');

function resizeScratchCanvas() {
  scratchCanvas.width = window.innerWidth;
  scratchCanvas.height = window.innerHeight;
}
resizeScratchCanvas();
window.addEventListener('resize', resizeScratchCanvas);

const SCRATCH_SKIP_CHANCE = 0.5;
const SCRATCH_MAX_OPACITY = 0.5;
const SCRATCH_LINE_WIDTH = 1;
const SCRATCH_FADE_MS = 350;

let scratchLastX = null;
let scratchLastY = null;

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

  setTimeout(() => {
    scratchCtx.globalCompositeOperation = 'lighter';
    scratchCtx.strokeStyle = `rgba(255,255,255,${targetOpacity})`;
    scratchCtx.lineWidth = SCRATCH_LINE_WIDTH;
    scratchCtx.lineCap = 'round';
    scratchCtx.beginPath();
    scratchCtx.moveTo(x1, y1);
    scratchCtx.lineTo(x2, y2);
    scratchCtx.stroke();
    mini.remove();
  }, SCRATCH_FADE_MS + 30);
}

document.addEventListener('mousemove', (e) => {
  const x = e.clientX;
  const y = e.clientY;
  if (scratchLastX !== null && Math.random() >= SCRATCH_SKIP_CHANCE) {
    const targetOpacity = Math.random() * SCRATCH_MAX_OPACITY;
    spawnFadingStroke(scratchLastX, scratchLastY, x, y, targetOpacity);
  }
  scratchLastX = x;
  scratchLastY = y;
});
