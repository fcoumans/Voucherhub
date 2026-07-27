# AI Instructions

Before generating or changing code, always read the files in `/docs`.

The `/docs` folder is the source of truth for:
- Product context
- Database schema
- Brand guidelines
- User flows

`MVP_SCOPE.md` and `ROADMAP.md` describe the original MVP plan and are kept
for historical context — most of what they list as future/excluded has
since shipped. Check the actual code before assuming either one reflects
current scope.

Build everything mobile-first.

Tech stack (actual, as implemented):

- Vanilla JavaScript (no framework) — the whole app is one Vite-bundled
  entry point, `src/app.js`, rendering template-literal HTML into a single
  `state` object and re-rendering on change
- Vite (build tool / dev server)
- Supabase (Postgres, Auth, Storage, Edge Functions)
- Deno + TypeScript, but only inside `supabase/functions/*` (edge functions)
- Deployed as an installable PWA (see `public/manifest.json`, `public/sw.js`)

There is no React, no React Native, no Expo, and no TypeScript in the
frontend — don't introduce them without discussing it first, since that
would be a full rewrite, not an incremental change.

Requirements:

- Clean architecture
- Reusable components
- Simple MVP
- No unnecessary complexity

Always check `MVP_SCOPE.md` (with the caveat above) and `docs/DATABASE_SCHEMA.md` before generating code.
