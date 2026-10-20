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
    fab.textContent = "+";
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
      <span class="tab-ico" aria-hidden="true">▣</span>
      <span>Catálogo</span>
    </a>
    <a href="/checkout.html" class="${activa === "pedido" ? "active" : ""}">
      <span class="tab-ico" aria-hidden="true">🛒</span>
      <span>Pedido</span>
    </a>
    <a href="/admin.html" class="${activa === "inventario" ? "active" : ""}">
      <span class="tab-ico" aria-hidden="true">▦</span>
      <span>Inventario</span>
    </a>
    <a href="/pedidos.html" class="${activa === "pedidos" ? "active" : ""}">
      <span class="tab-ico" aria-hidden="true">☰</span>
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
