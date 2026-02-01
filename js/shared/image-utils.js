/**
 * Image Processing Utilities
 * Global functions for image manipulation
 */

/**
 * Extract dominant color from image
 * @param {string} imageDataUrl - Base64 data URL
 * @returns {Promise<string>} RGB color string
 */
function extractDominantColor(imageDataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "Anonymous"; // Support CORS
    img.onload = function () {
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, 1, 1);
      const imageData = ctx.getImageData(0, 0, 1, 1).data;
      const rgb = `rgb(${imageData[0]}, ${imageData[1]}, ${imageData[2]})`;
      resolve(rgb);
    };
    img.onerror = () => {
      resolve("var(--accent-primary)"); // Fallback
    };
    img.src = imageDataUrl;
  });
}

/**
 * Load image from URL
 * @param {string} src - Image source
 * @returns {Promise<HTMLImageElement>}
 */
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/**
 * Get image dimensions
 * @param {string} imageDataUrl - Base64 data URL
 * @returns {Promise<{width: number, height: number, aspectRatio: number}>}
 */
async function getImageDimensions(imageDataUrl) {
  const img = await loadImage(imageDataUrl);
  return {
    width: img.naturalWidth,
    height: img.naturalHeight,
    aspectRatio: img.naturalWidth / img.naturalHeight,
  };
}

/**
 * Resize image to max dimensions while maintaining aspect ratio
 * @param {string} imageDataUrl - Original image data URL
 * @param {number} maxWidth - Maximum width
 * @param {number} maxHeight - Maximum height
 * @returns {Promise<string>} Resized image data URL
 */
async function resizeImage(imageDataUrl, maxWidth, maxHeight) {
  const img = await loadImage(imageDataUrl);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  let width = img.naturalWidth;
  let height = img.naturalHeight;

  // Calculate new dimensions
  if (width > maxWidth || height > maxHeight) {
    const ratio = Math.min(maxWidth / width, maxHeight / height);
    width = width * ratio;
    height = height * ratio;
  }

  canvas.width = width;
  canvas.height = height;
  ctx.drawImage(img, 0, 0, width, height);

  return canvas.toDataURL("image/jpeg", 0.9);
}
