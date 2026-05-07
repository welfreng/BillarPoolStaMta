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
        { error: 'Solo un superadmin puede cambiar correos de otros usuarios.' },
        { status: 403 }
      );
    }

    const { uid } = await context.params;
    const body = (await request.json()) as { newEmail?: string };
    const newEmail = body.newEmail?.trim().toLowerCase() ?? '';

    if (!newEmail || !newEmail.includes('@')) {
      return NextResponse.json({ error: 'Ingresa un correo valido.' }, { status: 400 });
    }

    const targetUser = await auth.getUser(uid);
    const currentEmail = targetUser.email?.trim().toLowerCase() ?? '';
    if (currentEmail === newEmail) {
      return NextResponse.json({ ok: true, unchanged: true });
    }

    try {
      const existingUser = await auth.getUserByEmail(newEmail);
      if (existingUser.uid !== uid) {
        return NextResponse.json({ error: 'Ese correo ya esta en uso por otro usuario.' }, { status: 409 });
      }
    } catch (error) {
      const firebaseError = error as { code?: string };
      if (firebaseError.code !== 'auth/user-not-found') {
        throw error;
      }
    }

    await auth.updateUser(uid, {
      email: newEmail,
      emailVerified: false,
    });

    await db.collection('usuarios').doc(uid).set(
      {
        email: newEmail,
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error cambiando correo como superadmin:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'No se pudo completar el cambio de correo del usuario.',
      },
      { status: 500 }
    );
  }
}
