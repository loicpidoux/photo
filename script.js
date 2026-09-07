const home = document.getElementById('home');
const viewer = document.getElementById('viewer');
const gridView = document.getElementById('gridView');
const mainImage = document.getElementById('mainImage');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const closeBtn = document.getElementById('closeBtn');

let images = [];
let currentIndex = 0;
let inGridView = false;

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

function showImage(index) {
  inGridView = false;
  gridView.style.display = 'none';
  viewer.style.display = 'flex';
  currentIndex = index;
  mainImage.src = images[index];
  updateArrows();
  if (index === 0) {
    preloadRemaining(0);
  }
}

function showGrid() {
  inGridView = true;
  viewer.style.display = 'none';
  gridView.innerHTML = '';
  images.forEach((src, i) => {
    const img = document.createElement('img');
    img.src = src;
    img.className = 'grid-thumb';
    img.addEventListener('click', () => showImage(i));
    gridView.appendChild(img);
  });
  gridView.style.display = 'grid';
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
  if (currentIndex < images.length - 1) {
    showImage(currentIndex + 1);
  } else {
    showGrid();
  }
}

function goPrev() {
  if (inGridView) {
    showImage(images.length - 1);
  } else if (currentIndex > 0) {
    showImage(currentIndex - 1);
  }
}

nextBtn.addEventListener('click', goNext);
prevBtn.addEventListener('click', goPrev);

closeBtn.addEventListener('click', (e) => {
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

let inactivityTimer;
function resetInactivityTimer() {
  if (inGridView) return; // pas de masquage des contrôles en mode grille, il n'y en a pas
  viewer.classList.remove('controls-hidden');
  clearTimeout(inactivityTimer);
  inactivityTimer = setTimeout(() => {
    viewer.classList.add('controls-hidden');
  }, 2000);
}
document.addEventListener('mousemove', resetInactivityTimer);
resetInactivityTimer();
