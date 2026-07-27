import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function extractTag(html: string, pattern: RegExp): string | null {
  const match = html.match(pattern);
  return match?.[1]?.trim() || null;
}

// Pulls just the title + meta description so the AI describes the actual
// site instead of guessing from the brand name (which can collide with a
// more famous, differently-named business — e.g. "La Bottega").
async function fetchDomainSnippet(domain: string): Promise<string | null> {
  const url = domain.startsWith('http') ? domain : `https://${domain}`;
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; VoucherHubBot/1.0)' },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const title = extractTag(html, /<title[^>]*>([^<]*)<\/title>/i);
    const description =
      extractTag(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) ||
      extractTag(html, /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i) ||
      extractTag(html, /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/i);
    const parts = [title, description].filter(Boolean);
    return parts.length ? parts.join(' — ').slice(0, 600) : null;
  } catch (err) {
    console.error('enrich-brand: domain fetch failed', domain, err);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  if (!ANTHROPIC_API_KEY) {
    console.error('enrich-brand: ANTHROPIC_API_KEY secret is not configured');
    return jsonResponse({ error: 'ANTHROPIC_API_KEY secret is not configured' }, 500);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    console.error('enrich-brand: missing Authorization header');
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  let brandId: string | undefined;
  try {
    ({ brandId } = await req.json());
  } catch {
    console.error('enrich-brand: invalid JSON body');
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }
  if (!brandId) {
    console.error('enrich-brand: brandId missing from request body');
    return jsonResponse({ error: 'brandId is required' }, 400);
  }

  // Scoped to the caller's own session so this respects the brands RLS policies.
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: brand, error: fetchErr } = await supabase
    .from('brands')
    .select('id, name, domain, description, category')
    .eq('id', brandId)
    .maybeSingle();

  if (fetchErr) {
    console.error('enrich-brand: brand fetch failed', brandId, fetchErr.message);
    return jsonResponse({ error: fetchErr.message }, 500);
  }
  if (!brand) {
    console.error('enrich-brand: brand not found', brandId);
    return jsonResponse({ error: 'Brand not found' }, 404);
  }
  if (brand.description) return jsonResponse({ description: brand.description, skipped: true });

  const siteSnippet = brand.domain ? await fetchDomainSnippet(brand.domain) : null;

  // The category is a hint the user already assigned (e.g. "Food & Drink")
  // — when there's no real site content to go on, this keeps the AI from
  // free-guessing a plausible-sounding but wrong category from the name
  // alone (e.g. assuming "ICE ICE AMY" is a fashion brand).
  const categoryHint = brand.category
    ? ` This business is filed under the "${brand.category}" category in our app, so keep the description consistent with that unless the page content clearly says otherwise.`
    : '';

  const prompt = siteSnippet
    ? `Here is the title and meta description from the homepage of "${brand.name}" (${brand.domain}):\n\n"""${siteSnippet}"""\n\nBased on this page content, write a short, factual, neutral 1-3 sentence introduction to this brand/store for shoppers browsing a second-hand gift-card marketplace app. Plain prose, no markdown, no quotation marks, no preamble. Describe what this specific website actually offers — do not substitute knowledge of a different, more famous brand that happens to share this name.${categoryHint} If this snippet is too thin to say anything specific (e.g. just a bare site title), do not explain that or refuse — instead write one short, generic sentence identifying "${brand.name}" neutrally as a brand/store, without inventing specific facts.`
    : `Give a short, factual, neutral introduction to the brand/company "${brand.name}"${
        brand.domain ? ` (website: ${brand.domain})` : ''
      } for shoppers browsing a second-hand gift-card marketplace app. 1-3 short sentences of plain prose, no markdown, no quotation marks, no preamble.${categoryHint} If you don't recognize this brand with confidence, write one generic sentence describing it neutrally as a brand/store without inventing specific facts.`;

  const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!aiRes.ok) {
    const text = await aiRes.text();
    console.error('enrich-brand: anthropic error', brandId, aiRes.status, text);
    return jsonResponse({ error: 'AI generation failed' }, 502);
  }

  const aiJson = await aiRes.json();
  const description = (aiJson.content?.[0]?.text ?? '').trim();
  if (!description) {
    console.error('enrich-brand: empty AI response', brandId, JSON.stringify(aiJson));
    return jsonResponse({ error: 'Empty AI response' }, 502);
  }

  const { error: updateErr } = await supabase
    .from('brands')
    .update({ description })
    .eq('id', brandId);

  if (updateErr) {
    console.error('enrich-brand: DB update failed', brandId, updateErr.message);
    return jsonResponse({ error: updateErr.message }, 500);
  }

  console.log('enrich-brand: success', brandId);
  return jsonResponse({ description });
});
