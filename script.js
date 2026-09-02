const params = new URLSearchParams(window.location.search);
const serieName = params.get('s');

const mainImage = document.getElementById('mainImage');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const viewer = document.getElementById('viewer');

let images = [];
let currentIndex = 0;

// Charge la liste des images de la série
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
  prevBtn.style.visibility = currentIndex === 0 ? 'hidden' : 'visible';
  nextBtn.style.visibility = currentIndex === images.length - 1 ? 'hidden' : 'visible';
}

function preloadNext() {
  // précharge discrètement l'image suivante pour une navigation fluide
  if (currentIndex + 1 < images.length) {
    const nextImg = new Image();
    nextImg.src = images[currentIndex + 1];
  }
}

function goNext() {
  if (currentIndex < images.length - 1) showImage(currentIndex + 1);
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

// Masquage des contrôles après inactivité de la souris
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