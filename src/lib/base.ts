// Prefixes internal paths with the configured base (e.g. "/casa-de-nova-vita/")
// so links and assets resolve correctly when the site is served from a subpath
// on GitHub Pages. External URLs and non-http schemes are returned unchanged.
const base = import.meta.env.BASE_URL;

export function withBase(path: string): string {
  if (/^(https?:|tel:|mailto:|data:|#|\/\/)/.test(path)) return path;
  return (base.replace(/\/$/, "") + "/" + path.replace(/^\//, "")).replace(
    /([^:]\/)\/+/g,
    "$1",
  );
}
