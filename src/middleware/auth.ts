import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { eq } from 'drizzle-orm';
import { adminAuth } from '../lib/firebase-admin.ts';
import { db } from '../db/index.ts';
import { profiles, staff, userRoles } from '../db/schema.ts';

const SESSION_SECRET =
  process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

const INITIAL_ADMIN_EMAIL = (
  process.env.ADMIN_EMAIL || 'rubifunded@gmail.com'
).toLowerCase();

export interface SessionActor {
  uid: string;
  profileId: number | null;
  staffId: number | null;
  counterId: number | null;
  email: string;
  phone: string;
  fullName: string;
  role: 'customer' | 'counter_staff' | 'admin';
  authProvider: 'firebase' | 'otp' | 'staff_passcode';
}

export interface AuthRequest extends Request {
  actor?: SessionActor;
}

export function hashSecret(raw: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(raw, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifySecret(raw: string, stored: string): boolean {
  if (!stored || !stored.includes(':')) return false;
  const [salt, expectedHex] = stored.split(':');
  const derived = crypto.scryptSync(raw, salt, 64);
  const expected = Buffer.from(expectedHex, 'hex');
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

export function signSessionToken(actor: SessionActor): string {
  const payloadObj = {
    ...actor,
    exp: Date.now() + 1000 * 60 * 60 * 24, // 24h
  };
  const payloadB64 = Buffer.from(JSON.stringify(payloadObj), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(payloadB64)
    .digest('base64url');
  return `jgt.${payloadB64}.${sig}`;
}

export function verifySessionToken(token: string): SessionActor | null {
  if (!token.startsWith('jgt.')) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [, payloadB64, sig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(payloadB64)
    .digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    if (!parsed.exp || Date.now() > Number(parsed.exp)) return null;
    return {
      uid: String(parsed.uid),
      profileId: parsed.profileId ?? null,
      staffId: parsed.staffId ?? null,
      counterId: parsed.counterId ?? null,
      email: String(parsed.email || ''),
      phone: String(parsed.phone || ''),
      fullName: String(parsed.fullName || ''),
      role: parsed.role || 'customer',
      authProvider: parsed.authProvider || 'otp',
    };
  } catch {
    return null;
  }
}

export async function getOrCreateProfileFromFirebase(
  uid: string,
  email: string,
  fullName = ''
): Promise<SessionActor> {
  const normalizedEmail = email.toLowerCase().trim();
  const existing = await db
    .select()
    .from(profiles)
    .where(eq(profiles.uid, uid))
    .limit(1);

  const [staffRow] = normalizedEmail
    ? await db.select().from(staff).where(eq(staff.email, normalizedEmail)).limit(1)
    : [];

  let resolvedRole: 'customer' | 'counter_staff' | 'admin' = 'customer';
  if (normalizedEmail && normalizedEmail === INITIAL_ADMIN_EMAIL) {
    resolvedRole = 'admin';
  } else if (staffRow && staffRow.isActive) {
    resolvedRole =
      staffRow.role === 'admin' && normalizedEmail === INITIAL_ADMIN_EMAIL
        ? 'admin'
        : 'counter_staff';
  } else if (existing[0]?.role === 'counter_staff') {
    resolvedRole = 'counter_staff';
  }

  const upserted = await db
    .insert(profiles)
    .values({
      uid,
      email: normalizedEmail,
      fullName: fullName || existing[0]?.fullName || '',
      role: resolvedRole,
    })
    .onConflictDoUpdate({
      target: profiles.uid,
      set: {
        email: normalizedEmail || existing[0]?.email || '',
        fullName: fullName || existing[0]?.fullName || '',
        role: resolvedRole,
      },
    })
    .returning();

  const profile = upserted[0];

  const existingRole = await db
    .select()
    .from(userRoles)
    .where(eq(userRoles.userId, profile.id))
    .limit(1);
  if (existingRole.length === 0) {
    await db.insert(userRoles).values({
      userId: profile.id,
      role: resolvedRole,
      assignedBy: 'system',
    });
  }

  return {
    uid: profile.uid,
    profileId: profile.id,
    staffId: staffRow?.id ?? null,
    counterId: staffRow?.counterId ?? null,
    email: profile.email,
    phone: profile.phone,
    fullName: profile.fullName,
    role: resolvedRole,
    authProvider: 'firebase',
  };
}

async function resolveActorFromRequest(req: AuthRequest): Promise<SessionActor | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) return null;

  if (token.startsWith('jgt.')) {
    return verifySessionToken(token);
  }

  try {
    const decoded = await adminAuth.verifyIdToken(token);
    return await getOrCreateProfileFromFirebase(
      decoded.uid,
      decoded.email || '',
      decoded.name || ''
    );
  } catch {
    return null;
  }
}

export async function optionalAuth(req: AuthRequest, _res: Response, next: NextFunction) {
  const actor = await resolveActorFromRequest(req);
  if (actor) {
    req.actor = actor;
  }
  next();
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const actor = await resolveActorFromRequest(req);
  if (!actor) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  req.actor = actor;
  next();
}

export async function requireStaffOrAdmin(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  const actor = await resolveActorFromRequest(req);
  if (!actor) {
    return res.status(401).json({ error: 'Staff or administrator sign-in required' });
  }
  if (actor.role !== 'counter_staff' && actor.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden: Counter staff or admin access required' });
  }
  req.actor = actor;
  next();
}

export async function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  const actor = await resolveActorFromRequest(req);
  if (!actor) {
    return res.status(401).json({ error: 'Administrator sign-in required' });
  }
  if (actor.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden: Administrator privileges required' });
  }
  req.actor = actor;
  next();
}
