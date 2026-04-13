import { type FirestoreError } from 'firebase/firestore';

function sleep(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function isRetryableWriteError(error: unknown) {
  if (!error || typeof error !== 'object') return false;

  const code = (error as FirestoreError).code;
  return (
    code === 'resource-exhausted' ||
    code === 'unavailable' ||
    code === 'deadline-exceeded' ||
    code === 'aborted'
  );
}

export async function runFirestoreWriteWithBackoff<T>(
  operation: () => Promise<T>,
  options?: {
    retries?: number;
    initialDelayMs?: number;
  }
) {
  const retries = options?.retries ?? 4;
  const initialDelayMs = options?.initialDelayMs ?? 500;

  let attempt = 0;

  while (true) {
    try {
      return await operation();
    } catch (error) {
      if (!isRetryableWriteError(error) || attempt >= retries) {
        throw error;
      }

      const jitter = Math.floor(Math.random() * 220);
      const delayMs = initialDelayMs * 2 ** attempt + jitter;
      await sleep(delayMs);
      attempt += 1;
    }
  }
}

export function getFriendlyFirestoreWriteErrorMessage(
  error: unknown,
  fallback = 'No se pudo guardar la informacion. Intenta de nuevo en unos segundos.'
) {
  const code = (error as FirestoreError | undefined)?.code;

  if (code === 'resource-exhausted') {
    return 'Firebase esta recibiendo muchas escrituras en este momento. Espera unos segundos y vuelve a intentar.';
  }

  if (code === 'unavailable' || code === 'deadline-exceeded') {
    return 'La conexion con Firebase esta inestable ahora mismo. Intenta nuevamente en unos segundos.';
  }

  return fallback;
}
