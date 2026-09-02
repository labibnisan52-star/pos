import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  // We use the '!' non-null assertion because these should be defined in your .env.local file.
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
