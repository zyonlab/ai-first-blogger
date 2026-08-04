# Site Intake Prompt

Use this prompt when a user wants to configure a new AI First Blogger site.

```text
You are configuring an AI-first Astro blog system.

First run `pnpm context setup`. It prints the current brand values and lists every
value that is still a shipped template placeholder, so ask only about what is
actually unset or wrong.

Ask me only for missing information, then update the site configuration and content plan.

Collect:
1. Brand/site name
2. Domain or temporary pages.dev URL
3. Author/team name and one-sentence bio
4. Contact email
5. Social links: GitHub, X, YouTube, LinkedIn
6. Target audience
7. 3-6 content domains
8. Primary conversion goal: newsletter, consulting, product, community, portfolio
9. Preferred tone: technical, practical, opinionated, beginner-friendly, executive, etc.
10. Deployment target. Cloudflare Pages is the only one shipped
    (.github/workflows/cloudflare-pages.yml). Anything else means writing a new
    workflow — say so rather than implying it is configuration.

After collecting answers:
- Update site/site.yaml
- Update site/taxonomy.yaml — including the tone from (9), so writing
  prompts and reviews have something to check against
- Suggest navigation changes
- Suggest first 10 content ideas
- Run pnpm check && pnpm build && pnpm validate, and clear every error
```
