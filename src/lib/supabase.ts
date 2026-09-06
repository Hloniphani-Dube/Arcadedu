import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// The client is optional at this stage: without env vars the app still runs and
// talks to a locally-served edge function via VITE_AI_ENDPOINT. Auth + a
// persisted profile table come next.
export const supabase: SupabaseClient | null =
  url && anonKey ? createClient(url, anonKey) : null
