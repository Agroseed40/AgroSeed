import { createHash } from "node:crypto";

const maxImageBytes = 750 * 1024;
const formats = {
  "image/png": (b) => b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
  "image/jpeg": (b) => b[0] === 255 && b[1] === 216 && b[2] === 255,
  "image/webp": (b) => b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP",
  "image/gif": (b) => /^GIF8[79]a$/.test(b.toString("ascii", 0, 6))
};

export async function saveCatalogImage(db, { type, content }) {
  const image = typeof content === "string" ? Buffer.from(content, "base64") : Buffer.alloc(0);
  if (image.length > maxImageBytes) throw Object.assign(new Error("Images must be 750 KB or smaller."), { statusCode: 413 });
  if (!Object.hasOwn(formats, type) || !formats[type](image)) {
    throw Object.assign(new Error("Choose a valid PNG, JPEG, WebP or GIF image."), { statusCode: 400 });
  }
  const id = createHash("sha256").update(image).digest("hex");
  await db.prepare("INSERT OR IGNORE INTO agroseed_catalog_images (id, content_type, content) VALUES (?, ?, ?)")
    .bind(id, type, [...image]).run();
  return { url: `/media/images/${id}` };
}

export async function serveCatalogImage(request, db, id) {
  const image = await db.prepare("SELECT content_type, content FROM agroseed_catalog_images WHERE id = ?").bind(id).first();
  if (!image) return new Response("Not found", { status: 404 });
  return new Response(request.method === "HEAD" ? null : new Uint8Array(image.content), {
    headers: {
      "Content-Type": image.content_type,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

export function catalogImageUrl(value) {
  const url = String(value || "").trim();
  if (!url || /^\/media\/images\/[a-f0-9]{64}$/.test(url)) return url;
  if (url.length <= 1000 && URL.canParse(url) && new URL(url).protocol === "https:") return url;
  throw Object.assign(new Error("Use an HTTPS image URL or upload an image."), { statusCode: 400 });
}
