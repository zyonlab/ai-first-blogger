# examples/

Complete, planned sites. They are **reference material, not the product** —
nothing here is read at build time.

`site/` ships as a skeleton where every decision a person must make is marked
`TODO`, and the pipeline refuses to run until those are gone. That is the right
default for a framework, but a blank form is a poor way to learn what a good
answer looks like. These are the worked answers.

## agent-native-engineer

A full-stack engineer a year into AI agent work. Chosen because it exercises the
parts of the framework that a generic sample does not:

- a **voice** with domain-specific signals — it penalises AI-boosterism
  (`颠覆`, `范式转移`, `赋能`) and *expects* concrete numbers (`ms`, `P99`,
  `token`, `$`), which a general-purpose phrase table would never contain
- a **taxonomy** whose pillars map to real reader intent rather than to tags
- two articles written against that voice, both passing all 24 rules

## indie-ai-builder

A solo builder shipping small AI products, in the terminal-plain style: the
`mono` theme — monospace throughout, 13px at 1.75, a 760px measure, hairline
rules, no cards or shadows — with lowercase section headings and sentence-shaped
article titles.

It exercises a different axis from the first example:

- a **theme** other than the shipped default, and the light-first mode
- a **voice** that demands concrete numbers and refuses AI-boosterism, with the
  guidance prose spelling out structure (sentence headings, conclusion first,
  1500–2000 words, almost no lists)
- a site that **declines a shipped content type** — no `videos` key, so those
  routes, the nav entry and the `llms.txt` section never exist
- five cross-linked articles, all scoring 100

## Using one

```bash
cp -r examples/<name>/site/. site/
cp -r examples/<name>/content/. content/
pnpm build && pnpm validate
```

Or scaffold straight into a new directory:

```bash
npm create aifb@latest my-blog --example indie-ai-builder
```

Then change every value to yours. Copying the example wholesale passes the
preflight — it contains no `TODO` — which is intentional: adopting someone
else's plan is a decision, leaving a form blank is not.
