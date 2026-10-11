// Cuts the card picture out of a screenshot. Used for shots that were already read in the background: that read has no pictures,
// only the box where each card was found (in ORIGINAL screenshot pixels).
import type { ReaderCard } from './readerApi';

export type Box = [number, number, number, number]; // x, y, width, height

/** Keeps a box inside the picture and at least 1 pixel big. */
export function clampBox(box: Box, width: number, height: number): Box {
  const x = Math.min(Math.max(0, Math.round(box[0])), Math.max(0, width - 1));
  const y = Math.min(Math.max(0, Math.round(box[1])), Math.max(0, height - 1));
  const w = Math.max(1, Math.min(Math.round(box[2]), width - x));
  const h = Math.max(1, Math.min(Math.round(box[3]), height - y));
  return [x, y, w, h];
}

/** Adds `image` (PNG data URL) to every card: the part of the screenshot inside its box, or the whole screenshot when the card has no box. */
export async function addCardImages(file: Blob, cards: ReaderCard[]): Promise<ReaderCard[]> {
  const bmp = await createImageBitmap(file);
  try {
    return cards.map(c => {
      if (c.image) return c;
      const [x, y, w, h] = c.detect?.box ? clampBox(c.detect.box, bmp.width, bmp.height) : [0, 0, bmp.width, bmp.height];
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('No canvas available');
      ctx.drawImage(bmp, x, y, w, h, 0, 0, w, h);
      return { ...c, image: canvas.toDataURL('image/png') };
    });
  } finally { bmp.close(); }
}
