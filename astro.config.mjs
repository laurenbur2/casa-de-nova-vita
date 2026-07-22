// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';

import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  // Live on the custom domain casadanovavida.com.
  site: 'https://casadanovavida.com',
  base: '/',

  server: {
    port: process.env.PORT ? Number(process.env.PORT) : 4321,
  },

  vite: {
    plugins: [tailwindcss()]
  },

  // Confirmation and dead-end pages carry no search value — keep them out of
  // the sitemap so crawl budget goes to the pages we actually want ranking.
  integrations: [
    sitemap({
      filter: (page) => !/\/(thank-you)\/?$/.test(page),
    }),
  ]
});