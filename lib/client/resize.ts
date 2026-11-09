/**
 * アップロード前のクライアント側縮小。
 * 目的：Vercel のリクエスト本文上限（4.5MB）を超える写真（10MB 超など）でも送れるようにすること。
 * 最終的な「長辺768px・JPEG品質80」への変換はサーバー側（sharp）で行う。ここでは長辺 1536px に軽く縮めるだけ。
 * ブラウザが読めない形式（Chrome で HEIC など）は、4MB 以下なら元ファイルのまま送る。
 */
const CLIENT_LONG_EDGE = 1536;
const CLIENT_QUALITY = 0.85;
export const UPLOAD_LIMIT_BYTES = 4 * 1024 * 1024;

export class ImageTooLargeError extends Error {}

async function decode(file: Blob): Promise<{ draw: CanvasImageSource; w: number; h: number; close: () => void }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { draw: bmp, w: bmp.width, h: bmp.height, close: () => bmp.close() };
    } catch {
      /* 下の <img> でもう一度試す */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return { draw: img, w: img.naturalWidth, h: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

export async function prepareUpload(file: File): Promise<{ blob: Blob; fileName: string; previewUrl: string | null }> {
  try {
    const { draw, w, h, close } = await decode(file);
    const scale = Math.min(1, CLIENT_LONG_EDGE / Math.max(w, h));
    const cw = Math.max(1, Math.round(w * scale));
    const ch = Math.max(1, Math.round(h * scale));
    const canvas = document.createElement("canvas");
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas unavailable");
    ctx.drawImage(draw, 0, 0, cw, ch);
    close();
    const blob = await new Promise<Blob>((res, rej) =>
      canvas.toBlob((b) => (b ? res(b) : rej(new Error("toBlob failed"))), "image/jpeg", CLIENT_QUALITY),
    );
    const base = file.name.replace(/\.[^.]+$/, "") || "photo";
    return { blob, fileName: `${base}.jpg`, previewUrl: URL.createObjectURL(blob) };
  } catch {
    // ブラウザで読めない形式：小さければそのまま送り、サーバー側で判定してもらう
    if (file.size <= UPLOAD_LIMIT_BYTES) return { blob: file, fileName: file.name, previewUrl: null };
    throw new ImageTooLargeError("この写真はブラウザで縮小できず、サイズも大きすぎます。");
  }
}
