import { NextResponse, type NextRequest } from 'next/server';
import { getServerAdminAuth, getServerAdminDb } from '@/lib/firebase-admin';

const OWNER_EMAILS = (process.env.NEXT_PUBLIC_OWNER_EMAILS ?? 'welfreng@gmail.com')
  .split(',')
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);

function isOwnerEmail(email?: string | null) {
  return email ? OWNER_EMAILS.includes(email.trim().toLowerCase()) : false;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ uid: string }> }
) {
  try {
    const authorization = request.headers.get('authorization') ?? '';
    const idToken = authorization.startsWith('Bearer ') ? authorization.slice('Bearer '.length).trim() : '';
    if (!idToken) {
      return NextResponse.json({ error: 'Falta el token de autorizacion.' }, { status: 401 });
    }

    const auth = getServerAdminAuth();
    const db = getServerAdminDb();
    const decodedToken = await auth.verifyIdToken(idToken);
    const callerUid = decodedToken.uid;
    const callerEmail = decodedToken.email ?? null;
    const callerSnapshot = await db.collection('usuarios').doc(callerUid).get();
    const callerRole = callerSnapshot.data()?.role;
    const callerIsSuperadmin = isOwnerEmail(callerEmail) || callerRole === 'superadmin';

    if (!callerIsSuperadmin) {
      return NextResponse.json(
        { error: 'Solo un superadmin puede cambiar contrasenas de otros usuarios.' },
        { status: 403 }
      );
    }

    const { uid } = await context.params;
    const body = (await request.json()) as { newPassword?: string };
    const newPassword = body.newPassword?.trim() ?? '';

    if (newPassword.length < 6) {
      return NextResponse.json(
        { error: 'La nueva contrasena debe tener al menos 6 caracteres.' },
        { status: 400 }
      );
    }

    await auth.updateUser(uid, {
      password: newPassword,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error cambiando contrasena como superadmin:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'No se pudo completar el cambio de contrasena del usuario.',
      },
      { status: 500 }
    );
  }
}
