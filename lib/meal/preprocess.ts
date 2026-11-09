import sharp from "sharp";

/** API に送る前の共通前処理（コストと速度の要。変更しないこと） */
export const PREPROCESS = { longEdge: 768, jpegQuality: 80 } as const;

export class UnsupportedImageError extends Error {}

/**
 * 向き補正（EXIF）→ 長辺 768px に縮小（拡大はしない）→ JPEG 品質 80。
 * 出力にはメタデータ（位置情報など）を含めない。
 * 注：npm 版 sharp の標準ビルドは HEIC（HEVC）を読めないため、HEIC は UnsupportedImageError になる。
 */
export async function preprocessImage(input: Buffer): Promise<{ jpeg: Buffer; width: number; height: number }> {
  try {
    const { data, info } = await sharp(input, { limitInputPixels: 100_000_000 })
      .rotate()
      .resize({ width: PREPROCESS.longEdge, height: PREPROCESS.longEdge, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: PREPROCESS.jpegQuality })
      .toBuffer({ resolveWithObject: true });
    return { jpeg: data, width: info.width, height: info.height };
  } catch (e) {
    throw new UnsupportedImageError(e instanceof Error ? e.message : String(e));
  }
}
