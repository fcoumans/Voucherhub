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
  if (brand.description) return jsonResponse({ description: brand.description, skipped: true });

  const prompt = `Give a short, factual, neutral introduction to the brand/company "${brand.name}"${
    brand.domain ? ` (website: ${brand.domain})` : ''
  } for shoppers browsing a second-hand gift-card marketplace app. 1-3 short sentences of plain prose, no markdown, no quotation marks, no preamble. If you don't recognize this brand with confidence, write one generic sentence describing it neutrally as a brand/store without inventing specific facts.`;

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
    console.error('anthropic error', aiRes.status, text);
    return jsonResponse({ error: 'AI generation failed' }, 502);
  }

  const aiJson = await aiRes.json();
  const description = (aiJson.content?.[0]?.text ?? '').trim();
  if (!description) return jsonResponse({ error: 'Empty AI response' }, 502);

  const { error: updateErr } = await supabase
    .from('brands')
    .update({ description })
    .eq('id', brandId);

  if (updateErr) return jsonResponse({ error: updateErr.message }, 500);

  return jsonResponse({ description });
});
