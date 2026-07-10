'use client';

import { useEffect } from 'react';

function getConsoleMessage(args: unknown[]) {
  return args
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
}

function isFilteredFirestoreMessage(args: unknown[]) {
  const message = args
    .map((arg) => getConsoleMessage([arg]))
    .join(' ');

  return (
    message.includes('@firebase/firestore') &&
    (
      message.includes('Detected an update time that is in the future') ||
      (
        message.includes("Failed to obtain primary lease") &&
        message.includes("Backfill Indexes")
      )
    )
  );
}

function isFirestoreQuotaMessage(args: unknown[]) {
  const message = args
    .map((arg) => getConsoleMessage([arg]))
    .join(' ');

  return (
    message.includes('@firebase/firestore') &&
    (
      message.includes('code=resource-exhausted') ||
      message.includes('Quota exceeded') ||
      message.includes('Using maximum backoff delay')
    )
  );
}

export function FirestoreConsoleFilter() {
  useEffect(() => {
    const originalConsoleError = console.error;
    const originalConsoleWarn = console.warn;

    console.error = (...args: unknown[]) => {
      if (isFilteredFirestoreMessage(args)) {
        return;
      }

      if (isFirestoreQuotaMessage(args)) {
        originalConsoleWarn(...args);
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
