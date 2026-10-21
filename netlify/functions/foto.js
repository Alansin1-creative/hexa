function permitido(raw) {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return false;
    if (u.hostname !== "firebasestorage.googleapis.com" && u.hostname !== "storage.googleapis.com") {
      return false;
    }
    return u.pathname.includes("green-a2929");
  } catch {
    return false;
  }
}

exports.handler = async (event) => {
  const raw = event.queryStringParameters?.u;
  if (!permitido(raw)) return { statusCode: 400, body: "url" };
  try {
    const r = await fetch(raw);
    if (!r.ok) return { statusCode: r.status, body: "fail" };
    const buf = Buffer.from(await r.arrayBuffer());
    return {
      statusCode: 200,
      isBase64Encoded: true,
      headers: {
        "Content-Type": r.headers.get("content-type") || "image/jpeg",
        "Cache-Control": "public, max-age=86400",
      },
      body: buf.toString("base64"),
    };
  } catch {
    return { statusCode: 502, body: "fail" };
  }
};
