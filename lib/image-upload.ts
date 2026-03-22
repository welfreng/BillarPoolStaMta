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

export async function optimizeImageFile(
  file: File,
  options: OptimizeImageOptions
): Promise<OptimizedImageResult> {
  const source = await readFileAsDataUrl(file);
  const image = await loadImageElement(source);
  const scale = Math.min(1, options.maxWidth / image.width, options.maxHeight / image.height);
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement('canvas');

  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('No se pudo preparar la imagen para guardarla.');
  }

  context.drawImage(image, 0, 0, width, height);

  return {
    dataUrl: canvas.toDataURL(options.outputType ?? 'image/jpeg', options.quality ?? 0.84),
    width,
    height,
    originalWidth: image.width,
    originalHeight: image.height,
  };
}
