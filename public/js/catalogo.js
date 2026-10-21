let productos = [];
let filtro = "todos";

function pintar() {
  const q = (document.getElementById("buscar").value || "").trim().toLowerCase();
  const root = document.getElementById("catalogo");
  const lista = productos.filter((p) => {
    const hay3d = p.estilos.some((e) => e.es_3d);
    if (filtro === "3d" && !hay3d) return false;
    if (filtro === "2d" && hay3d) return false;
    if (!q) return true;
    return `${p.nombre} ${p.categoria} ${p.estilos.map((e) => e.nombre).join(" ")}`.toLowerCase().includes(q);
  });
  if (!productos.length) {
    root.innerHTML = `<div class="empty">
      <p>El catálogo está vacío.</p>
      <p class="hint">Si administras la tienda, da de alta el primer producto.</p>
      <a class="btn" href="/admin.html">Ir a inventario</a>
    </div>`;
    return;
  }
  if (!lista.length) {
    root.innerHTML = `<div class="empty">Nada coincide con la búsqueda o el filtro.</div>`;
    return;
  }
  root.innerHTML = lista
    .map((p) => {
      const estilo = p.estilos[0];
      const img = portada(estilo);
      const hay3d = p.estilos.some((e) => e.es_3d);
      return `
        <a class="card" href="/producto.html?id=${p.id}">
          <div class="thumb">
            ${img ? `<img src="${img}" alt="${p.nombre}" />` : `<span class="meta">Sin foto</span>`}
            <span class="badge">${hay3d ? "Modelo 3D" : "Galería 2D"}</span>
            ${p.stock_total <= 0 ? `<span class="badge badge-agotado">Agotado</span>` : ""}
          </div>
          <div class="body">
            <div class="meta">${p.categoria} · ${p.estilos.length} estilo${p.estilos.length > 1 ? "s" : ""}</div>
            <strong>${p.nombre}</strong>
            <div class="row">
              <span class="price">${estilo ? money(estilo.precio_venta) : "—"}</span>
              <span class="meta${p.stock_total <= 2 ? " stock-bajo" : ""}">${p.stock_total <= 0 ? "Agotado" : `${p.stock_total} disponibles`}</span>
            </div>
            <div class="swatches">
              ${p.estilos.map((e) => `<span class="swatch" style="background:${e.color_hex}" title="${e.nombre}"></span>`).join("")}
            </div>
          </div>
        </a>`;
    })
    .join("");
}

async function cargar() {
  try {
    productos = await HexaAPI.vitrina();
  } catch (err) {
    document.getElementById("catalogo").innerHTML = `<div class="empty">${err.message}</div>`;
    return;
  }
  pintar();
}

document.getElementById("buscar").addEventListener("input", pintar);
document.querySelectorAll("[data-filtro]").forEach((btn) => {
  btn.addEventListener("click", () => {
    filtro = btn.dataset.filtro;
    document.querySelectorAll("[data-filtro]").forEach((b) => b.classList.toggle("active", b === btn));
    pintar();
  });
});

cargar();
