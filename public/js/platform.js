const HEXA_ICOS = {
  catalogo:
    '<path d="M12 3.2 20 7.5v9L12 20.8 4 16.5v-9L12 3.2z"/><path d="M12 20.8V12M4 7.5l8 4.5 8-4.5"/>',
  pedido:
    '<path d="M6.5 8h11l-1 12.5H7.5L6.5 8z"/><path d="M9 8V6.8A3 3 0 0 1 12 3.8 3 3 0 0 1 15 6.8V8"/>',
  inventario:
    '<path d="M4 10.5 12 5l8 5.5V20H4v-9.5z"/><path d="M9.5 20v-6h5v6"/>',
  pedidos:
    '<path d="M8 7h11M8 12h11M8 17h8"/><path d="M5 7h.01M5 12h.01M5 17h.01"/>',
  auto: '<path d="M15 4.2 16.3 7l2.8 1.3L16.3 9.6 15 12.4 13.7 9.6 10.9 8.3 13.7 7 15 4.2z"/><path d="M6 19 9.5 10h2.2"/>',
  zoomOut: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-3.2-3.2M8 11h6"/>',
  zoomIn: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-3.2-3.2M11 8v6M8 11h6"/>',
  rotIzq: '<path d="M8 7.2 5 10.2 8 13.2"/><path d="M5 10.2h8.2a5 5 0 1 1-1.2 9.8"/>',
  rotDer: '<path d="M16 7.2 19 10.2 16 13.2"/><path d="M19 10.2H10.8a5 5 0 1 0 1.2 9.8"/>',
  centrar: '<path d="M12 4.5v15M4.5 12h15"/><circle cx="12" cy="12" r="3"/>',
  guia: '<path d="M8 4.5v15M16 4.5v15M4.5 8h15M4.5 16h15"/>',
  camara:
    '<path d="M4.4 8.6h3.1l1.3-2h6.4l1.3 2h3.1v10.8H4.4V8.6z"/><circle cx="12" cy="13.6" r="3.1"/>',
  subir: '<path d="M12 16.5V7.2M8.4 10.6 12 7.2l3.6 3.4"/><path d="M5 18.2h14"/>',
  saltar: '<path d="M6 6.8v10.4L15.2 12 6 6.8z"/><path d="M18.2 6.8v10.4"/>',
  cerrar: '<path d="m7 7 10 10M17 7 7 17"/>',
  recorte: '<path d="M7 3.5V14a4 4 0 0 0 4 4h10.5"/><path d="M3.5 7H14a4 4 0 0 1 4 4v10.5"/>',
  repetir: '<path d="M5.2 12a6.8 6.8 0 1 0 1.8-4.7L5.2 9.2"/><path d="M5.2 5.2v4h4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  ratio11: '<rect x="6" y="6" width="12" height="12" rx="1.6"/>',
  ratio34: '<rect x="7.5" y="4" width="9" height="16" rx="1.6"/>',
  ratio43: '<rect x="4" y="7.5" width="16" height="9" rx="1.6"/>',
  ratio169: '<rect x="3" y="8.5" width="18" height="7" rx="1.6"/>',
  libre: '<rect x="5" y="6" width="14" height="12" rx="2" stroke-dasharray="2.6 2"/>',
  toda: '<path d="M9 5H5v4M15 5h4v4M9 19H5v-4M19 19h-4v-4"/>',
  cubo: '<path d="M12 3.2 20 7.5v9L12 20.8 4 16.5v-9L12 3.2z"/><path d="M12 20.8V12M4 7.5l8 4.5 8-4.5"/>',
};

function hexaIco(name, cls = "ico") {
  const inner = HEXA_ICOS[name];
  if (!inner) return "";
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
}
window.hexaIco = hexaIco;

function uiActual() {
  return document.documentElement.getAttribute("data-ui") || "material";
}

function themeColor() {
  const color = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim() || "#12110f";
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", color);
}

function syncFab() {
  const show = /admin\.html$/.test(location.pathname);
  let fab = document.querySelector(".fab");
  if (show && !fab) {
    fab = document.createElement("button");
    fab.className = "fab";
    fab.type = "button";
    fab.setAttribute("aria-label", "Nuevo producto");
    fab.innerHTML = hexaIco("plus");
    fab.addEventListener("click", () => {
      if (typeof window.abrirAlta === "function") window.abrirAlta();
      else document.getElementById("btn-nuevo")?.click();
    });
    document.documentElement.appendChild(fab);
  }
  if (fab) fab.hidden = !show;
}

function paginaActiva() {
  const p = location.pathname;
  if (p.endsWith("admin.html")) return "inventario";
  if (p.endsWith("ganancias.html")) return "ganancias";
  if (p.endsWith("checkout.html") || p.endsWith("pedido.html")) return "pedido";
  if (p.endsWith("pedidos.html")) return "pedidos";
  if (p.endsWith("producto.html")) return "catalogo";
  return "catalogo";
}

function inyectarTabbar() {
  if (document.querySelector(".tabbar")) return;
  const activa = paginaActiva();
  const nav = document.createElement("nav");
  nav.className = "tabbar";
  nav.setAttribute("aria-label", "Secciones");
  nav.innerHTML = `
    <p class="rail-label">Menú</p>
    <a href="/" class="${activa === "catalogo" ? "active" : ""}">
      <span class="tab-ico">${hexaIco("catalogo")}</span>
      <span>Catálogo</span>
    </a>
    <a href="/checkout.html" class="${activa === "pedido" ? "active" : ""}">
      <span class="tab-ico">${hexaIco("pedido")}</span>
      <span>Pedido</span>
    </a>
    <a href="/admin.html" class="${activa === "inventario" ? "active" : ""}">
      <span class="tab-ico">${hexaIco("inventario")}</span>
      <span>Inventario</span>
    </a>
    <a href="/pedidos.html" class="${activa === "pedidos" ? "active" : ""}">
      <span class="tab-ico">${hexaIco("pedidos")}</span>
      <span>Pedidos</span>
    </a>
  `;
  document.body.appendChild(nav);
}

function asegurarAcciones() {
  const host = document.querySelector(".top-inner");
  if (!host) return null;
  let actions = host.querySelector(".top-actions");
  if (!actions) {
    actions = document.createElement("div");
    actions.className = "top-actions";
    const themes = host.querySelector(".themes");
    if (themes) actions.appendChild(themes);
    host.appendChild(actions);
  }
  return actions;
}

function inyectarInstalar() {
  const actions = asegurarAcciones();
  if (!actions || actions.querySelector("#install-pwa")) return;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "ghost install-btn";
  btn.id = "install-pwa";
  btn.hidden = true;
  btn.textContent = "Instalar";
  actions.appendChild(btn);
}

function registrarPWA() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }
  let deferred = null;
  const btn = document.getElementById("install-pwa");
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e;
    if (btn) btn.hidden = false;
  });
  btn?.addEventListener("click", async () => {
    if (!deferred) return;
    deferred.prompt();
    await deferred.userChoice;
    deferred = null;
    btn.hidden = true;
  });
}

document.addEventListener("DOMContentLoaded", () => {
  inyectarTabbar();
  inyectarInstalar();
  registrarPWA();
  themeColor();
  syncFab();
});
