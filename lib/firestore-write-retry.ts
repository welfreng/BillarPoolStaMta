import { type FirestoreError } from 'firebase/firestore';

function sleep(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function createWriteTimeoutError(timeoutMs: number) {
  const error = new Error(`Firebase no confirmo la escritura en ${Math.round(timeoutMs / 1000)} segundos.`);
  Object.defineProperty(error, 'code', {
    value: 'deadline-exceeded',
    enumerable: true,
  });
  return error;
}

async function withTimeout<T>(operation: () => Promise<T>, timeoutMs: number) {
  let timeoutId: number | undefined;

  try {
    return await Promise.race([
      operation(),
      new Promise<T>((_, reject) => {
        timeoutId = window.setTimeout(() => reject(createWriteTimeoutError(timeoutMs)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) {
      window.clearTimeout(timeoutId);
    }
  }
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
    timeoutMs?: number;
  }
) {
  const retries = options?.retries ?? 4;
  const initialDelayMs = options?.initialDelayMs ?? 500;
  const timeoutMs = options?.timeoutMs ?? 12000;

  let attempt = 0;

  while (true) {
    try {
      return await withTimeout(operation, timeoutMs);
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
    return 'Firebase no confirmo la operacion a tiempo. Revisa tu conexion y vuelve a intentar; no cierres si no ves la confirmacion.';
  }

  return fallback;
}
