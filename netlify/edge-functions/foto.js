export default async (request) => {
  const raw = new URL(request.url).searchParams.get("u");
  let destino;
  try {
    destino = new URL(raw);
  } catch {
    return new Response("url", { status: 400 });
  }
  if (destino.protocol !== "https:") return new Response("url", { status: 400 });
  if (
    destino.hostname !== "firebasestorage.googleapis.com" &&
    destino.hostname !== "storage.googleapis.com"
  ) {
    return new Response("url", { status: 400 });
  }
  if (!destino.pathname.includes("green-a2929")) return new Response("url", { status: 400 });
  const r = await fetch(destino.href);
  return new Response(r.body, {
    status: r.status,
    headers: {
      "Content-Type": r.headers.get("content-type") || "image/jpeg",
      "Cache-Control": "public, max-age=86400",
    },
  });
};

export const config = { path: "/api/foto" };
