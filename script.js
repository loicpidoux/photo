const params = new URLSearchParams(window.location.search);
const serieName = params.get('s');

const mainImage = document.getElementById('mainImage');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const viewer = document.getElementById('viewer');
const closeBtn = document.getElementById('closeBtn');
const fullscreenBtn = document.getElementById('fullscreenBtn');

let images = [];
let currentIndex = 0;

fetch(`photos/${serieName}/liste.json`)
  .then(res => res.json())
  .then(list => {
    images = list.map(name => `photos/${serieName}/${name}`);
    showImage(0);
    preloadNext();
  })
  .catch(err => {
    console.error("Impossible de charger la série :", err);
  });

function showImage(index) {
  currentIndex = index;
  mainImage.src = images[index];
  updateArrows();
  preloadNext();
}

function updateArrows() {
  // La flèche gauche reste cachée sur la première image
  prevBtn.style.visibility = currentIndex === 0 ? 'hidden' : 'visible';
  // La flèche droite reste toujours visible puisqu'elle boucle
  nextBtn.style.visibility = 'visible';
}

function preloadNext() {
  const nextIndex = (currentIndex + 1) % images.length;
  const nextImg = new Image();
  nextImg.src = images[nextIndex];
}

function goNext() {
  // Boucle : après la dernière image, on revient à la première
  currentIndex = (currentIndex + 1) % images.length;
  showImage(currentIndex);
}

function goPrev() {
  if (currentIndex > 0) showImage(currentIndex - 1);
}

nextBtn.addEventListener('click', goNext);
prevBtn.addEventListener('click', goPrev);

document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight') goNext();
  if (e.key === 'ArrowLeft') goPrev();
});

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

// --- Plein écran ---
function enterFullscreen() {
  const elem = document.documentElement;
  if (elem.requestFullscreen) {
    elem.requestFullscreen();
  } else if (elem.webkitRequestFullscreen) {
    elem.webkitRequestFullscreen();
  }
}

// Premier clic n'importe où sur la page = entrée en plein écran (une seule fois)
let fullscreenAutoActivated = false;
function enterFullscreenOnce(e) {
  if (!fullscreenAutoActivated) {
    fullscreenAutoActivated = true;
    enterFullscreen();
    document.removeEventListener('click', enterFullscreenOnce);
  }
}
document.addEventListener('click', enterFullscreenOnce);

// Bouton plein écran explicite (utile après un Echap)
fullscreenBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  enterFullscreen();
});

// Croix : sort du plein écran si actif, sinon retourne à l'accueil
closeBtn.addEventListener('click', (e) => {
  if (document.fullscreenElement) {
    e.preventDefault();
    document.exitFullscreen();
  }
  // sinon, le comportement par défaut du lien (retour à index.html) s'applique
});
