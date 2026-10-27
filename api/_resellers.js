export const OWNER_EMAIL = 'juniorchibuike44@gmail.com';
export const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export async function resellerDb(auth, path, options = {}) {
  const response = await fetch(auth.supabaseUrl + '/rest/v1/' + path, {
    ...options, headers: {apikey: auth.secretKey, Authorization: 'Bearer ' + auth.secretKey,
      'Content-Type': 'application/json', Prefer: 'return=representation', ...options.headers}, cache: 'no-store', signal: AbortSignal.timeout(8000)
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw Error('Reseller records are unavailable. Please retry.');
  return data;
}
export function recipients(values) {
  if (!Array.isArray(values) || values.length < 2 || values.length > 20 || values.some(v => typeof v !== 'string' || !/^0\d{10}$/.test(v)) || new Set(values).size !== values.length) throw Error('Enter 2 to 20 different 11-digit Nigerian phone numbers');
  return values;
}
export async function loadBulkItem(auth, id) {
  if (!uuid(id)) throw Object.assign(Error('Invalid bulk item'), {statusCode:400});
  const rows = await resellerDb(auth, 'lp_bulk_items?id=eq.'+id+'&select=*');
  const item = rows?.[0];
  if (!item) throw Object.assign(Error('Bulk item unavailable'), {statusCode:404});
  const batches = await resellerDb(auth, 'lp_bulk_batches?id=eq.'+item.batch_id+'&user_id=eq.'+encodeURIComponent(auth.user.id)+'&select=id,expires_at');
  if (!batches?.length) throw Object.assign(Error('Bulk item unavailable'), {statusCode:404});
  if (item.state==='queued' && Date.parse(batches[0].expires_at)<=Date.now()) throw Object.assign(Error('Batch quote expired. Create a new batch for unsent recipients.'), {statusCode:409});
  return item;
}
