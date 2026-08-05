/**
 * Small HTML helpers. Regex is acceptable here because the only input is our
 * own Astro output, never third-party markup.
 */

export function metaContent(html: string, attr: 'name' | 'property', key: string) {
  const pattern = new RegExp(`<meta[^>]*${attr}="${key}"[^>]*content="([^"]*)"`, 'i');
  const alt = new RegExp(`<meta[^>]*content="([^"]*)"[^>]*${attr}="${key}"`, 'i');
  return pattern.exec(html)?.[1] ?? alt.exec(html)?.[1];
}

export function titleText(html: string) {
  return /<title>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim();
}

export function canonicalHref(html: string) {
  return /<link[^>]*rel="canonical"[^>]*href="([^"]*)"/i.exec(html)?.[1];
}

export function jsonLdBlocks(html: string): unknown[] {
  const out: unknown[] = [];
  const pattern = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(match[1]!);
      out.push(...(Array.isArray(parsed) ? parsed : [parsed]));
    } catch {
      // A malformed block is reported by its own rule; ignore here.
    }
  }
  return out;
}

/** Site-internal hrefs, excluding anchors, mailto, tel and external origins. */
export function internalLinks(html: string) {
  const out = new Set<string>();
  const pattern = /<a[^>]*href="([^"]+)"/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    const href = match[1]!;
    if (!href.startsWith('/')) continue;
    const clean = href.split('#')[0]!.split('?')[0]!;
    if (clean) out.add(clean);
  }
  return [...out];
}

/** The `lang` of the document, e.g. `zh-CN`. */
export function htmlLang(html: string) {
  return /<html[^>]*\blang="([^"]*)"/i.exec(html)?.[1];
}

export type HreflangLink = { hreflang: string; href: string };

/** Every `<link rel="alternate" hreflang>` on the page, `x-default` included. */
export function hreflangLinks(html: string): HreflangLink[] {
  return [...html.matchAll(/<link\b[^>]*\brel="alternate"[^>]*>/gi)].flatMap((match) => {
    const tag = match[0];
    const hreflang = /\bhreflang="([^"]*)"/i.exec(tag)?.[1];
    const href = /\bhref="([^"]*)"/i.exec(tag)?.[1];
    return hreflang && href ? [{ hreflang, href }] : [];
  });
}

export function hasVisibleBreadcrumb(html: string) {
  return /class="breadcrumbs"/.test(html);
}

/** Every `<img>` tag with its attributes, for the alt-text rule. */
export function images(html: string) {
  return [...html.matchAll(/<img\b([^>]*)>/gi)].map((match) => {
    const attrs = match[1] ?? '';
    return {
      src: /src="([^"]*)"/i.exec(attrs)?.[1] ?? '',
      alt: /\salt="([^"]*)"/i.exec(attrs)?.[1],
      /** Decorative images legitimately carry an empty alt. */
      hasAltAttr: /\salt=/i.test(attrs),
    };
  });
}

/** Internal anchors with their visible text, for the anchor-quality rule. */
export function internalAnchors(html: string) {
  return [...html.matchAll(/<a\b[^>]*href="(\/[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi)].map((match) => ({
    href: match[1]!,
    // Strip nested markup; what a crawler reads is the text.
    text: match[2]!.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim(),
  }));
}

/**
 * Anchors a crawler cannot follow: no `href`, an empty one, or a `javascript:`
 * destination. `href="#…"` is excluded — a fragment is a real destination, and
 * the skip link depends on it.
 *
 * This exists because a component rendered `<a href={site.social.youtube}>` for
 * a site that had no YouTube. Astro drops an `undefined` attribute, so the page
 * shipped a bare `<a>YouTube</a>` — visible, clickable-looking, and invisible to
 * every rule the gate had. Lighthouse found it; the gate should have.
 */
export function unfollowableAnchors(html: string) {
  return [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)]
    .map((match) => ({
      href: /\shref="([^"]*)"/i.exec(match[1] ?? '')?.[1],
      hasHrefAttr: /\shref=/i.test(match[1] ?? ''),
      text: match[2]!.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim(),
    }))
    .filter(
      (anchor) =>
        !anchor.hasHrefAttr ||
        anchor.href === undefined ||
        anchor.href.trim() === '' ||
        /^javascript:/i.test(anchor.href.trim()),
    );
}

/** Count of `<h1>` elements. Exactly one is the target. */
export function h1Count(html: string) {
  return [...html.matchAll(/<h1\b/gi)].length;
}

/** True when the page asks robots not to index it. */
export function isNoindex(html: string) {
  return /content="[^"]*noindex/i.test(html);
}

/**
 * Visible prose outside navigation, cards and footer — used to tell a page that
 * introduces its subject from one that is only a list of links.
 */
export function proseText(html: string) {
  const main = /<main\b[^>]*>([\s\S]*?)<\/main>/i.exec(html)?.[1] ?? html;
  return main
    .replace(/<(script|style|nav|footer|header)\b[\s\S]*?<\/\1>/gi, ' ')
    // Cards are the listing itself; their copy is not an introduction.
    .replace(/<article\b[\s\S]*?<\/article>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Display width: CJK characters occupy two columns in a SERP, so a 40-character
 * Chinese title is as long as an 80-character English one. Counting width
 * rather than characters makes the length rules work in any locale.
 */
export function displayWidth(text: string) {
  let width = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    const wide =
      (code >= 0x1100 && code <= 0x115f) ||
      (code >= 0x2e80 && code <= 0xa4cf) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xfe30 && code <= 0xfe6f) ||
      (code >= 0xff00 && code <= 0xff60) ||
      (code >= 0xffe0 && code <= 0xffe6);
    width += wide ? 2 : 1;
  }
  return width;
}
