const CARAS = ["derecha", "izquierda", "arriba", "abajo", "frente", "detras"];

let escenaActiva = null;

function destruirVisor() {
  if (!escenaActiva) return;
  cancelAnimationFrame(escenaActiva.frame);
  window.removeEventListener("pointerup", escenaActiva.onUp);
  window.removeEventListener("pointermove", escenaActiva.onMove);
  escenaActiva.renderer.dispose();
  escenaActiva = null;
}

function distFondo(r, g, b, f) {
  return Math.abs(r - f.r) + Math.abs(g - f.g) + Math.abs(b - f.b);
}

function recorteLetra(img) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) return { x: 0, y: 0, w: iw || 1, h: ih || 1 };
  try {
    const tw = 240;
    const th = Math.max(80, Math.round((ih * tw) / iw));
    const c = document.createElement("canvas");
    c.width = tw;
    c.height = th;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, tw, th);
    const { data } = ctx.getImageData(0, 0, tw, th);
    const muestra = (x, y) => {
      const i = (y * tw + x) * 4;
      return { r: data[i], g: data[i + 1], b: data[i + 2] };
    };
    const fondo = muestra(2, 2);
    const filaFondo = (y) => {
      let n = 0;
      for (let x = 0; x < tw; x += 2) {
        const i = (y * tw + x) * 4;
        if (distFondo(data[i], data[i + 1], data[i + 2], fondo) < 36) n++;
      }
      return n / Math.ceil(tw / 2) > 0.9;
    };
    const colFondo = (x) => {
      let n = 0;
      for (let y = 0; y < th; y += 2) {
        const i = (y * tw + x) * 4;
        if (distFondo(data[i], data[i + 1], data[i + 2], fondo) < 36) n++;
      }
      return n / Math.ceil(th / 2) > 0.9;
    };
    let y0 = 0;
    let y1 = th - 1;
    let x0 = 0;
    let x1 = tw - 1;
    while (y0 < y1 - 8 && filaFondo(y0)) y0++;
    while (y1 > y0 + 8 && filaFondo(y1)) y1--;
    while (x0 < x1 - 8 && colFondo(x0)) x0++;
    while (x1 > x0 + 8 && colFondo(x1)) x1--;
    const bw = x1 - x0 + 1;
    const bh = y1 - y0 + 1;
    if (bw / tw > 0.96 && bh / th > 0.96) return { x: 0, y: 0, w: iw, h: ih };
    return {
      x: (x0 / tw) * iw,
      y: (y0 / th) * ih,
      w: (bw / tw) * iw,
      h: (bh / th) * ih,
    };
  } catch (_) {
    return { x: 0, y: 0, w: iw, h: ih };
  }
}

function aplicarCropUV(tex, box) {
  const img = tex.image;
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih || box.w < 8 || box.h < 8) return;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.offset.set(box.x / iw, 1 - (box.y + box.h) / ih);
  tex.repeat.set(box.w / iw, box.h / ih);
  tex.needsUpdate = true;
}

function dimensionesDeMedidas(m) {
  const f = m.frente || m.detras;
  const s = m.izquierda || m.derecha;
  const t = m.arriba || m.abajo;
  let sx = 1;
  let sy = 1;
  let sz = 1;
  if (f && f.w > 0) sy = f.h / f.w;
  const zs = [];
  if (s && s.h > 0) zs.push((s.w / s.h) * sy);
  if (t && t.w > 0) zs.push(t.h / t.w);
  if (zs.length) sz = zs.reduce((a, b) => a + b, 0) / zs.length;
  sx = Math.max(0.3, Math.min(3.2, sx));
  sy = Math.max(0.3, Math.min(3.2, sy));
  sz = Math.max(0.3, Math.min(3.2, sz));
  const k = 1.9 / Math.max(sx, sy, sz);
  return { x: sx * k, y: sy * k, z: sz * k };
}

function pegarTextura(mat, tex) {
  if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  mat.map = tex;
  mat.color.set(0xffffff);
  mat.needsUpdate = true;
}

function texturaDesdeUrl(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const tex = new THREE.Texture(img);
      tex.needsUpdate = true;
      resolve(tex);
    };
    img.onerror = () => reject(new Error("foto"));
    img.referrerPolicy = "no-referrer";
    img.src = url;
  });
}

async function medirDesdeUrl(url) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const bmp = await createImageBitmap(blob);
    const box = recorteLetra(bmp);
    bmp.close?.();
    return box;
  } catch (_) {
    return null;
  }
}

function iniciarVisor(contenedor, imagenes) {
  destruirVisor();
  const width = Math.max(contenedor.clientWidth, 320);
  const height = Math.max(contenedor.clientHeight, 420);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x2a261f);

  const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
  camera.position.set(2.6, 1.8, 3.1);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(width, height);
  if (THREE.SRGBColorSpace) renderer.outputColorSpace = THREE.SRGBColorSpace;
  contenedor.innerHTML = "";
  contenedor.appendChild(renderer.domElement);

  const materiales = CARAS.map(() => new THREE.MeshBasicMaterial({ color: 0xffffff }));
  let geo = new THREE.BoxGeometry(1.55, 1.55, 1.55);
  const mesh = new THREE.Mesh(geo, materiales);
  let edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geo),
    new THREE.LineBasicMaterial({ color: 0xe8c890 })
  );
  mesh.add(edges);
  scene.add(mesh);

  const medidas = {};
  const redimensionar = () => {
    if (!Object.keys(medidas).length) return;
    const dim = dimensionesDeMedidas(medidas);
    const next = new THREE.BoxGeometry(dim.x, dim.y, dim.z);
    mesh.geometry.dispose();
    mesh.geometry = next;
    mesh.remove(edges);
    edges.geometry.dispose();
    edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(next),
      new THREE.LineBasicMaterial({ color: 0xe8c890 })
    );
    mesh.add(edges);
    const lejos = 2.15 + Math.max(dim.x, dim.y, dim.z) * 0.35;
    camera.position.set(lejos * 0.9, lejos * 0.55, lejos);
    camera.lookAt(0, 0, 0);
  };

  CARAS.forEach((angulo, i) => {
    const url = imagenes?.[angulo];
    if (!url) {
      materiales[i].color.set(0xc4a574);
      return;
    }
    texturaDesdeUrl(url)
      .then((tex) => {
        pegarTextura(materiales[i], tex);
        return medirDesdeUrl(url).then((box) => {
          const usado = box || recorteLetra(tex.image);
          medidas[angulo] = usado;
          aplicarCropUV(tex, usado);
          redimensionar();
        });
      })
      .catch(() => {
        materiales[i].color.set(0xc4a574);
      });
  });

  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  renderer.domElement.style.cursor = "grab";
  renderer.domElement.addEventListener("pointerdown", (e) => {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    renderer.domElement.setPointerCapture(e.pointerId);
    renderer.domElement.style.cursor = "grabbing";
  });
  const onUp = () => {
    dragging = false;
    renderer.domElement.style.cursor = "grab";
  };
  const onMove = (e) => {
    if (!dragging) return;
    mesh.rotation.y += (e.clientX - lastX) * 0.012;
    mesh.rotation.x += (e.clientY - lastY) * 0.012;
    lastX = e.clientX;
    lastY = e.clientY;
  };
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointermove", onMove);

  const state = { renderer, frame: 0, onUp, onMove };
  escenaActiva = state;
  const loop = () => {
    if (!dragging) mesh.rotation.y += 0.008;
    renderer.render(scene, camera);
    state.frame = requestAnimationFrame(loop);
  };
  loop();
}
