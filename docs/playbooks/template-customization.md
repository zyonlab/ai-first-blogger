# Template Customization

## Main Configuration
Edit `src/data/site.ts` first. It controls:
- site name and title
- domain
- author name, bio, email
- social links
- hero copy and CTA buttons
- service/contact copy
- theme storage key

## Content Strategy
Edit `content-plans/site-plan.yaml` for audience, positioning, content pillars, SEO/GEO rules, and maintenance cadence.

## Writing Style

Put site- or author-specific writing skills under `.ai/site-skills/<skill-name>/`. Register enabled skills, versions, and stage hooks in `content-plans/site-plan.yaml#writing_skills.active`.

Do not edit the framework-native `.ai/skills/ai-first-blogger/SKILL.md` to add one author's voice or article structure. The content pipeline loads configured site skills through generic `before` and `after` hooks.

## Navigation
Edit `src/data/nav.ts` only when the information architecture changes.

## Content
Add MDX files under:
- `src/content/posts/`
- `src/content/videos/`
- `src/content/projects/`
- `src/content/case-studies/`

## Validation
Run:

```bash
pnpm check
pnpm build
```
