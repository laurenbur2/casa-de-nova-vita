// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';

import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  // Served from the GitHub Pages subpath today. When casadanovavida.com is cut
  // over to GitHub Pages, switch site to 'https://casadanovavida.com', set
  // base to '/', and restore public/CNAME.
  site: 'https://laurenbur2.github.io',
  base: '/casa-de-nova-vita/',

  server: {
    port: process.env.PORT ? Number(process.env.PORT) : 4321,
  },

  vite: {
    plugins: [tailwindcss()]
  },

  integrations: [sitemap()]
});