// Shared brand directory (public.brands + the enrich-brand edge function) —
// consumed by wallet (voucher brand autocomplete), referrals (brand
// selection), marketplace (listing brand descriptions), and the generic
// avatar() render helper. Not owned by any single feature.
import { supabase } from '../lib/supabase.js';
import { state } from './state.js';

export const LOGODEV_TOKEN = import.meta.env.VITE_LOGODEV_TOKEN;

export async function fetchBrands() {
  const { data, error } = await supabase
    .from('brands')
    .select('id, name, category, domain, logo_url, description')
    .order('name');
  if (error) { console.error('fetchBrands error:', error); return; }
  state.brands = data || [];
}

export function getBrandByName(name) {
  if (!name) return null;
  const lower = name.toLowerCase();
  return state.brands.find(b => b.name.toLowerCase() === lower) || null;
}

export function getBrandLogo(brandName) {
  const brand = getBrandByName(brandName);
  if (!brand) return null;
  if (brand.logo_url) return brand.logo_url;
  if (brand.domain && LOGODEV_TOKEN) return `https://img.logo.dev/${brand.domain}?token=${LOGODEV_TOKEN}`;
  return null;
}

export function getBrandDescription(brandName) {
  return getBrandByName(brandName)?.description || null;
}

/* Fire-and-forget: asks the enrich-brand edge function to AI-generate a short
   intro for a brand that doesn't have one yet. Never blocks the caller. */
export function enrichBrandAsync(brandId) {
  if (!brandId) return;
  supabase.functions.invoke('enrich-brand', { body: { brandId } })
    .then(({ data, error }) => {
      if (error || !data?.description) return;
      const b = state.brands.find(x => x.id === brandId);
      if (b) b.description = data.description;
    })
    .catch(() => {});
}

export async function ensureBrand(name, category) {
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
