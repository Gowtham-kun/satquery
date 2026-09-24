import { fromUrl } from 'geotiff';

function getProxyUrl(rawUrl, apiBase = '') {
  if (!rawUrl) return '';
  const cleanBase = apiBase ? apiBase.replace(/\/+$/, '') : '';
  return `${cleanBase}/api/imagery/proxy?url=${encodeURIComponent(rawUrl)}`;
}

export function canvasToBlob(canvas, mimeType = 'image/jpeg', quality = 0.85) {
  return new Promise((resolve) => {
    if (typeof canvas.toBlob === 'function') {
      canvas.toBlob((b) => resolve(b), mimeType, quality);
    } else {
      const dataUrl = canvas.toDataURL(mimeType, quality);
      const byteStr = atob(dataUrl.split(',')[1]);
      const mime = dataUrl.split(',')[0].split(':')[1].split(';')[0];
      const ab = new ArrayBuffer(byteStr.length);
      const ia = new Uint8Array(ab);
      for (let i = 0; i < byteStr.length; i++) ia[i] = byteStr.charCodeAt(i);
      resolve(new Blob([ab], { type: mime }));
    }
  });
}

function loadFallbackImage(url, targetSize = 512) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = targetSize;
      canvas.height = targetSize;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, targetSize, targetSize);
      canvasToBlob(canvas).then((blob) => resolve({ canvas, imageBlob: blob, source: 'preview_png' }));
    };
    img.onerror = () => reject(new Error('Failed to load satellite preview'));
    img.src = url;
  });
}

async function readBandOverview(bandUrl, apiBase, targetSize) {
  const proxy = getProxyUrl(bandUrl, apiBase);
  const tiff = await fromUrl(proxy);
  const count = await tiff.getImageCount();
  const image = await tiff.getImage(Math.max(0, count - 1));
  const [data] = await image.readRasters({ width: targetSize, height: targetSize, interleave: false });
  return data;
}

export async function fetchAndRenderOptical(signedAssets, bbox, targetSize = 512, apiBase = '') {
  const b04Url = signedAssets?.B04;
  const b03Url = signedAssets?.B03;
  const b02Url = signedAssets?.B02;
  const previewUrl = signedAssets?.rendered_preview || signedAssets?.visual;

  if (b04Url && b03Url && b02Url) {
    try {
      const [rData, gData, bData] = await Promise.all([
        readBandOverview(b04Url, apiBase, targetSize),
        readBandOverview(b03Url, apiBase, targetSize),
        readBandOverview(b02Url, apiBase, targetSize)
      ]);
      const canvas = document.createElement('canvas');
      canvas.width = targetSize;
      canvas.height = targetSize;
      const ctx = canvas.getContext('2d');
      const imgData = ctx.createImageData(targetSize, targetSize);
      const pixels = imgData.data;
      const len = targetSize * targetSize;
      for (let i = 0; i < len; i++) {
        const rNorm = Math.min(1.0, Math.max(0.0, (rData[i] || 0) / 3500.0));
        const gNorm = Math.min(1.0, Math.max(0.0, (gData[i] || 0) / 3500.0));
        const bNorm = Math.min(1.0, Math.max(0.0, (bData[i] || 0) / 3500.0));
        const idx = i * 4;
        pixels[idx] = Math.round(Math.pow(rNorm, 0.45) * 255);
        pixels[idx + 1] = Math.round(Math.pow(gNorm, 0.45) * 255);
        pixels[idx + 2] = Math.round(Math.pow(bNorm, 0.45) * 255);
        pixels[idx + 3] = 255;
      }
      ctx.putImageData(imgData, 0, 0);
      const blob = await canvasToBlob(canvas);
      return { canvas, imageBlob: blob, source: 'cog_multiband' };
    } catch (_) {}
  }

  if (previewUrl) {
    return await loadFallbackImage(previewUrl, targetSize);
  }
  throw new Error('No optical imagery assets available for region');
}

export async function fetchAndRenderSAR(signedAssets, bbox, targetSize = 512, apiBase = '') {
  const vvUrl = signedAssets?.vv;
  const vhUrl = signedAssets?.vh;
  const previewUrl = signedAssets?.rendered_preview || signedAssets?.thumbnail;

  if (vvUrl && vhUrl) {
    try {
      const [vvData, vhData] = await Promise.all([
        readBandOverview(vvUrl, apiBase, targetSize),
        readBandOverview(vhUrl, apiBase, targetSize)
      ]);
      const canvas = document.createElement('canvas');
      canvas.width = targetSize;
      canvas.height = targetSize;
      const ctx = canvas.getContext('2d');
      const imgData = ctx.createImageData(targetSize, targetSize);
      const pixels = imgData.data;
      const len = targetSize * targetSize;
      for (let i = 0; i < len; i++) {
        const vvVal = vvData[i] || 0;
        const vhVal = vhData[i] || 0;
        const vvDb = 10 * Math.log10(Math.max(vvVal, 1e-4));
        const vhDb = 10 * Math.log10(Math.max(vhVal, 1e-4));
        const vvNorm = Math.min(1.0, Math.max(0.0, (vvDb + 25.0) / 25.0));
        const vhNorm = Math.min(1.0, Math.max(0.0, (vhDb + 30.0) / 25.0));
        const ratio = Math.min(1.0, Math.max(0.0, (vvVal / (vhVal + 1e-4)) / 10.0));
        const idx = i * 4;
        pixels[idx] = Math.round(vvNorm * 255);
        pixels[idx + 1] = Math.round(vhNorm * 255);
        pixels[idx + 2] = Math.round(ratio * 255);
        pixels[idx + 3] = 255;
      }
      ctx.putImageData(imgData, 0, 0);
      const blob = await canvasToBlob(canvas);
      return { canvas, imageBlob: blob, source: 'cog_sar_fusion' };
    } catch (_) {}
  }

  if (previewUrl) {
    return await loadFallbackImage(previewUrl, targetSize);
  }
  throw new Error('No SAR imagery assets available for region');
}
