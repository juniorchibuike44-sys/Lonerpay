import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';

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
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  const fail = (code, error) => res.status(code).json({ error });

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return fail(405, 'Method not allowed');
  }

  const url = process.env.SUPABASE_URL?.replace(/\/$/, '');
  const key = process.env.SUPABASE_SECRET_KEY;
  const appOrigin = process.env.LONERPAY_ORIGIN ||
    'https://lonerpayvercelfixed.vercel.app';
  const pepper = process.env.LOGIN_PIN_SECRET;

  if (!url || !key || !/^[a-f0-9]{64}$/i.test(pepper || '')) {
    return fail(503, 'Login PIN setup is not available yet. Use email and password.');
  }

  if (req.headers.origin !== appOrigin) {
    return fail(403, 'Open LonerPay using its official website address.');
  }

  if (!String(req.headers['content-type'] || '').startsWith('application/json')) {
    return fail(415, 'JSON request required');
  }

  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return fail(400, 'Invalid request');
  }

  const { action, pin, password } = req.body;

  if (!['status', 'enroll', 'verify', 'forget'].includes(action)) {
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
    if (!r.ok) throw new Error('Database unavailable');
    return r.data;
  }

  const proof = (value, id) =>
    createHmac('sha256', Buffer.from(pepper, 'hex'))
      .update(`login-pin:v1:${id}:${value}`)
      .digest('hex');

  try {
    if (action === 'forget') {
      if (current) {
        const r = await call(
          `/rest/v1/login_pin_devices?id=eq.${current.id}&device_hash=eq.${current.hash}`,
          { method: 'DELETE' }
        );
        if (!r.ok) throw new Error('Database unavailable');
      }

      res.setHeader('Set-Cookie', cookie('', 0));
      return res.status(200).json({ success: true });
    }

    if (action === 'status' || action === 'enroll') {
      const authorization = req.headers.authorization;

      if (!authorization?.startsWith('Bearer ')) {
        return fail(401, 'Log in with email and password first.');
      }

      const auth = await call('/auth/v1/user', { authorization });

      if (!auth.ok || !auth.data?.id) {
        return fail(401, 'Please log in again.');
      }

      const user = auth.data;

      if (action === 'status') {
        if (!current) {
          return res.status(200).json({ has_pin: false });
        }

        const r = await call(
          `/rest/v1/login_pin_devices?id=eq.${current.id}&device_hash=eq.${current.hash}&user_id=eq.${user.id}&select=expires_at`
        );

        if (!r.ok) throw new Error('Database unavailable');

        return res.status(200).json({
          has_pin: Boolean(
            r.data?.[0] &&
            Date.parse(r.data[0].expires_at) > Date.now()
          )
        });
      }

      if (typeof pin !== 'string' || !/^\d{6}$/.test(pin)) {
        return fail(400, 'Enter exactly six digits.');
      }

      if (/^(\d)\1{5}$/.test(pin) || pin === '123456' || pin === '654321') {
        return fail(400, 'Choose a less predictable six-digit PIN.');
      }

      if (typeof password !== 'string' || !password || password.length > 1024) {
        return fail(400, 'Enter your account password to set up or reset your PIN.');
      }

      if (mfaEnabled(user)) {
        return fail(403, 'Use your existing multi-factor login. PIN login is not enabled for this account.');
      }

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

      const id = randomUUID();
      const secret = randomBytes(32).toString('hex');

      await rpc('enroll_login_pin', {
        p_id: id,
        p_user_id: user.id,
        p_device_hash: sha(secret),
        p_pin_proof: proof(pin, id),
        p_previous_id: current?.id || null,
        p_previous_hash: current?.hash || null
      });

      res.setHeader('Set-Cookie', cookie(id + '.' + secret));
      return res.status(200).json({ success: true, has_pin: true });
    }

    if (!current) {
      return fail(401, 'Log in with email and password to set up your login PIN on this phone.');
    }

    if (typeof pin !== 'string' || !/^\d{6}$/.test(pin)) {
      return fail(400, 'Enter exactly six digits.');
    }

    const lease = randomUUID();

    const result = await rpc('check_login_pin', {
      p_id: current.id,
      p_device_hash: current.hash,
      p_pin_proof: proof(pin, current.id),
      p_lease_id: lease
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
          : 'Please log in with email and password and set up your PIN again.'
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
  } catch (_) {
    // Never log PINs, passwords, cookies, or session data.
    return fail(503, 'Unable to complete PIN login right now. Please use email and password.');
  }
} 
