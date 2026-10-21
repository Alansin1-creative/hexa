const params = new URLSearchParams(location.search);
const id = params.get("id");

async function cargar() {
  try {
    render(await HexaAPI.vitrinaUno(id));
  } catch {
    document.getElementById("detalle").innerHTML = `<p class="empty">Producto no encontrado.</p>`;
  }
}

function render(producto) {
  const elegido = Number(new URLSearchParams(location.search).get("estilo")) || producto.estilos[0].id;
  const estilo = producto.estilos.find((e) => e.id === elegido) || producto.estilos[0];
  const imgs = Object.entries(estilo.imagenes);
  document.title = `HEXA · ${producto.nombre}`;
  document.getElementById("detalle").innerHTML = `
    <div>
      <div class="stage" id="stage">
        ${
          estilo.es_3d
            ? `<div id="viewer"></div>`
            : `<div class="gallery">${
                imgs.length
                  ? `<img id="foto-principal" src="${portada(estilo)}" alt="${producto.nombre}" />`
                  : `<p class="meta">Este estilo aún no tiene fotografías.</p>`
              }</div>`
        }
      </div>
      ${
        !estilo.es_3d && imgs.length
          ? `<div class="thumbs">${imgs
              .map(
                ([angulo, src]) =>
                  `<button type="button" data-src="${src}" title="${angulo}"><img src="${src}" alt="${angulo}" /></button>`
              )
              .join("")}</div>`
          : `<p class="hint" style="margin-top:12px">${
              estilo.es_3d
                ? "Arrastra el modelo para girarlo. El tamaño sigue las proporciones de las fotos."
                : "Faltan ángulos: se muestra en 2D."
            }</p>`
      }
    </div>
    <aside class="panel">
      <a class="back-link" href="/">← Volver al catálogo</a>
      <div class="kicker">${producto.categoria}</div>
      <h1>${producto.nombre}</h1>
      <p>${producto.descripcion || "Sin descripción."}</p>
      <div>
        <div class="meta">Estilos</div>
        <div class="swatches" style="margin-top:8px">
          ${producto.estilos
            .map(
              (e) =>
                `<a class="chip" href="/producto.html?id=${producto.id}&estilo=${e.id}" style="border-color:${e.id === estilo.id ? e.color_hex : ""}">${e.nombre}</a>`
            )
            .join("")}
        </div>
      </div>
      <div class="stats">
        <div class="stat"><span>Precio</span><strong>${money(estilo.precio_venta)}</strong></div>
        <div class="stat"><span>Disponibles</span><strong>${estilo.stock}</strong></div>
      </div>
      <form class="qty" id="al-carrito">
        <input type="number" name="cantidad" min="1" max="${Math.max(estilo.stock, 1)}" value="1" />
        <button class="btn" type="submit" ${estilo.stock < 1 ? "disabled" : ""}>${estilo.stock < 1 ? "Agotado" : "Agregar al carrito"}</button>
      </form>
      <p class="hint" id="cart-msg">${estilo.stock < 1 ? "Este estilo no tiene piezas." : "Puedes seguir viendo o ir a Pedido cuando quieras."}</p>
    </aside>
  `;

  if (estilo.es_3d) iniciarVisor(document.getElementById("viewer"), estilo.imagenes);
  document.querySelectorAll(".thumbs button").forEach((btn) => {
    btn.addEventListener("click", () => {
      const img = document.getElementById("foto-principal");
      if (img) img.src = btn.dataset.src;
    });
  });
  document.getElementById("al-carrito").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const cantidad = Number(new FormData(ev.target).get("cantidad"));
    agregarAlCarrito({
      estilo_id: estilo.id,
      nombre: producto.nombre,
      estilo: estilo.nombre,
      precio: estilo.precio_venta,
      cantidad,
    });
    const msg = document.getElementById("cart-msg");
    msg.innerHTML = `Listo, ya está en el carrito. <a href="/checkout.html">Ir a Pedido</a>`;
    msg.className = "hint ok";
  });
}

cargar();
