const CARAS = ["derecha", "izquierda", "arriba", "abajo", "frente", "detras"];

let escenaActiva = null;

function destruirVisor() {
  if (!escenaActiva) return;
  cancelAnimationFrame(escenaActiva.frame);
  escenaActiva.stage?.removeEventListener("pointerdown", escenaActiva.onDown);
  window.removeEventListener("pointerup", escenaActiva.onUp);
  window.removeEventListener("pointermove", escenaActiva.onMove);
  escenaActiva = null;
}

function bboxLetra(img) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) return { x: 0, y: 0, w: 1, h: 1 };
  const tw = 240;
  const th = Math.max(80, Math.round((ih * tw) / iw));
  const c = document.createElement("canvas");
  c.width = tw;
  c.height = th;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, tw, th);
  const { data } = ctx.getImageData(0, 0, tw, th);
  const esPad = (i) => {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const lum = r * 0.299 + g * 0.587 + b * 0.114;
    const gris = Math.max(r, g, b) - Math.min(r, g, b);
    return lum < 42 && gris < 28;
  };
  const filaPad = (y) => {
    let n = 0;
    for (let x = 0; x < tw; x += 2) if (esPad((y * tw + x) * 4)) n++;
    return n / Math.ceil(tw / 2) > 0.82;
  };
  const colPad = (x) => {
    let n = 0;
    for (let y = 0; y < th; y += 2) if (esPad((y * tw + x) * 4)) n++;
    return n / Math.ceil(th / 2) > 0.82;
  };
  let y0 = 0;
  let y1 = th - 1;
  let x0 = 0;
  let x1 = tw - 1;
  while (y0 < y1 - 6 && filaPad(y0)) y0++;
  while (y1 > y0 + 6 && filaPad(y1)) y1--;
  while (x0 < x1 - 6 && colPad(x0)) x0++;
  while (x1 > x0 + 6 && colPad(x1)) x1--;
  const padX = Math.max(1, Math.round((x1 - x0) * 0.008));
  const padY = Math.max(1, Math.round((y1 - y0) * 0.008));
  x0 = Math.min(x1 - 4, x0 + padX);
  y0 = Math.min(y1 - 4, y0 + padY);
  x1 = Math.max(x0 + 4, x1 - padX);
  y1 = Math.max(y0 + 4, y1 - padY);
  return {
    x: (x0 / tw) * iw,
    y: (y0 / th) * ih,
    w: ((x1 - x0 + 1) / tw) * iw,
    h: ((y1 - y0 + 1) / th) * ih,
  };
}

function recortarACanvas(img, box) {
  const c = document.createElement("canvas");
  c.width = Math.max(8, Math.round(box.w));
  c.height = Math.max(8, Math.round(box.h));
  c.getContext("2d").drawImage(img, box.x, box.y, box.w, box.h, 0, 0, c.width, c.height);
  c.className = "hexa-tex";
  return c;
}

function urlCara(url) {
  try {
    const u = new URL(url, location.href);
    if (u.origin === location.origin) return url;
    if (/firebasestorage\.googleapis\.com$|storage\.googleapis\.com$/.test(u.hostname)) {
      return `/api/foto?u=${encodeURIComponent(u.href)}`;
    }
  } catch {
    /* seguir con la url original */
  }
  return url;
}

async function cargarCara(url) {
  const res = await fetch(urlCara(url));
  if (!res.ok) throw new Error("foto");
  const img = await createImageBitmap(await res.blob());
  const box = bboxLetra(img);
  const canvas = recortarACanvas(img, box);
  img.close?.();
  return { canvas, w: canvas.width, h: canvas.height };
}

function dimensionesDeMedidas(m) {
  const f = m.frente || m.detras;
  const s = m.izquierda || m.derecha;
  const t = m.arriba || m.abajo;
  let sx = 1;
  let sy = 1;
  let sz = 1;
  if (f && f.w) sy = f.h / f.w;
  const zs = [];
  if (s && s.h) zs.push((s.w / s.h) * sy);
  if (t && t.w) zs.push(t.h / t.w);
  if (zs.length) sz = zs.reduce((a, b) => a + b, 0) / zs.length;
  sx = Math.max(0.35, Math.min(3, sx));
  sy = Math.max(0.35, Math.min(3, sy));
  sz = Math.max(0.35, Math.min(3, sz));
  const max = 220 / Math.max(sx, sy, sz);
  return { w: Math.round(sx * max), h: Math.round(sy * max), d: Math.round(sz * max) };
}

function iniciarVisor(contenedor, imagenes) {
  destruirVisor();
  const stage = document.createElement("div");
  stage.className = "hexa-stage";
  const cube = document.createElement("div");
  cube.className = "hexa-cube";
  cube.style.setProperty("--hexa-w", "200px");
  cube.style.setProperty("--hexa-h", "200px");
  cube.style.setProperty("--hexa-d", "200px");

  const medidas = {};
  const aplicarTamano = () => {
    const dim = dimensionesDeMedidas(medidas);
    cube.style.setProperty("--hexa-w", `${dim.w}px`);
    cube.style.setProperty("--hexa-h", `${dim.h}px`);
    cube.style.setProperty("--hexa-d", `${dim.d}px`);
  };

  CARAS.forEach((angulo) => {
    const face = document.createElement("div");
    face.className = `hexa-face hexa-${angulo}`;
    const url = imagenes?.[angulo];
    if (url) {
      cargarCara(url)
        .then(({ canvas, w, h }) => {
          face.appendChild(canvas);
          medidas[angulo] = { w, h };
          aplicarTamano();
        })
        .catch(() => {
          const img = document.createElement("img");
          img.alt = angulo;
          img.src = url;
          face.appendChild(img);
        });
    }
    cube.appendChild(face);
  });

  stage.appendChild(cube);
  contenedor.innerHTML = "";
  contenedor.appendChild(stage);

  let rotX = -18;
  let rotY = 32;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  const pintar = () => {
    cube.style.transform = `rotateX(${rotX}deg) rotateY(${rotY}deg)`;
  };
  pintar();

  const onDown = (e) => {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    stage.setPointerCapture?.(e.pointerId);
    stage.style.cursor = "grabbing";
  };
  const onUp = () => {
    dragging = false;
    stage.style.cursor = "grab";
  };
  const onMove = (e) => {
    if (!dragging) return;
    rotY += (e.clientX - lastX) * 0.5;
    rotX -= (e.clientY - lastY) * 0.5;
    rotX = Math.max(-80, Math.min(80, rotX));
    lastX = e.clientX;
    lastY = e.clientY;
    pintar();
  };
  stage.addEventListener("pointerdown", onDown);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointermove", onMove);

  const state = { stage, frame: 0, onDown, onUp, onMove };
  escenaActiva = state;
  const loop = () => {
    if (!dragging) {
      rotY += 0.35;
      pintar();
    }
    state.frame = requestAnimationFrame(loop);
  };
  loop();
}
