import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const PROJECT_ROOT = process.cwd();
const ENV_FILE = path.join(PROJECT_ROOT, '.env.local');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separatorIndex = line.indexOf('=');
    if (separatorIndex <= 0) continue;
    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function getAdminApp() {
  const existingApp = getApps()[0];
  if (existingApp) return existingApp;

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      'Firebase Admin SDK no esta configurado. Define FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL y FIREBASE_ADMIN_PRIVATE_KEY.'
    );
  }

  return initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });
}

async function main() {
  loadEnvFile(ENV_FILE);

  const oldEmail = process.argv[2]?.trim().toLowerCase();
  const newEmail = process.argv[3]?.trim().toLowerCase();

  if (!oldEmail || !newEmail) {
    throw new Error('Uso: node scripts/update-user-email.mjs <correo-actual> <correo-nuevo>');
  }

  if (oldEmail === newEmail) {
    throw new Error('El correo actual y el nuevo no pueden ser iguales.');
  }

  const app = getAdminApp();
  const auth = getAuth(app);
  const db = getFirestore(app);

  let targetUser;
  try {
    targetUser = await auth.getUserByEmail(oldEmail);
  } catch (error) {
    throw new Error(`No existe un usuario en Firebase Auth con el correo ${oldEmail}.`);
  }

  try {
    await auth.getUserByEmail(newEmail);
    throw new Error(`El correo ${newEmail} ya esta en uso en Firebase Auth.`);
  } catch (error) {
    if (error instanceof Error && !error.message.includes('already in use')) {
      const firebaseError = /** @type {{ code?: string }} */ (error);
      if (firebaseError.code !== 'auth/user-not-found') {
        throw error;
      }
    }
  }

  const profileRef = db.collection('usuarios').doc(targetUser.uid);
  const profileSnapshot = await profileRef.get();
  if (!profileSnapshot.exists) {
    throw new Error(`No existe el perfil usuarios/${targetUser.uid} para el correo ${oldEmail}.`);
  }

  await auth.updateUser(targetUser.uid, {
    email: newEmail,
    emailVerified: false,
  });

  await profileRef.set(
    {
      email: newEmail,
      updatedAt: Timestamp.fromDate(new Date()),
    },
    { merge: true }
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        uid: targetUser.uid,
        oldEmail,
        newEmail,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
