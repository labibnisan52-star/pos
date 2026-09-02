-- ============================================================
-- EXPENSES MIGRATION — Run this in Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  expense_date date NOT NULL DEFAULT CURRENT_DATE,
  description text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  user_id uuid REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

-- Grant permissions to authenticated and anon roles
GRANT ALL ON TABLE public.expenses TO anon;
GRANT ALL ON TABLE public.expenses TO authenticated;
GRANT ALL ON TABLE public.expenses TO service_role;

-- Policy to allow full access (for now, similar to other tables in this POS)
CREATE POLICY "allow_all_expenses_anon"
  ON public.expenses FOR ALL
  TO anon, authenticated
  USING (true) WITH CHECK (true);
