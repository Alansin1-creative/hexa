const ANGULOS_API = ["frente", "detras", "izquierda", "derecha", "arriba", "abajo"];

function firebaseListo() {
  const c = window.FIREBASE_CONFIG;
  return Boolean(c && c.apiKey && !String(c.apiKey).startsWith("PEGAR"));
}

function exigirFirebase() {
  if (firebaseListo()) return;
  throw new Error("Falta la config de Firebase. Ábrela en /js/firebase-config.js");
}

function errorHexa(err) {
  const code = String(err?.code || "");
  const msg = String(err?.message || err || "");
  if (code.includes("permission-denied") || /insufficient permissions/i.test(msg)) {
    return new Error(
      "Firestore bloqueó el guardado. En Firebase Console → Firestore Database → Reglas publica: allow read, write: if true;"
    );
  }
  return err instanceof Error ? err : new Error(msg);
}

(function initFirebase() {
  if (!firebaseListo()) {
    document.addEventListener("DOMContentLoaded", () => {
      if (document.querySelector(".fb-setup")) return;
      const bar = document.createElement("div");
      bar.className = "fb-setup";
      bar.innerHTML =
        "HEXA usa Firebase. En la consola crea Hosting, Firestore y Storage, pega la config en <code>public/js/firebase-config.js</code> y despliega.";
      document.body.prepend(bar);
    });
    return;
  }
  if (!firebase.apps.length) firebase.initializeApp(window.FIREBASE_CONFIG);
})();

function db() {
  exigirFirebase();
  return firebase.firestore();
}
function bucket() {
  exigirFirebase();
  const gs = `gs://${window.FIREBASE_CONFIG.projectId}.appspot.com`;
  try {
    return firebase.app().storage(gs);
  } catch (_) {
    return firebase.storage();
  }
}

function mensajeStorage(err) {
  const code = String(err?.code || "");
  const server = String(err?.serverResponse || err?.customData?.serverResponse || err?.message || "");
  if (code.includes("unauthorized") || server.includes("403")) {
    return "Storage bloqueó la subida. En Firebase Console → Storage → Reglas deja: allow read, write: if true;";
  }
  if (code.includes("unauthenticated")) {
    return "Storage pide sesión. En las reglas de Storage permite escritura sin login.";
  }
  if (code.includes("quota") || server.includes("quota")) {
    return "Se llenó la cuota gratis de Storage.";
  }
  if (server.includes("404") || code.includes("object-not-found")) {
    return "Storage no está creado. En Firebase Console abre Storage y pulsa Comenzar.";
  }
  return "No se pudieron subir las fotos a Storage. En Firebase Console abre Storage, pulsa Comenzar si no está activo, y publica reglas abiertas (allow read, write: if true).";
}

function nowIso() {
  return new Date().toISOString();
}

function normalizarTel(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("52")) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits.slice(-10);
}

function telValido(tel) {
  return /^\d{10}$/.test(tel);
}

async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(text)));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function enriquecer(id, data) {
  const estilos = (data.estilos || []).map((estilo) => {
    const imagenes = estilo.imagenes || {};
    const cubiertas = ANGULOS_API.filter((a) => imagenes[a]);
    return {
      ...estilo,
      imagenes,
      angulos_cubiertos: cubiertas,
      es_3d: cubiertas.length === ANGULOS_API.length,
      ganancia_unitaria: Number((Number(estilo.precio_venta) - Number(estilo.costo)).toFixed(2)),
    };
  });
  return {
    id,
    ...data,
    estilos,
    stock_total: estilos.reduce((s, e) => s + Number(e.stock || 0), 0),
  };
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
      producto_id: producto.id,
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

async function leerProducto(id) {
  const snap = await db().collection("productos").doc(String(id)).get();
  if (!snap.exists) return null;
  return enriquecer(snap.id, snap.data());
}

async function listarProductos() {
  const snap = await db().collection("productos").get();
  return snap.docs
    .map((d) => enriquecer(d.id, d.data()))
    .sort((a, b) => String(b.creado_en || "").localeCompare(String(a.creado_en || "")));
}

async function findEstilo(estiloId) {
  const productos = await listarProductos();
  for (const p of productos) {
    const e = p.estilos.find((x) => String(x.id) === String(estiloId));
    if (e) return { productoId: p.id, producto: p, estilo: e };
  }
  return null;
}

async function aJpeg(file) {
  if (file.type === "image/jpeg" && file.size < 6 * 1024 * 1024) return file;
  if (typeof createImageBitmap === "function") {
    const bmp = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width = bmp.width;
    canvas.height = bmp.height;
    canvas.getContext("2d").drawImage(bmp, 0, 0);
    bmp.close?.();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
    if (blob) return new File([blob], "foto.jpg", { type: "image/jpeg" });
  }
  return new File([file], "foto.jpg", { type: "image/jpeg" });
}

async function subirUno(prefijo, angulo, file) {
  const jpeg = await aJpeg(file);
  const path = `${prefijo}/${angulo}-${Date.now()}.jpg`;
  const intentos = [
    () => firebase.app().storage(`gs://${window.FIREBASE_CONFIG.projectId}.appspot.com`).ref(path),
    () => firebase.storage().ref(path),
  ];
  let lastErr;
  for (const refDe of intentos) {
    try {
      const ref = refDe();
      await ref.put(jpeg, { contentType: "image/jpeg" });
      return await ref.getDownloadURL();
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

async function subirAngulos(prefijo, form) {
  const urls = {};
  try {
    for (const angulo of ANGULOS_API) {
      const file =
        form?._hexaFotos?.[angulo] || form?.querySelector(`input[name="${angulo}"]`)?.files?.[0];
      if (!file) continue;
      urls[angulo] = await subirUno(prefijo, angulo, file);
    }
  } catch (err) {
    throw new Error(mensajeStorage(err));
  }
  return urls;
}

async function crearProductoInterno(form) {
  const fd = new FormData(form);
  const nombre = String(fd.get("nombre") || "").trim();
  const costoNum = Number(fd.get("costo"));
  const ventaNum = Number(fd.get("precio_venta"));
  const stockNum = Number.parseInt(fd.get("stock"), 10);
  if (!nombre) throw new Error("El nombre es obligatorio");
  if (!Number.isFinite(costoNum) || costoNum < 0) throw new Error("Costo inválido");
  if (!Number.isFinite(ventaNum) || ventaNum < 0) throw new Error("Precio de venta inválido");
  if (!Number.isInteger(stockNum) || stockNum < 0) throw new Error("Stock inválido");
  const estiloId = uid();
  const imagenes = await subirAngulos(`estilos/${estiloId}`, form);
  const estilo = {
    id: estiloId,
    nombre: String(fd.get("estilo_nombre") || "Clásico").trim(),
    color_hex: fd.get("color_hex") || "#c4a574",
    costo: costoNum,
    precio_venta: ventaNum,
    stock: stockNum,
    imagenes,
  };
  const ref = await db().collection("productos").add({
    nombre,
    descripcion: String(fd.get("descripcion") || "").trim(),
    categoria: String(fd.get("categoria") || "General").trim(),
    creado_en: nowIso(),
    actualizado_en: nowIso(),
    estilos: [estilo],
  });
  if (stockNum > 0) {
    await db().collection("movimientos").add({
      estilo_id: estiloId,
      tipo: "entrada",
      cantidad: stockNum,
      costo_unitario: costoNum,
      precio_unitario: null,
      ganancia: 0,
      nota: "Stock inicial",
      producto: nombre,
      estilo: estilo.nombre,
      creado_en: nowIso(),
    });
  }
  return leerProducto(ref.id);
}

async function actualizarProductoInterno(productoId, estiloId, form) {
  const fd = new FormData(form);
  const nombre = String(fd.get("nombre") || "").trim();
  const costoNum = Number(fd.get("costo"));
  const ventaNum = Number(fd.get("precio_venta"));
  const stockNum = Number.parseInt(fd.get("stock"), 10);
  if (!nombre) throw new Error("El nombre es obligatorio");
  if (!Number.isFinite(costoNum) || costoNum < 0) throw new Error("Costo inválido");
  if (!Number.isFinite(ventaNum) || ventaNum < 0) throw new Error("Precio de venta inválido");
  if (!Number.isInteger(stockNum) || stockNum < 0) throw new Error("Stock inválido");
  const hallado = await findEstilo(estiloId);
  if (!hallado || String(hallado.productoId) !== String(productoId)) {
    throw new Error("Producto no encontrado");
  }
  const nuevas = await subirAngulos(`estilos/${estiloId}`, form);
  const ref = db().collection("productos").doc(String(productoId));
  let deltaStock = 0;
  let estiloNombre = "";
  await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error("Producto no encontrado");
    const data = snap.data();
    const estilos = [...(data.estilos || [])];
    const i = estilos.findIndex((e) => String(e.id) === String(estiloId));
    if (i < 0) throw new Error("Estilo no encontrado");
    const prev = estilos[i];
    deltaStock = stockNum - Number(prev.stock || 0);
    estiloNombre = String(fd.get("estilo_nombre") || prev.nombre || "Clásico").trim();
    estilos[i] = {
      ...prev,
      nombre: estiloNombre,
      color_hex: fd.get("color_hex") || prev.color_hex,
      costo: costoNum,
      precio_venta: ventaNum,
      stock: stockNum,
      imagenes: { ...(prev.imagenes || {}), ...nuevas },
    };
    tx.update(ref, {
      nombre,
      descripcion: String(fd.get("descripcion") || "").trim(),
      categoria: String(fd.get("categoria") || "General").trim(),
      estilos,
      actualizado_en: nowIso(),
    });
  });
  if (deltaStock !== 0) {
    await db().collection("movimientos").add({
      estilo_id: estiloId,
      tipo: deltaStock > 0 ? "entrada" : "ajuste",
      cantidad: deltaStock,
      costo_unitario: costoNum,
      precio_unitario: null,
      ganancia: 0,
      nota: "Edición de producto",
      producto: nombre,
      estilo: estiloNombre,
      creado_en: nowIso(),
    });
  }
  return leerProducto(productoId);
}

async function siguientePedido() {
  const ref = db().collection("meta").doc("contadores");
  return db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const n = Number(snap.exists ? snap.data().pedido || 0 : 0) + 1;
    tx.set(ref, { pedido: n }, { merge: true });
    return n;
  });
}

const HexaAPI = {
  async vitrina() {
    return (await listarProductos()).map(vitrinaDe).filter((p) => p.stock_total > 0);
  },
  async vitrinaUno(id) {
    const p = vitrinaDe(await leerProducto(id));
    if (!p) throw new Error("Producto no encontrado");
    return p;
  },
  async productos() {
    return listarProductos();
  },
  async crearProducto(form) {
    try {
      return await crearProductoInterno(form);
    } catch (err) {
      throw errorHexa(err);
    }
  },
  async actualizarProducto(productoId, estiloId, form) {
    try {
      return await actualizarProductoInterno(productoId, estiloId, form);
    } catch (err) {
      throw errorHexa(err);
    }
  },
  async borrarProducto(id) {
    await db().collection("productos").doc(String(id)).delete();
    return { ok: true };
  },
  async agregarEstilo(productoId, form) {
    const fd = new FormData(form);
    const nombre = String(fd.get("nombre") || "").trim();
    const costoNum = Number(fd.get("costo"));
    const ventaNum = Number(fd.get("precio_venta"));
    const stockNum = Number.parseInt(fd.get("stock"), 10);
    if (!nombre) throw new Error("El estilo necesita un nombre");
    const estiloId = uid();
    const imagenes = await subirAngulos(`estilos/${estiloId}`, form);
    const estilo = {
      id: estiloId,
      nombre,
      color_hex: fd.get("color_hex") || "#c4a574",
      costo: costoNum,
      precio_venta: ventaNum,
      stock: stockNum,
      imagenes,
    };
    const ref = db().collection("productos").doc(String(productoId));
    await db().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error("Producto no encontrado");
      const estilos = [...(snap.data().estilos || []), estilo];
      tx.update(ref, { estilos, actualizado_en: nowIso() });
    });
    if (stockNum > 0) {
      const prod = await leerProducto(productoId);
      await db().collection("movimientos").add({
        estilo_id: estiloId,
        tipo: "entrada",
        cantidad: stockNum,
        costo_unitario: costoNum,
        precio_unitario: null,
        ganancia: 0,
        nota: "Stock inicial del estilo",
        producto: prod?.nombre || "",
        estilo: nombre,
        creado_en: nowIso(),
      });
    }
    return leerProducto(productoId);
  },
  async guardarFotos(estiloId, form) {
    const nuevas = await subirAngulos(`estilos/${estiloId}`, form);
    if (!Object.keys(nuevas).length) throw new Error("No hay fotos nuevas");
    const snap = await db().collection("productos").get();
    for (const doc of snap.docs) {
      const estilos = doc.data().estilos || [];
      const i = estilos.findIndex((e) => String(e.id) === String(estiloId));
      if (i < 0) continue;
      estilos[i] = { ...estilos[i], imagenes: { ...(estilos[i].imagenes || {}), ...nuevas } };
      await doc.ref.update({ estilos, actualizado_en: nowIso() });
      return enriquecer(doc.id, { ...doc.data(), estilos });
    }
    throw new Error("Estilo no encontrado");
  },
  async ajustarStock(estiloId, cantidad, nota) {
    const n = Number.parseInt(cantidad, 10);
    if (!Number.isInteger(n) || n === 0) throw new Error("Cantidad inválida");
    const hallado = await findEstilo(estiloId);
    if (!hallado) throw new Error("Estilo no encontrado");
    let costo = 0;
    let productoNombre = "";
    let estiloNombre = "";
    const productoId = hallado.productoId;
    await db().runTransaction(async (tx) => {
      const ref = db().collection("productos").doc(productoId);
      const snap = await tx.get(ref);
      const estilos = [...(snap.data().estilos || [])];
      const i = estilos.findIndex((e) => String(e.id) === String(estiloId));
      if (i < 0) throw new Error("Estilo no encontrado");
      if (estilos[i].stock + n < 0) throw new Error("El stock no puede quedar negativo");
      estilos[i] = { ...estilos[i], stock: estilos[i].stock + n };
      costo = estilos[i].costo;
      estiloNombre = estilos[i].nombre;
      productoNombre = snap.data().nombre;
      tx.update(ref, { estilos, actualizado_en: nowIso() });
    });
    await db().collection("movimientos").add({
      estilo_id: estiloId,
      tipo: n > 0 ? "entrada" : "ajuste",
      cantidad: n,
      costo_unitario: costo,
      precio_unitario: null,
      ganancia: 0,
      nota: nota || "Ajuste desde inventario",
      producto: productoNombre,
      estilo: estiloNombre,
      creado_en: nowIso(),
    });
    return leerProducto(productoId);
  },
  async estadoTel(telefono) {
    const tel = normalizarTel(telefono);
    if (!telValido(tel)) return { verificado: false, primera_compra: true, nombre: "" };
    const snap = await db().collection("clientes").doc(tel).get();
    const c = snap.exists ? snap.data() : null;
    return {
      verificado: Boolean(c?.verificado),
      primera_compra: !c || Number(c.compras || 0) < 1,
      nombre: c?.nombre || "",
    };
  },
  async enviarCodigo(telefono) {
    const tel = normalizarTel(telefono);
    if (!telValido(tel)) throw new Error("Escribe un número de 10 dígitos.");
    const ref = db().collection("otps").doc(tel);
    const prev = await ref.get();
    if (prev.exists && Date.now() - Number(prev.data().creado_ms || 0) < 45000) {
      throw new Error("Espera unos segundos antes de pedir otro código.");
    }
    const codigo = String(Math.floor(100000 + Math.random() * 900000));
    await ref.set({
      hash: await sha256(codigo),
      expira_ms: Date.now() + 10 * 60 * 1000,
      usado: false,
      creado_ms: Date.now(),
    });
    return {
      ok: true,
      telefono: tel,
      demo_codigo: codigo,
      mensaje: "Código generado. En producción se enviaría por SMS a este número.",
    };
  },
  async confirmarCodigo(telefono, codigo) {
    const tel = normalizarTel(telefono);
    const pin = String(codigo || "").trim();
    if (!telValido(tel) || !/^\d{6}$/.test(pin)) throw new Error("Número o código inválido.");
    const otpRef = db().collection("otps").doc(tel);
    const fila = await otpRef.get();
    const data = fila.exists ? fila.data() : null;
    if (!data || data.usado || Date.now() > data.expira_ms || data.hash !== (await sha256(pin))) {
      throw new Error("El código no coincide o ya venció.");
    }
    const token = [...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2, "0")).join("");
    await otpRef.update({ usado: true });
    await db().collection("sesiones").doc(token).set({
      telefono: tel,
      expira_ms: Date.now() + 2 * 60 * 60 * 1000,
    });
    const cli = db().collection("clientes").doc(tel);
    const existe = await cli.get();
    if (!existe.exists) await cli.set({ telefono: tel, nombre: "", verificado: true, compras: 0, creado_en: nowIso() });
    else await cli.update({ verificado: true });
    const cliente = (await cli.get()).data();
    return { ok: true, token, telefono: tel, primera_compra: Number(cliente.compras || 0) < 1 };
  },
  async crearPedido(body) {
    const telefono = normalizarTel(body.telefono);
    const token = String(body.token || "");
    const nombre = String(body.nombre || "").trim();
    const metodo = String(body.metodo_pago || "");
    const direccion = String(body.direccion || "").trim();
    const compartir = Boolean(body.permiso_ubicacion);
    const items = Array.isArray(body.items) ? body.items : [];
    const pagos = ["efectivo", "transferencia", "tarjeta"];
    if (!telValido(telefono)) throw new Error("El teléfono es obligatorio (10 dígitos).");
    if (nombre.length < 2) throw new Error("Escribe tu nombre.");
    if (!pagos.includes(metodo)) throw new Error("Elige un método de pago.");
    if (!items.length) throw new Error("El carrito está vacío.");
    const ses = await db().collection("sesiones").doc(token).get();
    if (!ses.exists || ses.data().telefono !== telefono || Date.now() > ses.data().expira_ms) {
      throw new Error("Confirma el código de tu teléfono antes de pedir.");
    }
    if (compartir) {
      if (!Number.isFinite(Number(body.lat)) || !Number.isFinite(Number(body.lng))) {
        throw new Error("Aceptaste compartir ubicación, pero no llegó el GPS.");
      }
    } else if (direccion.length < 8) {
      throw new Error("Si no compartes GPS, escribe una dirección de entrega completa.");
    }

    const productos = await listarProductos();
    const lineas = [];
    let total = 0;
    let ganancia = 0;
    for (const item of items) {
      const cantidad = Number.parseInt(item.cantidad, 10);
      let found = null;
      let prod = null;
      for (const p of productos) {
        const e = p.estilos.find((x) => String(x.id) === String(item.estilo_id));
        if (e) {
          found = e;
          prod = p;
          break;
        }
      }
      if (!found || !Number.isInteger(cantidad) || cantidad < 1) throw new Error("Hay un artículo inválido en el carrito.");
      if (found.stock < cantidad) throw new Error(`Stock insuficiente. Disponible: ${found.stock}`);
      total += found.precio_venta * cantidad;
      ganancia += (found.precio_venta - found.costo) * cantidad;
      lineas.push({ estilo: found, producto: prod, cantidad });
    }

    const nro = await siguientePedido();
    const pedidoId = String(nro);
    await db().runTransaction(async (tx) => {
      const refs = [...new Set(lineas.map((l) => l.producto.id))].map((id) => db().collection("productos").doc(id));
      const snaps = await Promise.all(refs.map((r) => tx.get(r)));
      snaps.forEach((snap, idx) => {
        const estilos = [...(snap.data().estilos || [])];
        for (const linea of lineas) {
          if (linea.producto.id !== refs[idx].id) continue;
          const i = estilos.findIndex((e) => String(e.id) === String(linea.estilo.id));
          if (i < 0) throw new Error("Estilo no encontrado");
          if (estilos[i].stock < linea.cantidad) throw new Error("Stock insuficiente");
          estilos[i] = { ...estilos[i], stock: estilos[i].stock - linea.cantidad };
        }
        tx.update(refs[idx], { estilos, actualizado_en: nowIso() });
      });
    });

    const cli = db().collection("clientes").doc(telefono);
    const cSnap = await cli.get();
    if (cSnap.exists) await cli.update({ nombre, compras: Number(cSnap.data().compras || 0) + 1 });
    else await cli.set({ telefono, nombre, verificado: true, compras: 1, creado_en: nowIso() });

    const pedido = {
      id: nro,
      nombre,
      telefono,
      metodo_pago: metodo,
      direccion,
      permiso_ubicacion: compartir,
      lat: compartir ? Number(body.lat) : null,
      lng: compartir ? Number(body.lng) : null,
      precision_m: compartir ? Number(body.precision_m) || null : null,
      total: Number(total.toFixed(2)),
      ganancia: Number(ganancia.toFixed(2)),
      estado: "nuevo",
      creado_en: nowIso(),
      items: lineas.map((l) => ({
        estilo_id: l.estilo.id,
        producto_nombre: l.producto.nombre,
        estilo_nombre: l.estilo.nombre,
        cantidad: l.cantidad,
        precio_unitario: l.estilo.precio_venta,
      })),
    };
    await db().collection("pedidos").doc(pedidoId).set(pedido);
    for (const l of lineas) {
      const g = Number(((l.estilo.precio_venta - l.estilo.costo) * l.cantidad).toFixed(2));
      await db().collection("movimientos").add({
        estilo_id: l.estilo.id,
        tipo: "venta",
        cantidad: -l.cantidad,
        costo_unitario: l.estilo.costo,
        precio_unitario: l.estilo.precio_venta,
        ganancia: g,
        nota: `Pedido #${nro}`,
        producto: l.producto.nombre,
        estilo: l.estilo.nombre,
        creado_en: nowIso(),
      });
    }
    return pedido;
  },
  async pedido(id) {
    const snap = await db().collection("pedidos").doc(String(id)).get();
    if (!snap.exists) throw new Error("Pedido no encontrado");
    return { id: snap.id, ...snap.data() };
  },
  async pedidos() {
    const snap = await db().collection("pedidos").get();
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => Number(b.id) - Number(a.id))
      .slice(0, 80);
  },
  async dashboard() {
    const productos = await listarProductos();
    const mov = await db().collection("movimientos").get();
    const movimientos = mov.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => String(b.creado_en || "").localeCompare(String(a.creado_en || "")));
    const ventas = movimientos.filter((m) => m.tipo === "venta");
    const estilos = productos.flatMap((p) => p.estilos);
    const inventario_costo = estilos.reduce((s, e) => s + e.stock * e.costo, 0);
    const inventario_venta = estilos.reduce((s, e) => s + e.stock * e.precio_venta, 0);
    const ganancia_potencial = inventario_venta - inventario_costo;
    return {
      inventario_costo: Number(inventario_costo.toFixed(2)),
      inventario_venta: Number(inventario_venta.toFixed(2)),
      ganancia_potencial: Number(ganancia_potencial.toFixed(2)),
      unidades_vendidas: ventas.reduce((s, v) => s + Math.abs(v.cantidad), 0),
      ingreso_ventas: Number(
        ventas.reduce((s, v) => s + Math.abs(v.cantidad) * (v.precio_unitario || 0), 0).toFixed(2)
      ),
      ganancia_realizada: Number(ventas.reduce((s, v) => s + Number(v.ganancia || 0), 0).toFixed(2)),
      margen_inventario_pct:
        inventario_costo > 0 ? Number(((ganancia_potencial / inventario_costo) * 100).toFixed(1)) : 0,
      productos: productos.map((p) => ({
        id: p.id,
        nombre: p.nombre,
        categoria: p.categoria,
        stock: p.stock_total,
        valor_costo: p.estilos.reduce((s, e) => s + e.stock * e.costo, 0),
        valor_venta: p.estilos.reduce((s, e) => s + e.stock * e.precio_venta, 0),
        ganancia_potencial: p.estilos.reduce((s, e) => s + e.stock * (e.precio_venta - e.costo), 0),
      })),
      ventas_recientes: ventas.slice(0, 20),
    };
  },
};
