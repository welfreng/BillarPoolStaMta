'use client';

import { useEffect } from 'react';

function applyPublicThemeScope() {
  document.documentElement.classList.remove('dark');
  document.documentElement.classList.add('light');
  document.documentElement.style.colorScheme = 'light';
  document.body.classList.remove('admin-dashboard');
  document.body.classList.add('public-site');
}

export function PublicThemeScope() {
  useEffect(() => {
    applyPublicThemeScope();

    return () => {
      document.body.classList.remove('public-site');
      document.documentElement.style.colorScheme = '';
    };
  }, []);

  return (
    <script
      dangerouslySetInnerHTML={{
        __html:
          "document.documentElement.classList.remove('dark');document.documentElement.classList.add('light');document.documentElement.style.colorScheme='light';document.body&&document.body.classList.remove('admin-dashboard');document.body&&document.body.classList.add('public-site');",
      }}
    />
  );
}
