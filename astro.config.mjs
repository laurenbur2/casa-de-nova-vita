// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';

import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  // Live on the custom domain. (Was served from the GitHub Pages subpath
  // laurenbur2.github.io/casa-de-nova-vita before the cutover.)
  site: 'https://casadanovavida.com',
  base: '/',

  server: {
    port: process.env.PORT ? Number(process.env.PORT) : 4321,
  },

  vite: {
    plugins: [tailwindcss()]
  },

  integrations: [sitemap()]
});