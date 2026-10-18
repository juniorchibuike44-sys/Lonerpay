import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { enforceRateLimit, hardenResponse } from './_security.js';

const COOKIE = '__Host-lonerpay_login_device';
const MAX_AGE = 30 * 24 * 60 * 60;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const sha = value => createHash('sha256').update(value).digest('hex');

function device(req) {
  const raw = String(req.headers.cookie || '').split(';').map(x => x.trim())
    .find(x => x.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1);
  if (!raw) return null;

  const [id, secret, ...extra] = raw.split('.');
  if (!UUID.test(id || '') || !/^[a-f0-9]{64}$/.test(secret || '') || extra.length) {
    return null;
  }
  return { id, hash: sha(secret), raw };
}

const cookie = (value, age = MAX_AGE) =>
  `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${age}`;

function mfaEnabled(user) {
  return Array.isArray(user?.factors) &&
    user.factors.some(f => f.status === 'verified');
}

export default async function handler(req, res) {
  hardenResponse(res);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  const fail = (code, error) => res.status(code).json({ error });

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return fail(405, 'Method not allowed');
  }
  if (!enforceRateLimit(req, res, { key: 'login-pin', limit: 15, windowMs: 15 * 60_000 })) return;

  const url = process.env.SUPABASE_URL?.replace(/\/$/, '');
  const key = process.env.SUPABASE_SECRET_KEY;
  const allowedOrigins = new Set([
    'https://lonerpay.com',
    'https://www.lonerpay.com',
    'https://lonerpayvercelfixed.vercel.app',
    ...(process.env.LONERPAY_ORIGIN ? [process.env.LONERPAY_ORIGIN] : [])
  ]);
  const pepper = process.env.LOGIN_PIN_SECRET;

  if (!url || !key || !/^[a-f0-9]{64}$/i.test(pepper || '')) {
    return fail(503, 'Login PIN setup is not available yet. Use email and password.');
  }

  if (!allowedOrigins.has(req.headers.origin)) {
    return fail(403, 'Open LonerPay using its official website address.');
  }

  if (!String(req.headers['content-type'] || '').startsWith('application/json')) {
    return fail(415, 'JSON request required');
  }

  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return fail(400, 'Invalid request');
  }

  const { action, pin, password } = req.body;

  if (!['status', 'enroll', 'attach', 'reset', 'verify', 'forget'].includes(action)) {
    return fail(400, 'Invalid login PIN action');
  }

  const current = device(req);
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json'
  };

  async function call(path, { method = 'GET', body, authorization } = {}) {
    const response = await fetch(url + path, {
      method,
      headers: {
        ...headers,
        ...(authorization ? { Authorization: authorization } : {})
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      cache: 'no-store',
      signal: AbortSignal.timeout(12000)
    });

    const data = await response.json().catch(() => null);
    return { ok: response.ok, status: response.status, data };
  }

  async function rpc(name, body) {
    const r = await call('/rest/v1/rpc/' + name, { method: 'POST', body });
    if (!r.ok) {const e=new Error('Database unavailable');if(['PGRST202','42883','42P01'].includes(r.data?.code))e.setup=true;throw e;}
    return r.data;
  }

  const proof = (value, id) =>
    createHmac('sha256', Buffer.from(pepper, 'hex'))
      .update(`login-pin:v1:${id}:${value}`)
      .digest('hex');

  const accountProof=(value,userId)=>createHmac('sha256',Buffer.from(pepper,'hex')).update(`login-pin:v2:${userId}:${value}`).digest('hex');

  try {
    if (action === 'forget') {
      if(current)await rpc('forget_login_pin_device',{p_id:current.id,p_hash:current.hash});

      res.setHeader('Set-Cookie', cookie('', 0));
      return res.status(200).json({ success: true });
    }

    if (['status','enroll','attach','reset'].includes(action)) {
      const authorization = req.headers.authorization;

      if (!authorization?.startsWith('Bearer ')) {
        return fail(401, 'Log in with email and password first.');
      }

      const auth = await call('/auth/v1/user', { authorization });

      if (!auth.ok || !auth.data?.id) {
        return fail(401, 'Please log in again.');
      }

      const user = auth.data;

      const context=await rpc('login_pin_account_context',{p_user:user.id,p_id:current?.id||null,p_hash:current?.hash||null});
      if(action==='status')return res.status(200).json({has_pin:context.has_pin===true,device_ready:context.device_ready===true,account_pin:true});

      if (typeof pin !== 'string' || !/^\d{6}$/.test(pin)) {
        return fail(400, 'Enter exactly six digits.');
      }

      if (action!=='attach' && (/^(\d)\1{5}$/.test(pin) || pin === '123456' || pin === '654321')) {
        return fail(400, 'Choose a less predictable six-digit PIN.');
      }

      if (action!=='attach' && (typeof password !== 'string' || !password || password.length > 1024)) {
        return fail(400, 'Enter your account password to set up or reset your PIN.');
      }

      if(action==='attach'&&!user.email_confirmed_at)return fail(403,'Verify your email before linking PIN login.');

      if (mfaEnabled(user)) {
        return fail(403, 'Use your existing multi-factor login. PIN login is not enabled for this account.');
      }

      if(action!=='attach'){
      const fresh = await call('/auth/v1/token?grant_type=password', {
        method: 'POST',
        body: { email: user.email, password }
      });

      if (!fresh.ok || fresh.data?.user?.id !== user.id) {
        return fail(401, 'Account password is incorrect.');
      }

      if (!fresh.data.user.email_confirmed_at) {
        return fail(403, 'Verify your email before setting up PIN login.');
      }

      // This session is only used to confirm password ownership.
      await call('/auth/v1/logout?scope=local', {
        method: 'POST',
        authorization: `Bearer ${fresh.data.access_token}`
      });

      }

      const id = randomUUID();
      const secret = randomBytes(32).toString('hex');

      const result=await rpc('configure_account_login_pin',{
        p_user:user.id,p_proof:accountProof(pin,user.id),p_mode:action,p_id:id,p_hash:sha(secret),p_device_proof:proof(pin,id),
        p_legacy:(context.legacy_ids||[]).map(previous=>({id:previous,proof:proof(pin,previous)}))
      });
      if(result?.status==='already_set')return fail(409,'Your account already has a login PIN. Enter your existing PIN to link this device.');
      if(result?.status==='locked')return fail(423,'Too many wrong attempts. Try again in 15 minutes, or reset your PIN after signing in with your password.');
      if(result?.status!=='ok')return fail(401,'Login PIN is incorrect. Enter the PIN you already created.');

      res.setHeader('Set-Cookie', cookie(id + '.' + secret));
      return res.status(200).json({ success: true, has_pin: true });
    }

    if (!current) {
      return fail(401, 'Sign in with email and password first, then enter your existing login PIN to link this device.');
    }

    if (typeof pin !== 'string' || !/^\d{6}$/.test(pin)) {
      return fail(400, 'Enter exactly six digits.');
    }

    const lease = randomUUID();

    const context=await rpc('login_pin_account_context',{p_user:null,p_id:current.id,p_hash:current.hash});
    if(!context.user_id)return fail(401,'This device approval expired. Sign in with email and password, then use your existing login PIN.');
    const result=await rpc('check_account_login_pin',{
      p_id:current.id,p_hash:current.hash,p_account_proof:accountProof(pin,context.user_id),p_legacy_proof:proof(pin,current.id),p_lease:lease
    });

    if (result?.status === 'locked') {
      res.setHeader(
        'Retry-After',
        String(Math.max(1, Number(result.retry_after) || 900))
      );
      return fail(423, 'Too many wrong attempts. Try again later, or use email and password.');
    }

    if (result?.status === 'busy') {
      return fail(409, 'An unlock is already in progress. Please wait and try again.');
    }

    if (result?.status !== 'ok') {
      return fail(
        401,
        result?.status === 'incorrect'
          ? 'Login PIN is incorrect.'
          : 'Sign in with email and password, then enter your existing PIN to approve this device.'
      );
    }

    try {
      const account = await call(
        '/auth/v1/admin/users/' + encodeURIComponent(result.user_id)
      );

      const user = account.data?.user || account.data;

      if (
        !account.ok ||
        user?.id !== result.user_id ||
        !user.email ||
        !user.email_confirmed_at ||
        (user.banned_until && Date.parse(user.banned_until) > Date.now()) ||
        mfaEnabled(user)
      ) {
        return fail(401, 'Use email and password to continue.');
      }

      // Create a session only after the PIN and device are verified.
      // The administrative token stays on the server.
      const generated = await call('/auth/v1/admin/generate_link', {
        method: 'POST',
        body: { type: 'magiclink', email: user.email }
      });

      if (!generated.ok || !generated.data?.hashed_token) {
        throw new Error('Session unavailable');
      }

      const verified = await call('/auth/v1/verify', {
        method: 'POST',
        body: {
          type: 'email',
          token_hash: generated.data.hashed_token
        }
      });

      if (
        !verified.ok ||
        !verified.data?.access_token ||
        verified.data?.user?.id !== user.id
      ) {
        throw new Error('Session unavailable');
      }

      res.setHeader('Set-Cookie', cookie(current.raw));

      return res.status(200).json({
        success: true,
        session: verified.data
      });
    } finally {
      try {
        await rpc('finish_login_pin', {
          p_id: current.id,
          p_lease_id: lease
        });
      } catch (_) {
        // The lease expires automatically.
      }
    }
  } catch (error) {
    if(error?.setup)return fail(503,'Account login PIN update is required. Run supabase/account-login-pin.sql. Your existing PIN has not been changed.');
    // Never log PINs, passwords, cookies, or session data.
    return fail(503, 'Unable to complete PIN login right now. Please use email and password.');
  }
} 

