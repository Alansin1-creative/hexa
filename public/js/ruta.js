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
  return Boolean(p?.permiso_ubicacion) && Number.isFinite(lat) && Number.isFinite(lng);
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
  return `https://www.google.com/maps/dir/?api=1&origin=Current+Location&destination=${encodeURIComponent(`${lat},${lng}`)}&travelmode=driving`;
}

function urlMapsRuta(stops = leerRuta()) {
  if (!stops.length) return "https://www.google.com/maps/dir/?api=1&origin=Current+Location&travelmode=driving";
  const dest = stops[stops.length - 1];
  const mids = stops.slice(0, -1).map((s) => `${s.lat},${s.lng}`).join("|");
  let url = urlMapsDestino(dest.lat, dest.lng);
  if (mids) url += `&waypoints=${encodeURIComponent(mids)}`;
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

function pintarPanelRuta(root) {
  if (!root) return;
  const ruta = leerRuta();
  root.innerHTML = `
    <div class="ruta-head">
      <div>
        <div class="kicker">Entregas</div>
        <strong>Ruta en Maps</strong>
        <p class="hint">Parte de tu ubicación y suma cada GPS como parada. La última es el destino.</p>
      </div>
      <div class="qty">
        <a class="btn con-ico${ruta.length ? "" : " is-off"}" href="${ruta.length ? urlMapsRuta(ruta) : "#"}" target="_blank" rel="noopener" id="abrir-ruta">
          ${ico("ruta")}<span>Abrir ruta</span>
        </a>
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
        : `<p class="hint">Aún no hay paradas. En un pedido con GPS pulsa “Agregar parada”.</p>`
    }`;
  root.querySelector("#vaciar-ruta")?.addEventListener("click", () => {
    vaciarRuta();
    pintarPanelRuta(root);
  });
  root.querySelectorAll("[data-quitar-parada]").forEach((btn) => {
    btn.addEventListener("click", () => {
      quitarParada(btn.dataset.quitarParada);
      pintarPanelRuta(root);
    });
  });
}

window.HexaRuta = {
  leerRuta,
  agregarParada,
  quitarParada,
  vaciarRuta,
  pedidoConGps,
  urlMapsDestino,
  urlMapsRuta,
  urlMapsPunto,
  urlMapsEmbed,
  pintarPanelRuta,
};
