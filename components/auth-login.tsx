'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { auth } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { SITE_LOGO } from '@/lib/branding';

const loginSchema = z.object({
  email: z.string().email('Email invalido'),
  password: z.string().min(6, 'La contrasena debe tener al menos 6 caracteres'),
});

type LoginFormData = z.infer<typeof loginSchema>;

export function AuthLogin() {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const router = useRouter();

  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const onSubmit = async (data: LoginFormData) => {
    setLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, data.email, data.password);

      toast({
        title: 'Exito',
        description: `Bienvenido ${userCredential.user.displayName || 'Usuario'}`,
      });

      router.push('/dashboard');
    } catch (error: any) {
      let errorMessage = 'Error al iniciar sesion';

      if (error.code === 'auth/user-not-found') {
        errorMessage = 'Email no registrado';
      } else if (error.code === 'auth/wrong-password') {
        errorMessage = 'Contrasena incorrecta';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = 'Email invalido';
      } else if (error.code === 'auth/user-disabled') {
        errorMessage = 'Esta cuenta ha sido deshabilitada';
      }

      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl overflow-hidden rounded-[2rem] border border-white/10 bg-white shadow-2xl shadow-slate-950/20">
      <div className="grid lg:grid-cols-[1.05fr_0.95fr]">
        <section className="relative overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(88,160,255,0.45),_transparent_35%),linear-gradient(160deg,_#08142e_0%,_#0d2f78_45%,_#123f98_100%)] px-6 py-8 text-white sm:px-8 sm:py-10 lg:min-h-[720px] lg:px-10 lg:py-12">
          <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.08),transparent_38%,rgba(255,255,255,0.02)_70%)]" />
          <div className="relative flex h-full flex-col">
            <div className="flex items-center justify-between gap-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-cyan-100">
                <ShieldCheck className="h-4 w-4" />
                Acceso privado
              </div>
              <Link
                href="/"
                className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-2 text-sm font-medium text-white transition hover:bg-white/15"
              >
                <ArrowLeft className="h-4 w-4" />
                Volver al inicio
              </Link>
            </div>

            <div className="mt-10 flex flex-1 flex-col justify-between gap-8">
              <div className="space-y-5">
                <div className="relative mx-auto aspect-square w-full max-w-[320px] sm:max-w-[360px]">
                  <Image
                    src={SITE_LOGO}
                    alt="Billar Pool Santa Marta"
                    fill
                    className="object-contain drop-shadow-[0_18px_45px_rgba(0,0,0,0.45)]"
                    priority
                  />
                </div>

                <div className="space-y-4">
                  <p className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-200">
                    Billar Pool Santa Marta
                  </p>
                  <h1 className="max-w-xl text-3xl font-semibold leading-tight sm:text-4xl">
                    Tacos, accesorios y servicio especializado para billar.
                  </h1>
                  <p className="max-w-xl text-sm leading-7 text-slate-200 sm:text-base">
                    Ofrecemos tacos de billar, guantes, tizas, estuches y accesorios seleccionados
                    para quienes quieren jugar y cuidar mejor su equipo. Tambien realizamos
                    instalacion de casquillos y virolas con trabajo detallado y acabado profesional.
                  </p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-4 backdrop-blur-sm">
                  <p className="text-xs uppercase tracking-[0.2em] text-cyan-100">Tacos</p>
                  <p className="mt-2 text-sm text-slate-100">
                    Referencias y accesorios para juego recreativo y competitivo.
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-4 backdrop-blur-sm">
                  <p className="text-xs uppercase tracking-[0.2em] text-cyan-100">Accesorios</p>
                  <p className="mt-2 text-sm text-slate-100">
                    Guantes, tizas, estuches y productos para mantenimiento.
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-4 backdrop-blur-sm">
                  <p className="text-xs uppercase tracking-[0.2em] text-cyan-100">Servicio</p>
                  <p className="mt-2 text-sm text-slate-100">
                    Instalacion de casquillos y virolas para dejar el taco listo.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-white px-6 py-8 sm:px-8 sm:py-10 lg:px-10 lg:py-12">
          <div className="mx-auto flex h-full w-full max-w-md flex-col justify-center">
            <div className="mb-8 space-y-3">
              <p className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-700">
                Panel administrativo
              </p>
              <h2 className="text-3xl font-semibold text-slate-950">Iniciar sesion</h2>
              <p className="text-sm leading-6 text-slate-500">
                Accede al panel para gestionar productos, compras, ventas, inventario y reportes
                del negocio.
              </p>
            </div>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-slate-700">Email</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="tu@email.com"
                          type="email"
                          disabled={loading}
                          className="h-12 rounded-xl border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-slate-700">Contrasena</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Tu contrasena"
                          type="password"
                          disabled={loading}
                          className="h-12 rounded-xl border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="space-y-3 pt-2">
                  <Button
                    type="submit"
                    className="h-12 w-full rounded-xl bg-cyan-500 font-semibold text-slate-950 hover:bg-cyan-400"
                    disabled={loading}
                  >
                    {loading ? 'Iniciando sesion...' : 'Iniciar sesion'}
                  </Button>

                  <Link href="/" className="block lg:hidden">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-12 w-full rounded-xl border-slate-200 text-slate-700 hover:bg-slate-100"
                    >
                      Regresar al inicio
                    </Button>
                  </Link>
                </div>
              </form>
            </Form>
          </div>
        </section>
      </div>
    </div>
  );
}
