'use client';

import { useEffect, useMemo, useState } from 'react';
import { getApp, getApps, initializeApp } from 'firebase/app';
import { createUserWithEmailAndPassword, getAuth, signOut, updateProfile } from 'firebase/auth';
import { collection, doc, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { Pencil, Plus, Search, UserCog } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { firebaseConfig, db } from '@/lib/firebase';
import { useAuth } from '@/components/auth-context';
import { SectionHeader } from '@/components/admin/shared/section-header';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { UserFormDialog, type CreateUserFormValues, type UpdateUserFormValues } from '@/components/admin/users/user-form-dialog';
import { useToast } from '@/hooks/use-toast';
import type { AppUserAccount } from '@/lib/admin/types';

function normalizeDateValue(value: any) {
  if (typeof value === 'string') return value;
  if (value?.toDate) return value.toDate().toISOString();
  return new Date().toISOString();
}

function getSecondaryAuth() {
  const appName = 'secondary-admin-users';
  const secondaryApp = getApps().some((app) => app.name === appName)
    ? getApp(appName)
    : initializeApp(firebaseConfig, appName);
  return getAuth(secondaryApp);
}

export default function UsuariosPage() {
  const { role } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const [users, setUsers] = useState<AppUserAccount[]>([]);
  const [queryText, setQueryText] = useState('');
  const [openDialog, setOpenDialog] = useState(false);
  const [editingUser, setEditingUser] = useState<AppUserAccount | undefined>();

  useEffect(() => {
    if (role && role !== 'admin') {
      router.replace('/dashboard/ventas');
    }
  }, [role, router]);

  useEffect(() => {
    if (role !== 'admin') return;

    const unsubscribe = onSnapshot(
      query(collection(db, 'usuarios'), orderBy('createdAt', 'desc')),
      (snapshot) => {
        setUsers(
          snapshot.docs.map((item) => {
            const data = item.data();
            return {
              id: item.id,
              uid: String(data.uid ?? item.id),
              nombre: String(data.nombre ?? ''),
              email: String(data.email ?? ''),
              telefono: String(data.telefono ?? ''),
              role: data.role === 'sales' ? 'sales' : 'admin',
              status: data.status === 'inactive' ? 'inactive' : 'active',
              createdAt: normalizeDateValue(data.createdAt),
              updatedAt: normalizeDateValue(data.updatedAt),
            };
          })
        );
      },
      (error) => {
        console.error('Error leyendo usuarios:', error);
        toast({
          title: 'No se pudieron leer los usuarios',
          description: 'Revisa permisos de Firestore para la coleccion usuarios.',
          variant: 'destructive',
        });
      }
    );

    return unsubscribe;
  }, [role, toast]);

  const filteredUsers = useMemo(() => {
    return users.filter((user) =>
      `${user.nombre} ${user.email} ${user.role} ${user.telefono}`
        .toLowerCase()
        .includes(queryText.toLowerCase())
    );
  }, [queryText, users]);

  const handleCreateUser = async (values: CreateUserFormValues) => {
    const secondaryAuth = getSecondaryAuth();
    try {
      const credential = await createUserWithEmailAndPassword(secondaryAuth, values.email, values.password);
      await updateProfile(credential.user, { displayName: values.nombre });

      await setDoc(doc(db, 'usuarios', credential.user.uid), {
        uid: credential.user.uid,
        nombre: values.nombre,
        email: values.email,
        telefono: values.telefono,
        role: values.role,
        status: values.status,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setUsers((current) => [
        {
          id: credential.user.uid,
          uid: credential.user.uid,
          nombre: values.nombre,
          email: values.email,
          telefono: values.telefono,
          role: values.role,
          status: values.status,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        ...current.filter((item) => item.id !== credential.user.uid),
      ]);

      toast({
        title: 'Usuario creado',
        description: 'La cuenta fue creada y ya tiene rol asignado.',
      });
      setOpenDialog(false);
    } catch (error) {
      console.error('Error creando usuario:', error);
      toast({
        title: 'No se pudo crear el usuario',
        description: 'Verifica el email, la contrasena y los permisos de Firebase.',
        variant: 'destructive',
      });
      throw error;
    } finally {
      await signOut(secondaryAuth).catch(() => undefined);
    }
  };

  const handleUpdateUser = async (userId: string, values: UpdateUserFormValues) => {
    await updateDoc(doc(db, 'usuarios', userId), {
      role: values.role,
      status: values.status,
      updatedAt: serverTimestamp(),
    });

    toast({
      title: 'Usuario actualizado',
      description: 'El rol y el estado fueron guardados.',
    });
    setOpenDialog(false);
    setEditingUser(undefined);
  };

  if (role && role !== 'admin') return null;

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Seguridad"
        title="Usuarios y roles"
        description="Administra quien entra al panel y define si puede ver todo el CRUD o solo registrar ventas."
        actions={
          <Button
            onClick={() => {
              setEditingUser(undefined);
              setOpenDialog(true);
            }}
            className="w-full rounded-xl sm:w-auto"
          >
            <Plus className="mr-2 h-4 w-4" />
            Nuevo usuario
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-[28px] border border-slate-200/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(247,250,253,0.96)_100%)] p-4 shadow-[0_18px_45px_rgba(15,23,42,0.07)] sm:p-6">
          <p className="text-sm text-slate-500">Usuarios activos</p>
          <p className="mt-2 text-3xl font-semibold text-slate-950">
            {users.filter((user) => user.status === 'active').length}
          </p>
        </div>
        <div className="rounded-[28px] border border-slate-200/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(247,250,253,0.96)_100%)] p-4 shadow-[0_18px_45px_rgba(15,23,42,0.07)] sm:p-6">
          <p className="text-sm text-slate-500">Administradores</p>
          <p className="mt-2 text-3xl font-semibold text-slate-950">
            {users.filter((user) => user.role === 'admin').length}
          </p>
        </div>
        <div className="rounded-[28px] border border-slate-200/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(247,250,253,0.96)_100%)] p-4 shadow-[0_18px_45px_rgba(15,23,42,0.07)] sm:p-6">
          <p className="text-sm text-slate-500">Usuarios de ventas</p>
          <p className="mt-2 text-3xl font-semibold text-slate-950">
            {users.filter((user) => user.role === 'sales').length}
          </p>
        </div>
        <div className="rounded-[28px] border border-cyan-200 bg-[linear-gradient(180deg,rgba(236,254,255,0.98)_0%,rgba(207,250,254,0.82)_100%)] p-4 shadow-[0_18px_45px_rgba(15,23,42,0.07)] sm:p-6">
          <p className="text-sm text-cyan-800">Regla aplicada</p>
          <p className="mt-2 text-lg font-semibold text-cyan-950">
            Ventas solo ve dashboard y ventas
          </p>
        </div>
      </div>

      <div className="min-w-0 space-y-4 rounded-[28px] border border-slate-200/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(247,250,253,0.96)_100%)] p-4 shadow-[0_18px_45px_rgba(15,23,42,0.07)] sm:p-6">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={queryText}
            onChange={(event) => setQueryText(event.target.value)}
            placeholder="Buscar por nombre, email o rol"
            className="rounded-2xl border-slate-200 bg-white/90 pl-9 shadow-sm"
          />
        </div>

        {filteredUsers.length > 0 ? (
          <div className="min-w-0">
            <div className="mb-2 hidden text-xs text-slate-500 md:block">Desliza la tabla hacia la derecha para ver toda la informacion.</div>
            <div className="pb-2">
            <Table className="min-w-[760px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Usuario</TableHead>
                  <TableHead>Telefono</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Creado</TableHead>
                  <TableHead className="sticky right-0 z-10 bg-[rgba(248,250,252,0.96)] text-right shadow-[-12px_0_16px_-16px_rgba(15,23,42,0.22)] backdrop-blur">
                    Acciones
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map((item) => {
                  const roleLabel = item.role === 'sales' ? 'Ventas' : 'Administrador';
                  const rowHoverSummary = [
                    item.nombre,
                    `Correo: ${item.email}`,
                    `Telefono: ${item.telefono}`,
                    `Rol: ${roleLabel}`,
                    `Estado: ${item.status === 'active' ? 'Activo' : 'Inactivo'}`,
                    `Creado: ${new Date(item.createdAt).toLocaleDateString('es-CO')}`,
                  ].join('\n');
                  return (
                  <TableRow key={item.id} title={rowHoverSummary}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-slate-900">{item.nombre}</p>
                        <p className="text-xs text-slate-500">{item.email}</p>
                      </div>
                    </TableCell>
                    <TableCell>{item.telefono}</TableCell>
                    <TableCell>
                      {roleLabel}
                    </TableCell>
                    <TableCell>{item.status === 'active' ? 'Activo' : 'Inactivo'}</TableCell>
                    <TableCell>{new Date(item.createdAt).toLocaleDateString('es-CO')}</TableCell>
                    <TableCell className="sticky right-0 bg-[rgba(248,250,252,0.96)] text-right shadow-[-12px_0_16px_-16px_rgba(15,23,42,0.22)] backdrop-blur">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => {
                          setEditingUser(item);
                          setOpenDialog(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  )})}
                </TableBody>
            </Table>
            </div>
          </div>
        ) : (
          <Empty className="border border-dashed border-slate-200 bg-slate-50/70">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <UserCog className="h-5 w-5" />
              </EmptyMedia>
              <EmptyTitle>No hay usuarios para mostrar</EmptyTitle>
              <EmptyDescription>
                Crea tu primer usuario de ventas o un nuevo administrador.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </div>

      <UserFormDialog
        open={openDialog}
        onOpenChange={(nextOpen) => {
          setOpenDialog(nextOpen);
          if (!nextOpen) setEditingUser(undefined);
        }}
        initialUser={editingUser}
        onSubmit={async (values) => {
          if (editingUser) {
            await handleUpdateUser(editingUser.id, values as UpdateUserFormValues);
            return;
          }
          await handleCreateUser(values as CreateUserFormValues);
        }}
      />
    </div>
  );
}
