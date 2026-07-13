# Google Search Console Operations

This playbook defines the production Search Console setup and monthly review for a GitHub-backed AI First Blogger site. It records operational evidence without committing verification tokens, account identifiers, cookies, API credentials, or unredacted private exports.

## Operating Contract

- The site owner remains accountable for property ownership, access grants, incident decisions, and publication changes.
- An agent may prepare checklists, summarize exported data, create evidence records, and propose actions. It must not claim a report was checked unless a human or authenticated tool actually opened it.
- Production is the only environment submitted for indexing. Staging exists for release review and must not be treated as a second public copy of the site.
- Store monthly evidence by copying `content-plans/search-console-monthly-review.template.yaml` to `content-plans/search-console-review-YYYY-MM.yaml`.
- Commit only sanitized findings and action records. Keep screenshots private unless they contain no account details, private URLs, personal data, or verification values.

## Initial Production Setup

### 1. Create the Property

Prefer a **Domain property** for the production root domain because it covers protocols, subdomains, and paths. Domain properties require DNS verification. Use a URL-prefix property only when DNS access is unavailable or deliberately out of scope. Adding a property does not change the site's search behavior. See Google's [property documentation](https://support.google.com/webmasters/answer/34592).

Record only:

- property type: `domain` or `url-prefix`
- sanitized property label, normally the public production domain
- responsible owner role
- verification method and verification date

Do not record the verification token.

### 2. Verify Ownership Without Repository Secrets

Google supports DNS records and, for URL-prefix properties, HTML file, HTML tag, Google Analytics, or Google Tag Manager verification. Google recommends retaining valid verification methods and allows multiple methods for resilience. See [Verify your site ownership](https://support.google.com/webmasters/answer/9008080) and [Manage owners and permissions](https://support.google.com/webmasters/answer/7687615).

Use this order for a static deployment:

1. **DNS TXT, recommended:** add the value directly in the DNS provider. Never place the TXT value in Git, an issue, a pull request, build output, or the monthly evidence file.
2. **Provider-managed secret injection:** if a URL-prefix HTML tag or file is unavoidable, inject it outside the public repository and document only the method. Confirm that the deployment process cannot print the value.
3. **Analytics or Tag Manager:** use only when the site already uses the service and the verifying account has the required permission. Do not add analytics solely to avoid DNS verification.

After verification:

- add at least one recovery owner using a separately controlled account or verification method;
- grant delegated users only the access they need;
- review owners and users monthly;
- never delete an unfamiliar verification token before checking whether another Google service depends on it.

### 3. Submit the Production Sitemap

1. Build the production branch and confirm the canonical production origin.
2. Open the generated sitemap URL, normally `https://<production-domain>/sitemap-index.xml` for this Astro setup.
3. Confirm the sitemap returns `200`, contains absolute canonical production URLs, and excludes staging, drafts, redirects, error pages, and `noindex` pages.
4. In Search Console, open **Sitemaps**, submit the sitemap URL, and record the submission status and date.
5. Recheck after Google processes it. A successful submission helps discovery; it does not guarantee crawling, indexing, or ranking.

Google recommends root-level sitemaps, absolute URLs, and canonical URLs intended for search. See [Build and submit a sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap).

## Staging and Production

| Environment | Search Console | Sitemap submission | Indexing control | Evidence |
| --- | --- | --- | --- | --- |
| Production (`main`) | Verify and monitor | Submit | Indexable | Monthly review |
| Staging (`release`) | Do not add routinely | Do not submit | Access control preferred; otherwise `noindex` | Record control check only |

For staging:

- Prefer Cloudflare Access, HTTP authentication, or equivalent access control. Google states that password protection prevents private content from appearing in Search.
- If staging must remain public, send `noindex` in HTML or the `X-Robots-Tag` response header on every staging response.
- Do not rely on `robots.txt` alone to hide staging. A blocked URL can still be indexed without page content, and a crawler blocked by robots cannot read a page-level `noindex` rule.
- Never include staging URLs in production canonical tags, internal production links, feeds, or sitemaps.
- Before production release, verify that production responses do not inherit staging authentication or `noindex` headers.

See Google's guidance on [controlling shared content](https://developers.google.com/search/docs/crawling-indexing/control-what-you-share), [`noindex`](https://developers.google.com/search/docs/crawling-indexing/block-indexing), and [robots.txt limitations](https://developers.google.com/search/docs/crawling-indexing/robots/intro).

## Monthly Review

Run once per calendar month and after a domain move, large template change, security incident, or unexplained search drop. Use the same reporting window for comparisons and state it in the evidence file. Search Console data is delayed and sampled in some reports, so avoid interpreting a partial recent day as a trend. See [About Search Console data](https://support.google.com/webmasters/answer/96568).

### 1. Access and Ownership

- Confirm the production property still shows verified ownership.
- Review users, delegated owners, and verified owners; remove obsolete access through the approved owner process.
- Confirm at least one recovery method remains valid.
- Record status and review date, never token details.

### 2. Sitemap and Indexing

- Check **Sitemaps** for fetch or parsing errors and compare discovered URL movement with intentional publishing changes.
- Check **Page indexing** for indexed and not-indexed totals and material changes by reason.
- Treat expected exclusions—redirects, canonical duplicates, drafts, or intentional `noindex`—separately from unexpected exclusions.
- Use **URL Inspection** for representative new pages, important changed pages, and samples from unexpected issue groups.
- Request indexing only for important new or corrected URLs; recrawling can still take days or weeks.

The Page indexing report describes pages Google attempted to crawl; URL Inspection is the source for an individual URL. See [Page indexing guidance](https://support.google.com/webmasters/answer/10264824) and [URL Inspection](https://support.google.com/webmasters/answer/12482179).

### 3. Search Performance

- Compare the completed review period with an equal preceding period.
- Record clicks, impressions, CTR, and average position.
- Review queries, pages, countries, devices, and available search appearances.
- Note high-impression/low-CTR pages, material losses, new demand, unexpected queries, and differences between mobile and desktop.
- Check Google's data anomaly notes before treating an abrupt report change as a site regression.
- Do not turn a single metric movement into a content recommendation without the period, affected pages or queries, and a plausible user need.

Search Console attributes most performance data to canonical URLs and omits some anonymized or lower-volume query rows. See [Performance report tasks](https://support.google.com/webmasters/answer/17010961) and [dimensions and data grouping](https://support.google.com/webmasters/answer/17011259).

### 4. Manual Actions and Security

- Open **Manual actions**, mark the check `verified`, and record `clear` or the exact reported action category as its result.
- Open **Security issues**, mark the check `verified`, and record `clear` or the exact reported issue category as its result.
- Any non-clear result is an incident, not a monthly backlog item: stop unrelated SEO changes, preserve evidence privately, notify the owner, investigate the affected deployment and repository access, remediate, then follow Google's review process.
- Do not browse a suspected malware page directly; use the report, URL Inspection, or controlled command-line retrieval.

See [Manual actions](https://support.google.com/webmasters/answer/9044175) and [Security issues](https://support.google.com/webmasters/answer/9044101).

### 5. Core Web Vitals

- Review both **Mobile** and **Desktop**.
- Record Good, Needs improvement, and Poor URL counts plus affected LCP, INP, or CLS groups.
- Treat `no data` as insufficient field data, not a passing result.
- Link each regression to representative templates and issue groups before proposing code changes.
- After a fix is deployed to all affected URLs, start validation and record its state. Search Console validation monitors field data for 28 days; it does not trigger indexing.

The report uses real-user CrUX data, groups similar URLs, and assigns a group its worst metric status. See [Core Web Vitals report](https://support.google.com/webmasters/answer/9205520).

## Evidence Workflow for Agents

### Create a sanitized review artifact

1. Copy `content-plans/search-console-monthly-review.template.yaml` to a dated review file outside the template path.
2. Set an explicit, complete `review_period`. Search Analytics API dates are inclusive and interpreted in Pacific Time. Prefer finalized data for a monthly review; label fresh data explicitly when it is unavoidable. See the official [Search Analytics API request contract](https://developers.google.com/webmaster-tools/v1/searchanalytics/query).
3. Record totals and sanitized rows for query, page, country, and device with clicks, impressions, CTR, and average position. CTR uses a value from `0` to `1`. Country uses the three-letter ISO code and device uses the API values `DESKTOP`, `MOBILE`, or `TABLET`.
4. State whether the export is aggregated by property or page. These aggregation modes count impressions, clicks, and position differently, so do not compare them as interchangeable totals. See [Performance report data aggregation](https://support.google.com/webmasters/answer/17011364).
5. Keep at least one limitation note. Search Console can omit anonymized queries and does not guarantee every lower-volume row, while chart totals can still include omitted queries. See [dimensions and data groupings](https://support.google.com/webmasters/answer/17011259).
6. Mark every operational check `verified`, `issue`, `not-available`, or `not-checked`. Missing access or missing data is never `verified`.
7. Commit no tokens, account identifiers, authorization data, cookies, authenticated Search Console URLs, or raw private exports. Use a neutral local ticket or review identifier for `evidence_ref`.

Validate the artifact before review:

```sh
pnpm exec tsx scripts/search-evidence.ts validate content-plans/search-console-review-YYYY-MM.yaml
```

Validation rejects unknown fields, credential-like data, incomplete dimensions, invalid metric ranges, recommendation periods that differ from the observed period, and references to missing observations.

### Turn approved evidence into planning input

Each recommendation must keep four things together:

- one or more observation IDs containing the measured query or page and its metrics;
- the exact observed period;
- a concrete reader need;
- a content gap and a reviewable action against named planning targets.

Mark the review and individual recommendations `approved` only after a human verifies the sanitization, observations, reader need, and proposed target. Then generate a narrow planning input:

```sh
pnpm exec tsx scripts/search-evidence.ts plan \
  content-plans/search-console-review-YYYY-MM.yaml \
  --output content-plans/search-planning-input-YYYY-MM.yaml
```

The generated file copies only approved recommendations and their cited observations. It does not edit `site-plan.yaml`, create briefs, change publication state, or publish content. An agent must use it as evidence when revising topic research, a series plan, or an article brief through the normal content pipeline.

Search evidence is a signal about observed discovery and reader wording, not a topic factory. Google recommends examining impacted pages and searches while evaluating whether content is useful, original, complete, and satisfying for the site's intended audience. It also identifies producing many topics mainly to attract search traffic as a search-engine-first warning sign. See [Creating helpful, reliable, people-first content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content).

Therefore:

- do not infer reader intent from impressions alone;
- do not treat average position as a standalone target—Google recommends focusing more on click and impression trends than position alone in its [Performance report tasks](https://support.google.com/webmasters/answer/17010961);
- reject bulk topic expansion supported only by keyword volume or apparent search demand;
- require reader research, first-hand expertise, or an explicit business priority before approving any bulk expansion;
- prefer improving, consolidating, or investigating an existing page when that better serves the cited reader need.

Open a reviewable pull request containing the sanitized review, optional generated planning input, and separately reviewed planning changes.

An agent may propose actions, but manual-action responses, security review requests, access changes, and production indexing decisions require owner approval.
