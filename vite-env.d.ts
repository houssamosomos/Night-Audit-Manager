/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_DEFAULT_LANGUAGE?: string;
  readonly VITE_DEFAULT_CURRENCY?: string;
  readonly VITE_OFFLINE_DEMO?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
