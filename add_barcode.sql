-- Migration: Add barcode to products table
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS barcode TEXT;

-- Create an index for faster lookups during barcode scanning
CREATE INDEX IF NOT EXISTS idx_products_barcode ON public.products (barcode);

-- Optional: If you want to enforce uniqueness for barcodes (highly recommended to prevent duplicates)
-- Note: This will fail if there are currently duplicated barcodes in the DB.
-- CREATE UNIQUE INDEX IF NOT EXISTS idx_products_barcode_unique ON public.products (barcode) WHERE barcode IS NOT NULL;
