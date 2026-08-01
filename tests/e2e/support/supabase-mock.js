// A tiny in-memory stand-in for Supabase Auth (GoTrue) + PostgREST + Edge
// Functions, wired in via Playwright's `page.route`. The app talks to
// Supabase directly with no backend of its own, so this is what lets the
// suite drive real signup/login/CRUD/RPC calls through supabase-js without
// a live project, Docker, or any secrets.
//
// It deliberately doesn't implement the whole PostgREST query language —
// just enough of `eq`/`neq`/`in`/`order` filtering, `.select()`/`.single()`
// response shaping, and the one join (`marketplace_listings` -> `vouchers`)
// the app actually issues. Call `createDb()` once per test and pass the
// same object to `installSupabaseMock` for every page/context that should
// share the same "backend" (e.g. a sender and a recipient in the gift flow).

import { randomUUID } from 'node:crypto';

export function createDb() {
  return {
    authUsersByEmail: new Map(), // email -> { id, password, user }
    tables: {
      users: [],
      public_profiles: [],
      vouchers: [],
      voucher_files: [],
      marketplace_listings: [],
      voucher_gifts: [],
      brands: [],
      discovery_brands: [],
      friendships: [],
      referral_codes: [],
      reminders: [],
    },
  };
}

function nowIso() {
  return new Date().toISOString();
}

function tokenForUser(id) {
  return `test-access-token-${id}`;
}

function userIdFromAuthHeader(headers) {
  const header = headers['authorization'] || '';
  const match = /test-access-token-([\w-]+)/.exec(header);
  return match ? match[1] : null;
}

function makeSession(user) {
  return {
    access_token: tokenForUser(user.id),
    refresh_token: `test-refresh-token-${user.id}`,
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: 'bearer',
    user,
  };
}

function makeAuthUser({ id, email, firstName, lastName }) {
  return {
    id,
    aud: 'authenticated',
    role: 'authenticated',
    email,
    email_confirmed_at: nowIso(),
    phone: '',
    last_sign_in_at: nowIso(),
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: { first_name: firstName || '', last_name: lastName || '' },
    identities: [{
      identity_id: randomUUID(),
      id,
      user_id: id,
      identity_data: { email },
      provider: 'email',
      last_sign_in_at: nowIso(),
      created_at: nowIso(),
      updated_at: nowIso(),
    }],
    created_at: nowIso(),
    updated_at: nowIso(),
  };
}

async function fulfillJson(route, status, body) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function handleAuth(route, db) {
  const req = route.request();
  const url = new URL(req.url());
  const path = url.pathname;
  const method = req.method();

  if (path.endsWith('/signup') && method === 'POST') {
    const body = req.postDataJSON();
    const existing = db.authUsersByEmail.get(body.email);
    if (existing) {
      // Real Supabase: no error, but an empty `identities` array signals
      // "already registered" — register() in app.js checks for exactly this.
      return fulfillJson(route, 200, { ...existing.user, identities: [] });
    }
    const id = randomUUID();
    const firstName = body.data?.first_name;
    const lastName = body.data?.last_name;
    const user = makeAuthUser({ id, email: body.email, firstName, lastName });
    db.authUsersByEmail.set(body.email, { id, password: body.password, user });
    db.tables.users.push({
      id, email: body.email, avatar_url: null,
      first_name: firstName || null, last_name: lastName || null,
      last_active_at: null, created_at: nowIso(),
    });
    db.tables.public_profiles.push({ id, email: body.email, first_name: firstName || null, last_name: lastName || null });
    return fulfillJson(route, 200, makeSession(user));
  }

  if (path.endsWith('/token') && method === 'POST' && url.searchParams.get('grant_type') === 'password') {
    const body = req.postDataJSON();
    const entry = db.authUsersByEmail.get(body.email);
    if (!entry || entry.password !== body.password) {
      return fulfillJson(route, 400, { error: 'invalid_grant', error_description: 'Invalid login credentials', message: 'Invalid login credentials', code: 'invalid_credentials' });
    }
    return fulfillJson(route, 200, makeSession(entry.user));
  }

  if (path.endsWith('/logout')) {
    return route.fulfill({ status: 204, body: '' });
  }

  if (path.endsWith('/user') && method === 'GET') {
    const uid = userIdFromAuthHeader(req.headers());
    const entry = [...db.authUsersByEmail.values()].find(e => e.id === uid);
    return fulfillJson(route, 200, entry ? entry.user : {});
  }

  // Anything else auth-related (recover/resend/verify) isn't exercised by
  // these flows — respond blandly rather than leaving it unhandled.
  return fulfillJson(route, 200, {});
}

function applyFilters(rows, searchParams) {
  let result = rows;
  for (const [key, raw] of searchParams.entries()) {
    if (['select', 'order', 'limit', 'offset'].includes(key)) continue;
    const dot = raw.indexOf('.');
    if (dot === -1) continue;
    const op = raw.slice(0, dot);
    const val = raw.slice(dot + 1);
    if (op === 'eq') result = result.filter(r => String(r[key]) === val);
    else if (op === 'neq') result = result.filter(r => String(r[key]) !== val);
    else if (op === 'in') {
      const set = val.replace(/^\(|\)$/g, '').split(',');
      result = result.filter(r => set.includes(String(r[key])));
    }
  }
  const order = searchParams.get('order');
  if (order) {
    for (const clause of order.split(',').reverse()) {
      const [col, dir] = clause.split('.');
      const desc = dir === 'desc';
      result = [...result].sort((a, b) => {
        if (a[col] === b[col]) return 0;
        return (a[col] > b[col] ? 1 : -1) * (desc ? -1 : 1);
      });
    }
  }
  return result;
}

// Columns the real schema fills in via `DEFAULT` when the app's insert
// doesn't set them explicitly (see supabase/schema.sql) — the app relies on
// these defaults rather than setting the values itself, so the mock has to
// replicate them or those rows silently fail later `eq()` filters.
const TABLE_DEFAULTS = {
  voucher_gifts: { status: 'pending' },
  marketplace_listings: { status: 'available', visibility: 'public' },
  vouchers: { status: 'active' },
};

function applyDefaults(table, row) {
  const defaults = TABLE_DEFAULTS[table];
  return defaults ? { ...defaults, ...row } : row;
}

function attachEmbeds(table, rows, db, select) {
  if (table === 'marketplace_listings' && select && select.includes('vouchers(')) {
    return rows.map(r => {
      const voucher = db.tables.vouchers.find(v => v.id === r.voucher_id);
      return { ...r, vouchers: voucher ? { brand: voucher.brand, expiration_date: voucher.expiration_date } : null };
    });
  }
  return rows;
}

async function handleRpc(route, db, fnName) {
  const req = route.request();
  const body = req.postDataJSON() || {};
  const uid = userIdFromAuthHeader(req.headers());

  if (fnName === 'claim_voucher_gift') {
    const gift = db.tables.voucher_gifts.find(g => g.id === body.p_gift_id && g.status === 'pending');
    if (!gift) {
      return fulfillJson(route, 400, { message: 'This gift link is no longer valid', code: 'P0001' });
    }
    gift.status = 'claimed';
    const voucher = db.tables.vouchers.find(v => v.id === gift.voucher_id);
    if (voucher) voucher.user_id = uid;
    if (gift.sender_id && uid && gift.sender_id !== uid) {
      db.tables.friendships.push({ id: randomUUID(), requester_id: gift.sender_id, receiver_id: uid, status: 'accepted', created_at: nowIso() });
    }
    return fulfillJson(route, 200, voucher ? voucher.id : null);
  }

  return fulfillJson(route, 200, null);
}

async function handleRest(route, db) {
  const req = route.request();
  const url = new URL(req.url());

  if (url.pathname.includes('/rest/v1/rpc/')) {
    const fnName = url.pathname.split('/rpc/')[1];
    return handleRpc(route, db, fnName);
  }

  const match = /\/rest\/v1\/([^/?]+)/.exec(url.pathname);
  const table = match ? match[1] : null;
  if (!table || !(table in db.tables)) {
    return fulfillJson(route, 200, []);
  }

  const method = req.method();
  const accept = req.headers()['accept'] || '';
  const wantsSingle = accept.includes('vnd.pgrst.object');
  const prefer = req.headers()['prefer'] || '';
  const wantsRepresentation = prefer.includes('return=representation');

  if (method === 'GET') {
    let rows = applyFilters(db.tables[table], url.searchParams);
    rows = attachEmbeds(table, rows, db, url.searchParams.get('select'));
    if (wantsSingle) {
      if (rows.length === 0) return fulfillJson(route, 406, { message: 'No rows found' });
      return fulfillJson(route, 200, rows[0]);
    }
    return fulfillJson(route, 200, rows);
  }

  if (method === 'POST') {
    const bodyRaw = req.postDataJSON();
    const items = Array.isArray(bodyRaw) ? bodyRaw : [bodyRaw];
    const inserted = items.map(item => {
      const row = applyDefaults(table, { id: randomUUID(), created_at: nowIso(), ...item });
      db.tables[table].push(row);
      return row;
    });
    if (!wantsRepresentation) return route.fulfill({ status: 201, body: '' });
    return fulfillJson(route, 201, wantsSingle ? inserted[0] : inserted);
  }

  if (method === 'PATCH') {
    const body = req.postDataJSON();
    const matches = applyFilters(db.tables[table], url.searchParams);
    matches.forEach(row => Object.assign(row, body));
    if (!wantsRepresentation) return route.fulfill({ status: 204, body: '' });
    return fulfillJson(route, 200, wantsSingle ? matches[0] : matches);
  }

  if (method === 'DELETE') {
    const matches = new Set(applyFilters(db.tables[table], url.searchParams));
    db.tables[table] = db.tables[table].filter(r => !matches.has(r));
    return route.fulfill({ status: 204, body: '' });
  }

  return route.fulfill({ status: 404, body: '' });
}

export async function installSupabaseMock(page, db) {
  await page.route('**/auth/v1/**', route => handleAuth(route, db));
  await page.route('**/rest/v1/**', route => handleRest(route, db));
  // Brand enrichment fires-and-forgets a Supabase Edge Function call; it's
  // already wrapped in a `.catch()` in app.js, but stub it so the suite
  // never depends on real network access.
  await page.route('**/functions/v1/**', route => fulfillJson(route, 200, {}));
}
