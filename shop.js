const crypto = require("crypto");
const { db, productoCompleto } = require("./db");

function normalizarTel(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("52")) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits;
}

function telValido(tel) {
  return /^\d{10}$/.test(tel);
}

function hashCodigo(codigo) {
  return crypto.createHash("sha256").update(String(codigo)).digest("hex");
}

function vitrinaDe(producto) {
  if (!producto) return null;
  return {
    id: producto.id,
    nombre: producto.nombre,
    descripcion: producto.descripcion,
    categoria: producto.categoria,
    stock_total: producto.stock_total,
    estilos: producto.estilos.map((e) => ({
      id: e.id,
      producto_id: e.producto_id,
      nombre: e.nombre,
      color_hex: e.color_hex,
      precio_venta: e.precio_venta,
      stock: e.stock,
      imagenes: e.imagenes,
      angulos_cubiertos: e.angulos_cubiertos,
      es_3d: e.es_3d,
    })),
  };
}

function registrarShop(app) {
  app.get("/api/vitrina", (_req, res) => {
    const ids = db.prepare("SELECT id FROM productos ORDER BY id DESC").all();
    res.json(
      ids
        .map((row) => vitrinaDe(productoCompleto(row.id)))
        .filter((p) => p.stock_total > 0 || p.estilos.some((e) => e.es_3d))
    );
  });

  app.get("/api/vitrina/:id", (req, res) => {
    const producto = vitrinaDe(productoCompleto(Number(req.params.id)));
    if (!producto) return res.status(404).json({ error: "Producto no encontrado" });
    res.json(producto);
  });

  app.post("/api/verificar/enviar", (req, res) => {
    const telefono = normalizarTel(req.body.telefono);
    if (!telValido(telefono)) {
      return res.status(400).json({ error: "Escribe un número de 10 dígitos." });
    }
    const reciente = db
      .prepare(
        `SELECT id FROM otp_codigos
         WHERE telefono = ? AND creado_en >= datetime('now','localtime','-45 seconds')
         LIMIT 1`
      )
      .get(telefono);
    if (reciente) {
      return res.status(429).json({ error: "Espera unos segundos antes de pedir otro código." });
    }
    const codigo = String(crypto.randomInt(100000, 1000000));
    db.prepare(
      `INSERT INTO otp_codigos (telefono, codigo_hash, expira)
       VALUES (?, ?, datetime('now','localtime','+10 minutes'))`
    ).run(telefono, hashCodigo(codigo));
    res.json({
      ok: true,
      telefono,
      expira_minutos: 10,
      demo_codigo: codigo,
      mensaje: "Código generado. En producción se enviaría por SMS a este número.",
    });
  });

  app.post("/api/verificar/confirmar", (req, res) => {
    const telefono = normalizarTel(req.body.telefono);
    const codigo = String(req.body.codigo || "").trim();
    if (!telValido(telefono) || !/^\d{6}$/.test(codigo)) {
      return res.status(400).json({ error: "Número o código inválido." });
    }
    const fila = db
      .prepare(
        `SELECT * FROM otp_codigos
         WHERE telefono = ? AND usado = 0 AND expira >= datetime('now','localtime')
         ORDER BY id DESC LIMIT 1`
      )
      .get(telefono);
    if (!fila || fila.codigo_hash !== hashCodigo(codigo)) {
      return res.status(400).json({ error: "El código no coincide o ya venció." });
    }
    const token = crypto.randomBytes(24).toString("hex");
    db.transaction(() => {
      db.prepare("UPDATE otp_codigos SET usado = 1 WHERE id = ?").run(fila.id);
      db.prepare(
        `INSERT INTO sesiones_verif (telefono, token, expira)
         VALUES (?, ?, datetime('now','localtime','+2 hours'))`
      ).run(telefono, token);
      const existe = db.prepare("SELECT id FROM clientes WHERE telefono = ?").get(telefono);
      if (!existe) {
        db.prepare("INSERT INTO clientes (telefono, verificado) VALUES (?, 1)").run(telefono);
      } else {
        db.prepare("UPDATE clientes SET verificado = 1 WHERE telefono = ?").run(telefono);
      }
    })();
    const cliente = db.prepare("SELECT * FROM clientes WHERE telefono = ?").get(telefono);
    res.json({
      ok: true,
      token,
      telefono,
      primera_compra: cliente.compras < 1,
    });
  });

  app.get("/api/verificar/estado", (req, res) => {
    const telefono = normalizarTel(req.query.telefono);
    if (!telValido(telefono)) return res.json({ verificado: false, primera_compra: true });
    const cliente = db.prepare("SELECT * FROM clientes WHERE telefono = ?").get(telefono);
    res.json({
      verificado: Boolean(cliente?.verificado),
      primera_compra: !cliente || cliente.compras < 1,
      nombre: cliente?.nombre || "",
    });
  });

  app.post("/api/pedidos", (req, res) => {
    const telefono = normalizarTel(req.body.telefono);
    const token = String(req.body.token || "");
    const nombre = String(req.body.nombre || "").trim();
    const metodo = String(req.body.metodo_pago || "");
    const direccion = String(req.body.direccion || "").trim();
    const compartir = Boolean(req.body.permiso_ubicacion);
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    const pagos = ["efectivo", "transferencia", "tarjeta"];

    if (!telValido(telefono)) return res.status(400).json({ error: "El teléfono es obligatorio (10 dígitos)." });
    if (nombre.length < 2) return res.status(400).json({ error: "Escribe tu nombre." });
    if (!pagos.includes(metodo)) return res.status(400).json({ error: "Elige un método de pago." });
    if (!items.length) return res.status(400).json({ error: "El carrito está vacío." });

    const sesion = db
      .prepare(
        `SELECT * FROM sesiones_verif
         WHERE telefono = ? AND token = ? AND expira >= datetime('now','localtime')`
      )
      .get(telefono, token);
    const cliente = db.prepare("SELECT * FROM clientes WHERE telefono = ?").get(telefono);
    const necesitaCodigo = !cliente || cliente.compras < 1 || !cliente.verificado;
    if (necesitaCodigo && !sesion) {
      return res.status(403).json({
        error: "Primera compra: confirma el código enviado a tu número para verificar que es tuyo.",
      });
    }
    if (!necesitaCodigo && !sesion) {
      return res.status(403).json({ error: "Vuelve a verificar tu número para este pedido." });
    }

    if (compartir) {
      const lat = Number(req.body.lat);
      const lng = Number(req.body.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return res.status(400).json({ error: "Aceptaste compartir ubicación, pero no llegó el GPS." });
      }
    } else if (direccion.length < 8) {
      return res.status(400).json({
        error: "Si no compartes GPS, escribe una dirección de entrega completa.",
      });
    }

    try {
      const pedidoId = db.transaction(() => {
        let total = 0;
        let ganancia = 0;
        const lineas = [];
        for (const item of items) {
          const cantidad = Number.parseInt(item.cantidad, 10);
          const estilo = db.prepare("SELECT * FROM estilos WHERE id = ?").get(Number(item.estilo_id));
          if (!estilo || !Number.isInteger(cantidad) || cantidad < 1) {
            throw new Error("Hay un artículo inválido en el carrito.");
          }
          if (estilo.stock < cantidad) {
            throw new Error(`Stock insuficiente de un artículo. Disponible: ${estilo.stock}`);
          }
          const prod = db.prepare("SELECT nombre FROM productos WHERE id = ?").get(estilo.producto_id);
          total += estilo.precio_venta * cantidad;
          ganancia += (estilo.precio_venta - estilo.costo) * cantidad;
          lineas.push({ estilo, cantidad, prod: prod?.nombre || "Producto" });
        }

        db.prepare("UPDATE clientes SET nombre = ?, compras = compras + 1 WHERE telefono = ?").run(
          nombre,
          telefono
        );
        const cli = db.prepare("SELECT id FROM clientes WHERE telefono = ?").get(telefono);
        const info = db
          .prepare(
            `INSERT INTO pedidos
             (cliente_id, nombre, telefono, metodo_pago, direccion, permiso_ubicacion, lat, lng, precision_m, total, ganancia)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            cli.id,
            nombre,
            telefono,
            metodo,
            direccion,
            compartir ? 1 : 0,
            compartir ? Number(req.body.lat) : null,
            compartir ? Number(req.body.lng) : null,
            compartir && Number.isFinite(Number(req.body.precision_m)) ? Number(req.body.precision_m) : null,
            Number(total.toFixed(2)),
            Number(ganancia.toFixed(2))
          );

        const insItem = db.prepare(
          `INSERT INTO pedido_items (pedido_id, estilo_id, producto_nombre, estilo_nombre, cantidad, precio_unitario)
           VALUES (?, ?, ?, ?, ?, ?)`
        );
        for (const linea of lineas) {
          insItem.run(
            info.lastInsertRowid,
            linea.estilo.id,
            linea.prod,
            linea.estilo.nombre,
            linea.cantidad,
            linea.estilo.precio_venta
          );
          db.prepare("UPDATE estilos SET stock = stock - ? WHERE id = ?").run(
            linea.cantidad,
            linea.estilo.id
          );
          const g = Number(
            ((linea.estilo.precio_venta - linea.estilo.costo) * linea.cantidad).toFixed(2)
          );
          db.prepare(
            `INSERT INTO movimientos (estilo_id, tipo, cantidad, costo_unitario, precio_unitario, ganancia, nota)
             VALUES (?, 'venta', ?, ?, ?, ?, ?)`
          ).run(
            linea.estilo.id,
            -linea.cantidad,
            linea.estilo.costo,
            linea.estilo.precio_venta,
            g,
            `Pedido #${info.lastInsertRowid}`
          );
        }
        return info.lastInsertRowid;
      })();

      res.status(201).json(pedidoPublico(pedidoId));
    } catch (err) {
      res.status(400).json({ error: err.message || "No se pudo crear el pedido" });
    }
  });

  app.get("/api/pedidos/:id", (req, res) => {
    const pedido = pedidoPublico(Number(req.params.id));
    if (!pedido) return res.status(404).json({ error: "Pedido no encontrado" });
    res.json(pedido);
  });

  app.get("/api/pedidos", (_req, res) => {
    const filas = db.prepare("SELECT * FROM pedidos ORDER BY id DESC LIMIT 80").all();
    res.json(filas.map((p) => pedidoPublico(p.id)));
  });
}

function pedidoPublico(id) {
  const pedido = db.prepare("SELECT * FROM pedidos WHERE id = ?").get(id);
  if (!pedido) return null;
  const items = db.prepare("SELECT * FROM pedido_items WHERE pedido_id = ?").all(id);
  return { ...pedido, items };
}

module.exports = { registrarShop };
