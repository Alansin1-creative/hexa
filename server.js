const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const { db, ANGULOS, productoCompleto, uploadsDir } = require("./db");
const { registrarShop } = require("./shop");

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "0.0.0.0";

app.set("trust proxy", 1);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.get("/sw.js", (_req, res) => {
  res.set("Cache-Control", "no-cache");
  res.set("Service-Worker-Allowed", "/");
  res.type("application/javascript");
  res.sendFile(path.join(__dirname, "public", "sw.js"));
});
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(uploadsDir));

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase() || ".jpg";
    const safe = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, safe);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /^image\/(jpeg|png|webp|gif)$/i.test(file.mimetype);
    cb(ok ? null : new Error("Solo se aceptan imagenes JPG, PNG, WEBP o GIF"), ok);
  },
});

const camposAngulos = ANGULOS.map((angulo) => ({ name: angulo, maxCount: 1 }));

function guardarImagenes(estiloId, files) {
  if (!files) return;
  const replace = db.prepare(
    `INSERT INTO imagenes (estilo_id, angulo, archivo)
     VALUES (?, ?, ?)
     ON CONFLICT(estilo_id, angulo) DO UPDATE SET archivo = excluded.archivo`
  );
  const prev = db.prepare("SELECT archivo FROM imagenes WHERE estilo_id = ? AND angulo = ?");
  for (const angulo of ANGULOS) {
    const file = files[angulo]?.[0];
    if (!file) continue;
    const anterior = prev.get(estiloId, angulo);
    replace.run(estiloId, angulo, file.filename);
    if (anterior?.archivo) {
      const viejo = path.join(uploadsDir, anterior.archivo);
      if (fs.existsSync(viejo)) fs.unlinkSync(viejo);
    }
  }
}

registrarShop(app);

app.get("/api/angulos", (_req, res) => res.json(ANGULOS));

app.get("/api/productos", (_req, res) => {
  const ids = db.prepare("SELECT id FROM productos ORDER BY id DESC").all();
  res.json(ids.map((row) => productoCompleto(row.id)));
});

app.get("/api/productos/:id", (req, res) => {
  const producto = productoCompleto(Number(req.params.id));
  if (!producto) return res.status(404).json({ error: "Producto no encontrado" });
  res.json(producto);
});

app.post("/api/productos", upload.fields(camposAngulos), (req, res) => {
  try {
    const { nombre, descripcion, categoria, estilo_nombre, color_hex, costo, precio_venta, stock } =
      req.body;
    if (!nombre?.trim()) return res.status(400).json({ error: "El nombre es obligatorio" });
    const costoNum = Number(costo);
    const ventaNum = Number(precio_venta);
    const stockNum = Number.parseInt(stock, 10);
    if (!Number.isFinite(costoNum) || costoNum < 0) {
      return res.status(400).json({ error: "Costo invalido" });
    }
    if (!Number.isFinite(ventaNum) || ventaNum < 0) {
      return res.status(400).json({ error: "Precio de venta invalido" });
    }
    if (!Number.isInteger(stockNum) || stockNum < 0) {
      return res.status(400).json({ error: "Stock invalido" });
    }

    const crear = db.transaction(() => {
      const info = db
        .prepare(
          "INSERT INTO productos (nombre, descripcion, categoria) VALUES (?, ?, ?)"
        )
        .run(nombre.trim(), (descripcion || "").trim(), (categoria || "General").trim());
      const estilo = db
        .prepare(
          `INSERT INTO estilos (producto_id, nombre, color_hex, costo, precio_venta, stock)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(
          info.lastInsertRowid,
          (estilo_nombre || "Clasico").trim(),
          color_hex || "#c4a574",
          costoNum,
          ventaNum,
          stockNum
        );
      if (stockNum > 0) {
        db.prepare(
          `INSERT INTO movimientos (estilo_id, tipo, cantidad, costo_unitario, precio_unitario, ganancia, nota)
           VALUES (?, 'entrada', ?, ?, NULL, 0, 'Stock inicial')`
        ).run(estilo.lastInsertRowid, stockNum, costoNum);
      }
      guardarImagenes(estilo.lastInsertRowid, req.files);
      return info.lastInsertRowid;
    });

    res.status(201).json(productoCompleto(crear()));
  } catch (err) {
    res.status(400).json({ error: err.message || "No se pudo crear el producto" });
  }
});

app.post("/api/productos/:id/estilos", upload.fields(camposAngulos), (req, res) => {
  const producto = productoCompleto(Number(req.params.id));
  if (!producto) return res.status(404).json({ error: "Producto no encontrado" });
  try {
    const { nombre, color_hex, costo, precio_venta, stock } = req.body;
    const costoNum = Number(costo);
    const ventaNum = Number(precio_venta);
    const stockNum = Number.parseInt(stock, 10);
    if (!nombre?.trim()) return res.status(400).json({ error: "El estilo necesita un nombre" });
    if (!Number.isFinite(costoNum) || costoNum < 0) return res.status(400).json({ error: "Costo invalido" });
    if (!Number.isFinite(ventaNum) || ventaNum < 0) return res.status(400).json({ error: "Precio invalido" });
    if (!Number.isInteger(stockNum) || stockNum < 0) return res.status(400).json({ error: "Stock invalido" });

    const id = db.transaction(() => {
      const info = db
        .prepare(
          `INSERT INTO estilos (producto_id, nombre, color_hex, costo, precio_venta, stock)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(producto.id, nombre.trim(), color_hex || "#c4a574", costoNum, ventaNum, stockNum);
      if (stockNum > 0) {
        db.prepare(
          `INSERT INTO movimientos (estilo_id, tipo, cantidad, costo_unitario, precio_unitario, ganancia, nota)
           VALUES (?, 'entrada', ?, ?, NULL, 0, 'Stock inicial del estilo')`
        ).run(info.lastInsertRowid, stockNum, costoNum);
      }
      guardarImagenes(info.lastInsertRowid, req.files);
      db.prepare("UPDATE productos SET actualizado_en = datetime('now','localtime') WHERE id = ?").run(
        producto.id
      );
      return info.lastInsertRowid;
    })();

    res.status(201).json(productoCompleto(producto.id));
  } catch (err) {
    res.status(400).json({ error: err.message || "No se pudo agregar el estilo" });
  }
});

app.post("/api/estilos/:id/imagenes", upload.fields(camposAngulos), (req, res) => {
  const estilo = db.prepare("SELECT * FROM estilos WHERE id = ?").get(Number(req.params.id));
  if (!estilo) return res.status(404).json({ error: "Estilo no encontrado" });
  guardarImagenes(estilo.id, req.files);
  db.prepare("UPDATE productos SET actualizado_en = datetime('now','localtime') WHERE id = ?").run(
    estilo.producto_id
  );
  res.json(productoCompleto(estilo.producto_id));
});

app.post("/api/estilos/:id/stock", (req, res) => {
  const estilo = db.prepare("SELECT * FROM estilos WHERE id = ?").get(Number(req.params.id));
  if (!estilo) return res.status(404).json({ error: "Estilo no encontrado" });
  const cantidad = Number.parseInt(req.body.cantidad, 10);
  const nota = (req.body.nota || "Entrada de mercancia").trim();
  if (!Number.isInteger(cantidad) || cantidad === 0) {
    return res.status(400).json({ error: "Cantidad invalida" });
  }
  if (estilo.stock + cantidad < 0) {
    return res.status(400).json({ error: "El stock no puede quedar negativo" });
  }
  db.transaction(() => {
    db.prepare("UPDATE estilos SET stock = stock + ? WHERE id = ?").run(cantidad, estilo.id);
    db.prepare(
      `INSERT INTO movimientos (estilo_id, tipo, cantidad, costo_unitario, precio_unitario, ganancia, nota)
       VALUES (?, ?, ?, ?, NULL, 0, ?)`
    ).run(estilo.id, cantidad > 0 ? "entrada" : "ajuste", cantidad, estilo.costo, nota);
  })();
  res.json(productoCompleto(estilo.producto_id));
});

app.post("/api/estilos/:id/venta", (req, res) => {
  const estilo = db.prepare("SELECT * FROM estilos WHERE id = ?").get(Number(req.params.id));
  if (!estilo) return res.status(404).json({ error: "Estilo no encontrado" });
  const cantidad = Number.parseInt(req.body.cantidad, 10);
  if (!Number.isInteger(cantidad) || cantidad < 1) {
    return res.status(400).json({ error: "Cantidad de venta invalida" });
  }
  if (estilo.stock < cantidad) {
    return res.status(400).json({ error: `Stock insuficiente. Disponible: ${estilo.stock}` });
  }
  const ganancia = Number(((estilo.precio_venta - estilo.costo) * cantidad).toFixed(2));
  db.transaction(() => {
    db.prepare("UPDATE estilos SET stock = stock - ? WHERE id = ?").run(cantidad, estilo.id);
    db.prepare(
      `INSERT INTO movimientos (estilo_id, tipo, cantidad, costo_unitario, precio_unitario, ganancia, nota)
       VALUES (?, 'venta', ?, ?, ?, ?, 'Venta')`
    ).run(estilo.id, -cantidad, estilo.costo, estilo.precio_venta, ganancia);
  })();
  res.json({
    producto: productoCompleto(estilo.producto_id),
    venta: { cantidad, ganancia, total: Number((estilo.precio_venta * cantidad).toFixed(2)) },
  });
});

app.delete("/api/productos/:id", (req, res) => {
  const id = Number(req.params.id);
  const producto = productoCompleto(id);
  if (!producto) return res.status(404).json({ error: "Producto no encontrado" });
  for (const estilo of producto.estilos) {
    for (const archivo of Object.values(estilo.imagenes)) {
      const nombre = path.basename(archivo);
      const full = path.join(uploadsDir, nombre);
      if (fs.existsSync(full)) fs.unlinkSync(full);
    }
  }
  db.prepare("DELETE FROM productos WHERE id = ?").run(id);
  res.json({ ok: true });
});

app.get("/api/dashboard", (_req, res) => {
  const estilos = db.prepare("SELECT * FROM estilos").all();
  const ventas = db.prepare("SELECT * FROM movimientos WHERE tipo = 'venta' ORDER BY id DESC").all();
  const inventario_costo = estilos.reduce((s, e) => s + e.stock * e.costo, 0);
  const inventario_venta = estilos.reduce((s, e) => s + e.stock * e.precio_venta, 0);
  const ganancia_potencial = inventario_venta - inventario_costo;
  const unidades_vendidas = ventas.reduce((s, v) => s + Math.abs(v.cantidad), 0);
  const ingreso_ventas = ventas.reduce((s, v) => s + Math.abs(v.cantidad) * (v.precio_unitario || 0), 0);
  const ganancia_realizada = ventas.reduce((s, v) => s + v.ganancia, 0);
  const porProducto = db
    .prepare(
      `SELECT p.id, p.nombre, p.categoria,
              SUM(e.stock) AS stock,
              SUM(e.stock * e.costo) AS valor_costo,
              SUM(e.stock * e.precio_venta) AS valor_venta
       FROM productos p
       JOIN estilos e ON e.producto_id = p.id
       GROUP BY p.id
       ORDER BY p.nombre`
    )
    .all();

  res.json({
    inventario_costo: Number(inventario_costo.toFixed(2)),
    inventario_venta: Number(inventario_venta.toFixed(2)),
    ganancia_potencial: Number(ganancia_potencial.toFixed(2)),
    unidades_vendidas,
    ingreso_ventas: Number(ingreso_ventas.toFixed(2)),
    ganancia_realizada: Number(ganancia_realizada.toFixed(2)),
    margen_inventario_pct:
      inventario_costo > 0 ? Number(((ganancia_potencial / inventario_costo) * 100).toFixed(1)) : 0,
    productos: porProducto.map((p) => ({
      ...p,
      ganancia_potencial: Number((p.valor_venta - p.valor_costo).toFixed(2)),
    })),
    ventas_recientes: ventas.slice(0, 20).map((v) => {
      const estilo = db.prepare("SELECT * FROM estilos WHERE id = ?").get(v.estilo_id);
      const prod = estilo
        ? db.prepare("SELECT nombre FROM productos WHERE id = ?").get(estilo.producto_id)
        : null;
      return {
        ...v,
        producto: prod?.nombre || "—",
        estilo: estilo?.nombre || "—",
      };
    }),
  });
});

app.use((err, _req, res, _next) => {
  res.status(400).json({ error: err.message || "Error en la solicitud" });
});

app.listen(PORT, HOST, () => {
  console.log(`HEXA listo en http://${HOST}:${PORT}`);
});
