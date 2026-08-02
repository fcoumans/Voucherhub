// Discover: curated brand catalog (public.discovery_brands) — editorial
// content for "buy a fresh gift card straight from the source", unrelated
// to the peer-to-peer marketplace_listings table used by features/marketplace/.
import { supabase } from '../../lib/supabase.js';
import { state } from '../../core/state.js';

export function getDiscoveryCategories() {
  const cats = [...new Set(state.discoveryBrands.flatMap(b => b.categories))].sort();
  return ['All', ...cats];
}

export function getDiscoveryRegions() {
  const regions = [...new Set(state.discoveryBrands.flatMap(b => b.regions || []))].sort();
  return ['All', ...regions];
}

export function mapDiscoveryBrand(row) {
  return {
    id:          row.id,
    name:        row.name,
    categories:  row.categories || [],
    regions:     row.regions || [],
    location:    row.location || '',
    description: row.description,
    domain:      row.domain || null,
    logoUrl:     row.logo_url || null,
    websiteUrl:  row.website_url,
    funFact:     row.fun_fact || null,
  };
}

export async function fetchDiscoveryBrands() {
  const { data, error } = await supabase
    .from('discovery_brands')
    .select('id, name, categories, regions, location, description, domain, logo_url, website_url, fun_fact')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });
  if (error) { console.error('fetchDiscoveryBrands error:', error); return; }
  state.discoveryBrands = (data || []).map(mapDiscoveryBrand);
}
