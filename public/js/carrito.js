const CART_KEY = "hexa-carrito";

function leerCarrito() {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY) || "[]");
  } catch {
    return [];
  }
}

function guardarCarrito(items) {
  localStorage.setItem(CART_KEY, JSON.stringify(items));
  pintarBadge();
}

function agregarAlCarrito(item) {
  const items = leerCarrito();
  const i = items.findIndex((x) => x.estilo_id === item.estilo_id);
  if (i >= 0) items[i].cantidad += item.cantidad;
  else items.push(item);
  guardarCarrito(items);
}

function quitarDelCarrito(estiloId) {
  guardarCarrito(leerCarrito().filter((x) => String(x.estilo_id) !== String(estiloId)));
}

function totalCarrito() {
  return leerCarrito().reduce((s, x) => s + x.precio * x.cantidad, 0);
}

function pintarBadge() {
  const n = leerCarrito().reduce((s, x) => s + x.cantidad, 0);
  document.querySelectorAll("[data-cart-count]").forEach((el) => {
    el.textContent = n;
    el.hidden = n < 1;
  });
}

function inyectarAccesoCarrito() {
  const host = document.querySelector(".top-inner");
  if (!host || host.querySelector(".cart-link")) return;
  let actions = host.querySelector(".top-actions");
  if (!actions) {
    actions = document.createElement("div");
    actions.className = "top-actions";
    const themes = host.querySelector(".themes");
    if (themes) actions.appendChild(themes);
    host.appendChild(actions);
  }
  const a = document.createElement("a");
  a.className = "cart-link ghost";
  a.href = "/checkout.html";
  a.innerHTML = `Carrito <span class="cart-count" data-cart-count hidden>0</span>`;
  actions.appendChild(a);
  pintarBadge();
}

document.addEventListener("DOMContentLoaded", () => {
  inyectarAccesoCarrito();
  pintarBadge();
});
