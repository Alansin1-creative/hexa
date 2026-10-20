function kpi(label, value) {
  return `<div class="stat"><span>${label}</span><strong>${value}</strong></div>`;
}

async function cargar() {
  const d = await (await fetch("/api/dashboard")).json();
  document.getElementById("kpis").innerHTML = [
    kpi("Valor del stock (costo)", money(d.inventario_costo)),
    kpi("Valor del stock (venta)", money(d.inventario_venta)),
    kpi("Ganancia potencial", money(d.ganancia_potencial)),
    kpi("Margen de inventario", `${d.margen_inventario_pct}%`),
    kpi("Unidades vendidas", d.unidades_vendidas),
    kpi("Ingresos por ventas", money(d.ingreso_ventas)),
    kpi("Ganancia realizada", money(d.ganancia_realizada)),
  ].join("");

  document.getElementById("tabla-productos").innerHTML = `
    <thead><tr><th>Producto</th><th>Stock</th><th>A costo</th><th>A venta</th><th>Ganancia potencial</th></tr></thead>
    <tbody>
      ${
        d.productos.length
          ? d.productos
              .map(
                (p) =>
                  `<tr><td>${p.nombre}</td><td class="${p.stock <= 2 ? "stock-bajo" : ""}">${p.stock}${p.stock <= 2 ? " · bajo" : ""}</td><td>${money(p.valor_costo)}</td><td>${money(p.valor_venta)}</td><td>${money(p.ganancia_potencial)}</td></tr>`
              )
              .join("")
          : `<tr><td colspan="5">Sin productos.</td></tr>`
      }
    </tbody>`;

  document.getElementById("tabla-ventas").innerHTML = `
    <thead><tr><th>Fecha</th><th>Producto</th><th>Estilo</th><th>Cantidad</th><th>Ganancia</th></tr></thead>
    <tbody>
      ${
        d.ventas_recientes.length
          ? d.ventas_recientes
              .map(
                (v) =>
                  `<tr><td>${v.creado_en}</td><td>${v.producto}</td><td>${v.estilo}</td><td>${Math.abs(v.cantidad)}</td><td>${money(v.ganancia)}</td></tr>`
              )
              .join("")
          : `<tr><td colspan="5">Todavía no hay ventas.</td></tr>`
      }
    </tbody>`;
}

cargar();
