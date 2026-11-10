/**
 * Préparation des illustrations importées : redimensionnement et conversion en WebP
 * dans le navigateur, pour qu'une image de 8 Mo ne pèse plus que quelques centaines de Ko.
 */

export const IMAGE_MAX_EDGE = 2560;
/** Les cartes gardent plus de détail : on y zoome. */
export const MAP_MAX_EDGE = 4096;
export const MAP_TARGET_BYTES = 3.5 * 1024 * 1024;
const TARGET_BYTES = 1.2 * 1024 * 1024;
const ACCEPTED = /^image\/(jpeg|png|webp|gif|avif|bmp)$/;

export interface PreparedImage {
  blob: Blob;
  width: number;
  height: number;
  originalSize: number;
  converted: boolean;
}

export class ImageImportError extends Error {}

/** Dimensions finales : côté le plus long limité à `maxEdge`, proportions conservées. */
export function fitWithin(width: number, height: number, maxEdge = IMAGE_MAX_EDGE): { width: number; height: number } {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

function canvasToBlob(canvas: HTMLCanvasElement | OffscreenCanvas, type: string, quality: number): Promise<Blob | null> {
  if ('convertToBlob' in canvas) return canvas.convertToBlob({ type, quality }).catch(() => null);
  return new Promise((resolve) => (canvas as HTMLCanvasElement).toBlob(resolve, type, quality));
}

export async function prepareImage(
  file: File,
  { maxEdge = IMAGE_MAX_EDGE, targetBytes = TARGET_BYTES }: { maxEdge?: number; targetBytes?: number } = {},
): Promise<PreparedImage> {
  if (!ACCEPTED.test(file.type)) {
    throw new ImageImportError('Format non pris en charge. Utilisez une image WebP, JPEG ou PNG.');
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new ImageImportError('Cette image est illisible ou endommagée.');
  }
  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height, maxEdge);
    const needsResize = width !== bitmap.width || height !== bitmap.height;
    // Une image déjà légère et à la bonne taille est gardée telle quelle (aucune perte).
    if (!needsResize && file.size <= targetBytes && /webp|jpeg/.test(file.type)) {
      return { blob: file, width, height, originalSize: file.size, converted: false };
    }

    const canvas: HTMLCanvasElement | OffscreenCanvas =
      typeof OffscreenCanvas !== 'undefined'
        ? new OffscreenCanvas(width, height)
        : Object.assign(document.createElement('canvas'), { width, height });
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    if (!ctx) throw new ImageImportError('Le navigateur ne peut pas traiter cette image.');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, width, height);

    let blob: Blob | null = null;
    for (const quality of [0.84, 0.76, 0.68]) {
      blob = await canvasToBlob(canvas, 'image/webp', quality);
      // Certains navigateurs ignorent WebP et renvoient du PNG : on passe alors au JPEG.
      if (!blob || blob.type !== 'image/webp') blob = await canvasToBlob(canvas, 'image/jpeg', quality);
      if (blob && blob.size <= targetBytes) break;
    }
    if (!blob) throw new ImageImportError('La conversion de l’image a échoué.');
    // Si la conversion n'apporte rien, on garde l'original.
    if (!needsResize && blob.size >= file.size) {
      return { blob: file, width, height, originalSize: file.size, converted: false };
    }
    return { blob, width, height, originalSize: file.size, converted: true };
  } finally {
    bitmap.close();
  }
}
