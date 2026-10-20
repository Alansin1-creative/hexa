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
}

function modoRevision(on) {
  const review = document.getElementById("cam-review");
  const live = document.getElementById("cam-acciones-live");
  const revAcc = document.getElementById("cam-acciones-review");
  const msg = document.getElementById("cam-review-msg");
  const video = document.getElementById("cam-video");
  const frame = document.getElementById("cam-frame");
  if (review) review.hidden = !on;
  if (live) live.hidden = on;
  if (revAcc) revAcc.hidden = !on;
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

function promedioParche(data, w, h, cx, cy, r) {
  let R = 0,
    G = 0,
    B = 0,
    n = 0;
  const x0 = Math.max(0, cx - r);
  const y0 = Math.max(0, cy - r);
  const x1 = Math.min(w - 1, cx + r);
  const y1 = Math.min(h - 1, cy + r);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = (y * w + x) * 4;
      R += data[i];
      G += data[i + 1];
      B += data[i + 2];
      n++;
    }
  }
  return { r: R / n, g: G / n, b: B / n };
}

function distColor(r, g, b, p) {
  return Math.abs(r - p.r) + Math.abs(g - p.g) + Math.abs(b - p.b);
}

function dilatar(mask, w, h) {
  const out = new Uint8Array(mask.length);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (
        mask[i] ||
        mask[i - 1] ||
        mask[i + 1] ||
        mask[i - w] ||
        mask[i + w]
      ) {
        out[i] = 1;
      }
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

function bboxObjeto(srcCanvas) {
  const tw = 300;
  const th = Math.max(120, Math.round((srcCanvas.height * tw) / srcCanvas.width));
  const small = document.createElement("canvas");
  small.width = tw;
  small.height = th;
  const sctx = small.getContext("2d", { willReadFrequently: true });
  sctx.drawImage(srcCanvas, 0, 0, tw, th);
  const { data } = sctx.getImageData(0, 0, tw, th);
  const fondos = [
    promedioParche(data, tw, th, 10, 10, 8),
    promedioParche(data, tw, th, tw - 11, 10, 8),
    promedioParche(data, tw, th, 10, th - 11, 8),
    promedioParche(data, tw, th, tw - 11, th - 11, 8),
    promedioParche(data, tw, th, (tw / 2) | 0, 8, 6),
    promedioParche(data, tw, th, (tw / 2) | 0, th - 9, 6),
  ];
  const mask = new Uint8Array(tw * th);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const r = data[i],
      g = data[i + 1],
      b = data[i + 2];
    let dmin = 1e9;
    for (const f of fondos) dmin = Math.min(dmin, distColor(r, g, b, f));
    if (dmin > 48) mask[p] = 1;
  }
  let m = dilatar(mask, tw, th);
  m = dilatar(m, tw, th);
  m = erosionar(m, tw, th);
  m = erosionar(m, tw, th);
  const blob = componenteMayor(m, tw, th);
  if (!blob) return null;
  const area = blob.count / (tw * th);
  const bw = blob.maxX - blob.minX + 1;
  const bh = blob.maxY - blob.minY + 1;
  const aspect = bw / bh;
  if (area < 0.04 || area > 0.92) return null;
  if (aspect < 0.35 || aspect > 2.8) return null;
  const padX = Math.max(4, bw * 0.04);
  const padY = Math.max(4, bh * 0.04);
  const x = Math.max(0, blob.minX - padX);
  const y = Math.max(0, blob.minY - padY);
  const x2 = Math.min(tw, blob.maxX + 1 + padX);
  const y2 = Math.min(th, blob.maxY + 1 + padY);
  return {
    x: (x / tw) * srcCanvas.width,
    y: (y / th) * srcCanvas.height,
    w: ((x2 - x) / tw) * srcCanvas.width,
    h: ((y2 - y) / th) * srcCanvas.height,
  };
}

function letterboxCuadrado(src, x, y, w, h) {
  const out = 1024;
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

function capturarYRecortarObjeto() {
  const map = mapaVideoCover();
  if (!map.vw) return null;
  const vista = rectEnVideo(map.vRect, map);
  const ladoVista = Math.min(vista.sw, vista.sh);
  const tmp = document.createElement("canvas");
  tmp.width = 1024;
  tmp.height = 1024;
  tmp.getContext("2d").drawImage(
    map.video,
    vista.sx + (vista.sw - ladoVista) / 2,
    vista.sy + (vista.sh - ladoVista) / 2,
    ladoVista,
    ladoVista,
    0,
    0,
    1024,
    1024
  );
  const caja = bboxObjeto(tmp);
  if (caja && caja.w > 40 && caja.h > 40) {
    return letterboxCuadrado(tmp, caja.x, caja.y, caja.w, caja.h);
  }
  const frame = document.getElementById("cam-frame");
  const f = rectEnVideo(frame.getBoundingClientRect(), map);
  const lado = Math.min(f.sw, f.sh);
  return copiarVideoRect(f.sx + (f.sw - lado) / 2, f.sy + (f.sh - lado) / 2, lado, lado, 1024, 1024);
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
  document.getElementById("cam-capturar").addEventListener("click", async () => {
    const btn = document.getElementById("cam-capturar");
    btn.disabled = true;
    try {
      await esperarVideo(document.getElementById("cam-video"));
      const canvas = capturarYRecortarObjeto();
      if (!canvas) throw new Error("Aún no hay imagen de la cámara");
      const blob = await canvasABlob(canvas);
      if (!blob || blob.size < 100) throw new Error("La captura salió vacía");
      pendiente = blob;
      const img = document.getElementById("cam-preview");
      img.src = URL.createObjectURL(blob);
      img.classList.remove("redonda");
      const msg = document.getElementById("cam-review-msg");
      if (msg) msg.textContent = "Objeto recortado. Si el corte está bien, confírmalo; si no, repite la toma.";
      modoRevision(true);
    } catch (err) {
      alert(err.message || "No se pudo tomar la foto.");
    } finally {
      btn.disabled = false;
    }
  });
  document.getElementById("cam-usar").addEventListener("click", async () => {
    if (!pendiente) return;
    aplicarFoto(pendiente);
    pendiente = null;
    indiceCola += 1;
    inputUnico = null;
    modoRevision(false);
    await siguienteAngulo();
  });
  document.getElementById("cam-repetir").addEventListener("click", () => {
    if (document.getElementById("cam-preview")?.src) {
      URL.revokeObjectURL(document.getElementById("cam-preview").src);
    }
    pendiente = null;
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
