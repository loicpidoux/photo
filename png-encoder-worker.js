// --- Encodeur PNG "niveaux de gris + transparence" (color type 4), sans
// bibliothèque externe. Tourne dans un Worker séparé : même si l'encodage est
// plus lent que l'outil natif du navigateur, il ne bloque jamais l'affichage
// ni le dessin, quelle que soit la puissance de l'ordinateur.
//
// Fonctionne uniquement parce que nos traits sont toujours du blanc pur
// (rgba(255,255,255,x)) : les canaux R, G, B sont donc toujours identiques,
// et on peut n'en garder qu'un (le "gris") sans perdre la moindre information.

// --- CRC32, necessaire pour valider chaque "chunk" PNG (le navigateur n'a pas
// cette fonction integree, contrairement a la compression) ---
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function buildChunk(type, data) {
  const typeBytes = new TextEncoder().encode(type);
  const chunk = new Uint8Array(4 + 4 + data.length + 4);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, data.length, false);
  chunk.set(typeBytes, 4);
  chunk.set(data, 8);

  const crcInput = new Uint8Array(4 + data.length);
  crcInput.set(typeBytes, 0);
  crcInput.set(data, 4);
  view.setUint32(8 + data.length, crc32(crcInput), false);

  return chunk;
}

function buildIHDR(width, height) {
  const data = new Uint8Array(13);
  const view = new DataView(data.buffer);
  view.setUint32(0, width, false);
  view.setUint32(4, height, false);
  data[8] = 8;  // profondeur : 8 bits par canal
  data[9] = 4;  // type de couleur 4 = niveaux de gris + transparence
  data[10] = 0; // methode de compression (0 = deflate, seule valeur valide)
  data[11] = 0; // methode de filtrage (0 = filtres adaptatifs standards)
  data[12] = 0; // pas d'entrelacement
  return buildChunk('IHDR', data);
}

// Construit les lignes de pixels brutes attendues par le format PNG : chaque
// ligne commence par un octet de "filtre" (0 = aucun, la version la plus
// simple - un gain de compression supplementaire serait possible avec des
// filtres plus fins, piste d'optimisation pour plus tard si besoin).
function buildRawScanlines(rgba, width, height) {
  const bytesPerPixel = 2; // gris + alpha
  const rowBytes = 1 + width * bytesPerPixel;
  const raw = new Uint8Array(rowBytes * height);
  let rawIdx = 0;
  let srcIdx = 0;
  for (let y = 0; y < height; y++) {
    raw[rawIdx++] = 0; // type de filtre : aucun
    for (let x = 0; x < width; x++) {
      raw[rawIdx++] = rgba[srcIdx];     // canal R utilise comme "gris" (R=G=B ici)
      raw[rawIdx++] = rgba[srcIdx + 3]; // alpha
      srcIdx += 4;
    }
  }
  return raw;
}

async function deflateZlib(rawBytes) {
  // 'deflate' (pas 'deflate-raw') produit bien un flux au format zlib, celui
  // attendu par un chunk IDAT de PNG.
  const cs = new CompressionStream('deflate');
  const writer = cs.writable.getWriter();
  writer.write(rawBytes);
  writer.close();

  const chunks = [];
  const reader = cs.readable.getReader();
  let totalLen = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    totalLen += value.length;
  }

  const out = new Uint8Array(totalLen);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

async function encodeGrayscaleAlphaPNG(rgba, width, height) {
  const raw = buildRawScanlines(rgba, width, height);
  const compressed = await deflateZlib(raw);

  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = buildIHDR(width, height);
  const idat = buildChunk('IDAT', compressed);
  const iend = buildChunk('IEND', new Uint8Array(0));

  const total = signature.length + ihdr.length + idat.length + iend.length;
  const png = new Uint8Array(total);
  let offset = 0;
  [signature, ihdr, idat, iend].forEach(part => {
    png.set(part, offset);
    offset += part.length;
  });
  return png;
}

self.onmessage = async (e) => {
  const { id, width, height, buffer } = e.data;
  try {
    const rgba = new Uint8ClampedArray(buffer);
    const pngBytes = await encodeGrayscaleAlphaPNG(rgba, width, height);
    self.postMessage({ id, ok: true, buffer: pngBytes.buffer }, [pngBytes.buffer]);
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err) });
  }
};
