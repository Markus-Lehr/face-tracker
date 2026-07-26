import { defineConfig } from 'vite';

import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  server: {
    port: 3000,
    open: true
  },
  build: {
    target: 'esnext'
  },
  plugins: [cloudflare()]
});