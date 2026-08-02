// Referral codes: Supabase <-> frontend field mapping, fetch (own + public
// + friends', deduped), and CRUD + the "I used this" toggle.
//
// `go`/`render` (router) still live in app.js at this point in the module
// split — imported from there for now, repointed once core/router.js exists.
import { supabase } from '../../lib/supabase.js';
import { state } from '../../core/state.js';
import { fullName } from '../../core/dom.js';
import { showToast } from '../../core/toast.js';
import { getBrandByName, ensureBrand } from '../../core/brands.js';
import { go, render } from '../../core/router.js';

/* ============================================================
   REFERRAL FIELD MAPPING (Supabase ↔ frontend)
   ============================================================ */
export function mapReferral(row) {
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
    usedCount:       row.used_count || 0,
    createdAt:       row.created_at,
    brandData:       resolvedBrand,
  };
}

/* ============================================================
   FETCH
   ============================================================ */
export async function fetchReferrals() {
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
      .select('id, first_name, last_name, email')
      .in('id', ownerIds);
    if (pErr) { console.error('fetchReferrals owner profiles error:', pErr); }
    else {
      const profileMap = Object.fromEntries((profiles || []).map(p => [p.id, p]));
      state.referrals = state.referrals.map(r => {
        if (r.userId === uid) return r;
        const p = profileMap[r.userId];
        return { ...r, ownerName: fullName(p) || p?.email || 'Community' };
      });
    }
  }

  const { data: myUses, error: usesErr } = await supabase
    .from('referral_code_uses')
    .select('referral_id')
    .eq('user_id', uid);
  if (usesErr) console.error('fetchReferrals my-uses error:', usesErr);
  state.myReferralUses = new Set((myUses || []).map(u => u.referral_id));
}

/* ============================================================
   REFERRAL ACTIONS
   ============================================================ */
export async function saveReferral(data) {
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

export async function updateReferral(id, data) {
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

export async function deleteReferral(id) {
  const { error } = await supabase.from('referral_codes').delete().eq('id', id);
  if (error) { console.error('deleteReferral error:', error); showToast('Error deleting referral code'); return; }
  showToast('Referral code deleted');
  go('referrals');
}

// Marks (or unmarks) "I used this" for a referral code that isn't the
// current user's own — owners are blocked from inflating their own code's
// count at the RLS level too (referral_code_uses_insert policy), this is
// just the matching client-side guard so the button doesn't even appear.
export async function toggleReferralUse(id) {
  const uid = state.currentUser.id;
  const alreadyUsed = state.myReferralUses.has(id);
  if (alreadyUsed) {
    const { error } = await supabase.from('referral_code_uses').delete().eq('referral_id', id).eq('user_id', uid);
    if (error) { console.error('toggleReferralUse delete error:', error); showToast('Error updating use count'); return; }
    state.myReferralUses.delete(id);
    state.referrals = state.referrals.map(r => r.id === id ? { ...r, usedCount: Math.max((r.usedCount || 0) - 1, 0) } : r);
  } else {
    const { error } = await supabase.from('referral_code_uses').insert({ referral_id: id, user_id: uid });
    if (error) { console.error('toggleReferralUse insert error:', error); showToast('Error updating use count'); return; }
    const { error: notifyError } = await supabase.rpc('notify_referral_used', { p_referral_id: id });
    if (notifyError) console.error('notify_referral_used error:', notifyError);
    state.myReferralUses.add(id);
    state.referrals = state.referrals.map(r => r.id === id ? { ...r, usedCount: (r.usedCount || 0) + 1 } : r);
  }
  render();
}
