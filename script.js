const home = document.getElementById('home');
const viewer = document.getElementById('viewer');
const mainImage = document.getElementById('mainImage');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const closeBtn = document.getElementById('closeBtn');
let images = [];
let currentIndex = 0;

// --- Ouverture d'une série : tout se passe dans le même clic ---
document.querySelectorAll('.serie-link').forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const serieName = link.dataset.serie;

    // Demande le plein écran DANS le même geste utilisateur
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
      home.style.display = 'none';
      viewer.style.display = 'flex';
      showImage(0);
    })
    .catch(err => console.error("Impossible de charger la série :", err));
}

function closeSerie() {
  if (document.fullscreenElement) {
    document.exitFullscreen();
  }
  viewer.style.display = 'none';
  home.style.display = 'flex';
}

function showImage(index) {
  currentIndex = index;
  mainImage.src = images[index];
  updateArrows();
  preloadNext();
}

function updateArrows() {
  prevBtn.style.visibility = currentIndex === 0 ? 'hidden' : 'visible';
  nextBtn.style.visibility = 'visible';
}

function preloadNext() {
  const nextIndex = (currentIndex + 1) % images.length;
  const nextImg = new Image();
  nextImg.src = images[nextIndex];
}

function goNext() {
  currentIndex = (currentIndex + 1) % images.length;
  showImage(currentIndex);
}

function goPrev() {
  if (currentIndex > 0) showImage(currentIndex - 1);
}

nextBtn.addEventListener('click', goNext);
prevBtn.addEventListener('click', goPrev);

closeBtn.addEventListener('click', (e) => {
  e.preventDefault();
  closeSerie();
});

document.addEventListener('keydown', (e) => {
  if (viewer.style.display === 'none') return;
  if (e.key === 'ArrowRight') goNext();
  if (e.key === 'ArrowLeft') goPrev();
  if (e.key === 'Escape') closeSerie();
});

// --- Bouton plein écran manuel (utile après un Echap) ---
fullscreenBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
  }
});

// --- Masquage des contrôles après inactivité ---
let inactivityTimer;
function resetInactivityTimer() {
  viewer.classList.remove('controls-hidden');
  clearTimeout(inactivityTimer);
  inactivityTimer = setTimeout(() => {
    viewer.classList.add('controls-hidden');
  }, 2000);
}
document.addEventListener('mousemove', resetInactivityTimer);
resetInactivityTimer();
