# Scheduled Publishing and Freshness

Content remains in Git. Scheduling is expressed with an ISO 8601 `pubDate` that includes an explicit UTC offset, for example `2026-08-01T09:00:00+08:00`.

## Publication

- Normal builds exclude draft and future-dated posts, videos, and case studies.
- `.github/workflows/scheduled-publish.yml` checks `main` hourly at minute 17 UTC.
- The Action deploys only when non-draft content became due during the previous 70 minutes, or when manually dispatched.
- GitHub cron uses UTC. The timestamp offset in frontmatter remains the source of truth for the author's intended local time.
- Scheduled publication uses the production Cloudflare branch and does not modify DNS.

Inspect a window locally:

```bash
pnpm content:scheduled -- --now 2026-08-01T01:30:00Z --window-minutes 70
```

## Freshness

Use `reviewAfter` on content whose overall conclusions need periodic review. Time-sensitive individual claims continue to use `reviewAfter` in the fact ledger.

```bash
pnpm content:freshness
pnpm content:freshness -- --fail-on-stale true
pnpm content:freshness -- --base origin/main
```

The report lists stale articles and claims. `--base` also rejects an `updatedDate` change when the article body did not change; publication dates must not be refreshed merely to appear current.
