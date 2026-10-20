const GUIAS = {
  frente: "Coloca el artículo de frente, a la altura de la cámara, y llena el recuadro.",
  detras: "Gíralo 180°. Ahora debe verse la parte de atrás.",
  izquierda: "Gíralo a la izquierda. El costado izquierdo debe llenar el recuadro.",
  derecha: "Gíralo a la derecha. El costado derecho debe llenar el recuadro.",
  arriba: "Toma la foto desde arriba, mirando la tapa o la parte superior.",
  abajo: "Toma la foto desde abajo, mirando la base del artículo.",
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

function fileInputDe(form, angulo) {
  return form?.querySelector(`input[name="${angulo}"]`);
}

function ponerArchivo(input, file) {
  const dt = new DataTransfer();
  dt.items.add(file);
  input.files = dt.files;
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
  if (streamActual) return streamActual;
  streamActual = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 1280 } },
    audio: false,
  });
  const video = document.getElementById("cam-video");
  video.srcObject = streamActual;
  await video.play();
  return streamActual;
}

function cerrarCamara() {
  streamActual?.getTracks().forEach((t) => t.stop());
  streamActual = null;
  const video = document.getElementById("cam-video");
  if (video) video.srcObject = null;
}

function mostrarEstudio(angulo, pasoTexto) {
  const modal = document.getElementById("estudio");
  document.getElementById("estudio-titulo").textContent = LABELS[angulo] || angulo;
  document.getElementById("estudio-guia").textContent = GUIAS[angulo] || "";
  document.getElementById("estudio-paso").textContent = pasoTexto;
  document.getElementById("cam-frame").dataset.angulo = angulo;
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
  try {
    await abrirCamara();
    await siguienteAngulo();
  } catch (err) {
    alert("No se pudo abrir la cámara. Revisa el permiso o sube las fotos desde archivos.");
    document.getElementById("estudio").hidden = true;
    cerrarCamara();
  }
}

function capturarFrame() {
  const video = document.getElementById("cam-video");
  const canvas = document.getElementById("cam-canvas");
  const w = video.videoWidth || 640;
  const h = video.videoHeight || 640;
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d").drawImage(video, 0, 0, w, h);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
}

function cablearEstudio() {
  const modal = document.getElementById("estudio");
  if (!modal || modal.dataset.ready) return;
  modal.dataset.ready = "1";
  document.getElementById("cam-capturar").addEventListener("click", async () => {
    const blob = await capturarFrame();
    if (!blob) return;
    const angulo = colaAngulos[indiceCola];
    const file = new File([blob], `${angulo}.jpg`, { type: "image/jpeg" });
    const input = inputUnico || fileInputDe(formDestino, angulo);
    if (input) {
      ponerArchivo(input, file);
      previewEnSlot(input, URL.createObjectURL(blob));
    }
    indiceCola += 1;
    inputUnico = null;
    await siguienteAngulo();
  });
  document.getElementById("cam-saltar").addEventListener("click", async () => {
    indiceCola += 1;
    inputUnico = null;
    await siguienteAngulo();
  });
  document.getElementById("cam-cerrar").addEventListener("click", () => {
    modal.hidden = true;
    cerrarCamara();
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", cablearEstudio);
} else {
  cablearEstudio();
}
