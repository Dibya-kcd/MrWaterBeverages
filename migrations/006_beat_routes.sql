-- ============================================================
-- MrWater — Beat routes (hub + market stops)
-- Run in Supabase: Dashboard → SQL Editor → New query → Run
-- Safe to re-run (IF NOT EXISTS / ON CONFLICT DO NOTHING).
--
-- Model:
--   Hub  = main base (e.g. Kuchinda godown area)
--   Stops = beat markets only (Jamankira, Keseibahal, …)
-- ============================================================

-- 1) Beat route header
CREATE TABLE IF NOT EXISTS public.beat_routes (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    hub           TEXT NOT NULL,
    label         TEXT,
    active        BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order    INTEGER NOT NULL DEFAULT 0,
    notes         TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.beat_routes IS
  'Sales / delivery beat definitions. hub = base town; stops live in beat_stops.';
COMMENT ON COLUMN public.beat_routes.hub IS
  'Main hub (e.g. Kuchinda) — not a beat market stop.';

-- 2) Ordered market stops on each beat (hub is NOT stored here)
CREATE TABLE IF NOT EXISTS public.beat_stops (
    id            TEXT PRIMARY KEY,
    beat_route_id TEXT NOT NULL REFERENCES public.beat_routes(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    code          TEXT,
    sort_order    INTEGER NOT NULL DEFAULT 0,
    active        BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (beat_route_id, name)
);

COMMENT ON TABLE public.beat_stops IS
  'Market / village stops on a beat, ordered by sort_order. Excludes hub.';

CREATE INDEX IF NOT EXISTS idx_beat_stops_route
  ON public.beat_stops(beat_route_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_beat_routes_active
  ON public.beat_routes(active) WHERE active = TRUE;

-- 3) Optional links on existing tables (safe if columns already exist)
ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS beat_route_id TEXT REFERENCES public.beat_routes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_trips_beat_route ON public.trips(beat_route_id);

-- Optional: customers master (skip quietly if table does not exist)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'customers'
  ) THEN
    ALTER TABLE public.customers
      ADD COLUMN IF NOT EXISTS beat_route_id TEXT REFERENCES public.beat_routes(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_customers_beat_route ON public.customers(beat_route_id);
  END IF;
END $$;

-- 4) Seed: Kuchinda hub + beat markets
INSERT INTO public.beat_routes (id, name, hub, label, active, sort_order, notes)
VALUES (
    'beat_kuchinda_main',
    'Kuchinda Beat',
    'Kuchinda',
    'Kuchinda hub → Jamankira · Keseibahal · Kusumi · Laida · Kolabira · Subarnpali',
    TRUE,
    1,
    'Main distribution beat from Kuchinda hub (Sambalpur belt).'
)
ON CONFLICT (id) DO UPDATE SET
    name       = EXCLUDED.name,
    hub        = EXCLUDED.hub,
    label      = EXCLUDED.label,
    active     = EXCLUDED.active,
    sort_order = EXCLUDED.sort_order,
    notes      = EXCLUDED.notes,
    updated_at = NOW();

INSERT INTO public.beat_stops (id, beat_route_id, name, code, sort_order, active) VALUES
    ('stop_jmk', 'beat_kuchinda_main', 'Jamankira',   'JMK', 1, TRUE),
    ('stop_ksb', 'beat_kuchinda_main', 'Keseibahal',  'KSB', 2, TRUE),
    ('stop_ksm', 'beat_kuchinda_main', 'Kusumi',      'KSM', 3, TRUE),
    ('stop_lda', 'beat_kuchinda_main', 'Laida',       'LDA', 4, TRUE),
    ('stop_klb', 'beat_kuchinda_main', 'Kolabira',    'KLB', 5, TRUE),
    ('stop_sbp', 'beat_kuchinda_main', 'Subarnpali',  'SBP', 6, TRUE)
ON CONFLICT (id) DO UPDATE SET
    beat_route_id = EXCLUDED.beat_route_id,
    name          = EXCLUDED.name,
    code          = EXCLUDED.code,
    sort_order    = EXCLUDED.sort_order,
    active        = EXCLUDED.active;

-- 5) Helpful views for app / CA / ops
CREATE OR REPLACE VIEW public.v_beat_routes_with_stops AS
SELECT
    r.id,
    r.name,
    r.hub,
    r.label,
    r.active,
    r.sort_order,
    COALESCE(
      string_agg(s.name, ' → ' ORDER BY s.sort_order),
      ''
    ) AS stops_path,
    count(s.id)::INTEGER AS stop_count
FROM public.beat_routes r
LEFT JOIN public.beat_stops s
  ON s.beat_route_id = r.id AND s.active = TRUE
GROUP BY r.id, r.name, r.hub, r.label, r.active, r.sort_order;

COMMENT ON VIEW public.v_beat_routes_with_stops IS
  'Beat routes with hub and ordered stop path for dropdowns and reports';

-- 6) RLS (open policies — same pattern as other MrWater tables)
ALTER TABLE public.beat_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beat_stops  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all access to beat_routes" ON public.beat_routes;
CREATE POLICY "Allow all access to beat_routes"
  ON public.beat_routes FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to beat_stops" ON public.beat_stops;
CREATE POLICY "Allow all access to beat_stops"
  ON public.beat_stops FOR ALL USING (true) WITH CHECK (true);

-- Done
-- Verify:
--   SELECT * FROM public.v_beat_routes_with_stops;
--   SELECT * FROM public.beat_stops ORDER BY sort_order;
