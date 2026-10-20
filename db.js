const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const persistRoot =
  process.env.DATA_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH || null;
const dataDir = persistRoot || path.join(__dirname, "data");
const uploadsDir = persistRoot
  ? path.join(persistRoot, "uploads")
  : path.join(__dirname, "uploads");
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(uploadsDir, { recursive: true });

const dbPath = path.join(dataDir, "tienda.db");
const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS productos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    descripcion TEXT NOT NULL DEFAULT '',
    categoria TEXT NOT NULL DEFAULT 'General',
    creado_en TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    actualizado_en TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS estilos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    producto_id INTEGER NOT NULL,
    nombre TEXT NOT NULL,
    color_hex TEXT NOT NULL DEFAULT '#c4a574',
    costo REAL NOT NULL,
    precio_venta REAL NOT NULL,
    stock INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS imagenes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    estilo_id INTEGER NOT NULL,
    angulo TEXT NOT NULL,
    archivo TEXT NOT NULL,
    UNIQUE (estilo_id, angulo),
    FOREIGN KEY (estilo_id) REFERENCES estilos(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS movimientos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    estilo_id INTEGER NOT NULL,
    tipo TEXT NOT NULL,
    cantidad INTEGER NOT NULL,
    costo_unitario REAL NOT NULL,
    precio_unitario REAL,
    ganancia REAL NOT NULL DEFAULT 0,
    nota TEXT NOT NULL DEFAULT '',
    creado_en TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (estilo_id) REFERENCES estilos(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS clientes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telefono TEXT NOT NULL UNIQUE,
    nombre TEXT NOT NULL DEFAULT '',
    verificado INTEGER NOT NULL DEFAULT 0,
    compras INTEGER NOT NULL DEFAULT 0,
    creado_en TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS otp_codigos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telefono TEXT NOT NULL,
    codigo_hash TEXT NOT NULL,
    expira TEXT NOT NULL,
    usado INTEGER NOT NULL DEFAULT 0,
    creado_en TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS sesiones_verif (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telefono TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE,
    expira TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS pedidos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id INTEGER NOT NULL,
    nombre TEXT NOT NULL,
    telefono TEXT NOT NULL,
    metodo_pago TEXT NOT NULL,
    direccion TEXT NOT NULL DEFAULT '',
    permiso_ubicacion INTEGER NOT NULL DEFAULT 0,
    lat REAL,
    lng REAL,
    precision_m REAL,
    total REAL NOT NULL,
    ganancia REAL NOT NULL DEFAULT 0,
    estado TEXT NOT NULL DEFAULT 'nuevo',
    creado_en TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (cliente_id) REFERENCES clientes(id)
  );

  CREATE TABLE IF NOT EXISTS pedido_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pedido_id INTEGER NOT NULL,
    estilo_id INTEGER NOT NULL,
    producto_nombre TEXT NOT NULL,
    estilo_nombre TEXT NOT NULL,
    cantidad INTEGER NOT NULL,
    precio_unitario REAL NOT NULL,
    FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE
  );
`);

const ANGULOS = ["frente", "detras", "izquierda", "derecha", "arriba", "abajo"];

function productoCompleto(id) {
  const producto = db.prepare("SELECT * FROM productos WHERE id = ?").get(id);
  if (!producto) return null;
  const estilos = db.prepare("SELECT * FROM estilos WHERE producto_id = ? ORDER BY id").all(id);
  producto.estilos = estilos.map((estilo) => {
    const imagenes = db
      .prepare("SELECT angulo, archivo FROM imagenes WHERE estilo_id = ?")
      .all(estilo.id);
    const mapa = Object.fromEntries(imagenes.map((img) => [img.angulo, `/uploads/${img.archivo}`]));
    const cubiertas = ANGULOS.filter((a) => mapa[a]);
    return {
      ...estilo,
      imagenes: mapa,
      angulos_cubiertos: cubiertas,
      es_3d: cubiertas.length === ANGULOS.length,
      ganancia_unitaria: Number((estilo.precio_venta - estilo.costo).toFixed(2)),
    };
  });
  producto.stock_total = producto.estilos.reduce((s, e) => s + e.stock, 0);
  return producto;
}

module.exports = { db, ANGULOS, productoCompleto, uploadsDir };
