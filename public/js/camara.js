const GUIAS = {
  frente: "Centra el objeto (caja, libro, empaque). Al capturar se recorta solo la figura y te pedimos confirmar.",
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
let cropRect = { x: 80, y: 80, w: 864, h: 864 };
let cropAspect = 0;
let cropDrag = null;
const FOTO_LADO = 1024;

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

async function iniciarEstudio({ form, angulos, input }) {
  formDestino = form || input?.closest("form");
  inputUnico = input || null;
  colaAngulos = angulos;
  indiceCola = 0;
  pendiente = null;
  try {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Este navegador no permite cámara");
    }
    await abrirCamara();
    await siguienteAngulo();
  } catch (err) {
    alert(err.message || "No se pudo abrir la cámara. Revisa el permiso (el navegador lo pide) o sube las fotos desde archivos.");
    document.getElementById("estudio").hidden = true;
    cerrarCamara();
  }
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
  const areaScore = 1 - Math.min(1, Math.abs(bboxA - 0.36) / 0.36);
  const aspScore = 1 - Math.min(1, Math.abs(Math.log2(aspect)) / 2);
  const margen = Math.min(blob.minX, blob.minY, w - 1 - blob.maxX, h - 1 - blob.maxY);
  return areaScore * 0.5 + aspScore * 0.35 + Math.min(margen / 24, 1) * 0.15;
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

function refinarBordes(data, w, h, box) {
  const padX = Math.max(8, Math.round((box.maxX - box.minX) * 0.14));
  const padY = Math.max(8, Math.round((box.maxY - box.minY) * 0.14));
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
  const left = mejorV(box.minX - padX, box.minX + padX, box.minY, box.maxY);
  const right = mejorV(box.maxX - padX, box.maxX + padX, box.minY, box.maxY);
  const top = mejorH(box.minY - padY, box.minY + padY, box.minX, box.maxX);
  const bot = mejorH(box.maxY - padY, box.maxY + padY, box.minX, box.maxX);
  if (right - left < 16 || bot - top < 16) return box;
  return { minX: left, maxX: right, minY: top, maxY: bot, count: (right - left + 1) * (bot - top + 1) };
}

function bboxObjeto(srcCanvas) {
  const tw = 240;
  const th = Math.max(140, Math.round((srcCanvas.height * tw) / srcCanvas.width));
  const small = document.createElement("canvas");
  small.width = tw;
  small.height = th;
  const sctx = small.getContext("2d", { willReadFrequently: true });
  sctx.drawImage(srcCanvas, 0, 0, tw, th);
  const crudo = sctx.getImageData(0, 0, tw, th).data;
  const data = blurCaja(crudo, tw, th, 2);
  const candidatos = [];
  for (const umbral of [16, 28, 42, 58, 78, 104, 132]) {
    let m = inundarFondo(data, tw, th, umbral);
    m = dilatar(m, tw, th);
    m = erosionar(m, tw, th);
    const blob = componenteMayor(m, tw, th);
    if (cajaValida(blob, tw, th)) candidatos.push(blob);
  }
  const porBorde = bboxPorBordes(data, tw, th);
  if (porBorde) candidatos.push(porBorde);
  const porCentro = bboxPorCentro(data, tw, th);
  if (porCentro) candidatos.push(porCentro);
  if (!candidatos.length) return null;
  candidatos.sort((a, b) => puntuarCaja(b, tw, th) - puntuarCaja(a, tw, th));
  let best = refinarBordes(data, tw, th, candidatos[0]);
  if (!cajaValida(best, tw, th)) best = candidatos[0];
  const bw = best.maxX - best.minX + 1;
  const bh = best.maxY - best.minY + 1;
  const padX = Math.max(3, bw * 0.025);
  const padY = Math.max(3, bh * 0.025);
  const x = Math.max(0, best.minX - padX);
  const y = Math.max(0, best.minY - padY);
  const x2 = Math.min(tw, best.maxX + 1 + padX);
  const y2 = Math.min(th, best.maxY + 1 + padY);
  return {
    x: (x / tw) * srcCanvas.width,
    y: (y / th) * srcCanvas.height,
    w: ((x2 - x) / tw) * srcCanvas.width,
    h: ((y2 - y) / th) * srcCanvas.height,
  };
}

function letterboxCuadrado(src, x, y, w, h) {
  const out = FOTO_LADO;
  const canvas = document.getElementById("cam-canvas");
  canvas.width = out;
  canvas.height = out;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, out, out);
  const scale = Math.min(out / w, out / h);
  const dw = w * scale;
  const dh = h * scale;
  const dx = (out - dw) / 2;
  const dy = (out - dh) / 2;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(src, x, y, w, h, dx, dy, dw, dh);
  return canvas;
}

function clampCrop(r) {
  const S = FOTO_LADO;
  const min = 48;
  let { x, y, w, h } = r;
  w = Math.max(min, Math.min(S, w));
  h = Math.max(min, Math.min(S, h));
  if (cropAspect) {
    if (w / h > cropAspect) w = h * cropAspect;
    else h = w / cropAspect;
    if (w > S) {
      w = S;
      h = w / cropAspect;
    }
    if (h > S) {
      h = S;
      w = h * cropAspect;
    }
    w = Math.max(min, w);
    h = Math.max(min, h);
  }
  x = Math.max(0, Math.min(S - w, x));
  y = Math.max(0, Math.min(S - h, y));
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
    "crop-4-3": cropAspect === 4 / 3,
  };
  Object.entries(ids).forEach(([id, on]) => {
    document.getElementById(id)?.classList.toggle("on", on);
  });
}

function pintarCropBox() {
  const box = document.getElementById("crop-box");
  if (!box) return;
  const p = (n) => `${(n / FOTO_LADO) * 100}%`;
  box.style.left = p(cropRect.x);
  box.style.top = p(cropRect.y);
  box.style.width = p(cropRect.w);
  box.style.height = p(cropRect.h);
}

function mostrarFotoBase() {
  const view = document.getElementById("crop-view");
  if (!view || !fotoBase) return;
  view.width = FOTO_LADO;
  view.height = FOTO_LADO;
  view.getContext("2d").drawImage(fotoBase, 0, 0);
  pintarCropBox();
}

function sugerirCorte(canvas) {
  const caja = bboxObjeto(canvas);
  const areaOk = caja && caja.w > 48 && caja.h > 48 && caja.w * caja.h < 0.82 * FOTO_LADO * FOTO_LADO;
  if (areaOk) return { rect: caja, auto: true };
  return { rect: { x: 72, y: 72, w: 880, h: 880 }, auto: false };
}

function aplicarAutoCorte() {
  if (!fotoBase) return;
  cropAspect = 0;
  const { rect, auto } = sugerirCorte(fotoBase);
  cropRect = clampCrop(rect);
  pintarCropBox();
  marcarHerramienta();
  const msg = document.getElementById("cam-review-msg");
  if (msg) {
    msg.textContent = auto
      ? "Sugerencia automática. Arrastra las esquinas para ajustar."
      : "No se aisló solo. Ajusta el recuadro a mano.";
  }
}

function puntoEnFoto(e) {
  const stage = document.getElementById("crop-stage");
  const r = stage.getBoundingClientRect();
  const t = e.touches ? e.touches[0] : e;
  return {
    x: ((t.clientX - r.left) / r.width) * FOTO_LADO,
    y: ((t.clientY - r.top) / r.height) * FOTO_LADO,
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
  if (w < 48) {
    if (h.includes("w")) x = start.x + start.w - 48;
    w = 48;
  }
  if (ht < 48) {
    if (h.includes("n")) y = start.y + start.h - 48;
    ht = 48;
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

function canvasABlob(canvas) {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", 0.92));
}

function aplicarFoto(blob) {
  const angulo = colaAngulos[indiceCola];
  const file = new File([blob], `${angulo}.jpg`, { type: "image/jpeg" });
  const input = inputUnico || fileInputDe(formDestino, angulo);
  if (input) {
    ponerArchivo(input, file);
    previewEnSlot(input, URL.createObjectURL(blob));
  } else {
    guardarFotoLocal(formDestino, angulo, file);
  }
}

function cablearEstudio() {
  const modal = document.getElementById("estudio");
  if (!modal || modal.dataset.ready) return;
  modal.dataset.ready = "1";
  const stage = document.getElementById("crop-stage");
  const box = document.getElementById("crop-box");
  const onMove = (e) => {
    if (!cropDrag) return;
    e.preventDefault();
    const p = puntoEnFoto(e);
    cropRect = moverCrop(cropDrag.h, cropDrag.start, p.x - cropDrag.x, p.y - cropDrag.y);
    pintarCropBox();
  };
  const onUp = () => {
    cropDrag = null;
  };
  stage?.addEventListener("pointerdown", (e) => {
    if (!fotoBase) return;
    const h = e.target.dataset.h || (e.target === box || box.contains(e.target) ? "move" : "");
    if (!h) return;
    const p = puntoEnFoto(e);
    cropDrag = { h, x: p.x, y: p.y, start: { ...cropRect } };
    stage.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  });
  stage?.addEventListener("pointermove", onMove);
  stage?.addEventListener("pointerup", onUp);
  stage?.addEventListener("pointercancel", onUp);
  document.getElementById("crop-auto")?.addEventListener("click", aplicarAutoCorte);
  document.getElementById("crop-1-1")?.addEventListener("click", () => forzarAspecto(1));
  document.getElementById("crop-4-3")?.addEventListener("click", () => forzarAspecto(4 / 3));
  document.getElementById("crop-libre")?.addEventListener("click", () => forzarAspecto(0));
  document.getElementById("crop-todo")?.addEventListener("click", () => {
    cropAspect = 0;
    cropRect = { x: 0, y: 0, w: FOTO_LADO, h: FOTO_LADO };
    pintarCropBox();
    marcarHerramienta();
  });
  document.getElementById("cam-capturar").addEventListener("click", async () => {
    const btn = document.getElementById("cam-capturar");
    btn.disabled = true;
    try {
      await esperarVideo(document.getElementById("cam-video"));
      const cuadro = capturarCuadro();
      if (!cuadro) throw new Error("Aún no hay imagen de la cámara");
      fotoBase = cuadro;
      pendiente = true;
      const sugerido = sugerirCorte(cuadro);
      cropAspect = 0;
      cropRect = clampCrop(sugerido.rect);
      mostrarFotoBase();
      marcarHerramienta();
      const msg = document.getElementById("cam-review-msg");
      if (msg) {
        msg.textContent = sugerido.auto
          ? "Ajusta el recuadro (esquinas o Auto / 1:1) y confirma el recorte."
          : "Mueve y estira el recuadro hasta cubrir solo el objeto.";
      }
      modoRevision(true);
    } catch (err) {
      alert(err.message || "No se pudo tomar la foto.");
    } finally {
      btn.disabled = false;
    }
  });
  document.getElementById("cam-usar").addEventListener("click", async () => {
    if (!fotoBase || !pendiente) return;
    const canvas = letterboxCuadrado(fotoBase, cropRect.x, cropRect.y, cropRect.w, cropRect.h);
    const blob = await canvasABlob(canvas);
    if (!blob || blob.size < 100) {
      alert("El recorte salió vacío.");
      return;
    }
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
