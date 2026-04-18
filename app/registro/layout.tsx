import type { ReactNode } from 'react';
import { PublicThemeScope } from '@/components/public/public-theme-scope';

export default function RegisterLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <PublicThemeScope />
      {children}
    </>
  );
}
