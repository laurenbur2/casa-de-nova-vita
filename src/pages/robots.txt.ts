import type { APIRoute } from "astro";

// Generated rather than served from public/ so the Sitemap line always tracks
// the `site` in astro.config.mjs. A hardcoded copy silently rotted through the
// GitHub Pages → casadanovavida.com cutover and pointed crawlers at a 404.
export const GET: APIRoute = ({ site }) => {
  const sitemap = new URL("sitemap-index.xml", site).href;

  return new Response(
    `User-agent: *
Allow: /

Sitemap: ${sitemap}
`,
    { headers: { "Content-Type": "text/plain; charset=utf-8" } },
  );
};
