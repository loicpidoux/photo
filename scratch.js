function isMobileDeviceScratch() {
  return window.matchMedia('(pointer: coarse)').matches;
}

const REF_W = 1920;
const REF_H = 1140;

const VALID_SCRATCH_PAGES = ['home', 'chomage', 'gastromaniac-sa', 'av-de-cour-42', '2020', 'colonnes', 'apropos', 'contact'];

const scratchCanvas = document.getElementById('scratchCanvas');
const scratchCtx = scratchCanvas.getContext('2d');

const MOBILE_ZOOM_FACTOR = 1.3;

// Facteur d'echelle actuel entre le canvas de reference (1920x1140) et l'ecran
// reel - mis a jour a chaque calcul de transformation. Sert a ce que le
// tremblement et le pointille (dessines a l'ecran pour l'apercu, puis a la
// resolution de reference pour le resultat fige) paraissent de la meme taille
// visuelle dans les deux cas.
let scratchDisplayScale = 1;

function updateScratchTransform() {
  let scale = Math.max(screen.width / REF_W, screen.height / REF_H);
  if (isMobileDeviceScratch()) {
    scale *= MOBILE_ZOOM_FACTOR;
  }
  scratchDisplayScale = scale;

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
let scratchPageFullyLoaded = false; // true seulement une fois l'historique de la page CHARGE - protege contre une sauvegarde qui ecraserait tout avec un canvas encore vide

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
  scratchPageFullyLoaded = false;
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
    scratchPageFullyLoaded = true;
    if (scratchPageLoadedResolve) scratchPageLoadedResolve();
  }).catch(() => {
    // Meme en cas d'echec reseau, on debloque les sauvegardes futures - sinon
    // plus rien ne se sauvegarderait jamais pour le reste de la session.
    scratchPageFullyLoaded = true;
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

  // Si la page qu'on quitte n'a pas fini de charger son propre historique,
  // on NE LA SAUVEGARDE PAS (elle pourrait ne contenir qu'un canvas vide ou
  // incomplet) - on perd au pire les tout derniers traits, jamais l'historique.
  const saveBeforeSwitch = scratchPageFullyLoaded ? saveScratchPageNow(pageToSave) : Promise.resolve();

  scratchTransitionPromise = saveBeforeSwitch.then(() => {
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

// =====================================================================
// --- Dessin organique, version "outils natifs" (rapide sur tout ordinateur)
// =====================================================================
// Avant, chaque trait etait lu et re-ecrit pixel par pixel (getImageData /
// putImageData) pour creer les trous, l'estompage, etc. C'est fiable mais
// couteux - d'autant plus couteux que le trait est long (donc precisement les
// gestes rapides et amples, qui couvrent une grande zone). Cette version
// utilise a la place des outils NATIFS du navigateur (pointilles, degrade),
// qui donnent un effet proche sans jamais lire un seul pixel a la main.
// Cout : on perd le grain fin pixel-par-pixel et le petit bruit de luminosite
// individuel - le rendu est un peu plus "regulier" qu'avant, mais reste
// nettement plus rapide, y compris sur un ordinateur peu puissant.

// % de trous : tire au hasard entre 1% et 25% pour CHAQUE trait, independant
// de la vitesse. Moyenne de 3 tirages uniformes plutot qu'un seul : favorise
// les valeurs autour du centre de la fourchette (~13%), les extremes (1% ou
// 25%) restent possibles mais deviennent plus rares.
const SCRATCH_SKIP_MIN = 0.01;
const SCRATCH_SKIP_MAX = 0.25;
const SCRATCH_SKIP_JITTER = 0.2; // +/- 10 points de pourcentage

function randomSkipPct() {
  const r = (Math.random() + Math.random() + Math.random()) / 3;
  const base = SCRATCH_SKIP_MIN + r * (SCRATCH_SKIP_MAX - SCRATCH_SKIP_MIN);
  const jitter = (Math.random() - 0.5) * SCRATCH_SKIP_JITTER;
  return Math.min(Math.max(base + jitter, SCRATCH_SKIP_MIN), SCRATCH_SKIP_MAX);
}

// Traduit ce % de trous en un motif de pointilles natif (setLineDash), calcule
// UNE SEULE FOIS par trait (les longueurs sont exprimees en unites du canvas
// de reference ; on les remet a l'echelle au moment de dessiner selon le
// canvas cible - voir drawOrganicStroke).
const SCRATCH_DASH_UNIT_MIN = 1.5;
const SCRATCH_DASH_UNIT_MAX = 3.5;

function buildDashPattern(skipPct) {
  const filledFraction = 1 - skipPct;
  const unit = SCRATCH_DASH_UNIT_MIN + Math.random() * (SCRATCH_DASH_UNIT_MAX - SCRATCH_DASH_UNIT_MIN);
  const dashLen = Math.max(unit * filledFraction, 0.3);
  const gapLen = Math.max(unit * skipPct, 0.3);
  return [dashLen, gapLen];
}

// Estompage aux extremites (F) : chaque trait a sa propre proportion, tiree au
// hasard entre 0% et 20% de sa longueur, a chaque bout - fait via un degrade
// natif (createLinearGradient), pas de lecture de pixel.
const SCRATCH_TAPER_MAX_FRACTION = 0.20;

function randomTaperFraction() {
  return Math.random() * SCRATCH_TAPER_MAX_FRACTION;
}

// Tremblement de la ligne elle-meme (G) : DEUX points de controle, chacun
// decale perpendiculairement de +/- SCRATCH_TREMOR_MAX_PX pixels (unites de
// reference) - une petite double-courbure plutot qu'une ligne droite.
const SCRATCH_TREMOR_MAX_PX = 4;

function randomTremorOffsets() {
  return [
    (Math.random() * 2 - 1) * SCRATCH_TREMOR_MAX_PX,
    (Math.random() * 2 - 1) * SCRATCH_TREMOR_MAX_PX
  ];
}

// Accents occasionnels : un trait tres court a une petite chance d'etre
// nettement plus lumineux ; un trait long a une chance beaucoup plus rare
// d'avoir le meme traitement - pour ne jamais saturer le site de blanc.
// A ajuster apres test reel.
const SCRATCH_SHORT_ACCENT_MAX_DISTANCE = 12; // px ecran, ce qu'on considere "tres court"
const SCRATCH_SHORT_ACCENT_CHANCE = 0.04;
const SCRATCH_LONG_ACCENT_MIN_DISTANCE = 80; // px ecran, ce qu'on considere "long"
const SCRATCH_LONG_ACCENT_CHANCE = 0.004; // tres tres rare
const SCRATCH_ACCENT_OPACITY_MIN = 0.25;
const SCRATCH_ACCENT_OPACITY_MAX = 0.35;
const SCRATCH_MAX_FINAL_OPACITY = 0.5; // garde-fou general

function maybeApplyAccent(baseOpacity, distance) {
  const accentOpacity = () => Math.min(
    SCRATCH_ACCENT_OPACITY_MIN + Math.random() * (SCRATCH_ACCENT_OPACITY_MAX - SCRATCH_ACCENT_OPACITY_MIN),
    SCRATCH_MAX_FINAL_OPACITY
  );
  if (distance <= SCRATCH_SHORT_ACCENT_MAX_DISTANCE && Math.random() < SCRATCH_SHORT_ACCENT_CHANCE) {
    return accentOpacity();
  }
  if (distance >= SCRATCH_LONG_ACCENT_MIN_DISTANCE && Math.random() < SCRATCH_LONG_ACCENT_CHANCE) {
    return accentOpacity();
  }
  return baseOpacity;
}

// Dessine directement le trait sur le contexte donne (aucune lecture de pixel,
// aucun canvas intermediaire) - une seule ligne stroke() suffit.
// scaleFactor : 1 pour le canvas de reference (resultat fige), ou
// scratchDisplayScale pour le canvas ecran (apercu), afin que le pointille et
// le tremblement paraissent de la meme taille visuelle dans les deux cas.
function drawOrganicStroke(ctx, x1, y1, x2, y2, opacity, dashPattern, taperFraction, tremorOffsets, scaleFactor) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const perpX = -dy / len;
  const perpY = dx / len;
  const [t1, t2] = tremorOffsets;
  const scaledT1 = t1 * scaleFactor;
  const scaledT2 = t2 * scaleFactor;
  const cp1x = x1 + dx * (1 / 3) + perpX * scaledT1;
  const cp1y = y1 + dy * (1 / 3) + perpY * scaledT1;
  const cp2x = x1 + dx * (2 / 3) + perpX * scaledT2;
  const cp2y = y1 + dy * (2 / 3) + perpY * scaledT2;

  if (taperFraction > 0) {
    const grad = ctx.createLinearGradient(x1, y1, x2, y2);
    const stopIn = Math.min(taperFraction, 0.49);
    const stopOut = Math.max(1 - taperFraction, 0.51);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(stopIn, `rgba(255,255,255,${opacity})`);
    grad.addColorStop(stopOut, `rgba(255,255,255,${opacity})`);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.strokeStyle = grad;
  } else {
    ctx.strokeStyle = `rgba(255,255,255,${opacity})`;
  }

  ctx.lineWidth = SCRATCH_LINE_WIDTH;
  ctx.lineCap = 'round';
  ctx.setLineDash(dashPattern.map(v => v * scaleFactor));
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x2, y2);
  ctx.stroke();
}

function bakeStroke(stroke) {
  [scratchCtx, deltaCtx].forEach(ctx => {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    drawOrganicStroke(
      ctx, stroke.x1, stroke.y1, stroke.x2, stroke.y2,
      stroke.targetOpacity, stroke.dashPattern, stroke.taperFraction, stroke.tremorOffsets,
      1 // le canvas de reference EST l'unite de reference - pas de mise a l'echelle
    );
    ctx.restore();
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

function spawnFadingStroke(screenX1, screenY1, screenX2, screenY2, frameX1, frameY1, frameX2, frameY2, targetOpacity, fadeMs, dashPattern, taperFraction, tremorOffsets) {
  // dashPattern, taperFraction et tremorOffsets sont calcules par l'appelant
  // (voir processScratchPoint) - une seule fois, des la naissance du trait :
  // les memes valeurs serviront a la fois pour l'apercu (ci-dessous) et pour
  // le resultat fige (bakeStroke), avec juste une mise a l'echelle adaptee a
  // chaque canvas (voir scratchDisplayScale) - le style ne change donc pas
  // quand le trait se fige.
  const pad = SCRATCH_LINE_WIDTH / 2 + 6;
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
  drawOrganicStroke(
    mctx,
    screenX1 - minX, screenY1 - minY, screenX2 - minX, screenY2 - minY,
    targetOpacity, dashPattern, taperFraction, tremorOffsets,
    scratchDisplayScale
  );

  if (fadeMs > 0) {
    requestAnimationFrame(() => {
      mini.style.opacity = '1';
    });
  }

  const strokeRecord = {
    x1: frameX1, y1: frameY1, x2: frameX2, y2: frameY2, targetOpacity, baked: false, miniEl: mini,
    dashPattern, taperFraction, tremorOffsets
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

      const finalOpacity = maybeApplyAccent(targetOpacity, distance);

      const skipPct = randomSkipPct();
      const dashPattern = buildDashPattern(skipPct);
      const taperFraction = randomTaperFraction();
      const tremorOffsets = randomTremorOffsets();

      spawnFadingStroke(
        scratchLastScreenX, scratchLastScreenY, screenX, screenY,
        scratchLastFrameX, scratchLastFrameY, frame.x, frame.y,
        finalOpacity, fadeMs, dashPattern, taperFraction, tremorOffsets
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
  if (!scratchPageFullyLoaded) return;
  if (!hasUnsavedScratchChanges) return;
  saveScratchPageNow(currentScratchPage);
}

setInterval(saveMainState, 10000);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    bakeAllPending();
    if (isMobileDeviceScratch()) return;
    if (!scratchPageFullyLoaded) return;
    saveScratchPageNow(currentScratchPage);
  }
});
window.addEventListener('pagehide', () => {
  bakeAllPending();
  if (isMobileDeviceScratch()) return;
  if (!scratchPageFullyLoaded) return;
  saveScratchPageNow(currentScratchPage);
});
