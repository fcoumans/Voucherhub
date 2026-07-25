import { supabase } from './lib/supabase.js';

/* ============================================================
   CONFIG
   ============================================================ */
const CATEGORIES = ['Food & Drink', 'Shopping', 'Travel', 'Entertainment', 'Finance', 'Sports & Fitness', 'Beauty & Wellness', 'Mobility', 'Other'];
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;
function getReferralCategories() {
  const cats = [...new Set(state.referrals.map(r => r.category).filter(c => c && c !== 'Other'))].sort();
  if (state.referrals.some(r => !r.category || r.category === 'Other')) cats.push('Other');
  return ['All', ...cats];
}

/* ============================================================
   STATE
   ============================================================ */
const state = {
  view: 'auth',
  params: {},
  currentUser: null,
  vouchers:   [],
  brands:     [],
  listings:   [],   // marketplace_listings rows
  referrals:  [],   // referral_codes rows
  friends:         [],   // user objects { id, name, email }
  friendIds:       [],   // UUID array for quick lookup
  pendingRequests: [],   // incoming friend requests { id, requesterId, name, email }
  reminders:  [],   // notifications rows
  voucherFiles: [],  // voucher_files rows for the voucher currently open (form or detail)
  pendingGifts: [],  // voucher_gifts rows this user has sent that are still unclaimed
  searchQuery: '',
  activeFilter: 'active',
  activeSort: 'expiry',
  marketplaceTab: 'browse',
  referralTab: 'public',
  referralBrandFilter: null,      // null = brand grid, 'BrandName' = code list for that brand
  referralCategoryFilter: 'All',  // category chip filter within the referral brand grid
  referralVotes: {},              // { [referralId]: 'up' | 'down' } — in-memory, no DB column yet
};

/* ============================================================
   UTILITIES
   ============================================================ */
const esc = (str) =>
  String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const formatDate = (dateStr) => {
  if (!dateStr) return 'N/A';
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

const daysUntil = (dateStr) => {
  if (!dateStr) return Infinity;
  const [y, m, d] = dateStr.split('-').map(Number);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exp = new Date(y, m - 1, d);
  return Math.round((exp - today) / 86400000);
};

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};

const nowDateTimeLocalStr = () => {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const defaultReminderDateTimeStr = () => {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  // Default to 9AM today, or 9AM tomorrow if past 9AM
  if (d.getHours() >= 9) d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T09:00`;
};

const formatMonthYear = (dateStr) => {
  if (!dateStr) return '';
  const [y, m] = dateStr.split('-').map(Number);
  return `${String(m).padStart(2,'0')}-${y}`;
};

const brandColor = () => '#13B5A2';

const initial = (name) => (name || '?').charAt(0).toUpperCase();

const formatCurrency = (amount, currency = 'EUR') => {
  const sym = { EUR: '€', USD: '$', GBP: '£', CHF: 'CHF ', SEK: 'kr', NOK: 'kr', DKK: 'kr' };
  const formatted = parseFloat(amount || 0).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (sym[currency] || currency + ' ') + formatted;
};

// Native number inputs always require a period; this lets users type a comma (European style) instead.
const normalizeAmount = (str) => String(str ?? '').trim().replace(',', '.');

const getStatus = (v) => {
  if (v.status === 'used') return 'used';
  if (v.status === 'sold') return 'sold';
  if (v.listed) return 'listed';
  if (!v.expiryDate) return 'active';
  const d = daysUntil(v.expiryDate);
  if (d < 0) return 'expired';
  if (d <= 30) return 'expiring';
  return 'active';
};

const STATUS_LABEL = { active: 'Active', expiring: 'Expiring', expired: 'Expired', used: 'Used', sold: 'Sold', listed: 'Listed for Sale' };
const STATUS_CLASS  = { active: 'badge-success', expiring: 'badge-warning', expired: 'badge-danger', used: 'badge-gray', sold: 'badge-gray', listed: 'badge-primary' };

const discountPct = (original, selling) => {
  if (!original || !selling || original <= 0) return 0;
  return Math.round(((original - selling) / original) * 100);
};

const formData = (form) => Object.fromEntries(new FormData(form));

/* ============================================================
   USER MAPPING
   ============================================================ */
function mapUser(supabaseUser) {
  return {
    id:    supabaseUser.id,
    name:  supabaseUser.user_metadata?.name || supabaseUser.email.split('@')[0],
    email: supabaseUser.email,
  };
}

// syncUserToSupabase disabled — public.users not queried until RLS/schema is confirmed
function syncUserToSupabase() {}

/* ============================================================
   VOUCHER FIELD MAPPING (Supabase ↔ frontend)
   ============================================================ */
function mapVoucher(row) {
  return {
    id:          row.id,
    userId:      row.user_id,
    brand:       row.brand,
    value:       String(row.amount ?? ''),
    balance:     row.balance != null ? String(row.balance) : null,
    currency:    row.currency || 'EUR',
    expiryDate:  row.expiration_date || null,
    code:        row.voucher_code || '',
    pin:         row.pin || '',
    notes:       row.notes || '',
    category:    row.category || 'Other',
    status:      row.status === 'listed' ? 'active' : (row.status || 'active'),
    listed:      row.status === 'listed',
    copyCount:   row.copy_count || 0,
    createdAt:   row.created_at,
    voucherType: row.voucher_type || 'gift_card',
    barcodePath: row.barcode_path || null,
  };
}

function voucherToDb(v) {
  return {
    user_id:         v.userId,
    brand:           v.brand,
    amount:          parseFloat(v.value) || 0,
    balance:         v.balance !== '' && v.balance != null ? parseFloat(v.balance) : null,
    currency:        v.currency || 'EUR',
    expiration_date: v.expiryDate || null,
    voucher_code:    v.code || null,
    pin:             v.pin || null,
    notes:           v.notes || null,
    category:        v.category || 'Other',
    status:          v.listed ? 'listed' : (v.status || 'active'),
    copy_count:      v.copyCount || 0,
    voucher_type:    v.voucherType || 'gift_card',
    barcode_path:    v.barcodePath !== undefined ? v.barcodePath : null,
  };
}

/* ============================================================
   LISTING FIELD MAPPING (Supabase ↔ frontend)
   ============================================================ */
function mapListing(row) {
  return {
    id:            row.id,
    voucherId:     row.voucher_id,
    sellerId:      row.seller_id,
    sellerName:    '',
    sellerEmail:   '',
    brand:         '',
    originalValue: row.original_value,
    currency:      row.currency || 'EUR',
    sellingPrice:  row.selling_price,
    expiryDate:    null,
    notes:         '',
    status:        row.status,
    createdAt:     row.created_at,
  };
}

/* ============================================================
   REFERRAL FIELD MAPPING (Supabase ↔ frontend)
   ============================================================ */
function mapReferral(row) {
  // Prefer joined brand data from select('*, brands(...)'), fall back to state.brands lookup
  const joinedBrand = row.brands || null;
  const resolvedBrand = joinedBrand
    || state.brands.find(b => b.id === row.brand_id)
    || getBrandByName(row.brand)
    || null;
  return {
    id:              row.id,
    userId:          row.user_id,
    brandId:         row.brand_id || null,
    ownerName:       '',
    brand:           row.brand,
    code:            row.code,
    link:            row.referral_link || '',
    benefitNew:      row.benefit_for_new_user || '',
    benefitReferrer: row.benefit_for_referrer || '',
    terms:           row.terms || '',
    visibility:      row.visibility || 'public',
    expirationDate:  row.expiration_date || null,
    category:        row.category || resolvedBrand?.category || 'Other',
    usedCount:       0, // no used_count column in referral_codes table
    createdAt:       row.created_at,
    brandData:       resolvedBrand,
  };
}

/* ============================================================
   REMINDER FIELD MAPPING (Supabase ↔ frontend)
   ============================================================ */
function mapReminder(row) {
  const voucher = state.vouchers.find(v => v.id === row.voucher_id);
  return {
    id:           row.id,
    userId:       row.user_id,
    voucherId:    row.voucher_id,
    brand:        voucher?.brand || '',
    reminderDate: row.reminder_date,
    reminderTime: row.reminder_time ? row.reminder_time.slice(0, 5) : null,
    note:         '',
    dismissed:    row.sent || false,
    createdAt:    row.created_at,
  };
}

/* ============================================================
   FETCH FUNCTIONS
   ============================================================ */
async function fetchVouchers() {
  if (!state.currentUser) return;
  const { data, error } = await supabase
    .from('vouchers')
    .select('*')
    .eq('user_id', state.currentUser.id)
    .order('created_at', { ascending: false });
  if (error) { console.error('fetchVouchers error:', error); showToast('Error loading vouchers'); return; }
  state.vouchers = (data || []).map(mapVoucher);
}

async function fetchPendingGifts() {
  if (!state.currentUser) return;
  const { data, error } = await supabase
    .from('voucher_gifts')
    .select('id, voucher_id, created_at, expires_at')
    .eq('sender_id', state.currentUser.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  if (error) { console.error('fetchPendingGifts error:', error); return; }
  state.pendingGifts = data || [];
}

async function fetchBrands() {
  const { data, error } = await supabase
    .from('brands')
    .select('id, name, category, domain, logo_url, description')
    .order('name');
  if (error) { console.error('fetchBrands error:', error); return; }
  state.brands = data || [];
}

async function fetchListings() {
  if (!state.currentUser) return;
  const { data, error } = await supabase
    .from('marketplace_listings')
    .select('*, vouchers(brand, expiration_date)')
    .eq('status', 'available')
    .order('created_at', { ascending: false });
  if (error) { console.error('fetchListings error:', error); showToast('Error loading listings'); return; }
  state.listings = (data || []).map(row => ({
    ...mapListing(row),
    brand:      row.vouchers?.brand      || '',
    expiryDate: row.vouchers?.expiration_date || null,
  }));

  // Populate seller name and email from public_profiles
  const sellerIds = [...new Set(state.listings.map(l => l.sellerId))];
  if (sellerIds.length > 0) {
    const { data: profiles, error: pErr } = await supabase
      .from('public_profiles')
      .select('id, name, email')
      .in('id', sellerIds);
    if (pErr) { console.error('fetchListings profiles error:', pErr); }
    else {
      const profileMap = Object.fromEntries((profiles || []).map(p => [p.id, p]));
      state.listings = state.listings.map(l => {
        const p = profileMap[l.sellerId];
        return { ...l, sellerName: p?.name || p?.email || 'Seller', sellerEmail: p?.email || '' };
      });
    }
  }
}

async function fetchFriendIds() {
  if (!state.currentUser) return;
  const uid = state.currentUser.id;
  const [sent, received] = await Promise.all([
    supabase.from('friendships').select('receiver_id').eq('requester_id', uid).eq('status', 'accepted'),
    supabase.from('friendships').select('requester_id').eq('receiver_id', uid).eq('status', 'accepted'),
  ]);
  if (sent.error)     console.error('fetchFriendIds (sent) error:', sent.error);
  if (received.error) console.error('fetchFriendIds (received) error:', received.error);
  const sentIds     = (sent.data     || []).map(r => r.receiver_id);
  const receivedIds = (received.data || []).map(r => r.requester_id);
  state.friendIds = [...new Set([...sentIds, ...receivedIds])];
}

async function fetchFriends() {
  await fetchFriendIds();
  if (state.friendIds.length === 0) { state.friends = []; return; }
  const { data, error } = await supabase
    .from('public_profiles')
    .select('id, email, name')
    .in('id', state.friendIds);
  if (error) {
    console.error('fetchFriends profiles error:', error);
    state.friends = state.friendIds.map(id => ({ id, name: 'Friend', email: 'N/A' }));
    return;
  }
  state.friends = (data || []).map(p => ({ id: p.id, name: p.name || p.email, email: p.email || 'N/A' }));
}

async function fetchPendingRequests() {
  if (!state.currentUser) return;
  const { data, error } = await supabase
    .from('friendships')
    .select('id, requester_id')
    .eq('receiver_id', state.currentUser.id)
    .eq('status', 'pending');
  if (error) { console.error('fetchPendingRequests error:', error); return; }
  const requests = data || [];
  if (requests.length === 0) { state.pendingRequests = []; return; }
  const requesterIds = requests.map(r => r.requester_id);
  const { data: profiles, error: pErr } = await supabase
    .from('public_profiles')
    .select('id, email, name')
    .in('id', requesterIds);
  if (pErr) console.error('fetchPendingRequests profiles error:', pErr);
  state.pendingRequests = requests.map(r => {
    const p = (profiles || []).find(pr => pr.id === r.requester_id);
    return { id: r.id, requesterId: r.requester_id, name: p?.name || p?.email || 'Unknown', email: p?.email || '' };
  });
}

async function fetchReferrals() {
  if (!state.currentUser) return;
  const joinSel = '*, brands(id, name, domain, logo_url, description)';
  const friendIds = state.friendIds || [];
  let [mine, pub, frnd] = await Promise.all([
    supabase.from('referral_codes').select(joinSel).eq('user_id', state.currentUser.id),
    supabase.from('referral_codes').select(joinSel).eq('visibility', 'public').neq('user_id', state.currentUser.id),
    friendIds.length > 0
      ? supabase.from('referral_codes').select(joinSel).in('user_id', friendIds).neq('visibility', 'private')
      : Promise.resolve({ data: [], error: null }),
  ]);
  // If join fails (e.g. no FK defined), retry with plain select
  if (mine.error || pub.error) {
    console.error('fetchReferrals join error — falling back to select(*)', mine.error || pub.error);
    [mine, pub, frnd] = await Promise.all([
      supabase.from('referral_codes').select('*').eq('user_id', state.currentUser.id),
      supabase.from('referral_codes').select('*').eq('visibility', 'public').neq('user_id', state.currentUser.id),
      friendIds.length > 0
        ? supabase.from('referral_codes').select('*').in('user_id', friendIds).neq('visibility', 'private')
        : Promise.resolve({ data: [], error: null }),
    ]);
  }
  if (mine.error)  { console.error('fetchReferrals (mine) error:', mine.error);   showToast('Error loading referral codes'); return; }
  if (pub.error)   { console.error('fetchReferrals (public) error:', pub.error);  showToast('Error loading referral codes'); return; }
  if (frnd.error)  { console.error('fetchReferrals (friends) error:', frnd.error); }
  const allRows = [...(mine.data || []), ...(pub.data || []), ...(frnd.data || [])];
  const seen = new Set();
  state.referrals = allRows
    .filter(r => { if (seen.has(r.id)) return false; seen.add(r.id); return true; })
    .map(mapReferral)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  // Resolve owner names for other users' referral codes
  const uid = state.currentUser.id;
  const ownerIds = [...new Set(state.referrals.filter(r => r.userId !== uid).map(r => r.userId))];
  if (ownerIds.length > 0) {
    const { data: profiles, error: pErr } = await supabase
      .from('public_profiles')
      .select('id, name, email')
      .in('id', ownerIds);
    if (pErr) { console.error('fetchReferrals owner profiles error:', pErr); }
    else {
      const profileMap = Object.fromEntries((profiles || []).map(p => [p.id, p]));
      state.referrals = state.referrals.map(r => {
        if (r.userId === uid) return r;
        const p = profileMap[r.userId];
        return { ...r, ownerName: p?.name || p?.email || 'Community' };
      });
    }
  }
}

async function fetchReminders() {
  if (!state.currentUser) return;
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', state.currentUser.id)
    .order('reminder_date', { ascending: true });
  if (error) { console.error('fetchReminders error:', error); return; }
  state.reminders = (data || []).map(mapReminder);
}

/* ============================================================
   BRAND HELPERS
   ============================================================ */
function getBrandByName(name) {
  if (!name) return null;
  const lower = name.toLowerCase();
  return state.brands.find(b => b.name.toLowerCase() === lower) || null;
}

const LOGODEV_TOKEN = import.meta.env.VITE_LOGODEV_TOKEN;

function getBrandLogo(brandName) {
  const brand = getBrandByName(brandName);
  if (!brand) return null;
  if (brand.logo_url) return brand.logo_url;
  if (brand.domain && LOGODEV_TOKEN) return `https://img.logo.dev/${brand.domain}?token=${LOGODEV_TOKEN}`;
  return null;
}

function getBrandDescription(brandName) {
  return getBrandByName(brandName)?.description || null;
}

/* Fire-and-forget: asks the enrich-brand edge function to AI-generate a short
   intro for a brand that doesn't have one yet. Never blocks the caller. */
function enrichBrandAsync(brandId) {
  if (!brandId) return;
  supabase.functions.invoke('enrich-brand', { body: { brandId } })
    .then(({ data, error }) => {
      if (error || !data?.description) return;
      const b = state.brands.find(x => x.id === brandId);
      if (b) b.description = data.description;
    })
    .catch(() => {});
}

async function ensureBrand(name, category) {
  const normalized = name.trim();
  if (!normalized) return;
  const existing = state.brands.find(b => b.name.toLowerCase() === normalized.toLowerCase());
  if (existing) {
    // Write category to DB if we now have one and the brand didn't before
    if (category && category !== existing.category) {
      await supabase.from('brands').update({ category }).eq('id', existing.id);
      existing.category = category;
    }
    if (!existing.description) enrichBrandAsync(existing.id);
    return;
  }
  const { data, error } = await supabase
    .from('brands')
    .insert({ name: normalized, created_by: state.currentUser.id, category: category || null })
    .select('id, name, category, domain, logo_url, description')
    .single();
  if (error && error.code !== '23505') {
    console.error('ensureBrand error:', error);
  } else {
    const newBrand = data || { name: normalized, category: category || null, domain: null, logo_url: null, description: null };
    state.brands = [...state.brands, newBrand].sort((a, b) => a.name.localeCompare(b.name));
    if (newBrand.id) enrichBrandAsync(newBrand.id);
  }
}

/* ============================================================
   NAVIGATION
   ============================================================ */
async function go(view, params = {}) {
  state.view = view;
  state.params = params;
  state.searchQuery = '';
  if (view !== 'referral-form') state.referralBrandFilter = null;
  if (!state.currentUser) { render(); return; }

  switch (view) {
    case 'home':
      // vouchers first so mapReminder can look up brand names
      await fetchVouchers();
      await Promise.all([fetchReminders(), fetchListings(), fetchFriendIds(), fetchPendingRequests(), fetchPendingGifts()]);
      break;
    case 'vouchers':
      await Promise.all([fetchVouchers(), fetchPendingGifts()]);
      break;
    case 'pending-gifts':
      await Promise.all([fetchVouchers(), fetchPendingGifts()]);
      break;
    case 'voucher-detail':
      await Promise.all([fetchVouchers(), fetchReminders()]);
      state.voucherFiles = params.id ? await fetchVoucherFiles(params.id) : [];
      break;
    case 'voucher-form':
      pendingNewFiles.forEach(f => { if (f.previewUrl) URL.revokeObjectURL(f.previewUrl); });
      pendingNewFiles  = [];
      removedFileIds   = [];
      if (pendingExtractionFile) {
        // Arriving from startVoucherScan — pendingBarcode/pendingExtractionResult
        // were already resolved before this navigation, so leave them intact
        // for the template/render() hook below to consume.
        const { file, mimeType } = pendingExtractionFile;
        const kind = fileKind(mimeType);
        const entry = {
          localId: randomId(),
          file,
          mimeType,
          kind,
          previewUrl: kind === 'image' ? URL.createObjectURL(file) : null,
        };
        pendingNewFiles.push(entry);
        pendingExtractionEntry = entry;
        pendingExtractionFile = null;
      } else {
        // Plain navigation (Manual Entry / Edit) — clear any leftover scan state.
        if (pendingBarcode?.previewUrl) URL.revokeObjectURL(pendingBarcode.previewUrl);
        pendingBarcode           = null;
        barcodeRemoved           = false;
        pendingExtractionResult  = null;
        barcodeScanState         = null;
      }
      await Promise.all([fetchVouchers(), fetchBrands()]);
      state.voucherFiles = params.id ? await fetchVoucherFiles(params.id) : [];
      break;
    case 'marketplace':
    case 'listing-detail':
      await Promise.all([fetchListings(), fetchFriendIds()]);
      break;
    case 'referrals':
      await Promise.all([fetchFriendIds(), fetchBrands()]);
      await fetchReferrals();
      break;
    case 'referral-form':
      await fetchBrands();
      break;
    case 'friends':
      await Promise.all([fetchFriends(), fetchPendingRequests()]);
      break;
    case 'profile':
      await Promise.all([fetchVouchers(), fetchListings(), fetchFriendIds(), fetchPendingRequests(), fetchPendingGifts()]);
      await fetchReferrals();
      break;
  }
  render();
  window.scrollTo(0, 0);
}

/* ============================================================
   AUTH ACTIONS
   ============================================================ */
async function login(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return error.message;
  state.currentUser = mapUser(data.user);
  await tryClaimPendingGift();
  go('home');
  return null;
}

async function register(name, email, password) {
  if (password.length < 6) return 'Password must be at least 6 characters.';
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { name: name.trim() },
      emailRedirectTo: `${window.location.origin}${import.meta.env.BASE_URL}`,
    },
  });
  if (error) return error.message;
  // Supabase returns no error but empty identities when email is already registered
  if (data.user && (!data.user.identities || data.user.identities.length === 0)) {
    return 'This email address is already registered. Please log in instead.';
  }
  // Email confirmation required — session is null until user clicks the link
  if (!data.session) {
    state.view = 'verify-email';
    state.params = { email };
    render();
    return null;
  }
  state.currentUser = mapUser(data.user);
  await tryClaimPendingGift();
  go('home');
  return null;
}

async function logout() {
  await supabase.auth.signOut();
  state.currentUser = null;
  state.vouchers   = [];
  state.listings   = [];
  state.referrals  = [];
  state.friends         = [];
  state.friendIds       = [];
  state.pendingRequests = [];
  state.reminders       = [];
  state.voucherFiles    = [];
  go('auth');
}

/* ============================================================
   VOUCHER FILE ATTACHMENTS (photos + PDFs)
   ============================================================ */
const FILE_BUCKET = 'voucher-photos';
const ALLOWED_FILE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'];
const EXT_MIME_FALLBACK = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif' };
const signedFileUrlCache = new Map(); // path -> { url, expiresAt }

function fileKind(mimeType) {
  return mimeType === 'application/pdf' ? 'pdf' : 'image';
}

// Some mobile file providers (iOS "Browse", Google Drive/Dropbox pickers)
// hand back an empty or generic file.type for PDFs — fall back to the
// extension so those files aren't wrongly rejected as "unsupported".
function resolveMimeType(file) {
  if (ALLOWED_FILE_TYPES.includes(file.type)) return file.type;
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  return EXT_MIME_FALLBACK[ext] || file.type;
}

// crypto.randomUUID() only exists in secure contexts (HTTPS/localhost) —
// this works everywhere, including plain-HTTP LAN testing on a phone.
function randomId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

async function uploadVoucherFile(file, mimeType = file.type) {
  const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
  const path = `${state.currentUser.id}/${randomId()}.${ext}`;
  const { error } = await supabase.storage.from(FILE_BUCKET).upload(path, file, { contentType: mimeType });
  if (error) { console.error('uploadVoucherFile error:', error); throw error; }
  return path;
}

async function uploadBarcodeBlob(blob) {
  const path = `${state.currentUser.id}/barcode-${randomId()}.png`;
  const { error } = await supabase.storage.from(FILE_BUCKET).upload(path, blob, { contentType: 'image/png' });
  if (error) { console.error('uploadBarcodeBlob error:', error); throw error; }
  return path;
}

function deleteVoucherFileObject(path) {
  if (!path) return;
  signedFileUrlCache.delete(path);
  supabase.storage.from(FILE_BUCKET).remove([path]).then(({ error }) => {
    if (error) console.error('deleteVoucherFileObject error:', error);
  });
}

async function getVoucherFileUrl(path) {
  if (!path) return null;
  const cached = signedFileUrlCache.get(path);
  if (cached && cached.expiresAt > Date.now()) return cached.url;
  const { data, error } = await supabase.storage.from(FILE_BUCKET).createSignedUrl(path, 3600);
  if (error) { console.error('getVoucherFileUrl error:', error); return null; }
  signedFileUrlCache.set(path, { url: data.signedUrl, expiresAt: Date.now() + 55 * 60 * 1000 });
  return data.signedUrl;
}

async function fetchVoucherFiles(voucherId) {
  if (!voucherId) return [];
  const { data, error } = await supabase
    .from('voucher_files')
    .select('*')
    .eq('voucher_id', voucherId)
    .order('position', { ascending: true });
  if (error) { console.error('fetchVoucherFiles error:', error); return []; }
  return data || [];
}

/* ============================================================
   BARCODE / QR DETECTION (client-side crop, purely local —
   nothing is uploaded until the voucher is actually saved)
   ============================================================ */
function loadImageElement(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image failed to load'));
    img.src = url;
  });
}

// Voucher photos sometimes have more than one QR code on them — the actual
// redemption code plus an unrelated marketing one ("subscribe to our
// newsletter", social links). zxing's single-shot decode just returns
// whichever one it happens to find first. This masks out each hit and keeps
// decoding the same frame so multiple distinct codes are all found, not just
// the first — up to maxAttempts, deduped against `seenTexts` by text.
//
// QR only: 1D barcode scanning was both unreliable (zxing's row-sampling
// only checks a handful of lines near the canvas's own center, so a barcode
// that isn't centered/dominant in a full photo gets missed even though it
// decodes fine in isolation) and expensive (rotation + multi-scale tiling to
// compensate), which blocked the main thread long enough to also break the
// AI extraction call running alongside it. QR's global finder-pattern search
// is reliable and fast without any of that, so that's all this looks for.
function scanCanvasForCodes(reader, canvas, { imgW, imgH, maxAttempts, candidates, seenTexts }) {
  const ctx = canvas.getContext('2d');
  for (let i = 0; i < maxAttempts; i++) {
    let result;
    try {
      result = reader.decodeFromCanvas(canvas);
    } catch {
      return; // no (more) codes found
    }
    const points = (result.getResultPoints?.() || []).filter(Boolean);
    if (!points.length) return;
    const xs = points.map(p => p.getX());
    const ys = points.map(p => p.getY());

    const text = result.getText?.() || '';
    if (!seenTexts.has(text)) {
      seenTexts.add(text);
      candidates.push({
        text,
        x0: Math.min(...xs), y0: Math.min(...ys),
        x1: Math.max(...xs), y1: Math.max(...ys),
      });
    }

    // Mask this code out so the next decode attempt finds a different one.
    const mx0 = Math.max(0, Math.min(...xs) - 6), my0 = Math.max(0, Math.min(...ys) - 6);
    const mx1 = Math.min(imgW, Math.max(...xs) + 6), my1 = Math.min(imgH, Math.max(...ys) + 6);
    ctx.fillStyle = '#808080';
    ctx.fillRect(mx0, my0, mx1 - mx0, my1 - my0);
  }
}

async function findBarcodeCandidates(file, mimeType) {
  if (fileKind(mimeType) !== 'image') return { img: null, imgW: 0, imgH: 0, candidates: [] };
  const objectUrl = URL.createObjectURL(file);
  try {
    const { BrowserMultiFormatReader } = await import('@zxing/browser');
    const { DecodeHintType, BarcodeFormat } = await import('@zxing/library');
    const img = await loadImageElement(objectUrl);
    const imgW = img.naturalWidth, imgH = img.naturalHeight;

    const hints = new Map();
    hints.set(DecodeHintType.TRY_HARDER, true);
    hints.set(DecodeHintType.ALSO_INVERTED, true);
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE, BarcodeFormat.MICRO_QR_CODE]);
    const reader = new BrowserMultiFormatReader(hints);

    const canvas = document.createElement('canvas');
    canvas.width = imgW;
    canvas.height = imgH;
    canvas.getContext('2d').drawImage(img, 0, 0);

    const candidates = [];
    scanCanvasForCodes(reader, canvas, { imgW, imgH, maxAttempts: 6, candidates, seenTexts: new Set() });

    return { img, imgW, imgH, candidates };
  } catch (err) {
    console.error('findBarcodeCandidates error:', err);
    return { img: null, imgW: 0, imgH: 0, candidates: [] };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function normalizeCodeForCompare(s) {
  return (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// Picks the most likely "this is the actual redemption code" candidate when
// a photo has more than one QR code on it: prefer whichever one's decoded
// text matches the code the AI extraction already read off the same photo,
// otherwise the largest code in the photo (marketing codes are usually
// smaller/secondary on the layout).
function pickBestBarcodeCandidate(candidates, referenceCode) {
  if (!candidates.length) return null;
  const normRef = normalizeCodeForCompare(referenceCode);
  if (normRef) {
    const match = candidates.find(c => {
      const normText = normalizeCodeForCompare(c.text);
      return normText.length >= 4 && (normText === normRef || normText.includes(normRef) || normRef.includes(normText));
    });
    if (match) return match;
  }
  return candidates.slice().sort((a, b) => ((b.x1 - b.x0) * (b.y1 - b.y0)) - ((a.x1 - a.x0) * (a.y1 - a.y0)))[0];
}

async function cropBarcodeCandidate(img, imgW, imgH, candidate) {
  const pad = Math.max(imgW, imgH) * 0.08;
  const x0 = Math.max(0, candidate.x0 - pad);
  const y0 = Math.max(0, candidate.y0 - pad);
  const x1 = Math.min(imgW, candidate.x1 + pad);
  const y1 = Math.min(imgH, candidate.y1 + pad);
  const w = x1 - x0, h = y1 - y0;
  if (w < 20 || h < 20) return null;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(img, x0, y0, w, h, 0, 0, w, h);
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  return blob ? { blob, previewUrl: URL.createObjectURL(blob) } : null;
}

// Convenience wrapper for call sites that don't have a reference code to
// disambiguate multiple candidates with (see pickBestBarcodeCandidate).
async function detectBarcodeCrop(file, mimeType, referenceCode = null) {
  const { img, imgW, imgH, candidates } = await findBarcodeCandidates(file, mimeType);
  const best = pickBestBarcodeCandidate(candidates, referenceCode);
  if (!best || !img) return null;
  return cropBarcodeCandidate(img, imgW, imgH, best);
}

// Only auto-fills the barcode slot if it's currently empty, mirroring the
// "pre-fill, never clobber" rule used for the AI text fields — an explicit
// remove always wins over a later auto-detect from another photo.
function renderBarcodeGroupNow(v) {
  const group = document.getElementById('barcode-group');
  const preview = document.getElementById('barcode-preview');
  if (!group || !preview) return;
  group.style.display = barcodeGroupVisible(v) ? '' : 'none';
  preview.innerHTML = barcodePreviewHtml(v);
}

async function maybeAutoDetectBarcode(file, mimeType, existingBarcodePath) {
  if (pendingBarcode || barcodeRemoved || existingBarcodePath) return;

  // Visible immediately — so adding a photo always shows *something* is
  // happening, instead of the barcode section staying silent either way.
  barcodeScanState = 'scanning';
  renderBarcodeGroupNow(state.vouchers.find(x => x.id === state.params.id));

  const referenceCode = document.querySelector('#form-voucher [name="code"]')?.value || null;
  const found = await detectBarcodeCrop(file, mimeType, referenceCode);
  if (pendingBarcode || barcodeRemoved) return; // state changed while awaiting (e.g. user removed manually)

  barcodeScanState = found ? null : 'missing';
  if (found) pendingBarcode = found;
  renderBarcodeGroupNow(state.vouchers.find(x => x.id === state.params.id));
}

/* ============================================================
   AI VOUCHER EXTRACTION (pre-fill only — the user still reviews
   and explicitly saves; nothing here writes to the database)
   ============================================================ */
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// Pure data fetch — no DOM/toast side effects, so it can run behind the
// scan-loading screen (see startVoucherScan) without racing the render.
// Returns the sanitized fields object, or null if extraction failed.
async function extractVoucherFields(file, mimeType) {
  try {
    const fileBase64 = await fileToBase64(file);
    const { data, error } = await supabase.functions.invoke('extract-voucher', {
      body: { fileBase64, mimeType },
    });
    if (error) return { fields: null, rateLimited: error?.context?.status === 429 };
    if (!data?.fields) return { fields: null, rateLimited: false };
    return { fields: data.fields, rateLimited: false };
  } catch (err) {
    console.error('extractVoucherFields error:', err);
    return { fields: null, rateLimited: false };
  }
}

// Only fills fields the user hasn't already typed into — this is strictly
// a pre-fill, the user still reviews and submits through the normal form.
function applyExtractedFields(fields) {
  const form = document.getElementById('form-voucher');
  if (!form) return;

  const setIfEmpty = (name, value) => {
    if (value == null || value === '') return;
    const field = form.querySelector(`[name="${name}"]`);
    if (field && !field.value) field.value = value;
  };

  setIfEmpty('brand', fields.brand);
  if (fields.amount != null) setIfEmpty('amount', String(fields.amount));
  setIfEmpty('expiryDate', fields.expiryDate);
  setIfEmpty('code', fields.code);
  setIfEmpty('pin', fields.pin);
  setIfEmpty('notes', fields.termsAndConditions);

  if (fields.category && CATEGORIES.includes(fields.category)) {
    const catSel = form.querySelector('[name="category"]');
    if (catSel) catSel.value = fields.category;
  }
  if (fields.voucherType) {
    const typeSel = form.querySelector('[name="voucherType"]');
    if (typeSel) typeSel.value = fields.voucherType;
  }
}

function showScanLoadingScreen() {
  const el = document.createElement('div');
  el.id = 'scan-loading-screen';
  el.className = 'scan-loading';
  el.innerHTML = `
    <div class="scan-spinner"></div>
    <h3>Reading your voucher…</h3>
    <p>Detecting the brand, value, code and QR code from your photo.</p>
    <button type="button" class="scan-skip" id="scan-skip-btn">Skip &amp; enter manually</button>
  `;
  document.body.appendChild(el);
  return el;
}

function hideScanLoadingScreen() {
  document.getElementById('scan-loading-screen')?.remove();
}

let scanToken = 0; // guards against a superseded/skipped scan applying stale results later

// Runs AI field extraction and barcode detection in parallel behind a full
// -screen loading state, then only navigates to the form once both are
// resolved — so the very first render already has the pre-filled fields
// and the cropped barcode, instead of racing a background fill-in against
// however fast the user hits Save.
async function startVoucherScan(file, mimeType) {
  const token = ++scanToken;
  const screen = showScanLoadingScreen();
  let settled = false;

  const finish = (fields, barcode, { silent = false, rateLimited = false } = {}) => {
    if (settled || token !== scanToken) return;
    settled = true;
    hideScanLoadingScreen();
    pendingExtractionFile   = { file, mimeType };
    pendingExtractionResult = fields;
    pendingBarcode           = barcode;
    barcodeScanState         = silent ? null : (barcode ? null : 'missing');
    go('voucher-form').then(() => {
      if (silent) return;
      if (rateLimited) {
        showToast("You've reached today's AI-scan limit. Please fill in manually, or try again later.");
      } else if (!fields) {
        showToast('Could not auto-read this file. Please fill in manually.');
      } else if (!barcode) {
        showToast('Auto-filled. No scannable QR code found in this photo.');
      } else {
        showToast('Auto-filled from your photo. Please check the details before saving.');
      }
    });
  };

  screen.querySelector('#scan-skip-btn').addEventListener('click', () => finish(null, null, { silent: true }));

  const emptyCandidates = { img: null, imgW: 0, imgH: 0, candidates: [] };
  const emptyExtraction = { fields: null, rateLimited: false };
  const [extractionOutcome, candidatesOutcome] = await Promise.allSettled([
    Promise.race([extractVoucherFields(file, mimeType), new Promise(resolve => setTimeout(() => resolve(emptyExtraction), 25000))]),
    Promise.race([findBarcodeCandidates(file, mimeType), new Promise(resolve => setTimeout(() => resolve(emptyCandidates), 25000))]),
  ]);
  const { fields, rateLimited } = extractionOutcome.status === 'fulfilled' ? extractionOutcome.value : emptyExtraction;
  const { img, imgW, imgH, candidates } = candidatesOutcome.status === 'fulfilled' ? candidatesOutcome.value : emptyCandidates;

  // Now that extraction is done too, use its code field (if any) to pick
  // the right candidate when the photo has more than one code on it.
  const best = pickBestBarcodeCandidate(candidates, fields?.code);
  const barcode = best && img ? await cropBarcodeCandidate(img, imgW, imgH, best) : null;

  finish(fields, barcode, { rateLimited });
}

/* ============================================================
   VOUCHER ACTIONS
   ============================================================ */
// Returns the voucher's id. Does not toast or navigate — the caller
// (handleSubmit) does that once file attachments are also synced.
async function saveVoucher(data) {
  await ensureBrand(data.brand, data.category);
  if (data.id) {
    const existing = state.vouchers.find(v => v.id === data.id) || {};
    const { error } = await supabase.from('vouchers').update(voucherToDb({ ...existing, ...data, userId: state.currentUser.id })).eq('id', data.id);
    if (error) { console.error('saveVoucher update error:', error); throw error; }
    return data.id;
  } else {
    const v = { ...data, userId: state.currentUser.id, status: 'active', listed: false, copyCount: 0 };
    const { data: inserted, error } = await supabase.from('vouchers').insert(voucherToDb(v)).select('id').single();
    if (error) { console.error('saveVoucher insert error:', error); throw error; }
    return inserted.id;
  }
}

async function deleteVoucher(id) {
  const files = await fetchVoucherFiles(id);
  const { error } = await supabase.from('vouchers').delete().eq('id', id);
  if (error) { console.error('deleteVoucher error:', error); showToast('Error deleting voucher'); return; }
  files.forEach(f => deleteVoucherFileObject(f.file_path));
  showToast('Voucher deleted');
  go('vouchers');
}

async function markUsed(id) {
  await supabase.from('marketplace_listings').update({ status: 'cancelled' }).eq('voucher_id', id);
  const { error } = await supabase.from('vouchers').update({ status: 'used' }).eq('id', id);
  if (error) { console.error('markUsed error:', error); showToast('Error updating voucher'); return; }
  showToast('Marked as used');
  go('voucher-detail', { id });
}

async function markUnused(id) {
  const { error } = await supabase.from('vouchers').update({ status: 'active' }).eq('id', id);
  if (error) { console.error('markUnused error:', error); showToast('Error updating voucher'); return; }
  showToast('Marked as active');
  go('voucher-detail', { id });
}

async function listForSale(id, price) {
  const v = state.vouchers.find(x => x.id === id);
  if (!v) return;
  const { error: vErr } = await supabase.from('vouchers').update({ status: 'listed' }).eq('id', id);
  if (vErr) { console.error('listForSale voucher error:', vErr); showToast('Error listing voucher'); return; }
  const { error: lErr } = await supabase.from('marketplace_listings').insert({
    voucher_id:     id,
    seller_id:      state.currentUser.id,
    original_value: parseFloat(v.value),
    selling_price:  parseFloat(price),
    currency:       v.currency || 'EUR',
    status:         'available',
    visibility:     'public',
  });
  if (lErr) { console.error('listForSale listing insert error:', lErr); showToast('Error creating listing'); return; }
  showToast('Listed on marketplace');
  go('voucher-detail', { id });
}

async function unlist(id) {
  const { error: vErr } = await supabase.from('vouchers').update({ status: 'active' }).eq('id', id);
  if (vErr) { console.error('unlist voucher error:', vErr); showToast('Error removing listing'); return; }
  const { error: lErr } = await supabase.from('marketplace_listings').update({ status: 'inactive' }).eq('voucher_id', id);
  if (lErr) { console.error('unlist marketplace error:', lErr); showToast('Error removing listing'); return; }
  showToast('Listing removed');
  go('voucher-detail', { id });
}

/* ============================================================
   VOUCHER GIFTING (send to a friend, even without an account —
   see claim_voucher_gift RPC and init()'s ?gift= handling)
   ============================================================ */
async function sendVoucherGift(id) {
  const v = state.vouchers.find(x => x.id === id);
  if (!v) return;
  const { data, error } = await supabase
    .from('voucher_gifts')
    .insert({ voucher_id: id, sender_id: state.currentUser.id })
    .select('id')
    .single();
  if (error) { console.error('sendVoucherGift error:', error); showToast('Error creating gift link'); return; }
  showGiftShareScreen(data.id, v);
}

async function cancelVoucherGift(giftId) {
  const { error } = await supabase.from('voucher_gifts').update({ status: 'cancelled' }).eq('id', giftId);
  if (error) { console.error('cancelVoucherGift error:', error); showToast('Error cancelling gift'); return; }
  showToast('Gift cancelled. Voucher is back in your wallet');
  go('pending-gifts');
}

// Shows the QR code + shareable link for a gift. Reused both right after
// creating a gift and from the Pending Gifts list ("Link" button).
async function showGiftShareScreen(giftId, voucher) {
  const claimUrl = `${window.location.origin}${import.meta.env.BASE_URL}?gift=${giftId}`;
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `
  <div class="dialog">
    <h3>Send ${esc(voucher.brand)} to a friend</h3>
    <p>Have them scan this code, or share the link. Anyone with this link can claim it, so only share it with your friend.</p>
    <div class="gift-qr-wrap"><img id="gift-qr-img" alt="QR code to claim this voucher"></div>
    <div class="gift-link-row">
      <input type="text" readonly value="${esc(claimUrl)}" id="gift-link-input">
      <button type="button" class="btn btn-secondary btn-sm" id="gift-copy-btn">${icon.copy} Copy</button>
    </div>
    <div class="dialog-actions" style="margin-top:16px">
      ${typeof navigator.share === 'function' ? `<button type="button" class="btn btn-primary" id="gift-share-btn">Share</button>` : ''}
      <button type="button" class="btn btn-ghost" id="gift-done-btn">Done</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);

  const closeAndGo = () => { overlay.remove(); go('pending-gifts'); };
  overlay.querySelector('#gift-done-btn').addEventListener('click', closeAndGo);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeAndGo(); });

  overlay.querySelector('#gift-copy-btn').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(claimUrl);
      showToast('Link copied');
    } catch {
      showToast('Could not copy link');
    }
  });

  const shareBtn = overlay.querySelector('#gift-share-btn');
  if (shareBtn) {
    shareBtn.addEventListener('click', async () => {
      try {
        await navigator.share({ title: 'A gift voucher for you', text: `I'm sending you a ${voucher.brand} voucher!`, url: claimUrl });
      } catch {
        // user cancelled the share sheet — not an error
      }
    });
  }

  try {
    const qrModule = await import('qrcode');
    const QRCode = qrModule.default || qrModule;
    const dataUrl = await QRCode.toDataURL(claimUrl, { margin: 1, width: 240 });
    const img = document.getElementById('gift-qr-img');
    if (img) img.src = dataUrl;
  } catch (err) {
    console.error('gift QR generation error:', err);
  }
}

async function deductBalance(id, amount) {
  const v = state.vouchers.find(x => x.id === id);
  if (!v) return;
  const deduct = parseFloat(amount);
  if (isNaN(deduct) || deduct <= 0) { showToast('Enter a valid amount'); return; }
  const current = parseFloat((v.balance ?? v.value) || 0);
  const newBalance = parseFloat((current - deduct).toFixed(2));
  if (newBalance <= 0) {
    const { error } = await supabase.from('vouchers').update({ balance: null, status: 'used' }).eq('id', id);
    if (error) { console.error('deductBalance error:', error); showToast('Error updating balance'); return; }
    await supabase.from('marketplace_listings').update({ status: 'cancelled' }).eq('voucher_id', id);
    showToast('Voucher fully used. Marked as used');
  } else {
    const { error } = await supabase.from('vouchers').update({ balance: newBalance }).eq('id', id);
    if (error) { console.error('deductBalance error:', error); showToast('Error updating balance'); return; }
    showToast(`Balance updated: ${formatCurrency(newBalance, v.currency)} remaining`);
  }
  go('voucher-detail', { id });
}

async function incrementCopyCount(id) {
  const v = state.vouchers.find(x => x.id === id);
  if (!v) return;
  const newCount = (v.copyCount || 0) + 1;
  const { error } = await supabase.from('vouchers').update({ copy_count: newCount }).eq('id', id);
  if (error) { console.error('incrementCopyCount error:', error); }
}

/* ============================================================
   REFERRAL ACTIONS
   ============================================================ */
async function saveReferral(data) {
  await ensureBrand(data.brand, data.brandCategory);
  const brandObj = getBrandByName(data.brand);
  const { error } = await supabase.from('referral_codes').insert({
    user_id:              state.currentUser.id,
    brand_id:             brandObj?.id || null,
    brand:                data.brand,
    code:                 data.code || null,
    category:             data.brandCategory || null,
    referral_link:        data.link || null,
    benefit_for_new_user: data.benefitNew || null,
    benefit_for_referrer: data.benefitReferrer || null,
    terms:                data.terms || null,
    visibility:           data.visibility || 'public',
    expiration_date:      data.expirationDate || null,
  });
  if (error) { console.error('saveReferral error:', error); showToast('Error saving referral code'); return; }
  showToast('Referral code saved');
  go('referrals');
}

async function updateReferral(id, data) {
  await ensureBrand(data.brand, data.brandCategory);
  const brandObj = getBrandByName(data.brand);
  const { error } = await supabase
    .from('referral_codes')
    .update({
      brand_id:             brandObj?.id || null,
      brand:                data.brand,
      code:                 data.code || null,
      category:             data.brandCategory || null,
      referral_link:        data.link || null,
      benefit_for_new_user: data.benefitNew || null,
      benefit_for_referrer: data.benefitReferrer || null,
      terms:                data.terms || null,
      visibility:           data.visibility || 'public',
      expiration_date:      data.expirationDate || null,
    })
    .eq('id', id)
    .eq('user_id', state.currentUser.id);
  if (error) { console.error('updateReferral error:', error); showToast('Error updating referral code'); return; }
  showToast('Referral code updated');
  go('referrals');
}

async function deleteReferral(id) {
  const { error } = await supabase.from('referral_codes').delete().eq('id', id);
  if (error) { console.error('deleteReferral error:', error); showToast('Error deleting referral code'); return; }
  showToast('Referral code deleted');
  go('referrals');
}

async function incrementReferralUse(id) {
  // TODO: referral_codes table has no used_count column — cannot persist usage count in DB
  const r = state.referrals.find(x => x.id === id);
  if (!r) return;
  const newCount = (r.usedCount || 0) + 1;
  state.referrals = state.referrals.map(x => x.id === id ? { ...x, usedCount: newCount } : x);
  render();
}

/* ============================================================
   FRIEND ACTIONS
   ============================================================ */
async function fetchUserByEmail(email) {
  console.log('[fetchUserByEmail] searching for:', email);
  const { data, error } = await supabase
    .from('public_profiles')
    .select('id, email, name, vouchers_sold')
    .eq('email', email)
    .single();
  if (error) {
    console.error('[fetchUserByEmail] Supabase error:', error);
    return null;
  }
  console.log('[fetchUserByEmail] returned profile:', data);
  return data;
}

async function addFriend(email) {
  const found = await fetchUserByEmail(email.trim().toLowerCase());
  if (!found) return 'No user found with that email.';
  if (found.id === state.currentUser.id) return "That's your own email.";
  if (state.friendIds.includes(found.id)) return 'Already friends with this person.';
  const { error } = await supabase.from('friendships').insert({
    requester_id: state.currentUser.id,
    receiver_id:  found.id,
    status:       'pending',
  });
  if (error) {
    if (error.code === '23505') return 'Friend request already sent.';
    console.error('addFriend error:', error);
    return 'Error sending request.';
  }
  const displayName = found.name || found.email;
  showToast(`Friend request sent to ${displayName}`);
  return null;
}

async function acceptFriendRequest(friendshipId) {
  const { error } = await supabase
    .from('friendships')
    .update({ status: 'accepted' })
    .eq('id', friendshipId)
    .eq('receiver_id', state.currentUser.id);
  if (error) { console.error('acceptFriendRequest error:', error); showToast('Error accepting request'); return; }
  showToast('Friend request accepted!');
  await Promise.all([fetchFriends(), fetchPendingRequests()]);
  render();
}

async function declineFriendRequest(friendshipId) {
  const { error } = await supabase
    .from('friendships')
    .delete()
    .eq('id', friendshipId)
    .eq('receiver_id', state.currentUser.id);
  if (error) { console.error('declineFriendRequest error:', error); showToast('Error declining request'); return; }
  showToast('Request declined');
  await fetchPendingRequests();
  render();
}

async function removeFriend(friendId) {
  const uid = state.currentUser.id;
  const { error } = await supabase
    .from('friendships')
    .delete()
    .or(`and(requester_id.eq.${uid},receiver_id.eq.${friendId}),and(requester_id.eq.${friendId},receiver_id.eq.${uid})`);
  if (error) { console.error('removeFriend error:', error); showToast('Error removing friend'); return; }
  showToast('Friend removed');
  go('friends');
}

/* ============================================================
   REMINDER ACTIONS
   ============================================================ */
async function setReminder(voucherId, date, time) {
  const { error } = await supabase.from('notifications').insert({
    user_id:           state.currentUser.id,
    voucher_id:        voucherId,
    notification_type: 'reminder',
    reminder_date:     date,
    reminder_time:     time || null,
    sent:              false,
  });
  if (error) { console.error('setReminder error:', error); showToast('Error setting reminder'); return; }
  showToast('Reminder saved!');
  go('voucher-detail', { id: voucherId });
}

async function dismissReminder(id) {
  const { error } = await supabase
    .from('notifications')
    .update({ sent: true, sent_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', state.currentUser.id);
  if (error) { console.error('dismissReminder error:', error); showToast('Error dismissing reminder'); return; }
  state.reminders = state.reminders.map(r => r.id === id ? { ...r, dismissed: true } : r);
  render();
}

/* ============================================================
   PUSH NOTIFICATIONS
   ============================================================ */
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

async function subscribeToPush() {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) {
    showToast('Push notifications not supported on this device');
    return false;
  }
  if (!VAPID_PUBLIC_KEY) { console.error('VAPID_PUBLIC_KEY not set'); return false; }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    showToast('Notification permission denied');
    return false;
  }

  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }
    const { endpoint, keys } = sub.toJSON();
    const { error } = await supabase.from('push_subscriptions').upsert({
      user_id:  state.currentUser.id,
      endpoint,
      p256dh:   keys.p256dh,
      auth:     keys.auth,
    }, { onConflict: 'endpoint' });
    if (error) { console.error('push subscription save error:', error); showToast('Error enabling notifications'); return false; }
    showToast('Notifications enabled!');
    return true;
  } catch (err) {
    console.error('subscribeToPush error:', err);
    showToast('Could not enable notifications');
    return false;
  }
}

async function unsubscribeFromPush() {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
      await sub.unsubscribe();
    }
    showToast('Notifications disabled');
  } catch (err) {
    console.error('unsubscribeFromPush error:', err);
  }
}

async function getPushStatus() {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return sub ? 'subscribed' : 'unsubscribed';
  } catch {
    return 'unsubscribed';
  }
}

/* ============================================================
   TOAST
   ============================================================ */
let toastTimer;
function showToast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

/* ============================================================
   CLIPBOARD
   ============================================================ */
function copyText(text, label = 'Copied!') {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => showToast(label));
  } else {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    showToast(label);
  }
}

/* ============================================================
   RENDER HELPERS
   ============================================================ */

/* Global fallback called by onerror on brand logo <img> elements */
window.avatarError = function(img) {
  const el = img.parentElement;
  if (!el) return;
  const size  = parseInt(el.style.width) || 42;
  const name  = img.dataset.brandName || '?';
  el.style.background = '#13B5A2';
  el.style.color      = 'white';
  el.style.fontSize   = Math.round(size * 0.38) + 'px';
  el.style.display    = 'flex';
  el.style.alignItems = 'center';
  el.style.justifyContent = 'center';
  el.innerHTML = name.charAt(0).toUpperCase();
};

const avatar = (name, size = 42) => {
  const logoUrl = getBrandLogo(name);
  if (logoUrl) {
    return `<div class="avatar" style="width:${size}px;height:${size}px;background:#f5f7fa;padding:3px;box-sizing:border-box;display:flex;align-items:center;justify-content:center">
      <img src="${esc(logoUrl)}" data-brand-name="${esc(name)}" alt="" onerror="avatarError(this)" style="width:100%;height:100%;object-fit:contain;display:block;border-radius:4px">
    </div>`;
  }
  return `<div class="avatar" style="background:#13B5A2;width:${size}px;height:${size}px;font-size:${Math.round(size * 0.38)}px">${esc(initial(name))}</div>`;
};

const badge = (status) =>
  `<span class="badge ${STATUS_CLASS[status] || 'badge-gray'}">${STATUS_LABEL[status] || esc(status)}</span>`;

function brandAutocomplete(currentValue = '') {
  return `
  <div style="position:relative">
    <input type="text" name="brand" data-brand-ac placeholder="Search or type a brand…" value="${esc(currentValue)}" required autocomplete="off" style="width:100%">
    <div id="brand-suggestions" style="display:none;position:absolute;top:calc(100% + 4px);left:0;right:0;background:var(--bg,#fff);border:1.5px solid var(--border,#e2e8f0);border-radius:10px;max-height:220px;overflow-y:auto;z-index:200;box-shadow:0 4px 20px rgba(34,51,130,0.12)"></div>
  </div>`;
}

const icon = {
  back:   `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>`,
  plus:   `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  search: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
  copy:   `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>`,
  check:  `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  trash:  `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>`,
  edit:   `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
  tag:    `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>`,
  clock:  `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  link:   `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>`,
  logout: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`,
  info:   `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
  mail:   `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>`,
  undo:   `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>`,
  bell:   `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>`,
  users:  `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>`,
  eye:    `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`,
  eyeOff: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`,
  plus2:  `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  camera: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>`,
  file:   `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`,
  gift:   `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z"/></svg>`,
};

const navIcons = {
  home:        `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
  vouchers:    `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>`,
  marketplace: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>`,
  referrals:   `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>`,
  profile:     `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
};

function renderBottomNav() {
  const pending = state.pendingRequests.length;
  const items = [
    { id: 'home', label: 'Home' },
    { id: 'vouchers', label: 'Vouchers' },
    { id: 'marketplace', label: 'Market' },
    { id: 'referrals', label: 'Referrals' },
    { id: 'profile', label: 'Profile' },
  ];
  return `
  <nav class="bottom-nav">
    ${items.map(it => `
      <button class="nav-item ${state.view === it.id ? 'active' : ''}" data-nav="${it.id}">
        <div style="position:relative;display:inline-flex">
          ${navIcons[it.id]}
          ${it.id === 'profile' && pending > 0 ? `<span style="position:absolute;top:-2px;right:-2px;width:8px;height:8px;background:#e53e3e;border-radius:50%;border:1.5px solid #fff"></span>` : ''}
        </div>
        <span class="nav-label">${it.label}</span>
      </button>
    `).join('')}
  </nav>`;
}

const LOGO_MARK_SVG = (size) => `
  <svg width="${size}" height="${size}" viewBox="0 0 72 72" fill="none">
    <rect width="72" height="72" rx="18" fill="#13B5A2"/>
    <rect x="11" y="8" width="50" height="30" rx="9" fill="#2BD4BE" opacity="0.6"/>
    <rect x="6" y="26" width="60" height="38" rx="11" fill="white"/>
    <rect x="38" y="35" width="22" height="14" rx="7" fill="#11233F"/>
  </svg>`;

const LOGO_LOCKUP = `
  <div style="flex:1;display:flex;align-items:center;justify-content:center;gap:8px">
    ${LOGO_MARK_SVG(28)}
    <span style="font-size:1.0625rem;font-weight:800;letter-spacing:-0.01em"><span style="color:#11233F">Voucher</span><span style="color:#13B5A2">Wise</span></span>
  </div>`;

function renderHeader(title, backView, backParams = {}, rightAction = '') {
  const centerContent = title === 'VoucherWise'
    ? LOGO_LOCKUP
    : `<span class="header-title">${esc(title)}</span>`;
  return `
  <header class="app-header">
    <div class="header-left">
      ${backView ? `<button class="btn-back" data-nav="${backView}" ${backParams.id ? `data-id="${esc(backParams.id)}"` : ''}>${icon.back}</button>` : ''}
    </div>
    ${centerContent}
    <div class="header-right">${rightAction}</div>
  </header>`;
}

/* ============================================================
   PASSWORD FIELD HELPER
   ============================================================ */
function pwField(id, name, label, placeholder, autocomplete = 'current-password') {
  return `
  <div class="form-group">
    <label for="${id}">${label}</label>
    <div class="pw-wrap">
      <input type="password" id="${id}" name="${name}" placeholder="${placeholder}" required autocomplete="${autocomplete}">
      <button type="button" class="pw-toggle" data-pw-id="${id}" title="Show/hide password">${icon.eye}</button>
    </div>
  </div>`;
}

/* ============================================================
   VIEW: WELCOME (onboarding splash)
   ============================================================ */
function viewWelcome() {
  return `
  <div class="welcome-screen">
    <div class="welcome-hero">
      <svg viewBox="0 0 400 440" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMax slice">
        <defs>
          <linearGradient id="welcome-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#FFFFFF"/>
            <stop offset="55%" stop-color="#FDF6EF"/>
            <stop offset="100%" stop-color="#FBE7D6"/>
          </linearGradient>
          <radialGradient id="welcome-glow" cx="50%" cy="38%" r="55%">
            <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.14"/>
            <stop offset="70%" stop-color="var(--accent)" stop-opacity="0.05"/>
            <stop offset="100%" stop-color="var(--accent)" stop-opacity="0"/>
          </radialGradient>
          <filter id="welcome-shadow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="8" stdDeviation="10" flood-color="var(--dark)" flood-opacity="0.16"/>
          </filter>
          <clipPath id="welcome-curve">
            <path d="M0,0 H400 V352 C 300,414 100,414 0,352 Z"/>
          </clipPath>
        </defs>

        <g clip-path="url(#welcome-curve)">
          <rect width="400" height="440" fill="url(#welcome-sky)"/>
          <rect width="400" height="440" fill="url(#welcome-glow)"/>

          <g transform="translate(88,182) rotate(-12)" filter="url(#welcome-shadow)">
            <rect width="150" height="94" rx="14" fill="var(--dark)"/>
            <circle cx="22" cy="22" r="8" fill="#FFFFFF" opacity="0.9"/>
            <rect x="16" y="65" width="58" height="7" rx="3.5" fill="#FFFFFF" opacity="0.5"/>
            <rect x="16" y="78" width="38" height="6" rx="3" fill="#FFFFFF" opacity="0.32"/>
          </g>

          <g transform="translate(190,152) rotate(9)" filter="url(#welcome-shadow)">
            <rect width="150" height="94" rx="14" fill="var(--accent)"/>
            <circle cx="22" cy="22" r="8" fill="#FFFFFF" opacity="0.95"/>
            <rect x="16" y="65" width="64" height="7" rx="3.5" fill="#FFFFFF" opacity="0.55"/>
            <rect x="16" y="78" width="40" height="6" rx="3" fill="#FFFFFF" opacity="0.35"/>
          </g>

          <g transform="translate(132,208) rotate(-2)" filter="url(#welcome-shadow)">
            <rect width="164" height="102" rx="16" fill="var(--primary)"/>
            <circle cx="24" cy="24" r="9" fill="#FFFFFF" opacity="0.95"/>
            <rect x="18" y="70" width="70" height="8" rx="4" fill="#FFFFFF" opacity="0.65"/>
            <rect x="18" y="84" width="46" height="6" rx="3" fill="#FFFFFF" opacity="0.4"/>
          </g>
        </g>
      </svg>
    </div>

    <div class="welcome-content">
      <h1 class="welcome-title">
        <span class="welcome-title-line">Welcome to</span>
        <span class="welcome-title-brand"><span class="welcome-title-voucher">Voucher</span><span class="welcome-title-wise">Wise</span></span>
      </h1>
      <p class="welcome-desc">Unlock the full value of every voucher you own.</p>

      <div class="welcome-actions">
        <button type="button" class="btn btn-dark btn-full" data-nav="auth" data-tab="signup">Get started</button>
        <div class="welcome-secondary">
          Already have an account?
          <button type="button" class="link-btn" data-nav="auth" data-tab="login">Log in</button>
        </div>
      </div>
    </div>
  </div>`;
}

/* ============================================================
   VIEW: AUTH
   ============================================================ */
function viewAuth() {
  const tab = state.params.tab || 'login';
  return `
  <div class="auth-screen">
    <button type="button" class="btn-icon auth-back" data-nav="welcome">${icon.back}</button>
    <div class="auth-logo">
      <div class="logo-mark">
        <svg width="72" height="72" viewBox="0 0 72 72" fill="none">
          <rect width="72" height="72" rx="18" fill="#13B5A2"/>
          <rect x="11" y="8" width="50" height="30" rx="9" fill="#2BD4BE" opacity="0.6"/>
          <rect x="6" y="26" width="60" height="38" rx="11" fill="white"/>
          <rect x="38" y="35" width="22" height="14" rx="7" fill="#11233F"/>
        </svg>
      </div>
      <h1><span style="color:#11233F">Voucher</span><span style="color:#13B5A2">Wise</span></h1>
      <p>Unlock the full value of every voucher you own.</p>
    </div>

    ${localStorage.getItem('pendingGiftId') ? `
    <div class="gift-waiting-banner">${icon.gift} You have a gift waiting! Log in or sign up to claim it.</div>
    ` : ''}

    <div class="auth-tabs">
      <button class="auth-tab ${tab === 'login' ? 'active' : ''}" data-nav="auth" data-tab="login">Log In</button>
      <button class="auth-tab ${tab === 'signup' ? 'active' : ''}" data-nav="auth" data-tab="signup">Sign Up</button>
    </div>

    ${tab === 'login' ? `
    <form id="form-login" class="auth-form">
      <div id="auth-error" class="error-msg" style="display:none"></div>
      <div class="form-group">
        <label for="login-email">Email</label>
        <input type="email" id="login-email" name="email" placeholder="you@example.com" required autocomplete="email">
      </div>
      ${pwField('login-password', 'password', 'Password', '••••••••', 'current-password')}
      <button type="submit" class="btn btn-primary btn-full">Log In</button>
      <div style="text-align:center;margin-top:12px">
        <button type="button" class="link-btn" data-nav="forgot-password" style="font-size:0.875rem;color:var(--text-muted)">Forgot password?</button>
      </div>
    </form>
    ` : `
    <form id="form-signup" class="auth-form">
      <div id="auth-error" class="error-msg" style="display:none"></div>
      <div class="form-group">
        <label for="signup-name">Full Name</label>
        <input type="text" id="signup-name" name="name" placeholder="Your name" required>
      </div>
      <div class="form-group">
        <label for="signup-email">Email</label>
        <input type="email" id="signup-email" name="email" placeholder="you@example.com" required autocomplete="email">
      </div>
      ${pwField('signup-password', 'password', 'Password', 'Min. 6 characters', 'new-password')}
      <button type="submit" class="btn btn-primary btn-full">Create Account</button>
    </form>
    `}
  </div>`;
}

/* ============================================================
   VIEW: HOME
   ============================================================ */
function viewHome() {
  const vouchers  = state.vouchers;
  const expiring  = vouchers.filter(v => getStatus(v) === 'expiring');
  const active    = vouchers.filter(v => getStatus(v) === 'active');
  const total     = [...active, ...expiring].reduce((s, v) => s + parseFloat((v.balance ?? v.value) || 0), 0);
  const hour      = new Date().getHours();
  const greeting  = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return `
  ${renderHeader('VoucherWise')}
  <main class="content">
    <div class="home-header">
      <div>
        <p class="greeting">${greeting},</p>
        <h2>${esc(state.currentUser.name.split(' ')[0])}</h2>
      </div>
      <button class="btn-icon" data-nav="profile" style="border-radius:50%">
        <div class="avatar" style="background:linear-gradient(150deg,#D6710A 0%,#F98513 100%);width:38px;height:38px;font-size:15px">
          ${esc(initial(state.currentUser.name))}
        </div>
      </button>
    </div>


    <div class="stats-card">
      <div class="stat">
        <span class="stat-value">${active.length + expiring.length}</span>
        <span class="stat-label">Active</span>
      </div>
      <div class="stat-divider"></div>
      <div class="stat">
        <span class="stat-value">€${total.toLocaleString('nl-NL', { maximumFractionDigits: 0 })}</span>
        <span class="stat-label">Total Value</span>
      </div>
      <div class="stat-divider"></div>
      <div class="stat">
        <span class="stat-value ${expiring.length > 0 ? 'text-warning' : ''}">${expiring.length}</span>
        <span class="stat-label">Expiring</span>
      </div>
    </div>

    ${expiring.length > 0 ? `
    <section class="home-section">
      <h3 class="section-title">${icon.clock} Expiring Soon</h3>
      <div class="voucher-list" style="margin-top:10px">
        ${expiring.map(voucherCard).join('')}
      </div>
    </section>
    ` : ''}

    <section class="home-section">
      <h3 class="section-title">Quick Actions</h3>
      <div class="quick-actions" style="margin-top:10px">
        <button class="quick-action" data-action="add-voucher-menu">
          <div class="qa-icon" style="background:#CFF1E8">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#13B5A2" stroke-width="2" stroke-linecap="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/><line x1="12" y1="14" x2="12" y2="18"/><line x1="10" y1="16" x2="14" y2="16"/></svg>
          </div>
          <span>Add Voucher</span>
        </button>
        <button class="quick-action" data-nav="marketplace">
          <div class="qa-icon" style="background:#CFF1E8">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#13B5A2" stroke-width="2" stroke-linecap="round"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>
          </div>
          <span>Marketplace</span>
        </button>
        <button class="quick-action" data-nav="friends">
          <div class="qa-icon" style="background:#CFF1E8">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#13B5A2" stroke-width="2" stroke-linecap="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
          </div>
          <span>Friends</span>
        </button>
      </div>
    </section>

    ${active.length > 0 ? `
    <section class="home-section">
      <div class="section-header">
        <h3 class="section-title">My Vouchers</h3>
        <button class="link-btn" data-nav="vouchers">See all</button>
      </div>
      <div class="voucher-list">
        ${active.slice(0, 3).map(voucherCard).join('')}
      </div>
    </section>
    ` : vouchers.length === 0 ? `
    <section class="home-section">
      <div class="card" style="text-align:center;padding:32px 16px">
        <div style="color:var(--secondary);display:flex;justify-content:center;margin-bottom:12px"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg></div>
        <h3 style="margin-bottom:8px">No vouchers yet</h3>
        <p style="color:var(--text-muted);font-size:0.875rem;margin-bottom:16px">Add your first voucher to start managing your wallet</p>
        <button class="btn btn-primary" data-action="add-voucher-menu">Add Voucher</button>
      </div>
    </section>
    ` : ''}
  </main>
  ${renderBottomNav()}`;
}

/* ============================================================
   VIEW: VOUCHERS
   ============================================================ */
function voucherCard(v) {
  const s = getStatus(v);
  const days = v.expiryDate ? daysUntil(v.expiryDate) : null;
  let expiryMeta = badge(s);
  if (s !== 'listed' && days !== null) {
    if (days < 0)        expiryMeta = `<span class="text-danger text-xs">Expired</span>`;
    else if (days === 0) expiryMeta = `<span class="text-warning text-xs">Today!</span>`;
    else if (days <= 7)  expiryMeta = `<span class="text-warning text-xs">${days}d left</span>`;
    else if (days <= 30) expiryMeta = `<span class="text-warning text-xs">${days}d left</span>`;
    else                 expiryMeta = badge(s);
  }
  const displayAmount = v.balance != null ? v.balance : v.value;

  return `
  <div class="voucher-card status-${s}" data-nav="voucher-detail" data-id="${esc(v.id)}">
    ${avatar(v.brand)}
    <div class="vc-info">
      <div class="vc-brand">${esc(v.brand)}</div>
      <div class="vc-code">${v.code ? '•••• ' + esc(v.code.slice(-4)) : '<span style="opacity:0.5">No code</span>'}</div>
      ${s === 'listed' ? `<div class="vc-listed-hint">Tap to unlist</div>` : ''}
    </div>
    <div class="vc-right">
      <div class="vc-value">${formatCurrency(displayAmount, v.currency)}</div>
      <div class="vc-meta">${expiryMeta}</div>
      ${v.expiryDate ? `<div style="font-size:0.7rem;color:var(--text-muted);margin-top:2px">${formatMonthYear(v.expiryDate)}</div>` : ''}
    </div>
  </div>`;
}

function viewVouchers() {
  const q      = state.searchQuery.toLowerCase();
  const filter = state.activeFilter;
  const sort   = state.activeSort;
  // Vouchers with a pending gift are hidden from the normal wallet — they
  // live in the Pending Gifts list until claimed or cancelled.
  const giftedIds = new Set(state.pendingGifts.map(g => g.voucher_id));
  let vouchers = state.vouchers.filter(v => !giftedIds.has(v.id));

  if (q) vouchers = vouchers.filter(v => v.brand.toLowerCase().includes(q) || (v.code||'').toLowerCase().includes(q));
  if (filter !== 'all') vouchers = vouchers.filter(v => {
    const s = getStatus(v);
    if (filter === 'active') return s === 'active' || s === 'expiring';
    return s === filter;
  });

  const statusOrder = { active: 0, expiring: 0, used: 1, sold: 1, expired: 2, listed: 0 };
  if (sort === 'expiry') {
    vouchers.sort((a, b) => {
      const sa = statusOrder[getStatus(a)] ?? 3;
      const sb = statusOrder[getStatus(b)] ?? 3;
      if (sa !== sb) return sa - sb;
      const da = a.expiryDate ? daysUntil(a.expiryDate) : Infinity;
      const db2 = b.expiryDate ? daysUntil(b.expiryDate) : Infinity;
      return da - db2;
    });
  } else if (sort === 'value') {
    vouchers.sort((a, b) => {
      const sa = statusOrder[getStatus(a)] ?? 3;
      const sb = statusOrder[getStatus(b)] ?? 3;
      if (sa !== sb) return sa - sb;
      return parseFloat(b.value || 0) - parseFloat(a.value || 0);
    });
  } else {
    vouchers.sort((a, b) => {
      const sa = statusOrder[getStatus(a)] ?? 3;
      const sb = statusOrder[getStatus(b)] ?? 3;
      if (sa !== sb) return sa - sb;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
  }

  const allV   = state.vouchers.filter(v => !giftedIds.has(v.id));
  const counts = { all: allV.length, active: 0, expiring: 0, expired: 0, used: 0, listed: 0 };
  allV.forEach(v => {
    const s = getStatus(v);
    if (s === 'active' || s === 'expiring') counts.active++;
    else if (s in counts) counts[s]++;
  });

  return `
  ${renderHeader('My Vouchers')}
  <main class="content">
    <div class="search-bar">
      <span class="search-icon">${icon.search}</span>
      <input type="search" placeholder="Search brand, code…" value="${esc(state.searchQuery)}" data-search="vouchers">
    </div>

    ${state.pendingGifts.length > 0 ? `
    <button type="button" class="pending-gifts-pill" data-nav="pending-gifts">
      ${icon.gift} ${state.pendingGifts.length} pending gift${state.pendingGifts.length !== 1 ? 's' : ''}, waiting to be claimed
    </button>
    ` : ''}

    <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
      <div class="filter-chips" style="flex:1;margin-bottom:0">
        ${[
          { id: 'all',      label: `All (${counts.all})` },
          { id: 'active',   label: `Active (${counts.active})` },
          { id: 'expiring', label: `⚠ Expiring (${counts.expiring})` },
          { id: 'expired',  label: `Expired (${counts.expired})` },
          { id: 'used',     label: `Used (${counts.used})` },
          { id: 'listed',   label: `Listed (${counts.listed})` },
        ].map(f => `<button class="chip ${filter === f.id ? 'active' : ''}" data-filter="${f.id}">${f.label}</button>`).join('')}
      </div>
      <select class="sort-select" data-sort title="Sort">
        <option value="expiry" ${sort==='expiry'?'selected':''}>↑ Expiry</option>
        <option value="value"  ${sort==='value'?'selected':''}>↓ Value</option>
        <option value="added"  ${sort==='added'?'selected':''}>Newest</option>
      </select>
    </div>

    ${vouchers.length > 0
      ? `<div class="voucher-list">${vouchers.map(voucherCard).join('')}</div>`
      : `<div class="empty-state">
          <div class="empty-icon">${counts.all === 0 ? navIcons.vouchers : icon.search}</div>
          <h3>${counts.all === 0 ? 'No vouchers yet' : 'No results found'}</h3>
          <p>${counts.all === 0 ? 'Add vouchers to manage them in one place' : 'Try a different search or filter'}</p>
          ${counts.all === 0 ? '<button class="btn btn-primary" data-action="add-voucher-menu">Add Your First Voucher</button>' : ''}
        </div>`
    }
  </main>
  <button class="fab" data-action="add-voucher-menu" title="Add voucher">${icon.plus}</button>
  ${renderBottomNav()}`;
}

/* ============================================================
   VIEW: PENDING GIFTS
   ============================================================ */
function viewPendingGifts() {
  const rows = state.pendingGifts.map(g => {
    const v = state.vouchers.find(x => x.id === g.voucher_id);
    if (!v) return '';
    return `
    <div class="card" style="margin-bottom:10px;padding:14px">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
        <div>
          <div style="font-weight:700">${esc(v.brand)}</div>
          <div class="text-muted text-xs">${formatCurrency(v.value, v.currency)} · sent ${formatDate(g.created_at?.slice(0, 10))}</div>
        </div>
        <div style="display:flex;gap:8px">
          <button type="button" class="btn btn-secondary btn-sm" data-action="show-gift-qr" data-id="${esc(g.id)}" data-voucher-id="${esc(v.id)}">${icon.link} Link</button>
          <button type="button" class="btn btn-ghost btn-sm" data-action="cancel-gift" data-id="${esc(g.id)}">${icon.trash} Cancel</button>
        </div>
      </div>
    </div>`;
  }).join('');

  return `
  ${renderHeader('Pending Gifts', 'vouchers')}
  <main class="content">
    <p class="text-muted text-xs" style="margin-bottom:14px">Vouchers you've sent that a friend hasn't claimed yet. Cancel to bring one back into your wallet.</p>
    ${rows || `<div class="empty-state">
      <div class="empty-icon">${icon.gift}</div>
      <h3>No pending gifts</h3>
      <p>Open a voucher and tap "Gift" to send it to a friend.</p>
    </div>`}
  </main>
  ${renderBottomNav()}`;
}

/* ============================================================
   ATTACHMENT TILE (shared: server-rendered existing files +
   JS-inserted pending files use the same markup)
   ============================================================ */
function attachmentTileHtml({ existingId, localId, path, kind, previewUrl }) {
  const removeAttr = existingId
    ? `data-action="remove-existing-file" data-file-id="${esc(existingId)}"`
    : `data-action="remove-pending-file" data-local-id="${esc(localId)}"`;
  const body = kind === 'pdf'
    ? `<div class="attachment-file-icon">${icon.file}<span>PDF</span></div>`
    : `<img class="attachment-thumb" ${previewUrl ? `src="${esc(previewUrl)}"` : `data-path="${esc(path)}"`} alt="Attachment">`;
  return `
  <div class="attachment-tile">
    ${body}
    <button type="button" class="attachment-remove" ${removeAttr} title="Remove">✕</button>
  </div>`;
}

function barcodeTileHtml({ path, previewUrl }) {
  return `
  <div class="barcode-tile">
    <img class="barcode-thumb" ${previewUrl ? `src="${esc(previewUrl)}"` : `data-path="${esc(path)}"`} alt="Barcode">
    <button type="button" class="attachment-remove" data-action="remove-barcode" title="Remove">✕</button>
  </div>`;
}

// Shared by the initial template render and the imperative DOM updates in
// maybeAutoDetectBarcode/startVoucherScan, so a scan's status (in progress /
// found / not found) is never just... silent, wherever it's triggered from.
function barcodePreviewHtml(v) {
  if (pendingBarcode) return barcodeTileHtml({ previewUrl: pendingBarcode.previewUrl });
  if (v?.barcodePath && !barcodeRemoved) return barcodeTileHtml({ path: v.barcodePath });
  if (barcodeScanState === 'scanning') return `<div class="barcode-scanning"><div class="scan-spinner-sm"></div><span>Scanning for a QR code…</span></div>`;
  if (barcodeScanState === 'missing') return `<p class="barcode-not-found">No QR code found in this photo.</p>`;
  return '';
}

function barcodeGroupVisible(v) {
  return !!(pendingBarcode || (v?.barcodePath && !barcodeRemoved) || barcodeScanState);
}

/* ============================================================
   VIEW: VOUCHER FORM (add / edit)
   ============================================================ */
function viewVoucherForm() {
  const id = state.params.id;
  const v  = id ? state.vouchers.find(x => x.id === id) : null;
  const title = v ? 'Edit Voucher' : 'Add Voucher';

  return `
  ${renderHeader(title, id ? 'voucher-detail' : 'vouchers', id ? { id } : {})}
  <main class="content">
    <form id="form-voucher" autocomplete="off">
      ${v ? `<input type="hidden" name="voucherId" value="${esc(v.id)}">` : ''}
      <div class="form-group" id="barcode-group" ${barcodeGroupVisible(v) ? '' : 'style="display:none"'}>
        <label>QR Code</label>
        <div id="barcode-preview">${barcodePreviewHtml(v)}</div>
        <span class="form-hint">Auto-detected from your photo. Shown at the top of this voucher for quick scanning</span>
      </div>

      <div class="form-group">
        <label>Brand / Store <span style="color:var(--danger)">*</span></label>
        ${brandAutocomplete(v?.brand || '')}
      </div>

      <div class="form-group">
        <label>Photos or Files</label>
        <div class="attachment-grid" id="attachment-grid">
          ${state.voucherFiles.map(f => attachmentTileHtml({ existingId: f.id, path: f.file_path, kind: f.file_type })).join('')}
          ${pendingNewFiles.map(f => attachmentTileHtml({ localId: f.localId, kind: f.kind, previewUrl: f.previewUrl })).join('')}
          <div class="attachment-tile attachment-add" data-action="pick-photo" role="button" tabindex="0">
            ${icon.camera}
            <span>Add</span>
          </div>
        </div>
        <input type="file" id="voucher-file-input" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf" multiple style="display:none">
        <span class="form-hint">Front &amp; back photos, or a PDF (JPG, PNG, WEBP, HEIC or PDF, max 10MB each)</span>
      </div>

      <div class="form-group">
        <label>Value (€) <span style="color:var(--danger)">*</span></label>
        <input type="text" name="amount" placeholder="50,00" value="${esc(v?.value||'')}" required>
      </div>

      <div class="form-group">
        <label>Remaining Balance</label>
        <input type="text" name="balance" placeholder="Leave blank if full value remains" value="${esc(v?.balance??'')}">
        <span class="form-hint">Fill in only when a partial amount has already been used</span>
      </div>

      <div class="form-group">
        <label>Expiry Date</label>
        <div class="date-field-row">
          <input type="date" name="expiryDate" id="voucher-expiry-input" value="${esc(v?.expiryDate||'')}">
          <button type="button" class="btn btn-ghost btn-sm" data-action="clear-expiry-date">Clear</button>
        </div>
        <span class="form-hint">Leave blank if this voucher doesn't expire</span>
      </div>

      <div class="form-group">
        <label>Voucher Code</label>
        <input type="text" name="code" placeholder="e.g. SUMMER2024" value="${esc(v?.code||'')}">
        <span class="form-hint">The code you enter at checkout</span>
      </div>

      <div class="form-group">
        <label>PIN</label>
        <input type="text" name="pin" placeholder="Optional PIN or security code" value="${esc(v?.pin||'')}">
      </div>

      <div class="form-group">
        <label>Notes / Terms &amp; Conditions</label>
        <textarea name="notes" placeholder="Any extra info, or the voucher's terms &amp; conditions…" rows="3">${esc(v?.notes||'')}</textarea>
      </div>

      <div class="form-group">
        <label>Category</label>
        <select name="category">
          ${CATEGORIES.map(c => `<option value="${c}" ${(v?.category||'Other')===c?'selected':''}>${c}</option>`).join('')}
        </select>
      </div>

      <div class="form-group">
        <label>Voucher Type</label>
        <select name="voucherType">
          <option value="gift_card" ${(v?.voucherType||'gift_card')==='gift_card'?'selected':''}>Gift Card</option>
          <option value="store_credit" ${v?.voucherType==='store_credit'?'selected':''}>Store Credit</option>
        </select>
        <span class="form-hint">Store credit cannot be listed on the marketplace</span>
      </div>

      <div style="display:flex;gap:10px;margin-top:4px">
        <button type="button" class="btn btn-ghost btn-full" data-nav="${id ? 'voucher-detail' : 'vouchers'}" ${id ? `data-id="${esc(id)}"` : ''}>Cancel</button>
        <button type="submit" class="btn btn-primary btn-full">${v ? 'Save Changes' : 'Add Voucher'}</button>
      </div>
    </form>
  </main>
  ${renderBottomNav()}`;
}

/* ============================================================
   VIEW: VOUCHER DETAIL
   ============================================================ */
function viewVoucherDetail() {
  const id = state.params.id;
  const v  = state.vouchers.find(x => x.id === id);
  if (!v) return viewVouchers();

  const s = getStatus(v);
  const days = v.expiryDate ? daysUntil(v.expiryDate) : null;
  const showSellForm     = state.params.sellForm;
  const showReminderForm = state.params.reminderForm;
  const showDeductForm   = state.params.deductForm;

  let expiryInfo = 'N/A';
  if (days !== null) {
    if (days < 0)        expiryInfo = `<span class="text-danger">Expired ${Math.abs(days)} day${Math.abs(days)!==1?'s':''} ago</span>`;
    else if (days === 0) expiryInfo = `<span class="text-warning fw-600">Expires today!</span>`;
    else if (days <= 7)  expiryInfo = `<span class="text-warning fw-600">In ${days} day${days!==1?'s':''}</span>`;
    else                 expiryInfo = `<span>${formatDate(v.expiryDate)}</span>`;
  }

  const isOwn = v.userId === state.currentUser.id;
  const rightAction = isOwn
    ? `<button class="btn-icon" data-nav="voucher-form" data-id="${esc(id)}" title="Edit">${icon.edit}</button>`
    : '';

  const activeReminder = state.reminders.find(r => r.voucherId === id && !r.dismissed);

  return `
  ${renderHeader(v.brand, 'vouchers', {}, rightAction)}
  <main class="content">
    <div class="voucher-detail-header" style="background:#13B5A2">
      <div class="vd-brand">${esc(v.brand)}</div>
      <div class="vd-value">${formatCurrency(v.balance != null ? v.balance : v.value, v.currency)}</div>
      ${badge(s)}
    </div>

    ${v.barcodePath ? `
    <div class="barcode-display">
      <img data-path="${esc(v.barcodePath)}" alt="Barcode">
    </div>
    ` : ''}

    ${activeReminder ? `
    <div class="reminder-info-bar">
      ${icon.bell}
      <span>Reminder set for <strong>${formatDate(activeReminder.reminderDate)}</strong>${activeReminder.reminderTime ? ` at ${activeReminder.reminderTime}` : ''}</span>
      <button class="btn-icon" data-action="dismiss-reminder" data-id="${esc(activeReminder.id)}" title="Remove reminder" style="margin-left:auto;opacity:0.6;font-size:0.75rem">✕</button>
    </div>
    ` : ''}

    ${state.voucherFiles.length ? `
    <div class="attachment-list">
      ${state.voucherFiles.map((f, i) => `
      <button type="button" class="attachment-row" data-action="view-attachment" data-path="${esc(f.file_path)}">
        <span class="attachment-row-icon">${f.file_type === 'pdf' ? icon.file : icon.camera}</span>
        <span class="attachment-row-label">${f.file_type === 'pdf' ? 'PDF document' : `Photo ${i + 1}`}</span>
        <span class="attachment-row-view">${icon.eye} View</span>
      </button>`).join('')}
    </div>
    ` : ''}

    ${v.code ? `
    <p class="code-label">Voucher Code</p>
    <div class="code-display">
      <span class="code-text">${esc(v.code)}</span>
      <button class="btn btn-secondary btn-sm" data-action="copy-voucher-code" data-id="${esc(id)}" data-copy="${esc(v.code)}">${icon.copy} Copy</button>
    </div>
    ${(v.copyCount || 0) > 0 ? `<p class="text-xs text-muted" style="margin-top:4px;margin-left:2px">Copied ${v.copyCount} time${v.copyCount!==1?'s':''}</p>` : ''}
    ` : ''}

    ${v.pin ? `
    <p class="code-label" style="margin-top:10px">PIN</p>
    <div class="code-display">
      <span class="code-text">${esc(v.pin)}</span>
      <button class="btn btn-secondary btn-sm" data-action="copy" data-copy="${esc(v.pin)}" data-toast="PIN copied!">${icon.copy} Copy</button>
    </div>
    ` : ''}

    <div class="detail-grid" style="margin-top:16px">
      <div class="detail-item">
        <div class="detail-item-label">Expiry Date</div>
        <div class="detail-item-value">${expiryInfo}</div>
      </div>
      <div class="detail-item">
        <div class="detail-item-label">Status</div>
        <div class="detail-item-value">${badge(s)}</div>
      </div>
      <div class="detail-item">
        <div class="detail-item-label">Original Value</div>
        <div class="detail-item-value">${formatCurrency(v.value, v.currency)}</div>
      </div>
      <div class="detail-item">
        <div class="detail-item-label">Remaining Balance</div>
        <div class="detail-item-value">${v.balance != null ? formatCurrency(v.balance, v.currency) : formatCurrency(v.value, v.currency)}</div>
      </div>
      <div class="detail-item">
        <div class="detail-item-label">Category</div>
        <div class="detail-item-value">${esc(v.category || 'Other')}</div>
      </div>
      <div class="detail-item">
        <div class="detail-item-label">Type</div>
        <div class="detail-item-value">${v.voucherType === 'store_credit' ? 'Store Credit' : 'Gift Card'}</div>
      </div>
      ${v.notes ? `
      <div class="detail-item" style="grid-column:span 2">
        <div class="detail-item-label">Notes</div>
        <div class="detail-item-value" style="font-weight:400;font-size:0.875rem">${esc(v.notes)}</div>
      </div>` : ''}
    </div>

    ${isOwn ? `
    <div class="action-row">
      ${s === 'used' || s === 'sold'
        ? `<button class="btn btn-ghost" data-action="mark-unused" data-id="${esc(id)}">${icon.undo} Mark Active</button>`
        : `<button class="btn btn-success" data-action="mark-used" data-id="${esc(id)}">${icon.check} Mark Used</button>`
      }
      ${s === 'listed'
        ? `<button class="btn btn-ghost" data-action="unlist" data-id="${esc(id)}">${icon.tag} Remove Listing</button>`
        : (s === 'active' || s === 'expiring')
          ? `<button class="btn btn-secondary" data-action="show-sell" data-id="${esc(id)}">${icon.tag} Sell</button>`
          : ''
      }
      ${s === 'active' || s === 'expiring'
        ? `<button class="btn btn-secondary" data-action="send-gift" data-id="${esc(id)}">${icon.gift} Gift</button>`
        : ''
      }
    </div>

    ${s !== 'used' && s !== 'sold' ? `
    <div style="margin-top:10px">
      <button class="btn btn-ghost btn-full" data-action="${showDeductForm ? 'hide-deduct' : 'show-deduct'}" data-id="${esc(id)}">
        ${icon.tag} ${showDeductForm ? 'Cancel' : 'Deduct Amount Used'}
      </button>
    </div>

    ${showDeductForm ? `
    <div class="sell-form" style="margin-top:12px">
      <form id="form-deduct">
        <input type="hidden" name="voucherId" value="${esc(id)}">
        <div class="form-group">
          <label>Amount spent (${v.currency||'EUR'}) <span style="color:var(--danger)">*</span></label>
          <input type="text" name="amount" placeholder="e.g. 12,50" required autofocus>
          <span class="form-hint">Remaining: ${formatCurrency(v.balance ?? v.value, v.currency)}</span>
        </div>
        <div style="display:flex;gap:10px">
          <button type="button" class="btn btn-ghost" data-action="hide-deduct">Cancel</button>
          <button type="submit" class="btn btn-primary btn-full">Update Balance</button>
        </div>
      </form>
    </div>
    ` : ''}
    ` : ''}

    ${s !== 'expired' && s !== 'used' && s !== 'sold' ? `
    <div style="margin-top:10px">
      <button class="btn btn-ghost btn-full" data-action="${showReminderForm ? 'hide-reminder' : 'show-reminder'}" data-id="${esc(id)}">
        ${icon.bell} ${showReminderForm ? 'Cancel' : 'Schedule Reminder'}
      </button>
    </div>
    ` : ''}

    ${showReminderForm ? `
    <div class="sell-form" style="margin-top:12px">
      <form id="form-reminder">
        <input type="hidden" name="voucherId" value="${esc(id)}">
        <div class="form-group" style="margin-bottom:8px">
          <label style="font-size:0.8125rem;font-weight:600;margin-bottom:6px;display:block">When should we remind you?</label>
          <input type="datetime-local" name="reminderDateTime" required
            min="${nowDateTimeLocalStr()}"
            value="${defaultReminderDateTimeStr()}"
            style="width:100%;padding:10px 12px;border:1.5px solid var(--border);border-radius:10px;font-size:0.9375rem;background:var(--bg);color:var(--text)">
        </div>
        <p class="form-hint" style="margin-bottom:12px;font-size:0.75rem">
          ${icon.bell} Push notification at this time${v.expiryDate ? ` · Expires ${formatDate(v.expiryDate)}` : ''}
        </p>
        <div style="display:flex;gap:8px">
          <button type="button" class="btn btn-ghost" data-action="hide-reminder" style="flex:0 0 auto">Cancel</button>
          <button type="submit" class="btn btn-primary btn-full">Save Reminder</button>
        </div>
      </form>
    </div>
    ` : ''}

    ${showSellForm ? `
    <div class="sell-form">
      <div class="sell-hint">${icon.info} Buyer contacts you by email. No payment processing in MVP.</div>
      <form id="form-sell">
        <input type="hidden" name="voucherId" value="${esc(id)}">
        <div class="form-group">
          <label>Selling Price (${v.currency||'EUR'}) <span style="color:var(--danger)">*</span></label>
          <input type="text" name="price" placeholder="e.g. 40,00" required>
          <span class="form-hint">Original value: ${formatCurrency(v.value, v.currency)}</span>
        </div>
        <div style="display:flex;gap:10px">
          <button type="button" class="btn btn-ghost" data-action="hide-sell">Cancel</button>
          <button type="submit" class="btn btn-primary btn-full">List for Sale</button>
        </div>
      </form>
    </div>
    ` : ''}

    <div class="divider"></div>
    <button class="btn btn-danger btn-full" data-action="confirm-delete" data-id="${esc(id)}">${icon.trash} Delete Voucher</button>
    ` : ''}
  </main>
  ${renderBottomNav()}`;
}

/* ============================================================
   VIEW: MARKETPLACE
   ============================================================ */
function listingCard(l, isOwn = false) {
  const disc = discountPct(l.originalValue, l.sellingPrice);
  const days = l.expiryDate ? daysUntil(l.expiryDate) : null;

  return `
  <div class="listing-card" data-nav="listing-detail" data-id="${esc(l.id)}">
    ${avatar(l.brand, 46)}
    <div class="lc-info">
      <div class="lc-brand">${esc(l.brand)}</div>
      <div class="lc-seller">${isOwn ? 'Your listing' : esc(l.sellerName)}</div>
      ${days !== null && days >= 0 && days <= 14 ? `<div class="text-xs text-warning" style="margin-top:2px">Expires in ${days}d</div>` : ''}
      ${days !== null && days < 0 ? `<div class="text-xs text-danger" style="margin-top:2px">Expired</div>` : ''}
    </div>
    <div class="lc-right">
      <div class="lc-price">${formatCurrency(l.sellingPrice, l.currency)}</div>
      <div class="lc-original">${formatCurrency(l.originalValue, l.currency)}</div>
      ${disc > 0 ? `<div class="discount-badge">-${disc}%</div>` : ''}
    </div>
  </div>`;
}

function viewMarketplace() {
  const tab = state.marketplaceTab || 'browse';
  const q   = state.searchQuery.toLowerCase();
  const uid = state.currentUser.id;
  const friendIds = state.friendIds;

  let listings = state.listings.filter(l => l.sellerId !== uid);
  if (q) listings = listings.filter(l => l.brand.toLowerCase().includes(q));

  listings.sort((a, b) => {
    const aF = friendIds.includes(a.sellerId) ? 0 : 1;
    const bF = friendIds.includes(b.sellerId) ? 0 : 1;
    return aF - bF;
  });

  const myListings = state.listings.filter(l => l.sellerId === uid);

  return `
  ${renderHeader('Marketplace')}
  <main class="content">
    <div class="inline-tabs">
      <button class="inline-tab ${tab==='browse'?'active':''}" data-marketplace-tab="browse">Browse</button>
      <button class="inline-tab ${tab==='mine'?'active':''}" data-marketplace-tab="mine">My Listings (${myListings.length})</button>
    </div>

    ${tab === 'browse' ? `
    <div class="search-bar" style="margin-bottom:16px">
      <span class="search-icon">${icon.search}</span>
      <input type="search" placeholder="Search brand…" value="${esc(state.searchQuery)}" data-search="marketplace">
    </div>
    ${listings.length > 0
      ? listings.map(l => listingCard(l)).join('')
      : `<div class="empty-state"><div class="empty-icon">${navIcons.marketplace}</div><h3>${q?'No results':'Marketplace is empty'}</h3><p>${q?'Try a different search term':'Be the first to list a voucher for sale'}</p></div>`
    }
    ` : `
    ${myListings.length > 0
      ? myListings.map(l => listingCard(l, true)).join('')
      : `<div class="empty-state"><div class="empty-icon">${icon.tag}</div><h3>No active listings</h3><p>Open a voucher and tap "Sell" to list it here</p><button class="btn btn-primary" data-nav="vouchers">Go to My Vouchers</button></div>`
    }
    `}
  </main>
  ${renderBottomNav()}`;
}

/* ============================================================
   VIEW: LISTING DETAIL
   ============================================================ */
function viewListingDetail() {
  const id = state.params.id;
  const l  = state.listings.find(x => x.id === id);
  if (!l || l.status !== 'available') return viewMarketplace();

  const disc  = discountPct(l.originalValue, l.sellingPrice);
  const isOwn = l.sellerId === state.currentUser.id;
  const days  = l.expiryDate ? daysUntil(l.expiryDate) : null;

  const brandDesc = getBrandDescription(l.brand);

  return `
  ${renderHeader(l.brand, 'marketplace')}
  <main class="content">
    <div class="listing-detail-header" style="background:#13B5A2">
      <div class="ld-brand">${esc(l.brand)}</div>
      <div class="ld-price">${formatCurrency(l.sellingPrice, l.currency)}</div>
      <div class="ld-original">${formatCurrency(l.originalValue, l.currency)} original value</div>
      ${disc > 0 ? `<div style="margin-top:8px"><span class="discount-badge">-${disc}% discount</span></div>` : ''}
    </div>

    ${brandDesc ? `<p class="text-muted" style="font-size:0.875rem;margin-bottom:16px">${esc(brandDesc)}</p>` : ''}

    <div class="detail-grid">
      <div class="detail-item">
        <div class="detail-item-label">Original Value</div>
        <div class="detail-item-value">${formatCurrency(l.originalValue, l.currency)}</div>
      </div>
      <div class="detail-item">
        <div class="detail-item-label">You Save</div>
        <div class="detail-item-value text-success">${formatCurrency(l.originalValue - l.sellingPrice, l.currency)}</div>
      </div>
      <div class="detail-item">
        <div class="detail-item-label">Expiry Date</div>
        <div class="detail-item-value ${days !== null && days <= 7 && days >= 0 ? 'text-warning' : days !== null && days < 0 ? 'text-danger' : ''}">${l.expiryDate ? formatDate(l.expiryDate) : 'N/A'}</div>
      </div>
      <div class="detail-item">
        <div class="detail-item-label">Seller</div>
        <div class="detail-item-value">${esc(l.sellerName)}</div>
      </div>
      ${l.notes ? `<div class="detail-item" style="grid-column:span 2"><div class="detail-item-label">Notes</div><div class="detail-item-value" style="font-weight:400;font-size:0.875rem">${esc(l.notes)}</div></div>` : ''}
    </div>

    ${isOwn ? `
    <div class="card" style="background:var(--primary-light);border-color:var(--primary-light)">
      <p style="font-size:0.875rem;color:var(--primary);font-weight:500">This is your listing. Buyers will contact you at <strong>${esc(l.sellerEmail)}</strong></p>
    </div>
    <div style="margin-top:12px">
      <button class="btn btn-danger btn-full" data-action="remove-listing" data-id="${esc(l.id)}" data-voucher-id="${esc(l.voucherId)}">${icon.trash} Remove Listing</button>
    </div>
    ` : `
    <div class="sell-hint" style="margin-bottom:16px">${icon.info} Payment is arranged directly with the seller. No payment processing in this MVP.</div>
    <a href="mailto:${esc(l.sellerEmail)}?subject=${encodeURIComponent('Interested in your ' + l.brand + ' voucher on VoucherWise')}" class="btn btn-primary btn-full" style="display:flex">
      ${icon.mail} Contact Seller
    </a>
    `}
  </main>
  ${renderBottomNav()}`;
}

/* ============================================================
   VIEW: REFERRALS
   ============================================================ */
function referralCard(r, isOwn = false) {
  const vote = state.referralVotes[r.id] || null;
  return `
  <div class="referral-card">
    <div class="rc-header">
      ${avatar(r.brand, 40)}
      <div class="rc-info">
        <div class="rc-brand">${esc(r.brand)}</div>
        <div class="rc-owner">${isOwn ? 'Your code' : esc(r.ownerName || 'Community')}
          ${r.visibility === 'friends' ? ' · <span class="badge badge-primary" style="font-size:0.6rem;padding:2px 5px">Friends</span>' : ''}
          ${r.category && r.category !== 'Other' ? ` · <span class="badge badge-gray" style="font-size:0.6rem;padding:2px 5px">${esc(r.category)}</span>` : ''}
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:4px">
        ${isOwn ? `
          <button class="btn-icon" data-action="edit-referral" data-id="${esc(r.id)}" title="Edit">${icon.edit}</button>
          <button class="btn-icon" style="color:var(--danger)" data-action="delete-referral" data-id="${esc(r.id)}" title="Delete">${icon.trash}</button>
        ` : ''}
      </div>
    </div>
    <div class="rc-code-row">
      <span class="rc-code">${esc(r.code)}</span>
      <button class="btn btn-secondary btn-sm" data-action="copy" data-copy="${esc(r.code)}" data-toast="Code copied!">${icon.copy} Copy</button>
    </div>
    ${r.link ? `<a href="${esc(r.link)}" target="_blank" rel="noopener" class="btn btn-outline btn-sm btn-full" style="margin-bottom:8px">${icon.link} Open Referral Link</a>` : ''}
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px">
      <div class="rc-benefits">
        ${r.benefitNew      ? `<span class="rc-benefit">New user: ${esc(r.benefitNew)}</span>` : ''}
        ${r.benefitReferrer ? `<span class="rc-benefit">Referrer: ${esc(r.benefitReferrer)}</span>` : ''}
      </div>
      ${isOwn ? `
      <div class="usage-count">
        ${icon.users} <span>${r.usedCount || 0} use${(r.usedCount||0)!==1?'s':''}</span>
        <button class="btn btn-sm" style="padding:4px 8px;background:var(--success-light);color:var(--success);border-radius:6px" data-action="increment-referral" data-id="${esc(r.id)}" title="Mark one more use">+1 Use</button>
      </div>
      ` : `
      <div style="display:flex;gap:6px;align-items:center">
        <button class="btn btn-sm ${vote==='up'?'btn-success':'btn-ghost'}" style="padding:3px 10px;font-size:0.8rem" data-action="vote-referral" data-id="${esc(r.id)}" data-vote="up" title="Works for me">👍 Works</button>
        <button class="btn btn-sm ${vote==='down'?'btn-danger':'btn-ghost'}" style="padding:3px 10px;font-size:0.8rem" data-action="vote-referral" data-id="${esc(r.id)}" data-vote="down" title="Doesn't work">👎 Expired</button>
      </div>
      `}
    </div>
    <div class="rc-terms"><strong>Terms &amp; Conditions:</strong> ${r.terms ? esc(r.terms) : 'No terms specified'}</div>
  </div>`;
}

function viewReferrals() {
  const tab       = state.referralTab || 'public';
  const q         = state.searchQuery.toLowerCase();
  const uid       = state.currentUser.id;
  const friendIds = state.friendIds;
  const all       = state.referrals;
  const brand     = state.referralBrandFilter;
  const catFilter = state.referralCategoryFilter || 'All';

  // Pool of referrals visible to the current user (before brand/search filter)
  let pool = [];
  if (tab === 'public') {
    pool = all.filter(r => r.visibility === 'public');
  } else if (tab === 'friends') {
    // All non-private codes from friends (they can see public + friends-only)
    pool = all.filter(r => friendIds.includes(r.userId) || (r.userId === uid && r.visibility === 'friends'));
  } else {
    pool = all.filter(r => r.userId === uid);
  }

  // Tab counts scope to the selected brand once you've drilled into one
  const countPool    = brand ? all.filter(r => r.brand === brand) : all;
  const myCount      = countPool.filter(r => r.userId === uid).length;
  const friendsCount = countPool.filter(r => friendIds.includes(r.userId) || (r.userId === uid && r.visibility === 'friends')).length;
  const publicCount  = countPool.filter(r => r.visibility === 'public').length;

  const tabs = `
  <div class="inline-tabs" style="margin-bottom:12px">
    <button class="inline-tab ${tab==='public'?'active':''}" data-referral-tab="public">Public (${publicCount})</button>
    <button class="inline-tab ${tab==='friends'?'active':''}" data-referral-tab="friends">Friends (${friendsCount})</button>
    <button class="inline-tab ${tab==='mine'?'active':''}" data-referral-tab="mine">Mine (${myCount})</button>
  </div>`;

  /* ---- CODE LIST (brand drill-down) ---- */
  if (brand) {
    let visible = pool.filter(r => r.brand === brand);
    if (q) visible = visible.filter(r => r.code.toLowerCase().includes(q) || r.brand.toLowerCase().includes(q));
    const brandDesc = getBrandDescription(brand);

    return `
    <header class="app-header">
      <div class="header-left"><button class="btn-back" data-action="clear-referral-brand">${icon.back}</button></div>
      <span class="header-title">${esc(brand)}</span>
      <div class="header-right"></div>
    </header>
    <main class="content">
      ${brandDesc ? `<p class="text-muted" style="font-size:0.875rem;margin-bottom:14px">${esc(brandDesc)}</p>` : ''}
      ${tabs}
      <div class="search-bar" style="margin-bottom:16px">
        <span class="search-icon">${icon.search}</span>
        <input type="search" placeholder="Search code…" value="${esc(state.searchQuery)}" data-search="referrals">
      </div>
      <button class="btn btn-ghost btn-sm" style="margin-bottom:12px" data-action="clear-referral-brand">← All brands</button>
      ${visible.length > 0
        ? visible.map(r => referralCard(r, r.userId === uid)).join('')
        : `<div class="empty-state"><div class="empty-icon">${navIcons.referrals}</div><h3>No codes for ${esc(brand)}</h3><p>${q ? 'Try a different search' : 'No referral codes match this filter'}</p></div>`
      }
    </main>
    <button class="fab" data-nav="referral-form" title="Add referral code">${icon.plus}</button>
    ${renderBottomNav()}`;
  }

  /* ---- BRAND GRID (default view) ---- */
  // Compute unique brands in pool, apply category filter
  let filtered = pool;
  if (catFilter !== 'All') filtered = filtered.filter(r => r.category === catFilter);
  if (q) filtered = filtered.filter(r => r.brand.toLowerCase().includes(q));

  // Group by brand name
  const brandMap = new Map();
  for (const r of filtered) {
    if (!brandMap.has(r.brand)) brandMap.set(r.brand, []);
    brandMap.get(r.brand).push(r);
  }
  const brandList = [...brandMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  const categoryChips = getReferralCategories().map(c =>
    `<button class="chip ${catFilter===c?'active':''}" data-referral-cat="${esc(c)}">${c}</button>`
  ).join('');

  const brandCards = brandList.map(([brandName, codes]) => `
    <div class="voucher-card" style="cursor:pointer" data-referral-brand="${esc(brandName)}">
      ${avatar(brandName, 42)}
      <div class="vc-info">
        <div class="vc-brand">${esc(brandName)}</div>
        <div class="vc-code" style="font-size:0.8rem;opacity:0.7">${codes.length} code${codes.length!==1?'s':''}</div>
      </div>
      <div class="vc-right" style="color:var(--primary)">›</div>
    </div>`
  ).join('');

  return `
  ${renderHeader('Referral Codes')}
  <main class="content">
    ${tabs}
    <div class="search-bar" style="margin-bottom:12px">
      <span class="search-icon">${icon.search}</span>
      <input type="search" placeholder="Search brand…" value="${esc(state.searchQuery)}" data-search="referrals">
    </div>
    <div class="filter-chips" style="margin-bottom:16px">${categoryChips}</div>
    ${brandList.length > 0
      ? `<div class="voucher-list">${brandCards}</div>`
      : `<div class="empty-state">
           <div class="empty-icon">${navIcons.referrals}</div>
           <h3>${q || catFilter !== 'All' ? 'No results' : tab === 'mine' ? 'No codes yet' : tab === 'friends' ? 'No friends\' codes' : 'No public codes yet'}</h3>
           <p>${tab === 'mine' && !q ? 'Add your first referral code' : 'Try a different filter or tab'}</p>
           ${tab === 'mine' && !q ? '<button class="btn btn-primary" data-nav="referral-form">Add Referral Code</button>' : ''}
           ${tab === 'friends' && !q ? '<button class="btn btn-primary" data-nav="friends">Manage Friends</button>' : ''}
         </div>`
    }
  </main>
  <button class="fab" data-nav="referral-form" title="Add referral code">${icon.plus}</button>
  ${renderBottomNav()}`;
}

/* ============================================================
   VIEW: REFERRAL FORM (add / edit)
   ============================================================ */
function viewReferralForm() {
  const id = state.params.id;
  const r  = id ? state.referrals.find(x => x.id === id) : null;
  const title = r ? 'Edit Referral Code' : 'Add Referral Code';

  return `
  ${renderHeader(title, 'referrals')}
  <main class="content">
    <form id="form-referral" autocomplete="off">
      ${r ? `<input type="hidden" name="referralId" value="${esc(r.id)}">` : ''}
      <div class="form-group">
        <label>Brand / App <span style="color:var(--danger)">*</span></label>
        ${brandAutocomplete(r?.brand || '')}
      </div>
      <div class="form-group">
        <label>Category</label>
        <select name="brandCategory" id="brand-category">
          ${CATEGORIES.map(c =>
            `<option value="${esc(c)}" ${(r?.category||'Other')===c?'selected':''}>${esc(c)}</option>`
          ).join('')}
        </select>
        <span class="form-hint">Auto-filled when you pick a known brand · you can also set it manually</span>
      </div>
      <div class="form-group">
        <label>Referral Code <span style="color:var(--text-muted);font-weight:400;font-size:0.8125rem">or link below</span></label>
        <input type="text" name="code" placeholder="Your referral code" value="${esc(r?.code||'')}">
      </div>
      <div class="form-group">
        <label>Referral Link <span style="color:var(--text-muted);font-weight:400;font-size:0.8125rem">or code above</span></label>
        <input type="url" name="link" placeholder="https://…" value="${esc(r?.link||'')}">
        <span class="form-hint">Use this when there's no code, just a signup link</span>
      </div>
      <div class="form-group">
        <label>Benefit for New User</label>
        <input type="text" name="benefitNew" placeholder="e.g. €10 welcome bonus" value="${esc(r?.benefitNew||'')}">
      </div>
      <div class="form-group">
        <label>Benefit for You (Referrer)</label>
        <input type="text" name="benefitReferrer" placeholder="e.g. €5 for each signup" value="${esc(r?.benefitReferrer||'')}">
      </div>
      <div class="form-group">
        <label>Terms &amp; Conditions</label>
        <textarea name="terms" placeholder="e.g. New customers only, one code per household, valid 30 days">${esc(r?.terms||'')}</textarea>
      </div>
      <div class="form-group">
        <label>Who can see this?</label>
        <select name="visibility">
          <option value="public" ${(r?.visibility||'public')==='public'?'selected':''}>Public (visible to everyone)</option>
          <option value="friends" ${r?.visibility==='friends'?'selected':''}>Friends only (visible to people you follow)</option>
          <option value="private" ${r?.visibility==='private'?'selected':''}>Private (only you)</option>
        </select>
        <span class="form-hint">Public codes are shown in the community feed</span>
      </div>
      <div class="form-group">
        <label>Expiry Date</label>
        <input type="date" name="expirationDate" value="${esc(r?.expirationDate||'')}">
        <span class="form-hint">Leave blank if the code has no expiry</span>
      </div>
      <div style="display:flex;gap:10px;margin-top:4px">
        <button type="button" class="btn btn-ghost btn-full" data-nav="referrals">Cancel</button>
        <button type="submit" class="btn btn-primary btn-full">${r ? 'Save Changes' : 'Save Code'}</button>
      </div>
    </form>
  </main>
  ${renderBottomNav()}`;
}

/* ============================================================
   VIEW: FRIENDS
   ============================================================ */
function viewFriends() {
  const friends  = state.friends;
  const pending  = state.pendingRequests;

  return `
  ${renderHeader('Friends', 'profile')}
  <main class="content">
    <form id="form-add-friend">
      <div class="form-group">
        <label>Send Friend Request</label>
        <div style="display:flex;gap:8px">
          <input type="email" name="email" placeholder="friend@example.com" style="flex:1;padding:11px 14px;border:1.5px solid var(--border);border-radius:10px;font-size:0.9375rem;outline:none">
          <button type="submit" class="btn btn-primary">${icon.plus2} Send</button>
        </div>
        <span class="form-hint">They must have a VoucherWise account. They will need to accept your request.</span>
        <div id="friend-error" class="error-msg" style="display:none;margin-top:8px"></div>
      </div>
    </form>

    ${pending.length > 0 ? `
    <div class="divider"></div>
    <h3 style="margin-bottom:12px">Pending requests (${pending.length})</h3>
    <div class="settings-list">
      ${pending.map(r => `
      <div class="settings-item">
        <div class="si-icon" style="background:${brandColor(r.name)};border-radius:10px">
          <span style="color:white;font-weight:700;font-size:14px">${esc(initial(r.name))}</span>
        </div>
        <div class="si-text">
          <div class="si-title">${esc(r.name)}</div>
          <div class="si-subtitle">${esc(r.email)}</div>
        </div>
        <div style="display:flex;gap:6px">
          <button class="btn btn-sm btn-primary" data-action="accept-request" data-id="${esc(r.id)}">Accept</button>
          <button class="btn btn-sm btn-danger"  data-action="decline-request" data-id="${esc(r.id)}">Decline</button>
        </div>
      </div>`).join('')}
    </div>` : ''}

    <div class="divider"></div>

    <h3 style="margin-bottom:12px">Friends (${friends.length})</h3>

    ${friends.length > 0
      ? `<div class="settings-list">
          ${friends.map(f => `
          <div class="settings-item">
            <div class="si-icon" style="background:${brandColor(f.name)};border-radius:10px">
              <span style="color:white;font-weight:700;font-size:14px">${esc(initial(f.name))}</span>
            </div>
            <div class="si-text">
              <div class="si-title">${esc(f.name)}</div>
              <div class="si-subtitle">${esc(f.email)}</div>
            </div>
            <button class="btn btn-sm btn-danger" data-action="unfollow" data-id="${esc(f.id)}">Remove</button>
          </div>`).join('')}
        </div>`
      : `<div class="empty-state" style="padding:32px 0">
           <div class="empty-icon">${icon.users}</div>
           <h3>No friends yet</h3>
           <p>Send a friend request by entering their email above</p>
         </div>`
    }
  </main>
  ${renderBottomNav()}`;
}

/* ============================================================
   VIEW: PROFILE
   ============================================================ */
function viewProfile() {
  const u           = state.currentUser;
  const vouchers    = state.vouchers;
  const activeOnly  = vouchers.filter(v => getStatus(v) === 'active');
  const expiring    = vouchers.filter(v => getStatus(v) === 'expiring');
  const listed      = vouchers.filter(v => getStatus(v) === 'listed');
  const giftedVouchers = state.pendingGifts
    .map(g => vouchers.find(v => v.id === g.voucher_id))
    .filter(Boolean);
  const myListings  = state.listings.filter(l => l.sellerId === u.id);
  const myReferrals = state.referrals.filter(r => r.userId === u.id);
  const following   = state.friendIds.length;
  const valueOf     = list => list.reduce((s, v) => s + parseFloat((v.balance ?? v.value) || 0), 0);

  const kpiCard = (label, list, navView, navParams = {}) => `
    <button type="button" class="kpi-card" ${navView ? `data-nav="${navView}"` : ''} ${navParams.id ? `data-id="${esc(navParams.id)}"` : ''}>
      <div class="kpi-label">${label}</div>
      <div class="kpi-row">
        <div class="kpi-stat">
          <div class="kpi-value">${list.length}</div>
          <div class="kpi-unit">voucher${list.length !== 1 ? 's' : ''}</div>
        </div>
        <div class="kpi-stat">
          <div class="kpi-value">${formatCurrency(valueOf(list), 'EUR')}</div>
          <div class="kpi-unit">value</div>
        </div>
      </div>
    </button>`;

  return `
  ${renderHeader('Profile')}
  <main class="content">
    <div class="profile-header">
      <div class="profile-avatar" style="background:linear-gradient(150deg,#D6710A 0%,#F98513 100%)">${esc(initial(u.name))}</div>
      <div class="profile-name">${esc(u.name)}</div>
      <div class="profile-email">${esc(u.email)}</div>
    </div>

    <div class="kpi-grid">
      ${kpiCard('Active', activeOnly, 'vouchers')}
      ${kpiCard('Expiring', expiring, 'vouchers')}
      ${kpiCard('Listed', listed, 'marketplace')}
      ${kpiCard('Gifted', giftedVouchers, 'pending-gifts')}
    </div>

    <div class="settings-list">
      <button class="settings-item" data-nav="vouchers">
        <div class="si-icon" style="background:#CFF1E8">${navIcons.vouchers.replace(/currentColor/g,'#13B5A2')}</div>
        <div class="si-text"><div class="si-title">My Vouchers</div><div class="si-subtitle">${vouchers.length} total</div></div>
      </button>
      <button class="settings-item" data-nav="marketplace" data-marketplace-tab-init="mine">
        <div class="si-icon" style="background:#CFF1E8">${navIcons.marketplace.replace(/currentColor/g,'#13B5A2')}</div>
        <div class="si-text"><div class="si-title">My Listings</div><div class="si-subtitle">${myListings.length} active</div></div>
      </button>
      <button class="settings-item" data-nav="referrals" data-referral-tab-init="mine">
        <div class="si-icon" style="background:#CFF1E8">${navIcons.referrals.replace(/currentColor/g,'#13B5A2')}</div>
        <div class="si-text"><div class="si-title">Referral Codes</div><div class="si-subtitle">${myReferrals.length} codes, ${myReferrals.reduce((s,r)=>s+(r.usedCount||0),0)} total uses</div></div>
      </button>
      <button class="settings-item" data-nav="friends">
        <div style="position:relative;display:inline-flex">
          <div class="si-icon" style="background:#CFF1E8;color:#13B5A2">${icon.users}</div>
          ${state.pendingRequests.length > 0 ? `<span style="position:absolute;top:-2px;right:-2px;width:8px;height:8px;background:#e53e3e;border-radius:50%;border:1.5px solid #fff"></span>` : ''}
        </div>
        <div class="si-text">
          <div class="si-title">Friends</div>
          <div class="si-subtitle">${state.friendIds.length} friends${state.pendingRequests.length > 0 ? ` · <span style="color:#e53e3e;font-weight:600">${state.pendingRequests.length} pending</span>` : ''}</div>
        </div>
      </button>
      <button class="settings-item" data-nav="pending-gifts">
        <div class="si-icon" style="background:#CFF1E8;color:#13B5A2">${icon.gift}</div>
        <div class="si-text"><div class="si-title">Pending Gifts</div><div class="si-subtitle">${state.pendingGifts.length} waiting to be claimed</div></div>
      </button>
    </div>

    <div class="settings-list" style="margin-top:16px">
      <button class="settings-item" data-action="toggle-push" id="btn-push-toggle">
        <div class="si-icon" style="background:#FFF3E0">${icon.bell}</div>
        <div class="si-text"><div class="si-title">Push Notifications</div><div class="si-subtitle" id="push-status-label">Loading…</div></div>
        <div class="push-toggle" id="push-toggle-track"><div class="push-toggle-thumb"></div></div>
      </button>
      <button class="settings-item danger" data-action="logout">
        <div class="si-icon" style="background:var(--danger-light)">${icon.logout}</div>
        <div class="si-text"><div class="si-title">Log Out</div></div>
      </button>
    </div>

  </main>
  ${renderBottomNav()}`;
}

/* ============================================================
   CONFIRM DIALOG
   ============================================================ */
function showConfirm({ title, message, confirmLabel, confirmClass = 'btn-danger', onConfirm }) {
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `
  <div class="dialog">
    <h3>${esc(title)}</h3>
    <p>${esc(message)}</p>
    <div class="dialog-actions">
      <button class="btn btn-ghost" id="dialog-cancel">Cancel</button>
      <button class="btn ${confirmClass}" id="dialog-confirm">${esc(confirmLabel)}</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#dialog-cancel').addEventListener('click', () => overlay.remove());
  overlay.querySelector('#dialog-confirm').addEventListener('click', () => { overlay.remove(); onConfirm(); });
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

// "+" tap: offers photo/file capture (which kicks off startVoucherScan)
// alongside a plain manual-entry path.
//
// Just one file input, not one per source: on mobile browsers, any file
// input that accepts images (without a `capture` attribute) already opens
// the OS's own combined sheet with Take Photo / Photo Library / Browse
// Files as options — so a separate "Take Photo" button just duplicated a
// choice the native sheet already offers. Let the OS handle that split.
function showAddVoucherMenu() {
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `
  <div class="dialog">
    <h3>Add Voucher</h3>
    <p>Scan a photo or PDF to auto-fill the details, or enter them yourself.</p>
    <div class="dialog-actions" style="flex-direction:column;gap:8px">
      <button type="button" class="btn btn-primary btn-full" id="menu-choose-file">Photo or File</button>
      <button type="button" class="btn btn-ghost btn-full" id="menu-manual-entry">Manual Entry</button>
    </div>
    <input type="file" id="menu-file-input" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf" style="display:none">
  </div>`;
  document.body.appendChild(overlay);

  const closeMenu = () => overlay.remove();
  overlay.addEventListener('click', e => { if (e.target === overlay) closeMenu(); });
  overlay.querySelector('#menu-manual-entry').addEventListener('click', () => { closeMenu(); go('voucher-form'); });
  overlay.querySelector('#menu-choose-file').addEventListener('click', () => overlay.querySelector('#menu-file-input').click());

  overlay.querySelectorAll('input[type=file]').forEach(input => {
    input.addEventListener('change', () => {
      const file = input.files[0];
      input.value = '';
      if (!file) return;
      const mimeType = resolveMimeType(file);
      if (!ALLOWED_FILE_TYPES.includes(mimeType)) { showToast('Unsupported file type'); return; }
      if (file.size > 10 * 1024 * 1024) { showToast(`${file.name} is over 10MB`); return; }
      closeMenu();
      startVoucherScan(file, mimeType);
    });
  });
}

/* ============================================================
   VIEW: RESET PASSWORD (from recovery email link)
   ============================================================ */
function viewResetPassword() {
  return `
  <div class="auth-screen">
    <div class="auth-logo">
      <div class="logo-mark">
        <svg width="72" height="72" viewBox="0 0 72 72" fill="none">
          <rect width="72" height="72" rx="18" fill="#13B5A2"/>
          <rect x="11" y="8" width="50" height="30" rx="9" fill="#2BD4BE" opacity="0.6"/>
          <rect x="6" y="26" width="60" height="38" rx="11" fill="white"/>
          <rect x="38" y="35" width="22" height="14" rx="7" fill="#11233F"/>
        </svg>
      </div>
      <h1>Set New Password</h1>
      <p>Choose a new password for your account.</p>
    </div>
    <form id="form-reset-password" class="auth-form">
      <div id="reset-error" class="error-msg" style="display:none"></div>
      ${pwField('reset-password', 'password', 'New Password', 'Min. 6 characters', 'new-password')}
      ${pwField('reset-password-confirm', 'passwordConfirm', 'Confirm Password', 'Re-enter password', 'new-password')}
      <button type="submit" class="btn btn-primary btn-full">Update Password</button>
    </form>
  </div>`;
}

/* ============================================================
   MAIN RENDER
   ============================================================ */
function viewForgotPassword() {
  return `
  <div class="auth-screen">
    <div class="auth-logo">
      <div class="logo-mark">
        <svg width="72" height="72" viewBox="0 0 72 72" fill="none">
          <rect width="72" height="72" rx="18" fill="#13B5A2"/>
          <rect x="11" y="8" width="50" height="30" rx="9" fill="#2BD4BE" opacity="0.6"/>
          <rect x="6" y="26" width="60" height="38" rx="11" fill="white"/>
          <rect x="38" y="35" width="22" height="14" rx="7" fill="#11233F"/>
        </svg>
      </div>
      <h1>Reset Password</h1>
      <p>Enter your email and we'll send you a reset link.</p>
    </div>
    <form id="form-forgot" class="auth-form">
      <div id="forgot-error" class="error-msg" style="display:none"></div>
      <div id="forgot-success" style="display:none;background:var(--success-light);color:var(--success);border-radius:10px;padding:12px 14px;font-size:0.875rem;text-align:center;margin-bottom:12px"></div>
      <div class="form-group">
        <label>Email</label>
        <input type="email" name="email" placeholder="you@example.com" required autocomplete="email">
      </div>
      <button type="submit" class="btn btn-primary btn-full">Send Reset Link</button>
    </form>
    <button class="btn btn-ghost btn-full" style="margin-top:8px" data-nav="auth" data-tab="login">Back to Log In</button>
  </div>`;
}

function viewVerifyEmail() {
  const email = state.params?.email || '';
  return `
  <div class="auth-screen">
    <div class="auth-logo">
      <div class="logo-mark">
        <svg width="72" height="72" viewBox="0 0 72 72" fill="none">
          <rect width="72" height="72" rx="18" fill="#13B5A2"/>
          <rect x="11" y="8" width="50" height="30" rx="9" fill="#2BD4BE" opacity="0.6"/>
          <rect x="6" y="26" width="60" height="38" rx="11" fill="white"/>
          <rect x="38" y="35" width="22" height="14" rx="7" fill="#11233F"/>
        </svg>
      </div>
      <h1>Check your email</h1>
      <p>We sent a confirmation link to<br><strong>${esc(email)}</strong></p>
    </div>
    <div style="text-align:center;padding:24px 0;color:var(--text-muted);font-size:0.9rem">
      Click the link in the email to activate your account.<br>This page will update automatically.
    </div>
    <button class="btn btn-primary btn-full" id="btn-resend-email" data-action="resend-email">Resend Email</button>
    <div id="resend-msg" style="text-align:center;margin-top:10px;font-size:0.875rem;min-height:20px"></div>
    <button class="btn btn-ghost btn-full" style="margin-top:8px" data-nav="auth" data-tab="login">Back to Log In</button>
  </div>`;
}

const VIEWS = {
  welcome:          viewWelcome,
  auth:             viewAuth,
  'verify-email':   viewVerifyEmail,
  'forgot-password': viewForgotPassword,
  'reset-password':  viewResetPassword,
  home:             viewHome,
  vouchers:         viewVouchers,
  'pending-gifts':  viewPendingGifts,
  'voucher-form':   viewVoucherForm,
  'voucher-detail': viewVoucherDetail,
  marketplace:      viewMarketplace,
  'listing-detail': viewListingDetail,
  referrals:        viewReferrals,
  'referral-form':  viewReferralForm,
  friends:          viewFriends,
  profile:          viewProfile,
};

function render() {
  const el = document.getElementById('app');
  if (!el) return;
  el.innerHTML = (!state.currentUser ? (VIEWS[state.view] || viewAuth)() : (VIEWS[state.view] || viewHome)());
  attachListeners();
  if (state.view === 'profile') updatePushStatusLabel();
  if (state.view === 'voucher-form') loadVoucherFormAttachmentThumbs();
  if (state.view === 'voucher-detail') loadVoucherDetailBarcode();
  if (state.view === 'voucher-form' && pendingExtractionEntry) {
    // AI fields and the barcode crop are already resolved by startVoucherScan
    // before this render — just apply the fields (the barcode preview is
    // already part of the template itself, via pendingBarcode).
    pendingExtractionEntry = null; // consume once so re-renders (e.g. brand typing) don't re-apply
    if (pendingExtractionResult) applyExtractedFields(pendingExtractionResult);
    pendingExtractionResult = null;
  }
}

async function loadVoucherFormAttachmentThumbs() {
  const imgs = document.querySelectorAll('#attachment-grid .attachment-thumb[data-path], #barcode-preview .barcode-thumb[data-path]');
  for (const img of imgs) {
    const url = await getVoucherFileUrl(img.dataset.path);
    if (url) img.src = url;
  }
}

async function loadVoucherDetailBarcode() {
  const img = document.querySelector('.barcode-display img[data-path]');
  if (!img) return;
  const url = await getVoucherFileUrl(img.dataset.path);
  if (url) img.src = url;
}

async function updatePushStatusLabel() {
  const label  = document.getElementById('push-status-label');
  const track  = document.getElementById('push-toggle-track');
  if (!label) return;
  const status = await getPushStatus();
  if (status === 'unsupported') {
    label.textContent = 'Not supported on this device';
    if (track) track.classList.remove('on');
  } else if (status === 'denied') {
    label.textContent = 'Blocked in system settings';
    if (track) track.classList.remove('on');
  } else if (status === 'subscribed') {
    label.textContent = 'Reminders are enabled';
    if (track) track.classList.add('on');
  } else {
    label.textContent = 'Tap to enable reminders';
    if (track) track.classList.remove('on');
  }
}

/* ============================================================
   EVENT LISTENERS
   ============================================================ */
let _listenersAttached = false;
let pendingNewFiles  = []; // [{ localId, file, mimeType, kind: 'image'|'pdf', previewUrl }] chosen in the voucher form, not yet uploaded
let removedFileIds   = []; // ids of existing voucher_files rows queued for deletion on save
let pendingExtractionFile   = null; // { file, mimeType } picked from the add-voucher menu, staged for go('voucher-form') to attach
let pendingExtractionEntry  = null; // the pendingNewFiles entry whose AI-extracted fields still need applying after render
let pendingExtractionResult = null; // fields already resolved by startVoucherScan, applied on the next voucher-form render
let pendingBarcode  = null; // { blob, previewUrl } newly detected barcode/QR crop, not yet uploaded
let barcodeRemoved  = false; // true if the user removed the current/existing barcode this session
let barcodeScanState = null; // null | 'scanning' | 'missing' — shown inline so a failed/in-progress scan is never silent

function showBrandSuggestions(value) {
  const el = document.getElementById('brand-suggestions');
  if (!el) return;
  const q = (value || '').toLowerCase();
  const filtered = q
    ? state.brands.filter(b => b.name.toLowerCase().includes(q)).slice(0, 20)
    : state.brands.slice(0, 20);
  if (filtered.length === 0) { el.style.display = 'none'; return; }
  el.innerHTML = filtered.map(b => {
    const logoUrl = getBrandLogo(b.name);
    const logoHtml = logoUrl
      ? `<img src="${esc(logoUrl)}" alt="" onerror="this.style.display='none'" style="width:22px;height:22px;object-fit:contain;margin-right:10px;flex-shrink:0;border-radius:3px">`
      : `<div style="width:22px;height:22px;background:#13B5A2;border-radius:5px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:10px;font-weight:700;margin-right:10px;flex-shrink:0">${esc(initial(b.name))}</div>`;
    return `<div data-brand-opt="${esc(b.name)}" data-brand-cat="${esc(b.category||'')}" style="padding:10px 14px;cursor:pointer;font-size:0.9375rem;border-bottom:1px solid var(--border-light,#f0f0f0);display:flex;align-items:center">${logoHtml}${esc(b.name)}</div>`;
  }).join('');
  el.style.display = 'block';
}

function attachListeners() {
  if (_listenersAttached) return;
  _listenersAttached = true;
  document.addEventListener('click',    handleClick,   true);
  document.addEventListener('submit',   handleSubmit,  true);
  document.addEventListener('input',    handleInput,   true);
  document.addEventListener('change',   handleChange,  true);
  document.addEventListener('focusin',  handleFocusIn, true);
  document.addEventListener('focusout', handleFocusOut,true);
}

function handleFocusIn(e) {
  if (e.target.closest('[data-brand-ac]')) showBrandSuggestions(e.target.value);
}

function handleFocusOut(e) {
  if (e.target.closest('[data-brand-ac]')) {
    setTimeout(() => {
      const el = document.getElementById('brand-suggestions');
      if (el) el.style.display = 'none';
    }, 200);
  }
}

function handleClick(e) {
  const brandOpt = e.target.closest('[data-brand-opt]');
  if (brandOpt) {
    const input = document.querySelector('[data-brand-ac]');
    if (input) input.value = brandOpt.dataset.brandOpt;
    // Auto-fill category select if present and brand has a category
    const catSel = document.getElementById('brand-category');
    if (catSel && brandOpt.dataset.brandCat) {
      const opt = [...catSel.options].find(o => o.value === brandOpt.dataset.brandCat);
      if (opt) catSel.value = brandOpt.dataset.brandCat;
    }
    const el = document.getElementById('brand-suggestions');
    if (el) el.style.display = 'none';
    e.preventDefault();
    return;
  }

  const pwBtn = e.target.closest('[data-pw-id]');
  if (pwBtn) {
    const input = document.getElementById(pwBtn.dataset.pwId);
    if (input) {
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      pwBtn.innerHTML = show ? icon.eyeOff : icon.eye;
    }
    return;
  }

  const navEl = e.target.closest('[data-nav]');
  if (navEl) {
    e.preventDefault();
    const view = navEl.dataset.nav;
    const params = {};
    if (navEl.dataset.id) params.id = navEl.dataset.id;
    if (navEl.dataset.tab) {
      state.view = view;
      state.params = { tab: navEl.dataset.tab };
      render();
      return;
    }
    if (navEl.dataset.marketplaceTabInit) state.marketplaceTab = navEl.dataset.marketplaceTabInit;
    if (navEl.dataset.referralTabInit)    state.referralTab    = navEl.dataset.referralTabInit;
    go(view, params);
    return;
  }

  const chipEl = e.target.closest('[data-filter]');
  if (chipEl) { state.activeFilter = chipEl.dataset.filter; render(); return; }

  const mktTab = e.target.closest('[data-marketplace-tab]');
  if (mktTab) { state.marketplaceTab = mktTab.dataset.marketplaceTab; render(); return; }

  const refTab = e.target.closest('[data-referral-tab]');
  if (refTab) { state.referralTab = refTab.dataset.referralTab; render(); return; }

  const refCat = e.target.closest('[data-referral-cat]');
  if (refCat) { state.referralCategoryFilter = refCat.dataset.referralCat; render(); return; }

  const refBrand = e.target.closest('[data-referral-brand]');
  if (refBrand) { state.referralBrandFilter = refBrand.dataset.referralBrand; render(); return; }

  const actionEl = e.target.closest('[data-action]');
  if (actionEl) { handleAction(actionEl, e); return; }
}

async function handleAction(el, e) {
  const action = el.dataset.action;
  const id     = el.dataset.id;

  switch (action) {
    case 'copy':
      e.preventDefault();
      copyText(el.dataset.copy, el.dataset.toast || 'Copied!');
      break;

    case 'copy-voucher-code':
      e.preventDefault();
      copyText(el.dataset.copy, 'Code copied!');
      incrementCopyCount(id);
      render();
      break;

    case 'mark-used':
      showConfirm({ title: 'Mark as Used?', message: 'This will move the voucher out of your active wallet.', confirmLabel: 'Mark Used', confirmClass: 'btn-success', onConfirm: () => markUsed(id) });
      break;

    case 'mark-unused':
      markUnused(id);
      break;

    case 'show-sell':
      state.params = { id, sellForm: true };
      render();
      break;

    case 'hide-sell':
      state.params = { id };
      render();
      break;

    case 'show-deduct':
      state.params = { id, deductForm: true };
      render();
      break;

    case 'hide-deduct':
      state.params = { id };
      render();
      break;

    case 'show-reminder':
      state.params = { id, reminderForm: true };
      render();
      break;

    case 'hide-reminder':
      state.params = { id };
      render();
      break;

    case 'dismiss-reminder':
      dismissReminder(id);
      break;

    case 'unlist':
      showConfirm({ title: 'Remove Listing?', message: 'Your voucher will be removed from the marketplace.', confirmLabel: 'Remove', onConfirm: () => unlist(id) });
      break;

    case 'clear-expiry-date': {
      e.preventDefault();
      const input = document.getElementById('voucher-expiry-input');
      if (input) input.value = '';
      break;
    }

    case 'send-gift':
      showConfirm({
        title: 'Send this voucher?',
        message: "It'll leave your wallet and you'll get a QR code / link to share. Your friend receives it the moment they claim it, even if they don't have an account yet.",
        confirmLabel: 'Send',
        confirmClass: 'btn-primary',
        onConfirm: () => sendVoucherGift(id),
      });
      break;

    case 'cancel-gift':
      showConfirm({ title: 'Cancel this gift?', message: 'The voucher will move back into your wallet and the link will stop working.', confirmLabel: 'Cancel Gift', onConfirm: () => cancelVoucherGift(id) });
      break;

    case 'show-gift-qr': {
      const v = state.vouchers.find(x => x.id === el.dataset.voucherId);
      if (v) showGiftShareScreen(id, v);
      break;
    }

    case 'confirm-delete':
      showConfirm({ title: 'Delete Voucher?', message: 'This cannot be undone.', confirmLabel: 'Delete', onConfirm: () => deleteVoucher(id) });
      break;

    case 'pick-photo': {
      e.preventDefault();
      const input = document.getElementById('voucher-file-input');
      if (input) input.click();
      break;
    }

    case 'add-voucher-menu':
      e.preventDefault();
      showAddVoucherMenu();
      break;

    case 'remove-existing-file': {
      e.preventDefault();
      removedFileIds.push(el.dataset.fileId);
      el.closest('.attachment-tile')?.remove();
      break;
    }

    case 'remove-pending-file': {
      e.preventDefault();
      const localId = el.dataset.localId;
      const entry = pendingNewFiles.find(f => f.localId === localId);
      if (entry?.previewUrl) URL.revokeObjectURL(entry.previewUrl);
      pendingNewFiles = pendingNewFiles.filter(f => f.localId !== localId);
      el.closest('.attachment-tile')?.remove();
      break;
    }

    case 'view-attachment': {
      e.preventDefault();
      const url = await getVoucherFileUrl(el.dataset.path);
      if (url) window.open(url, '_blank', 'noopener');
      else showToast('Could not open file');
      break;
    }

    case 'remove-barcode': {
      e.preventDefault();
      if (pendingBarcode?.previewUrl) URL.revokeObjectURL(pendingBarcode.previewUrl);
      pendingBarcode   = null;
      barcodeRemoved   = true;
      barcodeScanState = null;
      renderBarcodeGroupNow(state.vouchers.find(x => x.id === state.params.id));
      break;
    }

    case 'edit-referral':
      go('referral-form', { id });
      break;

    case 'delete-referral':
      showConfirm({ title: 'Delete Referral Code?', message: 'This code will be permanently removed.', confirmLabel: 'Delete', onConfirm: () => deleteReferral(id) });
      break;

    case 'increment-referral':
      incrementReferralUse(id);
      break;

    case 'vote-referral': {
      const vote = el.dataset.vote;
      state.referralVotes[id] = state.referralVotes[id] === vote ? null : vote;
      render();
      break;
    }

    case 'resend-email': {
      const email = state.params?.email;
      if (!email) break;
      const btn = document.getElementById('btn-resend-email');
      const msg = document.getElementById('resend-msg');
      if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
      const { error: rErr } = await supabase.auth.resend({ type: 'signup', email });
      if (btn) { btn.disabled = false; btn.textContent = 'Resend Email'; }
      if (msg) {
        if (rErr) { msg.style.color = 'var(--danger)'; msg.textContent = rErr.message; }
        else { msg.style.color = 'var(--success)'; msg.textContent = 'Email sent! Check your inbox.'; }
      }
      break;
    }

    case 'clear-referral-brand':
      state.referralBrandFilter = null;
      render();
      break;

    case 'remove-listing': {
      const vId = el.dataset.voucherId;
      showConfirm({ title: 'Remove Listing?', message: 'This listing will be removed from the marketplace.', confirmLabel: 'Remove', onConfirm: async () => {
        const { error: lErr } = await supabase.from('marketplace_listings').update({ status: 'cancelled' }).eq('id', id);
        if (lErr) { console.error('remove-listing error:', lErr); showToast('Error removing listing'); return; }
        if (vId) {
          const { error: vErr } = await supabase.from('vouchers').update({ status: 'active' }).eq('id', vId);
          if (vErr) { console.error('remove-listing voucher error:', vErr); showToast('Error removing listing'); return; }
        }
        showToast('Listing removed');
        go('marketplace');
      }});
      break;
    }

    case 'unfollow':
      removeFriend(id);
      break;

    case 'accept-request':
      acceptFriendRequest(id);
      break;

    case 'decline-request':
      declineFriendRequest(id);
      break;

    case 'toggle-push': {
      const status = await getPushStatus();
      if (status === 'unsupported') { showToast('Not supported on this device'); break; }
      if (status === 'denied') { showToast('Enable notifications in your browser/phone settings'); break; }
      if (status === 'subscribed') {
        await unsubscribeFromPush();
      } else {
        await subscribeToPush();
      }
      updatePushStatusLabel();
      break;
    }

    case 'logout':
      showConfirm({ title: 'Log Out?', message: 'You will be returned to the login screen.', confirmLabel: 'Log Out', onConfirm: logout });
      break;
  }
}

function handleInput(e) {
  const searchEl = e.target.closest('[data-search]');
  if (searchEl) {
    const type = searchEl.dataset.search;
    const val  = searchEl.value;
    state.searchQuery = val;
    render();
    const restored = document.querySelector(`[data-search="${type}"]`);
    if (restored) { restored.focus(); restored.setSelectionRange(val.length, val.length); }
    return;
  }

  if (e.target.closest('[data-brand-ac]')) { showBrandSuggestions(e.target.value); }
}

function handleChange(e) {
  const sortEl = e.target.closest('[data-sort]');
  if (sortEl) { state.activeSort = sortEl.value; render(); }

  if (e.target.id === 'voucher-file-input') {
    const grid = document.getElementById('attachment-grid');
    const addTile = grid?.querySelector('.attachment-add');
    const existingBarcodePath = state.params.id ? (state.vouchers.find(v => v.id === state.params.id)?.barcodePath || null) : null;
    for (const file of e.target.files) {
      const mimeType = resolveMimeType(file);
      if (!ALLOWED_FILE_TYPES.includes(mimeType)) { showToast('Unsupported file type'); continue; }
      if (file.size > 10 * 1024 * 1024) { showToast(`${file.name} is over 10MB`); continue; }
      const kind = fileKind(mimeType);
      const entry = { localId: randomId(), file, mimeType, kind, previewUrl: kind === 'image' ? URL.createObjectURL(file) : null };
      pendingNewFiles.push(entry);
      if (addTile) addTile.insertAdjacentHTML('beforebegin', attachmentTileHtml(entry));
      maybeAutoDetectBarcode(file, mimeType, existingBarcodePath);
    }
    e.target.value = '';
  }
}

async function handleSubmit(e) {
  e.preventDefault();
  const form = e.target;

  if (form.id === 'form-login') {
    const d = formData(form);
    const btn = form.querySelector('[type=submit]');
    if (btn) { btn.disabled = true; btn.textContent = 'Logging in…'; }
    const err = await login(d.email, d.password);
    if (err) {
      const el = form.querySelector('#auth-error');
      if (el) { el.textContent = err; el.style.display = ''; }
      if (btn) { btn.disabled = false; btn.textContent = 'Log In'; }
    }
    return;
  }

  if (form.id === 'form-signup') {
    const d = formData(form);
    const btn = form.querySelector('[type=submit]');
    if (btn) { btn.disabled = true; btn.textContent = 'Creating account…'; }
    const err = await register(d.name, d.email, d.password);
    if (err) {
      const el = form.querySelector('#auth-error');
      if (el) { el.textContent = err; el.style.display = ''; }
      if (btn) { btn.disabled = false; btn.textContent = 'Create Account'; }
    }
    return;
  }

  if (form.id === 'form-forgot') {
    const d = formData(form);
    const btn = form.querySelector('[type=submit]');
    const errEl = document.getElementById('forgot-error');
    const okEl  = document.getElementById('forgot-success');
    if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
    const { error } = await supabase.auth.resetPasswordForEmail(d.email, {
      redirectTo: `${window.location.origin}${import.meta.env.BASE_URL}`,
    });
    if (btn) { btn.disabled = false; btn.textContent = 'Send Reset Link'; }
    if (error) {
      if (errEl) { errEl.textContent = error.message; errEl.style.display = ''; }
    } else {
      if (errEl) errEl.style.display = 'none';
      if (okEl)  { okEl.textContent = 'Check your email for a password reset link.'; okEl.style.display = ''; }
      form.querySelector('input[type=email]').disabled = true;
      if (btn) btn.style.display = 'none';
    }
    return;
  }

  if (form.id === 'form-reset-password') {
    const d = formData(form);
    const btn = form.querySelector('[type=submit]');
    const errEl = document.getElementById('reset-error');
    if (d.password.length < 6) { if (errEl) { errEl.textContent = 'Password must be at least 6 characters.'; errEl.style.display = ''; } return; }
    if (d.password !== d.passwordConfirm) { if (errEl) { errEl.textContent = 'Passwords do not match.'; errEl.style.display = ''; } return; }
    if (errEl) errEl.style.display = 'none';
    if (btn) { btn.disabled = true; btn.textContent = 'Updating…'; }
    const { error } = await supabase.auth.updateUser({ password: d.password });
    if (error) {
      if (errEl) { errEl.textContent = error.message; errEl.style.display = ''; }
      if (btn) { btn.disabled = false; btn.textContent = 'Update Password'; }
      return;
    }
    showToast('Password updated');
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      state.currentUser = mapUser(session.user);
      state.view = 'home';
      await fetchVouchers();
      await Promise.all([fetchBrands(), fetchListings(), fetchFriendIds(), fetchPendingRequests(), fetchReminders()]);
      render();
    } else {
      go('auth');
    }
    return;
  }

  if (form.id === 'form-voucher') {
    const d = formData(form);
    const amount  = normalizeAmount(d.amount);
    const balance = d.balance !== '' ? normalizeAmount(d.balance) : null;
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) { showToast('Enter a valid amount'); return; }
    if (balance !== null && (isNaN(parseFloat(balance)) || parseFloat(balance) < 0)) { showToast('Enter a valid balance'); return; }
    const btn = form.querySelector('[type=submit]');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    const data = {
      brand:       d.brand.trim(),
      value:       amount,
      balance:     balance,
      expiryDate:  d.expiryDate || null,
      code:        d.code.trim(),
      pin:         d.pin.trim(),
      notes:       d.notes.trim(),
      category:    d.category || 'Other',
      voucherType: d.voucherType || 'gift_card',
    };
    if (d.voucherId) data.id = d.voucherId;
    const existingBarcodePath = d.voucherId ? (state.vouchers.find(v => v.id === d.voucherId)?.barcodePath || null) : null;
    try {
      if (pendingBarcode) {
        data.barcodePath = await uploadBarcodeBlob(pendingBarcode.blob);
      } else if (barcodeRemoved) {
        data.barcodePath = null;
      }

      const voucherId = await saveVoucher(data);

      for (const fileId of removedFileIds) {
        const f = state.voucherFiles.find(x => x.id === fileId);
        await supabase.from('voucher_files').delete().eq('id', fileId);
        if (f) deleteVoucherFileObject(f.file_path);
      }

      const keptCount = state.voucherFiles.length - removedFileIds.length;
      for (let i = 0; i < pendingNewFiles.length; i++) {
        const entry = pendingNewFiles[i];
        const path = await uploadVoucherFile(entry.file, entry.mimeType);
        const { error: fileErr } = await supabase.from('voucher_files').insert({
          voucher_id: voucherId,
          user_id:    state.currentUser.id,
          file_path:  path,
          file_type:  entry.kind,
          position:   keptCount + i,
        });
        if (fileErr) { console.error('voucher_files insert error:', fileErr); throw fileErr; }
        if (entry.previewUrl) URL.revokeObjectURL(entry.previewUrl);
      }

      if (existingBarcodePath && data.barcodePath !== undefined && data.barcodePath !== existingBarcodePath) {
        deleteVoucherFileObject(existingBarcodePath);
      }
      if (pendingBarcode?.previewUrl) URL.revokeObjectURL(pendingBarcode.previewUrl);
      pendingBarcode  = null;
      barcodeRemoved  = false;

      pendingNewFiles = [];
      removedFileIds  = [];
      showToast(data.id ? 'Voucher updated' : 'Voucher saved');
      go(data.id ? 'voucher-detail' : 'vouchers', data.id ? { id: voucherId } : {});
    } catch (err) {
      console.error('saveVoucher exception:', err);
      showToast('Error saving voucher');
      if (btn) { btn.disabled = false; btn.textContent = data.id ? 'Save Changes' : 'Add Voucher'; }
    }
    return;
  }

  if (form.id === 'form-sell') {
    const d = formData(form);
    const price = parseFloat(normalizeAmount(d.price));
    if (!price || price <= 0) return;
    listForSale(d.voucherId, price);
    return;
  }

  if (form.id === 'form-deduct') {
    const d = formData(form);
    if (!d.amount) return;
    await deductBalance(d.voucherId, normalizeAmount(d.amount));
    return;
  }

  if (form.id === 'form-reminder') {
    const d = formData(form);
    if (!d.reminderDateTime) return;
    const [date, time] = d.reminderDateTime.split('T');
    await setReminder(d.voucherId, date, time);
    return;
  }

  if (form.id === 'form-referral') {
    const d = formData(form);
    if (!d.brand.trim()) { showToast('Please enter a brand name'); return; }
    if (!d.code.trim() && !(d.link || '').trim()) { showToast('Please enter a referral code or link'); return; }
    const btn = form.querySelector('[type=submit]');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    const payload = {
      brand:           d.brand.trim(),
      brandCategory:   d.brandCategory || null,
      code:            d.code.trim(),
      link:            (d.link || '').trim(),
      benefitNew:      (d.benefitNew || '').trim(),
      benefitReferrer: (d.benefitReferrer || '').trim(),
      terms:           (d.terms || '').trim(),
      visibility:      d.visibility,
      expirationDate:  d.expirationDate || null,
    };
    if (d.referralId) {
      await updateReferral(d.referralId, payload);
    } else {
      await saveReferral(payload);
    }
    if (btn) { btn.disabled = false; btn.textContent = 'Save Code'; }
    return;
  }

  if (form.id === 'form-add-friend') {
    const d   = formData(form);
    const btn = form.querySelector('[type=submit]');
    if (btn) { btn.disabled = true; btn.textContent = 'Following…'; }
    const err = await addFriend(d.email);
    const errEl = form.querySelector('#friend-error');
    if (err) {
      if (errEl) { errEl.textContent = err; errEl.style.display = ''; }
      if (btn) { btn.disabled = false; btn.textContent = 'Follow'; }
    } else {
      if (errEl) errEl.style.display = 'none';
      form.reset();
      await go('friends');
    }
    return;
  }
}

/* ============================================================
   INIT
   ============================================================ */
// Redeems a voucher gift link. The id is stashed in localStorage (not just
// in-memory state) because an unauthenticated visitor has to go through
// signup — often including an email-confirmation round trip that reloads
// the page — before there's a session to claim it with.
// Gift box opens -> confetti bursts -> the voucher card is revealed. Resolves
// once the user dismisses it, so the caller's normal fetchVouchers()/render()
// flow only continues afterward — by the time it's gone, the voucher is
// already sitting in the wallet like any other.
function showGiftRevealAnimation(voucher) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'gift-reveal-overlay';
    overlay.innerHTML = `
      <div class="gift-reveal-stage">
        <div class="confetti-layer" id="gift-confetti"></div>
        <div class="gift-box" id="gift-reveal-box">
          <div class="gift-box-lid"><div class="gift-box-bow"></div></div>
          <div class="gift-box-base"><div class="gift-box-ribbon"></div></div>
        </div>
        <div class="gift-reveal-card" id="gift-reveal-card">
          <div class="gift-reveal-card-brand">${esc(voucher.brand)}</div>
          <div class="gift-reveal-card-value">${formatCurrency(voucher.value, voucher.currency)}</div>
        </div>
      </div>
      <h3 class="gift-reveal-caption">You received a gift!</h3>
      <p class="gift-reveal-subcaption">${esc(voucher.brand)} is now in your wallet.</p>
      <button type="button" class="btn btn-primary gift-reveal-continue" id="gift-reveal-continue" style="visibility:hidden">Awesome!</button>
    `;
    document.body.appendChild(overlay);

    const confettiLayer = overlay.querySelector('#gift-confetti');
    const colors = ['#13B5A2', '#F98513', '#2BD4BE', '#D6710A', '#FFFFFF'];
    for (let i = 0; i < 44; i++) {
      const piece = document.createElement('div');
      piece.className = 'confetti-piece';
      const angle = Math.random() * Math.PI * 2;
      const distance = 90 + Math.random() * 160;
      piece.style.setProperty('--x', `${Math.cos(angle) * distance}px`);
      piece.style.setProperty('--y', `${Math.sin(angle) * distance - 40}px`);
      piece.style.setProperty('--rot', `${Math.random() * 720 - 360}deg`);
      piece.style.setProperty('--delay', `${Math.random() * 0.15}s`);
      piece.style.background = colors[i % colors.length];
      confettiLayer.appendChild(piece);
    }

    const boxEl  = overlay.querySelector('#gift-reveal-box');
    const cardEl = overlay.querySelector('#gift-reveal-card');
    const continueBtn = overlay.querySelector('#gift-reveal-continue');

    setTimeout(() => boxEl.classList.add('open'), 450);
    setTimeout(() => confettiLayer.classList.add('burst'), 500);
    setTimeout(() => cardEl.classList.add('revealed'), 850);
    setTimeout(() => { continueBtn.style.visibility = ''; }, 1600);

    const finish = () => { overlay.remove(); resolve(); };
    continueBtn.addEventListener('click', finish);
    overlay.addEventListener('click', e => { if (e.target === overlay) finish(); });
  });
}

async function tryClaimPendingGift() {
  const giftId = localStorage.getItem('pendingGiftId');
  if (!giftId || !state.currentUser) return;
  localStorage.removeItem('pendingGiftId'); // clear regardless of outcome — avoid retry loops on a dead link
  const { data: voucherId, error } = await supabase.rpc('claim_voucher_gift', { p_gift_id: giftId });
  if (error) {
    console.error('claim_voucher_gift error:', error);
    setTimeout(() => showToast(error.message || 'This gift link is no longer valid'), 300);
    return;
  }
  const { data: row, error: fetchErr } = await supabase
    .from('vouchers')
    .select('brand, amount, currency')
    .eq('id', voucherId)
    .maybeSingle();
  if (fetchErr || !row) {
    setTimeout(() => showToast('🎁 You received a voucher from a friend!'), 300);
    return;
  }
  await showGiftRevealAnimation({ brand: row.brand, value: row.amount, currency: row.currency });
}

async function init() {
  // Detect email confirmation / password-reset / gift-claim links in URL
  const urlSearch = new URLSearchParams(window.location.search);
  const urlHash   = new URLSearchParams(window.location.hash.replace('#', '?'));
  const confirmType = urlSearch.get('type') || urlHash.get('type');
  const isEmailConfirm = confirmType === 'email' || confirmType === 'signup';
  const isRecovery    = confirmType === 'recovery';
  const authError     = urlHash.get('error') || urlSearch.get('error');
  const authErrorDesc = urlHash.get('error_description') || urlSearch.get('error_description');
  const giftId        = urlSearch.get('gift') || urlHash.get('gift');
  if (giftId) localStorage.setItem('pendingGiftId', giftId);
  if (isEmailConfirm || isRecovery || authError || giftId) window.history.replaceState(null, '', import.meta.env.BASE_URL);

  const { data: { session } } = await supabase.auth.getSession();
  if (isRecovery && session) {
    // Recovery link established a session — show the reset form, not Home
    state.view = 'reset-password';
  } else if (session) {
    state.currentUser = mapUser(session.user);
    state.view = 'home';
    await tryClaimPendingGift();
    // vouchers first so mapReminder can look up brand names
    await fetchVouchers();
    await Promise.all([fetchBrands(), fetchListings(), fetchFriendIds(), fetchPendingRequests(), fetchReminders(), fetchPendingGifts()]);
  } else if (authError) {
    state.view = 'forgot-password';
  } else {
    state.view = isEmailConfirm ? 'auth' : 'welcome';
    state.params = { tab: 'login' };
  }
  render();

  if (authError) {
    const msg = authErrorDesc
      ? authErrorDesc.replace(/\+/g, ' ')
      : 'This link is invalid or has expired. Please request a new one.';
    setTimeout(() => showToast(msg), 300);
  }

  if (isEmailConfirm && session) {
    setTimeout(() => showToast('Email confirmed! Welcome to VoucherWise.'), 300);
  }

  // Handle email confirmation / password-recovery links — session fires here if not already caught above
  supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === 'PASSWORD_RECOVERY') {
      state.view = 'reset-password';
      render();
      return;
    }
    if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session && !state.currentUser && state.view !== 'reset-password') {
      state.currentUser = mapUser(session.user);
      state.view = 'home';
      await tryClaimPendingGift();
      await fetchVouchers();
      await Promise.all([fetchBrands(), fetchListings(), fetchFriendIds(), fetchPendingRequests(), fetchReminders(), fetchPendingGifts()]);
      render();
      if (isEmailConfirm) {
        setTimeout(() => showToast('Email confirmed! Welcome to VoucherWise.'), 300);
      }
    }
  });
}

init();
