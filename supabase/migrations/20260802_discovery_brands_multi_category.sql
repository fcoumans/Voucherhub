-- A brand can belong to more than one category (e.g. Planet B is both
-- Sustainability and Shopping) — convert the single `category` column to
-- a non-empty array.
ALTER TABLE public.discovery_brands ADD COLUMN categories TEXT[] NOT NULL DEFAULT '{}';

UPDATE public.discovery_brands SET categories = ARRAY[category] WHERE category IS NOT NULL;

-- Planet B: add Shopping alongside its existing Sustainability category.
UPDATE public.discovery_brands SET categories = ARRAY['Sustainability', 'Shopping'] WHERE name = 'Planet B';

ALTER TABLE public.discovery_brands DROP COLUMN category;
ALTER TABLE public.discovery_brands ADD CONSTRAINT discovery_brands_categories_nonempty CHECK (array_length(categories, 1) > 0);
CREATE INDEX idx_discovery_brands_categories ON public.discovery_brands USING GIN (categories);
