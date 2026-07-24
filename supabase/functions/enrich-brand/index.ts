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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  if (!ANTHROPIC_API_KEY) {
    return jsonResponse({ error: 'ANTHROPIC_API_KEY secret is not configured' }, 500);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return jsonResponse({ error: 'Unauthorized' }, 401);

  let brandId: string | undefined;
  try {
    ({ brandId } = await req.json());
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }
  if (!brandId) return jsonResponse({ error: 'brandId is required' }, 400);

  // Scoped to the caller's own session so this respects the brands RLS policies.
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: brand, error: fetchErr } = await supabase
    .from('brands')
    .select('id, name, domain, description')
    .eq('id', brandId)
    .maybeSingle();

  if (fetchErr) return jsonResponse({ error: fetchErr.message }, 500);
  if (!brand) return jsonResponse({ error: 'Brand not found' }, 404);
  if (brand.description) return jsonResponse({ description: brand.description, domain: brand.domain, skipped: true });

  const needsDomain = !brand.domain;

  const prompt = `Identify the brand/company "${brand.name}" for shoppers browsing a second-hand gift-card marketplace app.

Respond with ONLY a JSON object (no markdown code fences, no other text), with these keys:
- "description": a short, factual, neutral 1-3 sentence introduction, plain prose, no quotation marks. If you don't recognize this brand with confidence, write one generic sentence describing it neutrally as a brand/store without inventing specific facts.
${needsDomain
    ? '- "domain": the brand\'s official website domain, lowercase, no protocol/path (e.g. "nike.com"). Only include this if you are confident; otherwise use null.'
    : '- "domain": null'}`;

  const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!aiRes.ok) {
    const text = await aiRes.text();
    console.error('anthropic error', aiRes.status, text);
    return jsonResponse({ error: 'AI generation failed' }, 502);
  }

  const aiJson = await aiRes.json();
  const raw = (aiJson.content?.[0]?.text ?? '').trim();
  if (!raw) return jsonResponse({ error: 'Empty AI response' }, 502);

  let description = '';
  let domain: string | null = null;
  try {
    const parsed = JSON.parse(raw);
    description = typeof parsed.description === 'string' ? parsed.description.trim() : '';
    if (needsDomain && typeof parsed.domain === 'string') {
      const candidate = parsed.domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
      if (/^[a-z0-9.-]+\.[a-z]{2,}$/.test(candidate)) domain = candidate;
    }
  } catch {
    // Model didn't return valid JSON — fall back to treating the raw text as the description.
    description = raw;
  }

  if (!description) return jsonResponse({ error: 'Empty description in AI response' }, 502);

  const updates: Record<string, string> = { description };
  if (domain) updates.domain = domain;

  const { error: updateErr } = await supabase
    .from('brands')
    .update(updates)
    .eq('id', brandId);

  if (updateErr) return jsonResponse({ error: updateErr.message }, 500);

  return jsonResponse({ description, domain: domain ?? brand.domain });
});
