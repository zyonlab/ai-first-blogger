/**
 * The module Vite resolves `mermaid` to when the site has not installed it.
 *
 * `mermaid` is an optional peer: a site that publishes no diagrams should not
 * carry 11.x for the sake of a component it never triggers. But the renderer
 * imports it dynamically, and Rollup resolves a dynamic import while it builds
 * the module graph — before any dead branch is eliminated. An unresolvable bare
 * specifier is a build failure, not a runtime one, so the branch being
 * unreachable is not enough on its own. This file gives the specifier something
 * to resolve to.
 *
 * Nothing here is ever called: `MermaidRenderer.astro` is guarded by
 * `__AIFB_MERMAID__`, which the integration defines as `false` in exactly the
 * case this file is aliased in. The throw is here so that a future edit which
 * loses the guard fails loudly instead of silently rendering empty figures.
 */
const absent = new Proxy(
  {},
  {
    get(_target, property) {
      throw new Error(
        `mermaid.${String(property)}() was called, but mermaid is not installed. ` +
          'Run `npm install mermaid` to render diagrams, or leave it out and fenced ' +
          '```mermaid blocks stay readable as code.',
      );
    },
  },
);

export default absent;
