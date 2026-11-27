/**
 * Pure geometry for the image cropper. Kept away from the component so the
 * fiddly part — mapping a rectangle the user dragged on screen back onto
 * source pixels — can be reasoned about and tested without a device.
 *
 * Every rect is `{ x, y, width, height }` in the coordinate space named by
 * the function that produced it.
 */
export type Rect = { x: number; y: number; width: number; height: number };

/** Smallest crop we let someone drag to, in on-screen points. */
export const MIN_CROP_PX = 48;

/**
 * Where an image lands inside a box under `contentFit: 'contain'` — the
 * letterboxed area the crop rect is allowed to live in.
 */
export function fitContain(
  imageWidth: number,
  imageHeight: number,
  boxWidth: number,
  boxHeight: number,
): Rect {
  if (imageWidth <= 0 || imageHeight <= 0 || boxWidth <= 0 || boxHeight <= 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  const scale = Math.min(boxWidth / imageWidth, boxHeight / imageHeight);
  const width = imageWidth * scale;
  const height = imageHeight * scale;
  return {
    x: (boxWidth - width) / 2,
    y: (boxHeight - height) / 2,
    width,
    height,
  };
}

/** The largest rect of `aspect` that fits in `bounds`, centred. */
export function initialCrop(bounds: Rect, aspect: number | null): Rect {
  if (!aspect || aspect <= 0) return { ...bounds };
  let width = bounds.width;
  let height = width / aspect;
  if (height > bounds.height) {
    height = bounds.height;
    width = height * aspect;
  }
  return {
    x: bounds.x + (bounds.width - width) / 2,
    y: bounds.y + (bounds.height - height) / 2,
    width,
    height,
  };
}

/**
 * Keep a crop rect inside the image, above the minimum size, and — when an
 * aspect is locked — at that shape. Resizing is anchored so the corner the
 * user is *not* holding stays put.
 */
export function clampCrop(
  rect: Rect,
  bounds: Rect,
  aspect: number | null,
  anchor: 'move' | 'tl' | 'tr' | 'bl' | 'br' = 'move',
): Rect {
  const minW = Math.min(MIN_CROP_PX, bounds.width);
  const minH = Math.min(MIN_CROP_PX, bounds.height);

  if (anchor === 'move') {
    const width = Math.min(rect.width, bounds.width);
    const height = Math.min(rect.height, bounds.height);
    return {
      width,
      height,
      x: Math.min(Math.max(rect.x, bounds.x), bounds.x + bounds.width - width),
      y: Math.min(Math.max(rect.y, bounds.y), bounds.y + bounds.height - height),
    };
  }

  // Resize: the fixed corner is the one opposite the handle being dragged.
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;
  const fixedX = anchor === 'tl' || anchor === 'bl' ? right : rect.x;
  const fixedY = anchor === 'tl' || anchor === 'tr' ? bottom : rect.y;
  const growsLeft = anchor === 'tl' || anchor === 'bl';
  const growsUp = anchor === 'tl' || anchor === 'tr';

  // Room available from the fixed corner towards the handle.
  const maxW = growsLeft ? fixedX - bounds.x : bounds.x + bounds.width - fixedX;
  const maxH = growsUp ? fixedY - bounds.y : bounds.y + bounds.height - fixedY;

  let width = Math.min(Math.max(rect.width, minW), Math.max(maxW, minW));
  let height = Math.min(Math.max(rect.height, minH), Math.max(maxH, minH));

  if (aspect && aspect > 0) {
    // Honour the locked shape, shrinking on whichever axis has less room.
    height = width / aspect;
    if (height > maxH) {
      height = maxH;
      width = height * aspect;
    }
    if (width > maxW) {
      width = maxW;
      height = width / aspect;
    }
    width = Math.max(width, minW);
    height = Math.max(height, minH);
  }

  return {
    width,
    height,
    x: growsLeft ? fixedX - width : fixedX,
    y: growsUp ? fixedY - height : fixedY,
  };
}

/**
 * Map a crop rect drawn over the displayed image back onto source pixels,
 * which is what ImageManipulator's `crop` action takes. Clamped so rounding
 * at the edges can never ask for a pixel outside the file.
 */
export function toSourceRect(
  crop: Rect,
  display: Rect,
  imageWidth: number,
  imageHeight: number,
): { originX: number; originY: number; width: number; height: number } {
  if (display.width <= 0 || display.height <= 0) {
    return { originX: 0, originY: 0, width: imageWidth, height: imageHeight };
  }
  const scaleX = imageWidth / display.width;
  const scaleY = imageHeight / display.height;

  const originX = Math.round((crop.x - display.x) * scaleX);
  const originY = Math.round((crop.y - display.y) * scaleY);
  const width = Math.round(crop.width * scaleX);
  const height = Math.round(crop.height * scaleY);

  const clampedX = Math.min(Math.max(originX, 0), Math.max(imageWidth - 1, 0));
  const clampedY = Math.min(Math.max(originY, 0), Math.max(imageHeight - 1, 0));
  return {
    originX: clampedX,
    originY: clampedY,
    width: Math.max(1, Math.min(width, imageWidth - clampedX)),
    height: Math.max(1, Math.min(height, imageHeight - clampedY)),
  };
}

/** True when the crop covers the whole image — nothing to apply. */
export function isFullFrame(crop: Rect, display: Rect, tolerance = 1): boolean {
  return (
    Math.abs(crop.x - display.x) <= tolerance &&
    Math.abs(crop.y - display.y) <= tolerance &&
    Math.abs(crop.width - display.width) <= tolerance &&
    Math.abs(crop.height - display.height) <= tolerance
  );
}

export type AspectPreset = { key: string; label: string; value: number | null };

export const ASPECT_PRESETS: AspectPreset[] = [
  { key: 'free', label: 'Free', value: null },
  { key: 'square', label: '1:1', value: 1 },
  { key: 'portrait', label: '4:5', value: 4 / 5 },
  { key: 'story', label: '9:16', value: 9 / 16 },
  { key: 'photo', label: '4:3', value: 4 / 3 },
  { key: 'wide', label: '16:9', value: 16 / 9 },
];
