import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

// SEO article/guide collection. Each Markdown file in src/content/articles/
// becomes a page at /<slug> (the filename), rendered by src/pages/[slug].astro.
// These are the pillar and supporting pages of the topic-cluster SEO strategy.
const articles = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/articles" }),
  schema: z.object({
    // ── SEO ──────────────────────────────────────────────────────────
    title: z.string(), // <title> and <h1>
    description: z.string(), // meta description (~150-160 chars)
    // ── Hero ─────────────────────────────────────────────────────────
    eyebrow: z.string(), // small category label above the title
    intro: z.string().optional(), // hero sub-paragraph
    heroImage: z.string(), // e.g. "/images/photos/cards/welcome-iboga.jpg"
    heroImageAlt: z.string(),
    // ── Taxonomy / clustering ────────────────────────────────────────
    cluster: z.enum([
      "ibogaine",
      "ayahuasca",
      "integration",
      "addiction",
      "family",
      "general",
    ]),
    pillar: z.boolean().default(false), // true = hub page for its cluster
    featured: z.boolean().default(false), // surface on the Resources page
    draft: z.boolean().default(false),
    publishDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    // ── FAQ (renders on-page + emits FAQPage structured data) ─────────
    faq: z
      .array(z.object({ question: z.string(), answer: z.string() }))
      .optional(),
    // ── Internal links to related pages (collection or bespoke) ───────
    related: z
      .array(z.object({ label: z.string(), href: z.string() }))
      .optional(),
  }),
});

export const collections = { articles };
