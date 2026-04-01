/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_OPENSPLINKLER_BASE_URL: string
  readonly VITE_OPENSPLINKLER_PASSWORD?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
