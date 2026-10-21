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
  container.querySelectorAll(".file-one").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      form.querySelector(`input[name="${btn.dataset.angulo}"]`)?.click();
    });
  });
  container.querySelectorAll("input[type=file]").forEach((input) => {
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (file) {
        guardarFotoLocal(form, input.getAttribute("name"), file);
        previewEnSlot(input, URL.createObjectURL(file));
      }
      pintarProgreso(form);
    });
  });
  container.querySelectorAll(".cam-one").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      iniciarEstudio({
        form,
        angulos: [btn.dataset.angulo],
        input: form.querySelector(`input[name="${btn.dataset.angulo}"]`),
      });
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

function abrirAlta() {
  if (!modalAlta) return;
  modalAlta.hidden = false;
  document.body.style.overflow = "hidden";
  alta?.querySelector("[name=nombre]")?.focus();
}

function cerrarAlta() {
  if (!modalAlta) return;
  modalAlta.hidden = true;
  document.body.style.overflow = "";
}

window.abrirAlta = abrirAlta;

[modalAlta, document.getElementById("estudio")].forEach((el) => {
  if (el && el.parentElement !== document.documentElement) {
    document.documentElement.appendChild(el);
  }
});

document.getElementById("btn-nuevo")?.addEventListener("click", abrirAlta);
document.getElementById("cerrar-alta")?.addEventListener("click", cerrarAlta);
modalAlta?.addEventListener("click", (ev) => {
  if (ev.target === modalAlta) cerrarAlta();
});
document.addEventListener("keydown", (ev) => {
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
  let data;
  try {
    data = await HexaAPI.crearProducto(alta);
  } catch (err) {
    msg.textContent = err.message || "No se pudo guardar";
    msg.className = "hint danger";
    return;
  }
  msg.textContent = data.estilos[0].es_3d
    ? "Guardado con modelo 3D (6 ángulos)."
    : "Guardado en 2D. Faltan fotos para el cubo 3D.";
  msg.className = "hint ok";
  alta.reset();
  alta.estilo_nombre.value = "Clásico";
  montarAngulos(document.getElementById("angles"));
  pintarProgreso(alta);
  cargarLista();
  cerrarAlta();
});

async function cargarLista() {
  let productos = [];
  try {
    productos = await HexaAPI.productos();
  } catch (err) {
    document.getElementById("lista").innerHTML = `<p class="empty">${err.message}</p>`;
    return;
  }
  const root = document.getElementById("lista");
  if (!productos.length) {
    root.innerHTML = `<p class="empty">No hay artículos en la base de datos.</p>`;
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
            <div class="meta">${p.categoria} · ${p.estilos.length} estilo${p.estilos.length > 1 ? "s" : ""} · ${p.stock_total} uds</div>
          </div>
          <button class="ghost" data-del="${p.id}">Eliminar</button>
        </div>
        ${p.estilos
          .map(
            (e) => `
            <div class="estilo-block">
              <div class="estilo-meta">
                <span class="badge-mini">${e.es_3d ? "3D" : "2D"}</span>
                <strong>${e.nombre}</strong>
                <span class="meta${e.stock <= 2 ? " stock-bajo" : ""}">${e.stock} uds</span>
                <span class="price-mini">${money(e.costo)} → ${money(e.precio_venta)}</span>
              </div>
              <form class="stock-adjust" data-stock="${e.id}">
                <input name="cantidad" type="number" placeholder="Ej. 5 o −2" required />
                <button class="ghost" type="submit">Ajustar</button>
              </form>
              <details class="fold">
                <summary>Fotos ${e.angulos_cubiertos?.length || 0}/6</summary>
                <form class="form" data-fotos="${e.id}">
                  <div class="row">
                    <p class="hint" data-progreso></p>
                    <button type="button" class="ghost" data-estudio>Estudio 3D</button>
                  </div>
                  <div class="angles"></div>
                  <button class="ghost" type="submit">Guardar fotos</button>
                </form>
              </details>
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

  root.querySelectorAll("form[data-fotos], form[data-estilo]").forEach((form) => {
    const estiloId = form.dataset.fotos;
    const estilo = productos.flatMap((p) => p.estilos).find((e) => String(e.id) === estiloId);
    montarAngulos(form.querySelector(".angles"), estilo?.imagenes || {});
    cablearEstudioForm(form);
    pintarProgreso(form);
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
  root.querySelectorAll("[data-fotos]").forEach((form) => {
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      try {
        await HexaAPI.guardarFotos(form.dataset.fotos, form);
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

cargarLista();
