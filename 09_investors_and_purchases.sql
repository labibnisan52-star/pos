-- ============================================================
-- MIGRATION: Investors, Transactions, and Funding Source
-- Run this in your Supabase SQL Editor
-- ============================================================

-- 1. Create investors table
CREATE TABLE IF NOT EXISTS public.investors (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    contact text,
    created_at timestamptz DEFAULT now()
);

-- 2. Create investor_transactions table for tracking debt/payments
CREATE TABLE IF NOT EXISTS public.investor_transactions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    investor_id uuid REFERENCES public.investors(id) ON DELETE CASCADE,
    type text NOT NULL CHECK (type IN ('Investment', 'Repayment')),
    amount numeric NOT NULL CHECK (amount > 0),
    date timestamptz DEFAULT now(),
    notes text,
    created_by uuid REFERENCES auth.users(id)
);

-- 3. Add funding source to products
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS funding_source text DEFAULT 'Me';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS investor_id uuid REFERENCES public.investors(id) ON DELETE SET NULL;

-- 4. Enable RLS and setup policies
ALTER TABLE public.investors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investor_transactions ENABLE ROW LEVEL SECURITY;

-- Allow all operations for anon and authenticated (as per this project's pattern)
DROP POLICY IF EXISTS "allow_all_investors" ON public.investors;
CREATE POLICY "allow_all_investors" ON public.investors FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "allow_all_investor_tx" ON public.investor_transactions;
CREATE POLICY "allow_all_investor_tx" ON public.investor_transactions FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Grant permissions
GRANT ALL ON TABLE public.investors TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.investor_transactions TO anon, authenticated, service_role;
