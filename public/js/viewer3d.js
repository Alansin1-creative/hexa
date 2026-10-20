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

  const loader = new THREE.TextureLoader();
  const materiales = CARAS.map((angulo) => {
    const mat = new THREE.MeshBasicMaterial({ color: 0xc4a574 });
    if (!imagenes[angulo]) return mat;
    loader.load(imagenes[angulo], (tex) => {
      if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
      mat.map = tex;
      mat.color.set(0xffffff);
      mat.needsUpdate = true;
    });
    return mat;
  });

  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.55, 1.55, 1.55), materiales);
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(mesh.geometry),
    new THREE.LineBasicMaterial({ color: 0xe8c890, linewidth: 2 })
  );
  mesh.add(edges);
  scene.add(mesh);

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
