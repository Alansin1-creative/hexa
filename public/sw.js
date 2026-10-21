const CACHE = "hexa-v6";
const APP_SHELL = [
  "/",
  "/admin.html",
  "/ganancias.html",
  "/producto.html",
  "/checkout.html",
  "/pedido.html",
  "/pedidos.html",
  "/offline.html",
  "/css/app.css",
  "/css/platform.css",
  "/js/platform-boot.js",
  "/js/platform.js",
  "/js/theme.js",
  "/js/catalogo.js",
  "/js/admin.js",
  "/js/camara.js",
  "/js/ganancias.js",
  "/js/producto.js",
  "/js/carrito.js",
  "/js/checkout.js",
  "/js/viewer3d.js",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.pathname.startsWith("/api/")) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(req, copy));
        return res;
      })
      .catch(async () => {
        const cached = await caches.match(req);
        return cached || caches.match("/offline.html");
      })
  );
});
