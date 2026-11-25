import fs from 'node:fs';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const firebaseConfigUrl = new URL('../../firebase-applet-config.json', import.meta.url);
const firebaseConfig = fs.existsSync(firebaseConfigUrl)
  ? (JSON.parse(fs.readFileSync(firebaseConfigUrl, 'utf8')) as { projectId?: string })
  : {};

const projectId =
  firebaseConfig.projectId ||
  process.env.GOOGLE_CLOUD_PROJECT ||
  process.env.FIREBASE_PROJECT_ID;

if (!getApps().length) {
  initializeApp(projectId ? { projectId } : undefined);
}

export const adminAuth = getAuth();
