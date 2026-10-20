const VERIF_KEY = "hexa-verif";
const gps = { permiso: null, lat: null, lng: null, precision_m: null };

function sesionVerif() {
  try {
    return JSON.parse(localStorage.getItem(VERIF_KEY) || "null");
  } catch {
    return null;
  }
}

function pintarCarrito() {
  const root = document.getElementById("carrito-vista");
  const items = leerCarrito();
  if (!items.length) {
    root.innerHTML = `<p class="empty">Tu carrito está vacío. <a href="/">Ver catálogo</a></p>`;
    document.getElementById("checkout").hidden = true;
    return;
  }
  document.getElementById("checkout").hidden = false;
  root.innerHTML = `
    <div class="card" style="padding:16px">
      ${items
        .map(
          (x) => `<div class="row" style="padding:8px 0;border-bottom:1px solid var(--line)">
            <div><strong>${x.nombre}</strong><div class="meta">${x.estilo} · ${x.cantidad} × ${money(x.precio)}</div></div>
            <button type="button" class="ghost" data-quitar="${x.estilo_id}">Quitar</button>
          </div>`
        )
        .join("")}
      <div class="row" style="margin-top:12px"><span>Total</span><strong class="price">${money(totalCarrito())}</strong></div>
    </div>`;
  root.querySelectorAll("[data-quitar]").forEach((btn) => {
    btn.addEventListener("click", () => {
      quitarDelCarrito(Number(btn.dataset.quitar));
      pintarCarrito();
    });
  });
}

async function checarTel() {
  const tel = document.querySelector("[name=telefono]").value;
  const res = await fetch(`/api/verificar/estado?telefono=${encodeURIComponent(tel)}`);
  const data = await res.json();
  const el = document.getElementById("estado-tel");
  if (data.primera_compra) {
    el.textContent = "Primera compra: vamos a comprobar que el número es tuyo con un código.";
  } else {
    el.textContent = "Este número ya compró antes. Aun así confirmamos el código de este pedido.";
  }
}

document.getElementById("btn-codigo").addEventListener("click", async () => {
  const telefono = document.querySelector("[name=telefono]").value;
  const msg = document.getElementById("msg-verif");
  const res = await fetch("/api/verificar/enviar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ telefono }),
  });
  const data = await res.json();
  if (!res.ok) {
    msg.textContent = data.error;
    msg.className = "hint danger";
    return;
  }
  document.getElementById("caja-codigo").hidden = false;
  msg.textContent = `${data.mensaje} Código de prueba: ${data.demo_codigo}`;
  msg.className = "hint ok";
});

document.getElementById("btn-confirmar").addEventListener("click", async () => {
  const telefono = document.querySelector("[name=telefono]").value;
  const codigo = document.querySelector("[name=codigo]").value;
  const msg = document.getElementById("msg-verif");
  const res = await fetch("/api/verificar/confirmar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ telefono, codigo }),
  });
  const data = await res.json();
  if (!res.ok) {
    msg.textContent = data.error;
    msg.className = "hint danger";
    return;
  }
  localStorage.setItem(VERIF_KEY, JSON.stringify({ telefono: data.telefono, token: data.token }));
  msg.textContent = "Número confirmado. Ya puedes cerrar el pedido.";
  msg.className = "hint ok";
});

document.querySelector("[name=telefono]").addEventListener("change", checarTel);

document.getElementById("btn-si-gps").addEventListener("click", () => {
  const msg = document.getElementById("msg-gps");
  if (!navigator.geolocation) {
    gps.permiso = false;
    msg.textContent = "Este dispositivo no tiene GPS. Escribe la dirección.";
    msg.className = "hint warn";
    return;
  }
  msg.textContent = "El navegador va a pedir permiso de ubicación...";
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      gps.permiso = true;
      gps.lat = pos.coords.latitude;
      gps.lng = pos.coords.longitude;
      gps.precision_m = pos.coords.accuracy;
      msg.textContent = `Ubicación lista (±${Math.round(pos.coords.accuracy)} m). Solo se usa para este envío.`;
      msg.className = "hint ok";
    },
    (err) => {
      gps.permiso = false;
      msg.textContent =
        err.code === 1
          ? "No diste permiso de ubicación. Escribe la dirección de entrega."
          : "No se pudo leer el GPS. Escribe la dirección.";
      msg.className = "hint warn";
    },
    { enableHighAccuracy: true, timeout: 12000 }
  );
});

document.getElementById("btn-no-gps").addEventListener("click", () => {
  gps.permiso = false;
  gps.lat = gps.lng = gps.precision_m = null;
  const msg = document.getElementById("msg-gps");
  msg.textContent = "De acuerdo: no usaremos GPS. La dirección escrita es obligatoria.";
  msg.className = "hint";
});

document.getElementById("checkout").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const msg = document.getElementById("msg-pedido");
  if (gps.permiso === null) {
    msg.textContent = "Indica si quieres compartir tu ubicación o no.";
    msg.className = "hint danger";
    return;
  }
  const fd = new FormData(ev.target);
  const verif = sesionVerif();
  const telefono = fd.get("telefono");
  const tel = String(telefono).replace(/\D/g, "").slice(-10);
  if (!verif || String(verif.telefono) !== tel) {
    msg.textContent = "Confirma el código de tu teléfono antes de pedir.";
    msg.className = "hint danger";
    return;
  }
  const res = await fetch("/api/pedidos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      nombre: fd.get("nombre"),
      telefono,
      token: verif.token,
      metodo_pago: fd.get("metodo_pago"),
      direccion: fd.get("direccion"),
      permiso_ubicacion: gps.permiso === true,
      lat: gps.lat,
      lng: gps.lng,
      precision_m: gps.precision_m,
      items: leerCarrito().map((x) => ({ estilo_id: x.estilo_id, cantidad: x.cantidad })),
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    msg.textContent = data.error;
    msg.className = "hint danger";
    return;
  }
  guardarCarrito([]);
  location.href = `/pedido.html?id=${data.id}`;
});

pintarCarrito();
