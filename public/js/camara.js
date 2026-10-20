const GUIAS = {
  frente: "Coloca el artículo de frente y llena el recuadro. Luego verás el recorte para confirmarlo.",
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

function recortarAlMarco() {
  const video = document.getElementById("cam-video");
  const frame = document.getElementById("cam-frame");
  const canvas = document.getElementById("cam-canvas");
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return null;
  const vRect = video.getBoundingClientRect();
  const fRect = frame.getBoundingClientRect();
  const scale = Math.max(vRect.width / vw, vRect.height / vh);
  const extraX = (vw * scale - vRect.width) / 2;
  const extraY = (vh * scale - vRect.height) / 2;
  let sx = (fRect.left - vRect.left + extraX) / scale;
  let sy = (fRect.top - vRect.top + extraY) / scale;
  let sw = fRect.width / scale;
  let sh = fRect.height / scale;
  sx = Math.max(0, Math.min(vw - 2, sx));
  sy = Math.max(0, Math.min(vh - 2, sy));
  sw = Math.max(2, Math.min(vw - sx, sw));
  sh = Math.max(2, Math.min(vh - sy, sh));
  const lado = Math.min(sw, sh);
  sx += (sw - lado) / 2;
  sy += (sh - lado) / 2;
  const out = 1024;
  canvas.width = out;
  canvas.height = out;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(video, sx, sy, lado, lado, 0, 0, out, out);
  return canvas;
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
      const canvas = recortarAlMarco();
      if (!canvas) throw new Error("Aún no hay imagen de la cámara");
      const blob = await canvasABlob(canvas);
      if (!blob || blob.size < 100) throw new Error("La captura salió vacía");
      pendiente = blob;
      const img = document.getElementById("cam-preview");
      img.src = URL.createObjectURL(blob);
      img.classList.toggle("redonda", document.getElementById("cam-frame").dataset.angulo === "arriba" || document.getElementById("cam-frame").dataset.angulo === "abajo");
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
