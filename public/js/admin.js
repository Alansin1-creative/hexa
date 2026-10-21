const ANGULOS = [
  ["frente", "Frente"],
  ["detras", "Detrás"],
  ["izquierda", "Izquierda"],
  ["derecha", "Derecha"],
  ["arriba", "Arriba"],
  ["abajo", "Abajo"],
];

function contarListos(form) {
  return ANGULOS.filter(([id]) => {
    const input = form.querySelector(`input[name="${id}"]`);
    if (input?.files?.[0]) return true;
    const img = input?.closest(".angle")?.querySelector(".prev");
    return Boolean(img && !img.hidden && img.getAttribute("src"));
  }).length;
}

function pintarProgreso(form) {
  const n = contarListos(form);
  const el = form.querySelector("[data-progreso]");
  if (!el) return;
  el.textContent =
    n === 6
      ? "6 / 6 ángulos. Al guardar se arma el modelo 3D."
      : `${n} / 6 ángulos. Faltan fotos: se quedará en 2D.`;
  el.className = n === 6 ? "hint ok" : "hint";
}

function montarAngulos(container, imagenes = {}) {
  container.innerHTML = ANGULOS.map(
    ([id, label]) => `
      <div class="angle${imagenes[id] ? " listo" : ""}" data-slot="${id}">
        <span>${label}${imagenes[id] ? " ✓" : ""}</span>
        <img class="prev" alt="${label}" ${imagenes[id] ? `src="${imagenes[id]}"` : "hidden"} />
        <input class="file-oculto" type="file" name="${id}" accept="image/*" />
        <div class="angle-actions">
          <button type="button" class="ghost cam-one" data-angulo="${id}">Cámara</button>
          <button type="button" class="ghost file-one" data-angulo="${id}">Subir</button>
        </div>
      </div>`
  ).join("");
  const form = container.closest("form");
  container.querySelectorAll("input[type=file]").forEach((input) => {
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (input.dataset.hexaListo === "1") {
        delete input.dataset.hexaListo;
        pintarProgreso(form);
        return;
      }
      if (!file) {
        pintarProgreso(form);
        return;
      }
      iniciarEstudio({
        form,
        angulos: [input.getAttribute("name")],
        input,
        desde: "archivo",
        file,
      });
    });
  });
  container.querySelectorAll(".cam-one").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      iniciarEstudio({
        form,
        angulos: [btn.dataset.angulo],
        input: form.querySelector(`input[name="${btn.dataset.angulo}"]`),
        desde: "camara",
      });
    });
  });
  container.querySelectorAll(".file-one").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const input = form.querySelector(`input[name="${btn.dataset.angulo}"]`);
      if (!input) return;
      input.value = "";
      input.click();
    });
  });
}

function cablearEstudioForm(form) {
  form.querySelector("[data-estudio]")?.addEventListener("click", () => {
    iniciarEstudio({ form, angulos: ANGULOS.map(([id]) => id) });
  });
}

const alta = document.getElementById("alta");
const preview = document.getElementById("margen-preview");
const modalAlta = document.getElementById("modal-alta");
let inventario = [];
let filtroInv = "";

function modoAltaNuevo() {
  alta.dataset.modo = "nuevo";
  delete alta.dataset.producto;
  delete alta.dataset.estilo;
  alta.reset();
  alta.estilo_nombre.value = "Clásico";
  alta._hexaFotos = {};
  document.getElementById("alta-kicker").textContent = "Alta de mercancía";
  document.getElementById("alta-titulo").textContent = "Nuevo producto";
  document.getElementById("alta-hint").textContent =
    "Costo y precio son obligatorios. Con las seis fotos se arma el 3D; si falta alguna, queda en 2D.";
  document.getElementById("label-stock").firstChild.textContent = "Stock inicial";
  document.getElementById("alta-estilo-titulo").textContent = "Estilo inicial";
  document.getElementById("alta-submit").textContent = "Guardar producto";
  document.getElementById("alta-msg").textContent = "";
  montarAngulos(document.getElementById("angles"));
  pintarProgreso(alta);
  actualizarMargen();
}

function abrirAlta() {
  if (!modalAlta) return;
  if (alta.dataset.modo !== "editar") modoAltaNuevo();
  modalAlta.hidden = false;
  document.body.style.overflow = "hidden";
  alta?.querySelector("[name=nombre]")?.focus();
}

function abrirEdicion(producto, estilo) {
  if (!modalAlta || !producto || !estilo) return;
  alta.dataset.modo = "editar";
  alta.dataset.producto = producto.id;
  alta.dataset.estilo = estilo.id;
  alta._hexaFotos = {};
  alta.nombre.value = producto.nombre || "";
  alta.categoria.value = producto.categoria || "";
  alta.descripcion.value = producto.descripcion || "";
  alta.estilo_nombre.value = estilo.nombre || "Clásico";
  alta.color_hex.value = estilo.color_hex || "#c4a574";
  alta.costo.value = estilo.costo ?? "";
  alta.precio_venta.value = estilo.precio_venta ?? "";
  alta.stock.value = estilo.stock ?? 0;
  document.getElementById("alta-kicker").textContent = "Editar ficha";
  document.getElementById("alta-titulo").textContent = producto.nombre;
  document.getElementById("alta-hint").textContent =
    "Cambia texto, precios o reemplaza fotos. Las imágenes que no toques se quedan.";
  document.getElementById("label-stock").firstChild.textContent = "Stock";
  document.getElementById("alta-estilo-titulo").textContent = "Estilo";
  document.getElementById("alta-submit").textContent = "Guardar cambios";
  document.getElementById("alta-msg").textContent = "";
  montarAngulos(document.getElementById("angles"), estilo.imagenes || {});
  pintarProgreso(alta);
  actualizarMargen();
  modalAlta.hidden = false;
  document.body.style.overflow = "hidden";
  alta?.querySelector("[name=nombre]")?.focus();
}

function cerrarAlta() {
  if (!modalAlta) return;
  modalAlta.hidden = true;
  document.body.style.overflow = "";
  alta.dataset.modo = "nuevo";
}

window.abrirAlta = abrirAlta;

[modalAlta, document.getElementById("estudio")].forEach((el) => {
  if (el && el.parentElement !== document.documentElement) {
    document.documentElement.appendChild(el);
  }
});

document.getElementById("btn-nuevo")?.addEventListener("click", () => {
  modoAltaNuevo();
  abrirAlta();
});
document.getElementById("cerrar-alta")?.addEventListener("click", cerrarAlta);
modalAlta?.addEventListener("click", (ev) => {
  if (ev.target === modalAlta) cerrarAlta();
});
document.addEventListener("keydown", (ev) => {
  const estudio = document.getElementById("estudio");
  if (ev.key === "Escape" && estudio && !estudio.hidden) return;
  if (ev.key === "Escape" && modalAlta && !modalAlta.hidden) cerrarAlta();
});

montarAngulos(document.getElementById("angles"));
cablearEstudioForm(alta);
pintarProgreso(alta);

function actualizarMargen() {
  const costo = Number(alta.costo.value);
  const venta = Number(alta.precio_venta.value);
  if (!Number.isFinite(costo) || !Number.isFinite(venta)) return;
  const g = venta - costo;
  preview.textContent = `Ganancia unitaria: ${money(g)} · margen ${costo ? ((g / costo) * 100).toFixed(1) : 0}%`;
}
alta.costo.addEventListener("input", actualizarMargen);
alta.precio_venta.addEventListener("input", actualizarMargen);

alta.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const msg = document.getElementById("alta-msg");
  const btn = document.getElementById("alta-submit");
  btn.disabled = true;
  msg.textContent = alta.dataset.modo === "editar" ? "Guardando cambios…" : "Guardando producto…";
  msg.className = "hint";
  try {
    if (alta.dataset.modo === "editar") {
      await HexaAPI.actualizarProducto(alta.dataset.producto, alta.dataset.estilo, alta);
    } else {
      await HexaAPI.crearProducto(alta);
    }
  } catch (err) {
    msg.textContent = err.message || "No se pudo guardar";
    msg.className = "hint danger";
    btn.disabled = false;
    return;
  }
  btn.disabled = false;
  modoAltaNuevo();
  cargarLista();
  cerrarAlta();
});

function productosFiltrados() {
  const q = filtroInv.trim().toLowerCase();
  if (!q) return inventario;
  return inventario.filter((p) =>
    `${p.nombre} ${p.categoria} ${p.descripcion || ""} ${p.estilos.map((e) => e.nombre).join(" ")}`
      .toLowerCase()
      .includes(q)
  );
}

function pintarLista() {
  const root = document.getElementById("lista");
  const productos = productosFiltrados();
  if (!inventario.length) {
    root.innerHTML = `<div class="empty">
      <p>Aún no hay artículos.</p>
      <button type="button" class="btn" id="empty-nuevo">Agregar el primero</button>
    </div>`;
    document.getElementById("empty-nuevo")?.addEventListener("click", () => {
      modoAltaNuevo();
      abrirAlta();
    });
    return;
  }
  if (!productos.length) {
    root.innerHTML = `<p class="empty">Nada coincide con “${filtroInv}”.</p>`;
    return;
  }
  root.innerHTML = productos
    .map((p) => {
      const cover = portada(p.estilos[0]);
      return `
      <article class="card stock-card">
        <div class="stock-head">
          <div class="stock-cover">${cover ? `<img src="${cover}" alt="" />` : `<span>H</span>`}</div>
          <div class="stock-title">
            <strong>${p.nombre}</strong>
            <div class="meta">${p.categoria || "General"} · ${p.estilos.length} estilo${p.estilos.length > 1 ? "s" : ""} · ${p.stock_total} uds</div>
          </div>
          <div class="card-actions">
            <button class="btn" type="button" data-edit-prod="${p.id}" data-estilo="${p.estilos[0].id}">Editar</button>
            <button class="ghost btn-danger" type="button" data-del="${p.id}">Eliminar</button>
          </div>
        </div>
        ${p.estilos
          .map(
            (e) => `
            <div class="estilo-block">
              <div class="estilo-meta">
                <span class="badge-mini">${e.es_3d ? "3D" : "2D"}</span>
                <strong>${e.nombre}</strong>
                <span class="meta">${e.angulos_cubiertos?.length || 0}/6 fotos</span>
                <span class="meta${e.stock <= 2 ? " stock-bajo" : ""}">${e.stock} uds</span>
                <span class="price-mini">${money(e.costo)} → ${money(e.precio_venta)}</span>
              </div>
              <div class="card-actions">
                <button class="ghost" type="button" data-edit-prod="${p.id}" data-estilo="${e.id}">Editar ficha y fotos</button>
              </div>
              <form class="stock-adjust" data-stock="${e.id}">
                <input name="cantidad" type="number" placeholder="Ajuste: 5 o −2" required />
                <button class="ghost" type="submit">Ajustar stock</button>
              </form>
              <details class="fold">
                <summary>Agregar otro estilo</summary>
                <form class="form" data-estilo="${p.id}">
                  <div class="form-grid">
                    <label>Estilo<input name="nombre" required /></label>
                    <label>Color<input name="color_hex" type="color" value="${e.color_hex}" /></label>
                    <label>Costo<input name="costo" type="number" min="0" step="0.01" required /></label>
                    <label>Venta<input name="precio_venta" type="number" min="0" step="0.01" required /></label>
                    <label>Stock<input name="stock" type="number" min="0" step="1" value="0" required /></label>
                  </div>
                  <div class="row">
                    <p class="hint" data-progreso></p>
                    <button type="button" class="ghost" data-estudio>Estudio 3D</button>
                  </div>
                  <div class="angles"></div>
                  <button class="btn" type="submit">Guardar estilo</button>
                </form>
              </details>
            </div>`
          )
          .join("")}
      </article>`;
    })
    .join("");

  root.querySelectorAll("form[data-estilo]").forEach((form) => {
    montarAngulos(form.querySelector(".angles"));
    cablearEstudioForm(form);
    pintarProgreso(form);
  });

  root.querySelectorAll("[data-edit-prod]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const producto = inventario.find((p) => String(p.id) === String(btn.dataset.editProd));
      const estilo = producto?.estilos.find((e) => String(e.id) === String(btn.dataset.estilo));
      abrirEdicion(producto, estilo);
    });
  });

  root.querySelectorAll("[data-del]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("¿Borrar producto, fotos y movimientos?")) return;
      await HexaAPI.borrarProducto(btn.dataset.del);
      cargarLista();
    });
  });
  root.querySelectorAll("[data-stock]").forEach((form) => {
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const cantidad = Number(new FormData(form).get("cantidad"));
      try {
        await HexaAPI.ajustarStock(form.dataset.stock, cantidad, "Ajuste desde inventario");
      } catch (err) {
        return alert(err.message);
      }
      cargarLista();
    });
  });
  root.querySelectorAll("[data-estilo]").forEach((form) => {
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      try {
        await HexaAPI.agregarEstilo(form.dataset.estilo, form);
      } catch (err) {
        return alert(err.message);
      }
      cargarLista();
    });
  });
}

async function cargarLista() {
  try {
    inventario = await HexaAPI.productos();
  } catch (err) {
    document.getElementById("lista").innerHTML = `<p class="empty">${err.message}</p>`;
    return;
  }
  pintarLista();
}

document.getElementById("buscar-inv")?.addEventListener("input", (ev) => {
  filtroInv = ev.target.value || "";
  pintarLista();
});

cargarLista();
