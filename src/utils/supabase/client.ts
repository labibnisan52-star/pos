import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // Allow Next.js build-time SSR prerendering to complete when .env.local is not present in CI/build environments.
  if ((!supabaseUrl || !supabaseAnonKey) && typeof window === 'undefined') {
    return createBrowserClient(
      supabaseUrl || 'https://project.supabase.co',
      supabaseAnonKey || 'public-anon-key-not-configured'
    )
  }

  return createBrowserClient(supabaseUrl!, supabaseAnonKey!)
}
