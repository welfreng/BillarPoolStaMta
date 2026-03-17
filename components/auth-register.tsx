'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  createUserWithEmailAndPassword,
  deleteUser,
  updateProfile,
} from 'firebase/auth';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import Link from 'next/link';
import { auth, db } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';

const registroSchema = z
  .object({
    nombre: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
    email: z.string().email('Email invalido'),
    telefono: z
      .string()
      .regex(/^[0-9+\-\s()]{10,}$/, 'Numero de telefono invalido'),
    password: z.string().min(6, 'La contrasena debe tener al menos 6 caracteres'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Las contrasenas no coinciden',
    path: ['confirmPassword'],
  });

type RegistroFormData = z.infer<typeof registroSchema>;

type SubmitStatus =
  | {
      type: 'success' | 'error';
      message: string;
    }
  | null;

export function AuthRegister() {
  const [loading, setLoading] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<SubmitStatus>(null);
  const { toast } = useToast();

  const form = useForm<RegistroFormData>({
    resolver: zodResolver(registroSchema),
    defaultValues: {
      nombre: '',
      email: '',
      telefono: '',
      password: '',
      confirmPassword: '',
    },
  });

  const onSubmit = async (data: RegistroFormData) => {
    setLoading(true);
    setSubmitStatus(null);

    try {
      const nombre = data.nombre.trim();
      const email = data.email.trim();
      const telefono = data.telefono.trim();

      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        data.password
      );

      try {
        await updateProfile(userCredential.user, {
          displayName: nombre,
        });

        await setDoc(doc(db, 'usuarios', userCredential.user.uid), {
          nombre,
          email,
          telefono,
          uid: userCredential.user.uid,
          createdAt: serverTimestamp(),
        });
      } catch (firestoreError) {
        console.error('Error guardando usuario en Firestore:', firestoreError);
        await deleteUser(userCredential.user);
        throw firestoreError;
      }

      toast({
        title: 'Registro exitoso',
        description: 'La cuenta fue creada y guardada en Firestore.',
      });

      setSubmitStatus({
        type: 'success',
        message: 'Registro exitoso. Tus datos fueron guardados correctamente.',
      });

      form.reset();
    } catch (error: any) {
      console.error('Error en el registro:', error);

      let errorMessage = 'Error al crear la cuenta';

      if (error.code === 'auth/email-already-in-use') {
        errorMessage = 'El email ya esta en uso';
      } else if (error.code === 'auth/weak-password') {
        errorMessage = 'La contrasena es muy debil';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = 'Email invalido';
      } else if (error.code === 'permission-denied') {
        errorMessage =
          'Firestore rechazo el guardado. Revisa las reglas de seguridad.';
      } else if (error.code === 'unavailable') {
        errorMessage =
          'Firestore no esta disponible en este momento. Intenta de nuevo.';
      }

      setSubmitStatus({
        type: 'error',
        message: errorMessage,
      });

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
    <div className="mx-auto w-full max-w-md rounded-lg bg-white p-6 shadow-md">
      <h1 className="mb-6 text-center text-2xl font-bold">Crear Cuenta</h1>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          {submitStatus && (
            <div
              className={`rounded-md border px-4 py-3 text-sm ${
                submitStatus.type === 'success'
                  ? 'border-green-200 bg-green-50 text-green-700'
                  : 'border-red-200 bg-red-50 text-red-700'
              }`}
            >
              {submitStatus.message}
            </div>
          )}

          <FormField
            control={form.control}
            name="nombre"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nombre Completo</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Juan Perez"
                    type="text"
                    disabled={loading}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input
                    placeholder="tu@email.com"
                    type="email"
                    disabled={loading}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="telefono"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Numero de Telefono</FormLabel>
                <FormControl>
                  <Input
                    placeholder="+57 300 123 4567"
                    type="tel"
                    disabled={loading}
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
                <FormLabel>Contrasena</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Minimo 6 caracteres"
                    type="password"
                    disabled={loading}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="confirmPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Confirmar Contrasena</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Confirma tu contrasena"
                    type="password"
                    disabled={loading}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Creando cuenta...' : 'Crear Cuenta'}
          </Button>
        </form>
      </Form>

      <p className="mt-4 text-center text-sm">
        Ya tienes cuenta?{' '}
        <Link href="/login" className="text-blue-600 hover:underline">
          Inicia sesion
        </Link>
      </p>
    </div>
  );
}
