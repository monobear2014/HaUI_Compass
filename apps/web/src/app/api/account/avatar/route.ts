import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import {
  accountAvatar,
  saveAccountAvatar,
  getSessionUser,
  sameOrigin,
  SESSION_COOKIE,
} from "@/lib/demo-auth";
export const runtime = "nodejs";
const headers = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};
async function handle(request: NextRequest) {
  if (request.method !== "GET" && !sameOrigin(request))
    return NextResponse.json(
      { error: "invalid_origin" },
      { status: 403, headers },
    );
  try {
    const user = await getSessionUser(
      request.cookies.get(SESSION_COOKIE)?.value,
    );
    if (!user)
      return NextResponse.json(
        { error: "unauthorized" },
        { status: 401, headers },
      );
    if (request.method === "GET")
      return NextResponse.json(
        { image: await accountAvatar(user) },
        { headers },
      );
    if (request.method === "DELETE") {
      await saveAccountAvatar(user, null);
      return NextResponse.json({ image: null }, { headers });
    }
    const limit = 5 * 1024 * 1024;
    const reader = request.body?.getReader();
    if (!reader)
      return NextResponse.json(
        { error: "invalid_image" },
        { status: 400, headers },
      );
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) {
        await reader.cancel();
        return NextResponse.json(
          { error: "image_too_large" },
          { status: 413, headers },
        );
      }
      chunks.push(value);
    }
    let image: string;
    try {
      const input = Buffer.concat(chunks);
      const decoder = sharp(input, {
        limitInputPixels: 25000000,
        animated: false,
      });
      const meta = await decoder.metadata();
      if (
        !meta.format ||
        !["jpeg", "png", "webp", "gif", "avif", "heif"].includes(meta.format)
      )
        throw new Error();
      const output = await decoder
        .rotate()
        .resize(384, 384, { fit: "cover" })
        .webp({ quality: 82 })
        .toBuffer();
      image = "data:image/webp;base64," + output.toString("base64");
    } catch {
      return NextResponse.json(
        { error: "invalid_image" },
        { status: 400, headers },
      );
    }
    await saveAccountAvatar(user, image);
    return NextResponse.json({ image }, { headers });
  } catch {
    return NextResponse.json(
      { error: "unavailable" },
      { status: 503, headers },
    );
  }
}
export const GET = handle;
export const PUT = handle;
export const DELETE = handle;
