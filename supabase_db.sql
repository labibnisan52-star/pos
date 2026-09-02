-- 1. Add image_url column to products table
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS image_url text;

-- 2. Create the storage bucket for product images
INSERT INTO storage.buckets (id, name, public) 
VALUES ('product_images', 'product_images', true)
ON CONFLICT (id) DO NOTHING;

-- 3. Set up Storage Policies to allow public access and uploads
CREATE POLICY "Public Read Access" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'product_images');

CREATE POLICY "Public Insert Access" 
ON storage.objects FOR INSERT 
WITH CHECK (bucket_id = 'product_images');
