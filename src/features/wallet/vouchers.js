// Voucher CRUD: Supabase <-> frontend field mapping, fetch, save/delete,
// status transitions (mark used/unused), and file attachment storage.
// Listing-for-sale/unlisting live in features/marketplace/ instead — they
// mutate a voucher's status too, but own the marketplace_listings side.
//
// `go` (router) still lives in app.js at this point in the module split —
// imported from there for now, repointed once core/router.js exists.
import { supabase } from '../../lib/supabase.js';
import { state } from '../../core/state.js';
import { esc, daysUntil, formatCurrency } from '../../core/dom.js';
import { showToast } from '../../core/toast.js';
import { getBrandByName, ensureBrand } from '../../core/brands.js';
import { go } from '../../core/router.js';

/* ============================================================
   VOUCHER FIELD MAPPING (Supabase ↔ frontend)
   ============================================================ */
export function mapVoucher(row) {
  return {
    id:               row.id,
    userId:           row.user_id,
    brand:            row.brand,
    brandId:          row.brand_id || null,
    value:            row.amount != null ? String(row.amount) : '',
    valueDescription: row.value_description || '',
    balance:          row.balance != null ? String(row.balance) : null,
    currency:         row.currency || 'EUR',
    expiryDate:       row.expiration_date || null,
    code:             row.voucher_code || '',
    pin:              row.pin || '',
    notes:            row.notes || '',
    category:         row.category || 'Other',
    status:           row.status === 'listed' ? 'active' : (row.status || 'active'),
    listed:           row.status === 'listed',
    copyCount:        row.copy_count || 0,
    createdAt:        row.created_at,
    voucherType:      row.voucher_type || 'gift_card',
    barcodePath:      row.barcode_path || null,
    giftMessage:      row.gift_message || '',
    giftSender:       row.gift_sender || '',
  };
}

export function voucherToDb(v) {
  const isDescription = v.valueMode === 'description';
  return {
    user_id:           v.userId,
    brand:             v.brand,
    brand_id:          getBrandByName(v.brand)?.id || null,
    amount:            isDescription ? null : (parseFloat(v.value) || null),
    value_description: isDescription ? (v.valueDescription || null) : null,
    balance:           !isDescription && v.balance !== '' && v.balance != null ? parseFloat(v.balance) : null,
    currency:          v.currency || 'EUR',
    expiration_date:   v.expiryDate || null,
    voucher_code:      v.code || null,
    pin:               v.pin || null,
    notes:             v.notes || null,
    category:          v.category || 'Other',
    status:            v.listed ? 'listed' : (v.status || 'active'),
    copy_count:        v.copyCount || 0,
    voucher_type:      v.voucherType || 'gift_card',
    barcode_path:      v.barcodePath !== undefined ? v.barcodePath : null,
    gift_message:      v.giftMessage || null,
    gift_sender:       v.giftSender || null,
  };
}

/* ============================================================
   Voucher-specific display helpers
   ============================================================ */
// Not every voucher has a monetary amount — some are for an experience or
// item instead, stored as free text in valueDescription. Wherever a
// voucher's value is displayed, show that text instead of "€0".
export const formatVoucherValue = (v, amount, showDecimals = true) =>
  v.valueDescription ? esc(v.valueDescription) : formatCurrency(amount, v.currency, showDecimals);

export const getStatus = (v) => {
  if (v.status === 'used') return 'used';
  if (v.status === 'sold') return 'sold';
  if (v.listed) return 'listed';
  if (!v.expiryDate) return 'active';
  const d = daysUntil(v.expiryDate);
  if (d < 0) return 'expired';
  if (d <= 30) return 'expiring';
  return 'active';
};

export const STATUS_LABEL = { active: 'Active', expiring: 'Expiring', expired: 'Expired', used: 'Used', sold: 'Sold', listed: 'Listed for Sale' };
export const STATUS_CLASS  = { active: 'badge-success', expiring: 'badge-warning', expired: 'badge-danger', used: 'badge-gray', sold: 'badge-gray', listed: 'badge-primary' };

export const formatMonthYear = (dateStr) => {
  if (!dateStr) return '';
  const [y, m] = dateStr.split('-').map(Number);
  return `${String(m).padStart(2,'0')}-${y}`;
};

export const formatFullDate = (dateStr) => {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
};

/* ============================================================
   FETCH
   ============================================================ */
export async function fetchVouchers() {
  if (!state.currentUser) return;
  const { data, error } = await supabase
    .from('vouchers')
    .select('*')
    .eq('user_id', state.currentUser.id)
    .order('created_at', { ascending: false });
  if (error) { console.error('fetchVouchers error:', error); showToast('Error loading vouchers'); return; }
  state.vouchers = (data || []).map(mapVoucher);
}

/* ============================================================
   VOUCHER FILE ATTACHMENTS (photos + PDFs)
   ============================================================ */
export const FILE_BUCKET = 'voucher-photos';
export const ALLOWED_FILE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'];
export const EXT_MIME_FALLBACK = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif' };
export const MAX_SCAN_FILES = 5; // mirrors MAX_FILES_PER_REQUEST in supabase/functions/extract-voucher
const signedFileUrlCache = new Map(); // path -> { url, expiresAt }

export function fileKind(mimeType) {
  return mimeType === 'application/pdf' ? 'pdf' : 'image';
}

// Some mobile file providers (iOS "Browse", Google Drive/Dropbox pickers)
// hand back an empty or generic file.type for PDFs — fall back to the
// extension so those files aren't wrongly rejected as "unsupported".
export function resolveMimeType(file) {
  if (ALLOWED_FILE_TYPES.includes(file.type)) return file.type;
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  return EXT_MIME_FALLBACK[ext] || file.type;
}

// crypto.randomUUID() only exists in secure contexts (HTTPS/localhost) —
// this works everywhere, including plain-HTTP LAN testing on a phone.
export function randomId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export async function uploadVoucherFile(file, mimeType = file.type) {
  const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
  const path = `${state.currentUser.id}/${randomId()}.${ext}`;
  const { error } = await supabase.storage.from(FILE_BUCKET).upload(path, file, { contentType: mimeType });
  if (error) { console.error('uploadVoucherFile error:', error); throw error; }
  return path;
}

export async function uploadBarcodeBlob(blob) {
  const path = `${state.currentUser.id}/barcode-${randomId()}.png`;
  const { error } = await supabase.storage.from(FILE_BUCKET).upload(path, blob, { contentType: 'image/png' });
  if (error) { console.error('uploadBarcodeBlob error:', error); throw error; }
  return path;
}

export function deleteVoucherFileObject(path) {
  if (!path) return;
  signedFileUrlCache.delete(path);
  supabase.storage.from(FILE_BUCKET).remove([path]).then(({ error }) => {
    if (error) console.error('deleteVoucherFileObject error:', error);
  });
}

export async function getVoucherFileUrl(path) {
  if (!path) return null;
  const cached = signedFileUrlCache.get(path);
  if (cached && cached.expiresAt > Date.now()) return cached.url;
  const { data, error } = await supabase.storage.from(FILE_BUCKET).createSignedUrl(path, 3600);
  if (error) { console.error('getVoucherFileUrl error:', error); return null; }
  signedFileUrlCache.set(path, { url: data.signedUrl, expiresAt: Date.now() + 55 * 60 * 1000 });
  return data.signedUrl;
}

export async function fetchVoucherFiles(voucherId) {
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
   VOUCHER ACTIONS
   ============================================================ */
// Returns the voucher's id. Does not toast or navigate — the caller
// (handleSubmit) does that once file attachments are also synced.
export async function saveVoucher(data) {
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

export async function deleteVoucher(id) {
  const files = await fetchVoucherFiles(id);
  const { error } = await supabase.from('vouchers').delete().eq('id', id);
  if (error) { console.error('deleteVoucher error:', error); showToast('Error deleting voucher'); return; }
  files.forEach(f => deleteVoucherFileObject(f.file_path));
  showToast('Voucher deleted');
  go('vouchers');
}

export async function markUsed(id) {
  await supabase.from('marketplace_listings').update({ status: 'cancelled' }).eq('voucher_id', id);
  const { error } = await supabase.from('vouchers').update({ status: 'used' }).eq('id', id);
  if (error) { console.error('markUsed error:', error); showToast('Error updating voucher'); return; }
  showToast('Marked as used');
  go('voucher-detail', { id });
}

export async function markUnused(id) {
  const { error } = await supabase.from('vouchers').update({ status: 'active' }).eq('id', id);
  if (error) { console.error('markUnused error:', error); showToast('Error updating voucher'); return; }
  showToast('Marked as active');
  go('voucher-detail', { id });
}

export async function deductBalance(id, amount) {
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

export async function incrementCopyCount(id) {
  const v = state.vouchers.find(x => x.id === id);
  if (!v) return;
  const newCount = (v.copyCount || 0) + 1;
  const { error } = await supabase.from('vouchers').update({ copy_count: newCount }).eq('id', id);
  if (error) { console.error('incrementCopyCount error:', error); return; }
  v.copyCount = newCount;
}

/* ============================================================
   POST-RENDER HOOKS (called from core/router.js's render() after the
   voucher-form / voucher-detail templates are in the DOM — file/barcode
   URLs are signed on demand rather than baked into the template string)
   ============================================================ */
export async function loadVoucherFormAttachmentThumbs() {
  const imgs = document.querySelectorAll('#attachment-grid .attachment-thumb[data-path], #barcode-preview .barcode-thumb[data-path]');
  for (const img of imgs) {
    const url = await getVoucherFileUrl(img.dataset.path);
    if (url) img.src = url;
  }
}

export async function loadVoucherDetailBarcode() {
  const img = document.querySelector('.barcode-display img[data-path]');
  if (!img) return;
  const url = await getVoucherFileUrl(img.dataset.path);
  if (url) img.src = url;
}
