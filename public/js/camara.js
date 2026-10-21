const GUIAS = {
  frente: "Centra el objeto. Captura o sube la foto; luego recortas y confirmas.",
  detras: "Gíralo 180°. La parte de atrás debe llenar el recuadro.",
  izquierda: "El costado izquierdo debe llenar el recuadro.",
  derecha: "El costado derecho debe llenar el recuadro.",
  arriba: "Desde arriba, la tapa debe quedar dentro del círculo.",
  abajo: "Desde abajo, la base debe quedar dentro del círculo.",
};

const LABELS = {
  frente: "Frente",
  detras: "Detrás",
  izquierda: "Izquierda",
  derecha: "Derecha",
  arriba: "Arriba",
  abajo: "Abajo",
};

let streamActual = null;
let colaAngulos = [];
let indiceCola = 0;
let formDestino = null;
let inputUnico = null;
let pendiente = null;
let fotoBase = null;
let cropRect = { x: 12, y: 12, w: 76, h: 76 };
let cropAspect = 0;
let cropDrag = null;
let cropZoom = 1;
let cropPan = { x: 0, y: 0 };
let cropRot = 0;
let cropGrid = true;
let cropPointers = new Map();
let origenToma = "camara";
let ultimoAutoRect = null;
const FOTO_LADO = 1024;
const CROP_MEM = "hexa-crop-memoria";
const CROP_MIN = 6;

function fileInputDe(form, angulo) {
  return form?.querySelector(`input[name="${angulo}"]`);
}

function guardarFotoLocal(form, angulo, file) {
  if (!form) return;
  form._hexaFotos = form._hexaFotos || {};
  form._hexaFotos[angulo] = file;
}

function ponerArchivo(input, file) {
  if (!input || !file) return;
  input.dataset.hexaListo = "1";
  try {
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
  } catch (_) {
    /* Safari viejo: HexaAPI usa form._hexaFotos */
  }
  const angulo = input.getAttribute("name");
  guardarFotoLocal(input.closest("form"), angulo, file);
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function previewEnSlot(input, src) {
  const slot = input.closest(".angle");
  if (!slot) return;
  let img = slot.querySelector(".prev");
  if (!img) {
    img = document.createElement("img");
    img.className = "prev";
    img.alt = "vista previa";
    slot.insertBefore(img, slot.querySelector("input"));
  }
  img.src = src;
  img.hidden = false;
  slot.classList.add("listo");
}

async function abrirCamara() {
  if (streamActual) {
    const video = document.getElementById("cam-video");
    if (video && !video.srcObject) video.srcObject = streamActual;
    return streamActual;
  }
  const intentos = [
    { video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 1280 } }, audio: false },
    { video: { facingMode: "user" }, audio: false },
    { video: true, audio: false },
  ];
  let lastErr;
  for (const opts of intentos) {
    try {
      streamActual = await navigator.mediaDevices.getUserMedia(opts);
      break;
    } catch (err) {
      lastErr = err;
    }
  }
  if (!streamActual) throw lastErr || new Error("Sin cámara");
  const video = document.getElementById("cam-video");
  video.setAttribute("playsinline", "true");
  video.muted = true;
  video.srcObject = streamActual;
  await video.play();
  await esperarVideo(video);
  return streamActual;
}

function esperarVideo(video) {
  if (video.videoWidth > 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("La cámara no envió imagen. Prueba de nuevo.")), 10000);
    const ok = () => {
      if (video.videoWidth > 0) {
        clearTimeout(t);
        video.removeEventListener("loadeddata", ok);
        resolve();
      }
    };
    video.addEventListener("loadeddata", ok);
  });
}

function cerrarCamara() {
  streamActual?.getTracks().forEach((t) => t.stop());
  streamActual = null;
  const video = document.getElementById("cam-video");
  if (video) video.srcObject = null;
  pendiente = null;
  fotoBase = null;
  cropDrag = null;
  cropPointers.clear();
  resetVistaCrop();
}

function resetVistaCrop() {
  cropZoom = 1;
  cropPan = { x: 0, y: 0 };
  cropRot = 0;
}

function modoRevision(on) {
  const review = document.getElementById("cam-review");
  const live = document.getElementById("cam-acciones-live");
  const revAcc = document.getElementById("cam-acciones-review");
  const tools = document.getElementById("crop-tools");
  const msg = document.getElementById("cam-review-msg");
  const video = document.getElementById("cam-video");
  const frame = document.getElementById("cam-frame");
  if (review) review.hidden = !on;
  if (live) live.hidden = on;
  if (revAcc) revAcc.hidden = !on;
  if (tools) tools.hidden = !on;
  if (msg) msg.hidden = !on;
  if (video) video.style.opacity = on ? "0" : "1";
  if (frame) frame.style.visibility = on ? "hidden" : "visible";
}

function mostrarEstudio(angulo, pasoTexto) {
  const modal = document.getElementById("estudio");
  if (modal && modal.parentElement !== document.body) document.body.appendChild(modal);
  document.getElementById("estudio-titulo").textContent = LABELS[angulo] || angulo;
  document.getElementById("estudio-guia").textContent = GUIAS[angulo] || "";
  document.getElementById("estudio-paso").textContent = pasoTexto;
  document.getElementById("cam-frame").dataset.angulo = angulo;
  modoRevision(false);
  modal.hidden = false;
}

async function siguienteAngulo() {
  if (indiceCola >= colaAngulos.length) {
    document.getElementById("estudio").hidden = true;
    cerrarCamara();
    return;
  }
  const angulo = colaAngulos[indiceCola];
  mostrarEstudio(angulo, `${indiceCola + 1} / ${colaAngulos.length}`);
}

function pedirGaleria() {
  const pick = document.getElementById("cam-pick");
  if (!pick) return;
  pick.value = "";
  pick.click();
}

function iniciarEstudio({ form, angulos, input, desde = "camara", file = null }) {
  formDestino = form || input?.closest("form");
  inputUnico = input || null;
  colaAngulos = angulos;
  indiceCola = 0;
  pendiente = null;
  fotoBase = null;
  origenToma = desde;
  const angulo = colaAngulos[0];
  mostrarEstudio(angulo, `1 / ${colaAngulos.length}`);
  if (desde === "archivo") {
    if (file) {
      archivoAFotoBase(file)
        .then((cuadro) => entrarRevision(cuadro))
        .catch((err) => alert(err.message || "No se pudo abrir esa foto."));
    } else {
      pedirGaleria();
    }
    return;
  }
  abrirCamara().catch((err) => {
    alert(err.message || "No se pudo abrir la cámara. Usa Subir para elegir una foto del dispositivo.");
  });
}

function mapaVideoCover() {
  const video = document.getElementById("cam-video");
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const vRect = video.getBoundingClientRect();
  const scale = Math.max(vRect.width / vw, vRect.height / vh);
  const extraX = (vw * scale - vRect.width) / 2;
  const extraY = (vh * scale - vRect.height) / 2;
  return { video, vw, vh, vRect, scale, extraX, extraY };
}

function rectEnVideo(domRect, map) {
  const { vRect, scale, extraX, extraY, vw, vh } = map;
  let sx = (domRect.left - vRect.left + extraX) / scale;
  let sy = (domRect.top - vRect.top + extraY) / scale;
  let sw = domRect.width / scale;
  let sh = domRect.height / scale;
  sx = Math.max(0, Math.min(vw - 2, sx));
  sy = Math.max(0, Math.min(vh - 2, sy));
  sw = Math.max(2, Math.min(vw - sx, sw));
  sh = Math.max(2, Math.min(vh - sy, sh));
  return { sx, sy, sw, sh };
}

function copiarVideoRect(sx, sy, sw, sh, destW, destH) {
  const canvas = document.getElementById("cam-canvas");
  const video = document.getElementById("cam-video");
  canvas.width = destW;
  canvas.height = destH;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, destW, destH);
  return canvas;
}

function dilatar(mask, w, h) {
  const out = new Uint8Array(mask.length);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (mask[i] || mask[i - 1] || mask[i + 1] || mask[i - w] || mask[i + w]) out[i] = 1;
    }
  }
  return out;
}

function erosionar(mask, w, h) {
  const out = new Uint8Array(mask.length);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (mask[i] && mask[i - 1] && mask[i + 1] && mask[i - w] && mask[i + w]) out[i] = 1;
    }
  }
  return out;
}

function componenteMayor(mask, w, h) {
  const seen = new Uint8Array(mask.length);
  let best = null;
  const stack = [];
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || seen[i]) continue;
    stack.push(i);
    seen[i] = 1;
    let minX = w,
      minY = h,
      maxX = 0,
      maxY = 0,
      count = 0;
    while (stack.length) {
      const p = stack.pop();
      const x = p % w;
      const y = (p / w) | 0;
      count++;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      const vecinos = [p - 1, p + 1, p - w, p + w];
      for (const q of vecinos) {
        if (q < 0 || q >= mask.length || seen[q] || !mask[q]) continue;
        const qx = q % w;
        if (Math.abs(qx - x) + Math.abs(((q / w) | 0) - y) !== 1) continue;
        seen[q] = 1;
        stack.push(q);
      }
    }
    if (!best || count > best.count) best = { minX, minY, maxX, maxY, count };
  }
  return best;
}

function lum(data, w, x, y) {
  const i = (y * w + x) * 4;
  return data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
}

function blurCaja(data, w, h, radio) {
  const tmp = new Float32Array(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let R = 0,
        G = 0,
        B = 0,
        n = 0;
      for (let dx = -radio; dx <= radio; dx++) {
        const xx = x + dx;
        if (xx < 0 || xx >= w) continue;
        const i = (y * w + xx) * 4;
        R += data[i];
        G += data[i + 1];
        B += data[i + 2];
        n++;
      }
      const o = (y * w + x) * 3;
      tmp[o] = R / n;
      tmp[o + 1] = G / n;
      tmp[o + 2] = B / n;
    }
  }
  const out = new Uint8ClampedArray(data.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let R = 0,
        G = 0,
        B = 0,
        n = 0;
      for (let dy = -radio; dy <= radio; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        const o = (yy * w + x) * 3;
        R += tmp[o];
        G += tmp[o + 1];
        B += tmp[o + 2];
        n++;
      }
      const i = (y * w + x) * 4;
      out[i] = R / n;
      out[i + 1] = G / n;
      out[i + 2] = B / n;
      out[i + 3] = 255;
    }
  }
  return out;
}

function inundarFondo(data, w, h, umbral) {
  const bg = new Uint8Array(w * h);
  const stack = [];
  const meter = (x, y) => {
    const i = y * w + x;
    if (bg[i]) return;
    bg[i] = 1;
    stack.push(i);
  };
  for (let x = 0; x < w; x++) {
    meter(x, 0);
    meter(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    meter(0, y);
    meter(w - 1, y);
  }
  while (stack.length) {
    const p = stack.pop();
    const x = p % w;
    const y = (p / w) | 0;
    const i = p * 4;
    const pr = data[i];
    const pg = data[i + 1];
    const pb = data[i + 2];
    const vecinos = [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
    ];
    for (const [nx, ny] of vecinos) {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = ny * w + nx;
      if (bg[ni]) continue;
      const j = ni * 4;
      const d = Math.abs(data[j] - pr) + Math.abs(data[j + 1] - pg) + Math.abs(data[j + 2] - pb);
      if (d <= umbral) meter(nx, ny);
    }
  }
  const fg = new Uint8Array(w * h);
  for (let i = 0; i < fg.length; i++) fg[i] = bg[i] ? 0 : 1;
  return fg;
}

function cajaValida(blob, w, h) {
  if (!blob) return false;
  const bw = blob.maxX - blob.minX + 1;
  const bh = blob.maxY - blob.minY + 1;
  const bboxA = (bw * bh) / (w * h);
  const aspect = bw / bh;
  const cx = w / 2;
  const cy = h / 2;
  if (blob.minX > cx || blob.maxX < cx || blob.minY > cy || blob.maxY < cy) return false;
  if (bboxA < 0.05 || bboxA > 0.82) return false;
  if (aspect < 0.32 || aspect > 3.2) return false;
  const margen = Math.min(blob.minX, blob.minY, w - 1 - blob.maxX, h - 1 - blob.maxY);
  if (margen < 4 && bboxA > 0.7) return false;
  return true;
}

function puntuarCaja(blob, w, h) {
  const bw = blob.maxX - blob.minX + 1;
  const bh = blob.maxY - blob.minY + 1;
  const bboxA = (bw * bh) / (w * h);
  const aspect = bw / bh;
  const areaScore = 1 - Math.min(1, Math.abs(bboxA - 0.24) / 0.4);
  const aspScore = 1 - Math.min(1, Math.abs(Math.log2(aspect)) / 2);
  const margen = Math.min(blob.minX, blob.minY, w - 1 - blob.maxX, h - 1 - blob.maxY);
  const tightness = 1 - Math.min(1, bboxA);
  return areaScore * 0.35 + aspScore * 0.3 + Math.min(margen / 20, 1) * 0.1 + tightness * 0.25;
}

function picoEn(arr, a, b) {
  let bestI = a;
  let bestV = -1;
  const i0 = Math.max(1, a);
  const i1 = Math.min(arr.length - 2, b);
  for (let i = i0; i <= i1; i++) {
    if (arr[i] > bestV) {
      bestV = arr[i];
      bestI = i;
    }
  }
  return bestI;
}

function suavizar(arr) {
  const o = new Float32Array(arr.length);
  for (let i = 1; i < arr.length - 1; i++) o[i] = arr[i - 1] + arr[i] * 2 + arr[i + 1];
  o[0] = arr[0];
  o[arr.length - 1] = arr[arr.length - 1];
  return o;
}

function bboxPorBordes(data, w, h) {
  const col = new Float32Array(w);
  const row = new Float32Array(h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const gx = lum(data, w, x + 1, y) - lum(data, w, x - 1, y);
      const gy = lum(data, w, x, y + 1) - lum(data, w, x, y - 1);
      col[x] += Math.abs(gx);
      row[y] += Math.abs(gy);
    }
  }
  const cs = suavizar(suavizar(col));
  const rs = suavizar(suavizar(row));
  const left = picoEn(cs, Math.floor(w * 0.03), Math.floor(w * 0.46));
  const right = picoEn(cs, Math.floor(w * 0.54), Math.floor(w * 0.97));
  const top = picoEn(rs, Math.floor(h * 0.03), Math.floor(h * 0.46));
  const bot = picoEn(rs, Math.floor(h * 0.54), Math.floor(h * 0.97));
  const blob = {
    minX: left,
    maxX: right,
    minY: top,
    maxY: bot,
    count: (right - left + 1) * (bot - top + 1),
  };
  return cajaValida(blob, w, h) ? blob : null;
}

function bboxPorCentro(data, w, h) {
  const fg = [];
  const bg = [];
  const inner = 0.2;
  const x0 = Math.floor(w * (0.5 - inner));
  const x1 = Math.floor(w * (0.5 + inner));
  const y0 = Math.floor(h * (0.5 - inner));
  const y1 = Math.floor(h * (0.5 + inner));
  const borde = Math.max(8, Math.floor(Math.min(w, h) * 0.1));
  for (let y = 0; y < h; y += 4) {
    for (let x = 0; x < w; x += 4) {
      const i = (y * w + x) * 4;
      const c = [data[i], data[i + 1], data[i + 2]];
      if (x < borde || y < borde || x >= w - borde || y >= h - borde) bg.push(c);
      else if (x >= x0 && x < x1 && y >= y0 && y < y1) fg.push(c);
    }
  }
  if (fg.length < 8 || bg.length < 8) return null;
  const minDist = (r, g, b, samples) => {
    let d = 1e9;
    for (let s = 0; s < samples.length; s++) {
      const t = Math.abs(r - samples[s][0]) + Math.abs(g - samples[s][1]) + Math.abs(b - samples[s][2]);
      if (t < d) d = t;
    }
    return d;
  };
  const mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const df = minDist(data[i], data[i + 1], data[i + 2], fg);
      const db = minDist(data[i], data[i + 1], data[i + 2], bg);
      if (df + 12 < db) mask[y * w + x] = 1;
    }
  }
  let m = dilatar(mask, w, h);
  m = erosionar(m, w, h);
  const blob = componenteMayor(m, w, h);
  return cajaValida(blob, w, h) ? blob : null;
}

function abrirMascara(m, w, h) {
  m = erosionar(m, w, h);
  m = erosionar(m, w, h);
  m = dilatar(m, w, h);
  m = dilatar(m, w, h);
  return m;
}

function encogerPorPerfil(mask, w, h, box) {
  let { minX, maxX, minY, maxY } = box;
  const colOcup = (x, y0, y1) => {
    let n = 0;
    for (let y = y0; y <= y1; y++) n += mask[y * w + x];
    return n / Math.max(1, y1 - y0 + 1);
  };
  const rowOcup = (y, x0, x1) => {
    let n = 0;
    for (let x = x0; x <= x1; x++) n += mask[y * w + x];
    return n / Math.max(1, x1 - x0 + 1);
  };
  const umbral = 0.4;
  while (maxX - minX > 20 && colOcup(minX, minY, maxY) < umbral) minX++;
  while (maxX - minX > 20 && colOcup(maxX, minY, maxY) < umbral) maxX--;
  while (maxY - minY > 20 && rowOcup(minY, minX, maxX) < umbral) minY++;
  while (maxY - minY > 20 && rowOcup(maxY, minX, maxX) < umbral) maxY--;
  return { minX, maxX, minY, maxY, count: (maxX - minX + 1) * (maxY - minY + 1) };
}

function bboxColorDelObjeto(data, w, h, blob) {
  const q = (v) => v >> 4;
  const key = (r, g, b) => (q(r) << 8) | (q(g) << 4) | q(b);
  const bg = new Set();
  for (let x = 0; x < w; x += 2) {
    for (const y of [0, 1, 2, h - 1, h - 2, h - 3]) {
      const i = (y * w + x) * 4;
      bg.add(key(data[i], data[i + 1], data[i + 2]));
    }
  }
  for (let y = 0; y < h; y += 2) {
    for (const x of [0, 1, 2, w - 1, w - 2, w - 3]) {
      const i = (y * w + x) * 4;
      bg.add(key(data[i], data[i + 1], data[i + 2]));
    }
  }
  const marginX = Math.max(2, Math.floor((blob.maxX - blob.minX) * 0.14));
  const marginY = Math.max(2, Math.floor((blob.maxY - blob.minY) * 0.14));
  const counts = new Map();
  for (let y = blob.minY + marginY; y <= blob.maxY - marginY; y++) {
    for (let x = blob.minX + marginX; x <= blob.maxX - marginX; x++) {
      const i = (y * w + x) * 4;
      const k = key(data[i], data[i + 1], data[i + 2]);
      if (bg.has(k)) continue;
      counts.set(k, (counts.get(k) || 0) + 1);
    }
  }
  let bestK = -1;
  let bestN = 0;
  counts.forEach((n, k) => {
    if (n > bestN) {
      bestN = n;
      bestK = k;
    }
  });
  if (bestK < 0 || bestN < 12) return null;
  const tr = ((bestK >> 8) & 15) * 16 + 8;
  const tg = ((bestK >> 4) & 15) * 16 + 8;
  const tb = (bestK & 15) * 16 + 8;
  let m = new Uint8Array(w * h);
  const x0 = Math.max(0, blob.minX - 6);
  const x1 = Math.min(w - 1, blob.maxX + 6);
  const y0 = Math.max(0, blob.minY - 6);
  const y1 = Math.min(h - 1, blob.maxY + 6);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = (y * w + x) * 4;
      const d = Math.abs(data[i] - tr) + Math.abs(data[i + 1] - tg) + Math.abs(data[i + 2] - tb);
      if (d < 58) m[y * w + x] = 1;
    }
  }
  m = dilatar(m, w, h);
  m = erosionar(m, w, h);
  const tight = componenteMayor(m, w, h);
  if (!cajaValida(tight, w, h)) return null;
  return { blob: encogerPorPerfil(m, w, h, tight), mask: m };
}

function colorInterior(data, w, h, box) {
  let R = 0,
    G = 0,
    B = 0,
    n = 0;
  const x0 = box.minX + Math.floor((box.maxX - box.minX) * 0.22);
  const x1 = box.maxX - Math.floor((box.maxX - box.minX) * 0.22);
  const y0 = box.minY + Math.floor((box.maxY - box.minY) * 0.22);
  const y1 = box.maxY - Math.floor((box.maxY - box.minY) * 0.22);
  for (let y = y0; y <= y1; y += 2) {
    for (let x = x0; x <= x1; x += 2) {
      const i = (y * w + x) * 4;
      R += data[i];
      G += data[i + 1];
      B += data[i + 2];
      n++;
    }
  }
  return { r: R / Math.max(1, n), g: G / Math.max(1, n), b: B / Math.max(1, n) };
}

function esColorObjeto(data, w, x, y, c, umbral) {
  const i = (y * w + x) * 4;
  return Math.abs(data[i] - c.r) + Math.abs(data[i + 1] - c.g) + Math.abs(data[i + 2] - c.b) < umbral;
}

function encogerPorColor(data, w, h, box) {
  const c = colorInterior(data, w, h, box);
  let { minX, maxX, minY, maxY } = box;
  const colOcup = (x, y0, y1) => {
    let n = 0;
    for (let y = y0; y <= y1; y++) if (esColorObjeto(data, w, x, y, c, 62)) n++;
    return n / Math.max(1, y1 - y0 + 1);
  };
  const rowOcup = (y, x0, x1) => {
    let n = 0;
    for (let x = x0; x <= x1; x++) if (esColorObjeto(data, w, x, y, c, 62)) n++;
    return n / Math.max(1, x1 - x0 + 1);
  };
  const umbral = 0.45;
  while (maxX - minX > 18 && colOcup(minX, minY, maxY) < umbral) minX++;
  while (maxX - minX > 18 && colOcup(maxX, minY, maxY) < umbral) maxX--;
  while (maxY - minY > 18 && rowOcup(minY, minX, maxX) < umbral) minY++;
  while (maxY - minY > 18 && rowOcup(maxY, minX, maxX) < umbral) maxY--;
  return { minX, maxX, minY, maxY, count: (maxX - minX + 1) * (maxY - minY + 1) };
}

function refinarBordes(data, w, h, box) {
  const bw = box.maxX - box.minX + 1;
  const bh = box.maxY - box.minY + 1;
  const padOutX = 1;
  const padInX = Math.max(8, Math.round(bw * 0.18));
  const padOutY = 1;
  const padInY = Math.max(8, Math.round(bh * 0.18));
  const mejorV = (x0, x1, y0, y1) => {
    let bestX = Math.round((x0 + x1) / 2);
    let best = -1;
    const xa = Math.max(1, Math.min(x0, x1));
    const xb = Math.min(w - 2, Math.max(x0, x1));
    const ya = Math.max(1, y0);
    const yb = Math.min(h - 2, y1);
    for (let x = xa; x <= xb; x++) {
      let s = 0;
      for (let y = ya; y <= yb; y++) s += Math.abs(lum(data, w, x + 1, y) - lum(data, w, x - 1, y));
      if (s > best) {
        best = s;
        bestX = x;
      }
    }
    return bestX;
  };
  const mejorH = (y0, y1, x0, x1) => {
    let bestY = Math.round((y0 + y1) / 2);
    let best = -1;
    const ya = Math.max(1, Math.min(y0, y1));
    const yb = Math.min(h - 2, Math.max(y0, y1));
    const xa = Math.max(1, x0);
    const xb = Math.min(w - 2, x1);
    for (let y = ya; y <= yb; y++) {
      let s = 0;
      for (let x = xa; x <= xb; x++) s += Math.abs(lum(data, w, x, y + 1) - lum(data, w, x, y - 1));
      if (s > best) {
        best = s;
        bestY = y;
      }
    }
    return bestY;
  };
  const left = mejorV(box.minX - padOutX, box.minX + padInX, box.minY, box.maxY);
  const right = mejorV(box.maxX - padInX, box.maxX + padOutX, box.minY, box.maxY);
  const top = mejorH(box.minY - padOutY, box.minY + padInY, box.minX, box.maxX);
  const bot = mejorH(box.maxY - padInY, box.maxY + padOutY, box.minX, box.maxX);
  if (right - left < 16 || bot - top < 16) return box;
  return { minX: left, maxX: right, minY: top, maxY: bot, count: (right - left + 1) * (bot - top + 1) };
}

function bboxObjeto(srcCanvas) {
  const tw = 256;
  const th = Math.max(140, Math.round((srcCanvas.height * tw) / srcCanvas.width));
  const small = document.createElement("canvas");
  small.width = tw;
  small.height = th;
  const sctx = small.getContext("2d", { willReadFrequently: true });
  sctx.drawImage(srcCanvas, 0, 0, tw, th);
  const crudo = sctx.getImageData(0, 0, tw, th).data;
  const data = blurCaja(crudo, tw, th, 1);
  const candidatos = [];
  for (const umbral of [18, 32, 48, 64, 88, 112, 140]) {
    let m = inundarFondo(data, tw, th, umbral);
    m = abrirMascara(m, tw, th);
    const blob = componenteMayor(m, tw, th);
    if (!cajaValida(blob, tw, th)) continue;
    candidatos.push(encogerPorPerfil(m, tw, th, blob));
    const color = bboxColorDelObjeto(crudo, tw, th, blob);
    if (color?.blob && cajaValida(color.blob, tw, th)) candidatos.push(color.blob);
  }
  const porBorde = bboxPorBordes(crudo, tw, th);
  if (porBorde) candidatos.push(porBorde);
  const porCentro = bboxPorCentro(data, tw, th);
  if (porCentro) candidatos.push(porCentro);
  if (!candidatos.length) return null;
  candidatos.sort((a, b) => puntuarCaja(b, tw, th) - puntuarCaja(a, tw, th));
  let best = refinarBordes(crudo, tw, th, candidatos[0]);
  if (!cajaValida(best, tw, th)) best = candidatos[0];
  best = encogerPorColor(crudo, tw, th, best);
  if (!cajaValida(best, tw, th)) best = candidatos[0];
  const x = Math.max(0, best.minX);
  const y = Math.max(0, best.minY);
  const x2 = Math.min(tw, best.maxX + 1);
  const y2 = Math.min(th, best.maxY + 1);
  return {
    x: (x / tw) * srcCanvas.width,
    y: (y / th) * srcCanvas.height,
    w: ((x2 - x) / tw) * srcCanvas.width,
    h: ((y2 - y) / th) * srcCanvas.height,
  };
}

function tamanoVistaCrop() {
  const stage = document.getElementById("crop-stage");
  const r = stage?.getBoundingClientRect();
  const css = Math.max(120, Math.round(r?.width || 320));
  const lado = Math.max(720, Math.round(css * (window.devicePixelRatio || 1)));
  return { css, lado };
}

function layoutVista(sw, sh) {
  const imgW = fotoBase.width;
  const imgH = fotoBase.height;
  const fit = Math.min(sw / imgW, sh / imgH);
  const scale = fit * cropZoom;
  return {
    sw,
    sh,
    imgW,
    imgH,
    scale,
    cx: sw / 2,
    cy: sh / 2,
    rot: (cropRot * Math.PI) / 180,
  };
}

function canvasToImage(sx, sy, sw = 100, sh = 100) {
  const v = layoutVista(sw, sh);
  let x = sx - v.cx;
  let y = sy - v.cy;
  const c = Math.cos(-v.rot);
  const s = Math.sin(-v.rot);
  const rx = x * c - y * s;
  const ry = x * s + y * c;
  return {
    x: rx / v.scale + v.imgW / 2 + cropPan.x,
    y: ry / v.scale + v.imgH / 2 + cropPan.y,
  };
}

function recorteVistaAImagen() {
  const pts = [
    canvasToImage(cropRect.x, cropRect.y),
    canvasToImage(cropRect.x + cropRect.w, cropRect.y),
    canvasToImage(cropRect.x, cropRect.y + cropRect.h),
    canvasToImage(cropRect.x + cropRect.w, cropRect.y + cropRect.h),
  ];
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

function dibujarVistaEn(ctx, sw, sh) {
  const v = layoutVista(sw, sh);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, sw, sh);
  ctx.translate(v.cx, v.cy);
  ctx.rotate(v.rot);
  ctx.scale(v.scale, v.scale);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(fotoBase, -v.imgW / 2 - cropPan.x, -v.imgH / 2 - cropPan.y);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

function pintarCropVista() {
  const view = document.getElementById("crop-view");
  if (!view || !fotoBase) return;
  const { lado } = tamanoVistaCrop();
  if (view.width !== lado || view.height !== lado) {
    view.width = lado;
    view.height = lado;
  }
  dibujarVistaEn(view.getContext("2d"), view.width, view.height);
  pintarCropBox();
}

function extraerRecorte() {
  if (!fotoBase) return null;
  const { lado } = tamanoVistaCrop();
  const hi = Math.max(lado, 1400);
  const tmp = document.createElement("canvas");
  tmp.width = hi;
  tmp.height = hi;
  dibujarVistaEn(tmp.getContext("2d"), hi, hi);
  const x = (cropRect.x / 100) * hi;
  const y = (cropRect.y / 100) * hi;
  const w = (cropRect.w / 100) * hi;
  const h = (cropRect.h / 100) * hi;
  const max = FOTO_LADO;
  const k = Math.min(max / Math.max(w, 1), max / Math.max(h, 1), 1);
  const dw = Math.max(8, Math.round(w * k));
  const dh = Math.max(8, Math.round(h * k));
  const canvas = document.getElementById("cam-canvas");
  canvas.width = dw;
  canvas.height = dh;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(tmp, x, y, w, h, 0, 0, dw, dh);
  return canvas;
}

function clampCrop(r) {
  const min = CROP_MIN;
  let { x, y, w, h } = r;
  w = Math.max(min, Math.min(100, w));
  h = Math.max(min, Math.min(100, h));
  if (cropAspect) {
    if (w / h > cropAspect) w = h * cropAspect;
    else h = w / cropAspect;
    if (w > 100) {
      w = 100;
      h = w / cropAspect;
    }
    if (h > 100) {
      h = 100;
      w = h * cropAspect;
    }
    w = Math.max(min, w);
    h = Math.max(min, h);
  }
  x = Math.max(0, Math.min(100 - w, x));
  y = Math.max(0, Math.min(100 - h, y));
  return { x, y, w, h };
}

function forzarAspecto(aspect) {
  cropAspect = aspect;
  const cx = cropRect.x + cropRect.w / 2;
  const cy = cropRect.y + cropRect.h / 2;
  if (aspect) {
    let w = cropRect.w;
    let h = w / aspect;
    if (h > cropRect.h) {
      h = cropRect.h;
      w = h * aspect;
    }
    cropRect = clampCrop({ x: cx - w / 2, y: cy - h / 2, w, h });
  } else {
    cropRect = clampCrop(cropRect);
  }
  pintarCropBox();
  marcarHerramienta();
}

function marcarHerramienta() {
  const ids = {
    "crop-libre": cropAspect === 0,
    "crop-1-1": cropAspect === 1,
    "crop-3-4": cropAspect === 3 / 4,
    "crop-4-3": cropAspect === 4 / 3,
    "crop-16-9": cropAspect === 16 / 9,
  };
  Object.entries(ids).forEach(([id, on]) => {
    document.getElementById(id)?.classList.toggle("on", on);
  });
  document.getElementById("crop-grid")?.classList.toggle("on", cropGrid);
  document.getElementById("crop-box")?.classList.toggle("con-guia", cropGrid);
}

function pintarCropBox() {
  const box = document.getElementById("crop-box");
  if (!box) return;
  box.style.left = `${cropRect.x}%`;
  box.style.top = `${cropRect.y}%`;
  box.style.width = `${cropRect.w}%`;
  box.style.height = `${cropRect.h}%`;
}

function mostrarFotoBase() {
  pintarCropVista();
}

function acercarVista(factor, cx = 50, cy = 50) {
  if (!fotoBase) return;
  const prev = canvasToImage(cx, cy);
  cropZoom = Math.max(0.5, Math.min(8, cropZoom * factor));
  const next = canvasToImage(cx, cy);
  cropPan.x += prev.x - next.x;
  cropPan.y += prev.y - next.y;
  pintarCropVista();
}

function girarVista(grados) {
  cropRot = (cropRot + grados) % 360;
  pintarCropVista();
}

function leerMemoriaCrop() {
  try {
    const m = JSON.parse(localStorage.getItem(CROP_MEM) || "null");
    if (!m || !m.n) return { n: 0, scaleX: 1, scaleY: 1 };
    return m;
  } catch (_) {
    return { n: 0, scaleX: 1, scaleY: 1 };
  }
}

function recordarAjusteCrop(autoRect, userRect) {
  if (!autoRect || !userRect || autoRect.w < 40 || autoRect.h < 40) return;
  const sx = userRect.w / autoRect.w;
  const sy = userRect.h / autoRect.h;
  if (sx < 0.5 || sx > 1.25 || sy < 0.5 || sy > 1.25) return;
  const m = leerMemoriaCrop();
  const ema = m.n < 3 ? 0.4 : 0.18;
  m.scaleX = m.n ? m.scaleX * (1 - ema) + sx * ema : sx;
  m.scaleY = m.n ? m.scaleY * (1 - ema) + sy * ema : sy;
  m.n = Math.min((m.n || 0) + 1, 50);
  try {
    localStorage.setItem(CROP_MEM, JSON.stringify(m));
  } catch (_) {
    /* private mode */
  }
}

function aplicarMemoriaCrop(rect) {
  const m = leerMemoriaCrop();
  if (m.n < 2) return rect;
  const sx = Math.min(1, Math.max(0.82, m.scaleX));
  const sy = Math.min(1, Math.max(0.82, m.scaleY));
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const w = rect.w * sx;
  const h = rect.h * sy;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

function rectImagenAVista(rect) {
  if (!fotoBase) return { x: 12, y: 12, w: 76, h: 76 };
  const v = layoutVista(1000, 1000);
  const c = Math.cos(v.rot);
  const s = Math.sin(v.rot);
  const toVista = (ix, iy) => {
    const x = (ix - v.imgW / 2 - cropPan.x) * v.scale;
    const y = (iy - v.imgH / 2 - cropPan.y) * v.scale;
    return { x: v.cx + x * c - y * s, y: v.cy + x * s + y * c };
  };
  const pts = [
    toVista(rect.x, rect.y),
    toVista(rect.x + rect.w, rect.y),
    toVista(rect.x, rect.y + rect.h),
    toVista(rect.x + rect.w, rect.y + rect.h),
  ];
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x = Math.min(...xs) / 10;
  const y = Math.min(...ys) / 10;
  const x2 = Math.max(...xs) / 10;
  const y2 = Math.max(...ys) / 10;
  return { x, y, w: x2 - x, h: y2 - y };
}

function sugerirCorte(canvas) {
  const caja = bboxObjeto(canvas);
  const area = canvas.width * canvas.height;
  const areaOk = caja && caja.w > 48 && caja.h > 48 && caja.w * caja.h < 0.82 * area;
  if (areaOk) {
    const rect = aplicarMemoriaCrop(caja);
    return { rect: rectImagenAVista(rect), auto: true, crudo: caja };
  }
  return { rect: { x: 10, y: 10, w: 80, h: 80 }, auto: false, crudo: null };
}

function aplicarAutoCorte() {
  if (!fotoBase) return;
  cropAspect = 0;
  const { rect, auto, crudo } = sugerirCorte(fotoBase);
  ultimoAutoRect = crudo || rect;
  cropRect = clampCrop(rect);
  pintarCropVista();
  marcarHerramienta();
  const msg = document.getElementById("cam-review-msg");
  if (msg) {
    msg.textContent = auto
      ? "Sugerencia automática. Mueve el recuadro, pellizca para zoom o gira la foto."
      : "No se aisló solo. Arrastra el recuadro o la foto para ajustar.";
  }
}

function puntoEnFoto(e) {
  const stage = document.getElementById("crop-stage");
  const r = stage.getBoundingClientRect();
  const t = e.touches ? e.touches[0] : e;
  return {
    x: ((t.clientX - r.left) / r.width) * 100,
    y: ((t.clientY - r.top) / r.height) * 100,
  };
}

function moverCrop(h, start, dx, dy) {
  let { x, y, w, ht } = { x: start.x, y: start.y, w: start.w, ht: start.h };
  if (h === "move") {
    x = start.x + dx;
    y = start.y + dy;
    return clampCrop({ x, y, w, h: ht });
  }
  if (h.includes("e")) w = start.w + dx;
  if (h.includes("s")) ht = start.h + dy;
  if (h.includes("w")) {
    x = start.x + dx;
    w = start.w - dx;
  }
  if (h.includes("n")) {
    y = start.y + dy;
    ht = start.h - dy;
  }
  if (w < CROP_MIN) {
    if (h.includes("w")) x = start.x + start.w - CROP_MIN;
    w = CROP_MIN;
  }
  if (ht < CROP_MIN) {
    if (h.includes("n")) y = start.y + start.h - CROP_MIN;
    ht = CROP_MIN;
  }
  if (cropAspect) {
    if (h === "n" || h === "s") w = ht * cropAspect;
    else if (h === "e" || h === "w") ht = w / cropAspect;
    else {
      ht = w / cropAspect;
      if (h.includes("n")) y = start.y + start.h - ht;
      if (h.includes("w")) x = start.x + start.w - w;
    }
  }
  return clampCrop({ x, y, w, h: ht });
}

function capturarCuadro() {
  const map = mapaVideoCover();
  if (!map.vw) return null;
  const vista = rectEnVideo(map.vRect, map);
  const ladoVista = Math.min(vista.sw, vista.sh);
  const tmp = document.createElement("canvas");
  tmp.width = FOTO_LADO;
  tmp.height = FOTO_LADO;
  tmp.getContext("2d").drawImage(
    map.video,
    vista.sx + (vista.sw - ladoVista) / 2,
    vista.sy + (vista.sh - ladoVista) / 2,
    ladoVista,
    ladoVista,
    0,
    0,
    FOTO_LADO,
    FOTO_LADO
  );
  return tmp;
}

function archivoAFotoBase(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(img.src);
      const max = 1600;
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.width * scale));
      c.height = Math.max(1, Math.round(img.height * scale));
      const ctx = c.getContext("2d");
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(img, 0, 0, c.width, c.height);
      resolve(c);
    };
    img.onerror = () => reject(new Error("No se pudo leer la imagen"));
    img.src = URL.createObjectURL(file);
  });
}

function entrarRevision(canvas) {
  fotoBase = canvas;
  pendiente = true;
  resetVistaCrop();
  let sugerido;
  try {
    sugerido = sugerirCorte(canvas);
  } catch (_) {
    sugerido = { rect: { x: 10, y: 10, w: 80, h: 80 }, auto: false, crudo: null };
  }
  ultimoAutoRect = sugerido.crudo || sugerido.rect;
  cropAspect = 0;
  cropRect = clampCrop(sugerido.rect);
  mostrarFotoBase();
  marcarHerramienta();
  const msg = document.getElementById("cam-review-msg");
  if (msg) {
    msg.textContent = sugerido.auto
      ? "Arrastra el recuadro, mueve la foto, pellizca o gira. Las flechas afinan el corte."
      : "Mueve el recuadro o la foto. Usa +/− para acercar y ↺↻ para girar.";
  }
  modoRevision(true);
}

function canvasABlob(canvas) {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", 0.92));
}

function aplicarFoto(blob) {
  const angulo = colaAngulos[indiceCola];
  const file = new File([blob], `${angulo}.jpg`, { type: "image/jpeg" });
  const input = inputUnico || fileInputDe(formDestino, angulo);
  guardarFotoLocal(formDestino, angulo, file);
  if (input) {
    ponerArchivo(input, file);
    previewEnSlot(input, URL.createObjectURL(blob));
  }
  if (formDestino && typeof pintarProgreso === "function") pintarProgreso(formDestino);
}

function cablearEstudio() {
  const modal = document.getElementById("estudio");
  if (!modal || modal.dataset.ready) return;
  modal.dataset.ready = "1";
  const stage = document.getElementById("crop-stage");
  const box = document.getElementById("crop-box");
  const distanciaPunteros = () => {
    const pts = [...cropPointers.values()];
    if (pts.length < 2) return 0;
    const dx = pts[0].x - pts[1].x;
    const dy = pts[0].y - pts[1].y;
    return Math.hypot(dx, dy);
  };
  const centroPunteros = () => {
    const pts = [...cropPointers.values()];
    return { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
  };
  const onMove = (e) => {
    if (!fotoBase) return;
    if (cropPointers.has(e.pointerId)) cropPointers.set(e.pointerId, puntoEnFoto(e));
    if (cropPointers.size >= 2 && cropDrag?.tipo === "pinch") {
      e.preventDefault();
      const dist = distanciaPunteros();
      if (cropDrag.dist > 8 && dist > 8) {
        const c = centroPunteros();
        acercarVista(dist / cropDrag.dist, c.x, c.y);
        cropDrag.dist = dist;
      }
      return;
    }
    if (!cropDrag) return;
    e.preventDefault();
    const p = puntoEnFoto(e);
    if (cropDrag.tipo === "pan") {
      const v = layoutVista(100, 100);
      const dx = p.x - cropDrag.x;
      const dy = p.y - cropDrag.y;
      const c = Math.cos(-v.rot);
      const s = Math.sin(-v.rot);
      const ix = dx / v.scale;
      const iy = dy / v.scale;
      cropPan.x -= ix * c - iy * s;
      cropPan.y -= ix * s + iy * c;
      cropDrag.x = p.x;
      cropDrag.y = p.y;
      pintarCropVista();
      return;
    }
    cropRect = moverCrop(cropDrag.h, cropDrag.start, p.x - cropDrag.x, p.y - cropDrag.y);
    pintarCropBox();
  };
  const onUp = (e) => {
    cropPointers.delete(e.pointerId);
    if (cropPointers.size < 2 && cropDrag?.tipo === "pinch") cropDrag = null;
    if (!cropPointers.size) {
      cropDrag = null;
      stage?.classList.remove("is-drag");
    }
  };
  stage?.addEventListener("pointerdown", (e) => {
    if (!fotoBase) return;
    const p = puntoEnFoto(e);
    cropPointers.set(e.pointerId, p);
    if (cropPointers.size >= 2) {
      cropDrag = { tipo: "pinch", dist: distanciaPunteros() };
      e.preventDefault();
      return;
    }
    const h = e.target.dataset.h || (e.target === box || box.contains(e.target) ? "move" : "pan");
    cropDrag = { tipo: h === "pan" ? "pan" : "box", h, x: p.x, y: p.y, start: { ...cropRect } };
    stage.classList.add("is-drag");
    e.preventDefault();
  });
  stage?.addEventListener("pointermove", onMove);
  stage?.addEventListener("pointerup", onUp);
  stage?.addEventListener("pointercancel", onUp);
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onUp);
  stage?.addEventListener(
    "wheel",
    (e) => {
      if (!fotoBase) return;
      e.preventDefault();
      const p = puntoEnFoto(e);
      acercarVista(e.deltaY < 0 ? 1.12 : 1 / 1.12, p.x, p.y);
    },
    { passive: false }
  );
  document.getElementById("crop-auto")?.addEventListener("click", aplicarAutoCorte);
  document.getElementById("crop-1-1")?.addEventListener("click", () => forzarAspecto(1));
  document.getElementById("crop-3-4")?.addEventListener("click", () => forzarAspecto(3 / 4));
  document.getElementById("crop-4-3")?.addEventListener("click", () => forzarAspecto(4 / 3));
  document.getElementById("crop-16-9")?.addEventListener("click", () => forzarAspecto(16 / 9));
  document.getElementById("crop-libre")?.addEventListener("click", () => forzarAspecto(0));
  document.getElementById("crop-todo")?.addEventListener("click", () => {
    cropAspect = 0;
    cropRect = { x: 0, y: 0, w: 100, h: 100 };
    pintarCropBox();
    marcarHerramienta();
  });
  document.getElementById("crop-menos")?.addEventListener("click", () => acercarVista(1 / 1.2));
  document.getElementById("crop-mas")?.addEventListener("click", () => acercarVista(1.2));
  document.getElementById("crop-rot-izq")?.addEventListener("click", () => girarVista(-15));
  document.getElementById("crop-rot-der")?.addEventListener("click", () => girarVista(15));
  document.getElementById("crop-reset")?.addEventListener("click", () => {
    resetVistaCrop();
    pintarCropVista();
  });
  document.getElementById("crop-grid")?.addEventListener("click", () => {
    cropGrid = !cropGrid;
    marcarHerramienta();
  });
  window.addEventListener("keydown", (e) => {
    if (!fotoBase || !pendiente) return;
    const paso = e.shiftKey ? 2.4 : 0.6;
    if (e.key === "ArrowLeft") {
      cropRect = clampCrop({ ...cropRect, x: cropRect.x - paso });
    } else if (e.key === "ArrowRight") {
      cropRect = clampCrop({ ...cropRect, x: cropRect.x + paso });
    } else if (e.key === "ArrowUp") {
      cropRect = clampCrop({ ...cropRect, y: cropRect.y - paso });
    } else if (e.key === "ArrowDown") {
      cropRect = clampCrop({ ...cropRect, y: cropRect.y + paso });
    } else if (e.key === "+" || e.key === "=") {
      acercarVista(1.12);
      return;
    } else if (e.key === "-" || e.key === "_") {
      acercarVista(1 / 1.12);
      return;
    } else return;
    e.preventDefault();
    pintarCropBox();
  });
  new ResizeObserver(() => {
    if (fotoBase) pintarCropVista();
  }).observe(stage || document.body);
  document.getElementById("cam-capturar").addEventListener("click", async () => {
    const btn = document.getElementById("cam-capturar");
    btn.disabled = true;
    try {
      origenToma = "camara";
      await abrirCamara();
      await esperarVideo(document.getElementById("cam-video"));
      const cuadro = capturarCuadro();
      if (!cuadro) throw new Error("Aún no hay imagen de la cámara");
      entrarRevision(cuadro);
    } catch (err) {
      alert(err.message || "No se pudo tomar la foto. Prueba Subir.");
    } finally {
      btn.disabled = false;
    }
  });
  document.getElementById("cam-subir")?.addEventListener("click", () => {
    origenToma = "archivo";
    pedirGaleria();
  });
  document.getElementById("cam-pick")?.addEventListener("change", async () => {
    const file = document.getElementById("cam-pick")?.files?.[0];
    if (!file) return;
    try {
      origenToma = "archivo";
      const cuadro = await archivoAFotoBase(file);
      entrarRevision(cuadro);
    } catch (err) {
      alert(err.message || "No se pudo abrir esa foto.");
    }
  });
  document.getElementById("cam-usar").addEventListener("click", async () => {
    if (!fotoBase || !pendiente) return;
    const canvas = extraerRecorte();
    const blob = await canvasABlob(canvas);
    if (!blob || blob.size < 100) {
      alert("El recorte salió vacío.");
      return;
    }
    recordarAjusteCrop(ultimoAutoRect, recorteVistaAImagen());
    aplicarFoto(blob);
    pendiente = null;
    fotoBase = null;
    indiceCola += 1;
    inputUnico = null;
    modoRevision(false);
    await siguienteAngulo();
  });
  document.getElementById("cam-repetir").addEventListener("click", () => {
    pendiente = null;
    fotoBase = null;
    cropDrag = null;
    modoRevision(false);
    if (origenToma === "archivo" && !streamActual) pedirGaleria();
  });
  document.getElementById("cam-saltar").addEventListener("click", async () => {
    pendiente = null;
    indiceCola += 1;
    inputUnico = null;
    modoRevision(false);
    await siguienteAngulo();
  });
  document.getElementById("cam-cerrar").addEventListener("click", () => {
    modal.hidden = true;
    modoRevision(false);
    cerrarCamara();
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", cablearEstudio);
} else {
  cablearEstudio();
}
