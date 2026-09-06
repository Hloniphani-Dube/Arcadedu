/** Downscale + centre-crop an uploaded image to a square JPEG data URL small
 *  enough to store in the profile row (~15-30 KB). Runs entirely in the
 *  browser — no upload bucket needed. */
export async function fileToAvatarDataUrl(file: File, size = 256): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('That file is not an image.')
  }
  if (file.size > 12 * 1024 * 1024) {
    throw new Error('Image is too large (12 MB max).')
  }

  const bitmap = await createImageBitmap(file)
  try {
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Your browser can’t process images here.')

    // cover-fit: fill the square, crop the overflow, keep the centre
    const scale = size / Math.min(bitmap.width, bitmap.height)
    const dw = bitmap.width * scale
    const dh = bitmap.height * scale
    ctx.drawImage(bitmap, (size - dw) / 2, (size - dh) / 2, dw, dh)

    return canvas.toDataURL('image/jpeg', 0.82)
  } finally {
    bitmap.close()
  }
}
