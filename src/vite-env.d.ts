/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  /** Used only when the Supabase env vars above are absent (local `functions serve`). */
  readonly VITE_AI_ENDPOINT?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
