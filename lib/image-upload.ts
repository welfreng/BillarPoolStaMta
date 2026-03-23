'use client';

export interface OptimizedImageResult {
  dataUrl: string;
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
}

export interface OptimizeImageOptions {
  maxWidth: number;
  maxHeight: number;
  quality?: number;
  outputType?: 'image/jpeg' | 'image/png' | 'image/webp';
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }

      reject(new Error('No se pudo leer la imagen seleccionada.'));
    };
    reader.onerror = () => reject(new Error('No se pudo leer la imagen seleccionada.'));
    reader.readAsDataURL(file);
  });
}

function loadImageElement(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('No se pudo procesar la imagen seleccionada.'));
    image.src = src;
  });
}

function loadImageFromObjectUrl(file: File) {
  const objectUrl = URL.createObjectURL(file);

  return new Promise<{ image: HTMLImageElement; cleanup: () => void }>((resolve, reject) => {
    const image = new window.Image();
    const cleanup = () => URL.revokeObjectURL(objectUrl);

    image.onload = () => resolve({ image, cleanup });
    image.onerror = () => {
      cleanup();
      reject(new Error('No se pudo procesar la imagen seleccionada.'));
    };
    image.src = objectUrl;
  });
}

function renderImageToDataUrl(
  image: HTMLImageElement,
  width: number,
  height: number,
  options: OptimizeImageOptions
) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('No se pudo preparar la imagen para guardarla.');
  }

  context.drawImage(image, 0, 0, width, height);

  const dataUrl = canvas.toDataURL(options.outputType ?? 'image/jpeg', options.quality ?? 0.84);
  if (!dataUrl || dataUrl === 'data:,') {
    throw new Error('No se pudo preparar la imagen para guardarla.');
  }

  return dataUrl;
}

export async function optimizeImageFile(
  file: File,
  options: OptimizeImageOptions
): Promise<OptimizedImageResult> {
  let loadedImage: HTMLImageElement | null = null;
  let cleanup: () => void = () => {};

  try {
    const loaded = await loadImageFromObjectUrl(file);
    loadedImage = loaded.image;
    cleanup = loaded.cleanup;
  } catch {
    const source = await readFileAsDataUrl(file);
    loadedImage = await loadImageElement(source);
  }

  const scale = Math.min(1, options.maxWidth / loadedImage.width, options.maxHeight / loadedImage.height);
  const targetWidth = Math.max(1, Math.round(loadedImage.width * scale));
  const targetHeight = Math.max(1, Math.round(loadedImage.height * scale));

  let width = targetWidth;
  let height = targetHeight;
  let dataUrl = '';

  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      dataUrl = renderImageToDataUrl(loadedImage, width, height, options);
      break;
    } catch (error) {
      if (attempt === 3) {
        cleanup();
        throw error;
      }

      width = Math.max(1, Math.round(width * 0.72));
      height = Math.max(1, Math.round(height * 0.72));
    }
  }

  cleanup();

  return {
    dataUrl,
    width,
    height,
    originalWidth: loadedImage.width,
    originalHeight: loadedImage.height,
  };
}
