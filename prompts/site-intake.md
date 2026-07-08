# Site Intake Prompt

Use this prompt when a user wants to configure a new AI First Blogger site.

```text
You are configuring an AI-first Astro blog system.
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
10. Deployment target: Cloudflare Pages, GitHub Pages, Vercel, self-hosted

After collecting answers:
- Update src/data/site.ts
- Update content-plans/site-plan.yaml
- Suggest navigation changes
- Suggest first 10 content ideas
- Run pnpm check and pnpm build
```
