/** Shrinks photos in the browser (max 1600px, JPEG ~80%) so uploads work on weak connections. */
export function compressImage(file, maxDim = 1600, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const fallback = () => { const r = new FileReader(); r.onload = () => resolve({ dataUrl: r.result, size: file.size }); r.onerror = reject; r.readAsDataURL(file); };
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return fallback();
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      const dataUrl = c.toDataURL('image/jpeg', quality);
      const size = Math.round((dataUrl.length - 23) * 0.75);
      size < file.size ? resolve({ dataUrl, size }) : fallback();
    };
    img.onerror = () => { URL.revokeObjectURL(url); fallback(); };
    img.src = url;
  });
}
