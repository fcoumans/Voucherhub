// Marketplace listings: Supabase <-> frontend field mapping, fetch, and
// list-for-sale/unlist actions. These also flip the underlying voucher's
// status ('listed' <-> 'active') since a listing and its voucher move
// together, but voucher CRUD itself lives in features/wallet/vouchers.js.
//
// `go` (router) still lives in app.js at this point in the module split —
// imported from there for now, repointed once core/router.js exists.
import { supabase } from '../../lib/supabase.js';
import { state } from '../../core/state.js';
import { fullName } from '../../core/dom.js';
import { showToast } from '../../core/toast.js';
import { go } from '../../core/router.js';

/* ============================================================
   LISTING FIELD MAPPING (Supabase ↔ frontend)
   ============================================================ */
export function mapListing(row) {
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
    visibility:    row.visibility || 'public',
    createdAt:     row.created_at,
  };
}

export const discountPct = (original, selling) => {
  if (!original || !selling || original <= 0) return 0;
  return Math.round(((original - selling) / original) * 100);
};

/* ============================================================
   FETCH
   ============================================================ */
export async function fetchListings() {
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
      .select('id, first_name, last_name, email')
      .in('id', sellerIds);
    if (pErr) { console.error('fetchListings profiles error:', pErr); }
    else {
      const profileMap = Object.fromEntries((profiles || []).map(p => [p.id, p]));
      state.listings = state.listings.map(l => {
        const p = profileMap[l.sellerId];
        return { ...l, sellerName: fullName(p) || p?.email || 'Seller', sellerEmail: p?.email || '' };
      });
    }
  }
}

/* ============================================================
   LISTING ACTIONS
   ============================================================ */
export async function listForSale(id, price, visibility = 'public') {
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
    visibility:     visibility === 'friends_only' ? 'friends_only' : 'public',
  });
  if (lErr) { console.error('listForSale listing insert error:', lErr); showToast('Error creating listing'); return; }
  showToast('Listed on marketplace');
  go('voucher-detail', { id });
}

export async function unlist(id) {
  const { error: vErr } = await supabase.from('vouchers').update({ status: 'active' }).eq('id', id);
  if (vErr) { console.error('unlist voucher error:', vErr); showToast('Error removing listing'); return; }
  const { error: lErr } = await supabase.from('marketplace_listings').update({ status: 'cancelled' }).eq('voucher_id', id);
  if (lErr) { console.error('unlist marketplace error:', lErr); showToast('Error removing listing'); return; }
  showToast('Listing removed');
  go('voucher-detail', { id });
}
