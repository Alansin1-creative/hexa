const RUTA_KEY = "hexa-ruta-entregas";

function leerRuta() {
  try {
    const raw = JSON.parse(localStorage.getItem(RUTA_KEY) || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function guardarRuta(stops) {
  localStorage.setItem(RUTA_KEY, JSON.stringify(stops));
}

function pedidoConGps(p) {
  const lat = Number(p?.lat);
  const lng = Number(p?.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);
}

function paradaDePedido(p) {
  if (!pedidoConGps(p)) return null;
  return {
    id: String(p.id),
    nombre: p.nombre || `Pedido ${p.id}`,
    lat: Number(p.lat),
    lng: Number(p.lng),
  };
}

function agregarParada(p) {
  const stop = paradaDePedido(p);
  if (!stop) throw new Error("Este pedido no tiene GPS de entrega.");
  const ruta = leerRuta().filter((x) => x.id !== stop.id);
  ruta.push(stop);
  guardarRuta(ruta);
  return ruta;
}

function quitarParada(id) {
  guardarRuta(leerRuta().filter((x) => String(x.id) !== String(id)));
  return leerRuta();
}

function vaciarRuta() {
  guardarRuta([]);
}

function urlMapsDestino(lat, lng) {
  return `https://www.google.com/maps/dir/Current+Location/${lat},${lng}`;
}

function urlMapsRuta(stops = leerRuta()) {
  const puntos = (stops && stops.length ? stops : leerRuta()).map((s) => `${s.lat},${s.lng}`);
  if (!puntos.length) return "https://www.google.com/maps/dir/Current+Location/";
  return `https://www.google.com/maps/dir/Current+Location/${puntos.join("/")}`;
}

function armarDesdePedidos(pedidos) {
  const stops = (pedidos || [])
    .filter(pedidoConGps)
    .sort((a, b) => Number(a.id) - Number(b.id))
    .map(paradaDePedido)
    .filter(Boolean);
  guardarRuta(stops);
  return stops;
}

function cargarEnMaps(stops = leerRuta()) {
  if (!stops.length) throw new Error("No hay entregas con GPS para armar la ruta.");
  const url = urlMapsRuta(stops);
  window.open(url, "_blank", "noopener");
  return url;
}

function urlMapsPunto(lat, lng) {
  return `https://www.google.com/maps?q=${encodeURIComponent(`${lat},${lng}`)}`;
}

function urlMapsEmbed(lat, lng) {
  return `https://maps.google.com/maps?q=${encodeURIComponent(`${lat},${lng}`)}&z=16&output=embed`;
}

function ico(name) {
  return window.hexaIco ? hexaIco(name) : "";
}

function pintarPanelRuta(root, pedidos = []) {
  if (!root) return;
  const conGps = (pedidos || []).filter(pedidoConGps);
  const ruta = leerRuta();
  root.innerHTML = `
    <div class="ruta-head">
      <div>
        <div class="kicker">Entregas</div>
        <strong>Ruta en Maps</strong>
        <p class="hint">El botón carga todos los GPS, parte de tu ubicación y deja la última entrega como destino.</p>
      </div>
      <div class="qty">
        <button type="button" class="btn con-ico" id="cargar-ruta" ${conGps.length ? "" : "disabled"}>
          ${ico("ruta")}<span>Cargar ruta en Maps</span>
        </button>
        <button type="button" class="ghost" id="vaciar-ruta" ${ruta.length ? "" : "disabled"}>Vaciar</button>
      </div>
    </div>
    ${
      ruta.length
        ? `<ol class="ruta-lista">${ruta
            .map(
              (s, i) => `<li>
                <span class="ruta-n">${i + 1}</span>
                <span><b>${s.nombre}</b><div class="meta">Pedido #${s.id} · ${s.lat.toFixed(5)}, ${s.lng.toFixed(5)}${i === ruta.length - 1 ? " · destino" : " · parada"}</div></span>
                <button type="button" class="ghost" data-quitar-parada="${s.id}">Quitar</button>
              </li>`
            )
            .join("")}</ol>`
        : `<p class="hint">${conGps.length ? `${conGps.length} entregas con GPS listas. Pulsa el botón para abrirlas en Maps.` : "Cuando un pedido tenga GPS, aquí se arma la ruta."}</p>`
    }`;
  root.querySelector("#cargar-ruta")?.addEventListener("click", () => {
    try {
      const stops = armarDesdePedidos(pedidos);
      cargarEnMaps(stops);
      pintarPanelRuta(root, pedidos);
    } catch (err) {
      alert(err.message);
    }
  });
  root.querySelector("#vaciar-ruta")?.addEventListener("click", () => {
    vaciarRuta();
    pintarPanelRuta(root, pedidos);
  });
  root.querySelectorAll("[data-quitar-parada]").forEach((btn) => {
    btn.addEventListener("click", () => {
      quitarParada(btn.dataset.quitarParada);
      pintarPanelRuta(root, pedidos);
    });
  });
}

window.HexaRuta = {
  leerRuta,
  agregarParada,
  quitarParada,
  vaciarRuta,
  pedidoConGps,
  armarDesdePedidos,
  cargarEnMaps,
  urlMapsDestino,
  urlMapsRuta,
  urlMapsPunto,
  urlMapsEmbed,
  pintarPanelRuta,
};
