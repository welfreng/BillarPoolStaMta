'use client';

import { useEffect } from 'react';

export function AdminThemeScope() {
  useEffect(() => {
    document.body.classList.remove('public-site');
    document.body.classList.add('admin-dashboard');

    return () => {
      document.body.classList.remove('admin-dashboard');
    };
  }, []);

  return null;
}
