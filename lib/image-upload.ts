'use client';

export interface OptimizedImageResult {
  dataUrl: string;
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
  estimatedBytes: number;
}

export interface OptimizeImageOptions {
  maxWidth: number;
  maxHeight: number;
  quality?: number;
  minQuality?: number;
  outputType?: 'image/jpeg' | 'image/png' | 'image/webp';
  fit?: 'contain' | 'cover';
  maxBytes?: number;
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

  context.clearRect(0, 0, width, height);

  if (options.fit === 'cover') {
    const sourceSize = Math.min(image.width, image.height);
    const sourceX = Math.round((image.width - sourceSize) / 2);
    const sourceY = Math.round((image.height - sourceSize) / 2);
    context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, width, height);
  } else {
    context.drawImage(image, 0, 0, width, height);
  }

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
  const targetWidth =
    options.fit === 'cover'
      ? Math.max(1, Math.round(options.maxWidth))
      : Math.max(1, Math.round(loadedImage.width * scale));
  const targetHeight =
    options.fit === 'cover'
      ? Math.max(1, Math.round(options.maxHeight))
      : Math.max(1, Math.round(loadedImage.height * scale));

  let width = targetWidth;
  let height = targetHeight;
  let dataUrl = '';
  let quality = options.quality ?? 0.84;
  const minQuality = options.minQuality ?? 0.58;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      dataUrl = renderImageToDataUrl(loadedImage, width, height, {
        ...options,
        quality,
      });

      const estimatedBytes = Math.ceil((dataUrl.length * 3) / 4);
      if (!options.maxBytes || estimatedBytes <= options.maxBytes) {
        cleanup();
        return {
          dataUrl,
          width,
          height,
          originalWidth: loadedImage.width,
          originalHeight: loadedImage.height,
          estimatedBytes,
        };
      }
    } catch (error) {
      if (attempt === 7) {
        cleanup();
        throw error;
      }
    }

    if (quality > minQuality) {
      quality = Math.max(minQuality, Number((quality - 0.07).toFixed(2)));
      continue;
    }

    width = Math.max(1, Math.round(width * 0.88));
    height = Math.max(1, Math.round(height * 0.88));
  }

  cleanup();

  return {
    dataUrl,
    width,
    height,
    originalWidth: loadedImage.width,
    originalHeight: loadedImage.height,
    estimatedBytes: Math.ceil((dataUrl.length * 3) / 4),
  };
}
