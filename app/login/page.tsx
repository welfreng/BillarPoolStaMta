import { AuthLogin } from '@/components/auth-login';

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.24),_transparent_25%),linear-gradient(180deg,_#081225_0%,_#0d2b63_38%,_#eff5ff_100%)] px-3 py-6 sm:px-4 sm:py-8 lg:px-8 lg:py-10">
      <AuthLogin />
    </div>
  );
}
