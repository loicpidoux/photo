function isMobileDevice() {
  return window.matchMedia('(pointer: coarse)').matches;
}

document.querySelectorAll('.serie-link').forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const serieName = link.dataset.serie;

    if (!isMobileDevice() && document.documentElement.requestFullscreen) {
      fadeOutScratch(() => {
        document.documentElement.requestFullscreen().catch(() => {});
        openSerie(serieName);
      });
    } else {
      openSerie(serieName);
    }
  });
});

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
