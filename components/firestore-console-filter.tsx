'use client';

import { useEffect } from 'react';

function isFirestoreFutureUpdateTimeMessage(args: unknown[]) {
  const message = args
    .map((arg) => {
      if (typeof arg === 'string') return arg;
      if (arg instanceof Error) return arg.message;

      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    })
    .join(' ');

  return (
    message.includes('@firebase/firestore') &&
    message.includes('Detected an update time that is in the future')
  );
}

export function FirestoreConsoleFilter() {
  useEffect(() => {
    const originalConsoleError = console.error;

    console.error = (...args: unknown[]) => {
      if (isFirestoreFutureUpdateTimeMessage(args)) {
        return;
      }

      originalConsoleError(...args);
    };

    return () => {
      console.error = originalConsoleError;
    };
  }, []);

  return null;
}
