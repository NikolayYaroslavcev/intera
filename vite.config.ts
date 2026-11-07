import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // GitHub Pages serves the sandbox from /<repo>/; local dev and build keep '/'.
  base: process.env.PAGES_BASE ?? '/',
});
