---
title: GitHub Pages Setup
description: How to publish the prompt-to-json docs folder with GitHub Pages.
---

# GitHub Pages Setup

This repo now has a lightweight GitHub Pages-ready docs site in the `docs/` folder.

Pages included:

- [`docs/index.md`](./index.md) — docs landing page
- [`docs/content-marketing-plan.md`](./content-marketing-plan.md) — YouTube and short-form content strategy
- [`docs/pi-integration.md`](./pi-integration.md) — Pi integration notes

## Recommended setup: deploy from `/docs`

Use GitHub's built-in Pages publishing from a branch.

1. Push this repo to GitHub.
2. Open the repository on GitHub.
3. Go to **Settings** -> **Pages**.
4. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
5. Choose the default branch, usually `main`.
6. Set the folder to `/docs`.
7. Click **Save**.

GitHub Pages will publish the Markdown files from `docs/` as a static site.

The public URL will usually look like:

```text
https://<github-user-or-org>.github.io/<repo-name>/
```

For this project, that may be:

```text
https://<github-user-or-org>.github.io/prompt-to-json/
```

## Optional: add a custom domain

If you own a domain, add it in **Settings** -> **Pages** -> **Custom domain**.

Example domains:

```text
prompt-to-json.dev
docs.prompt-to-json.dev
```

If you use a custom domain, also create a `docs/CNAME` file containing only the domain name.

Example:

```text
prompt-to-json.dev
```

## Optional: use a theme

The docs can work without a custom theme. If you want a basic GitHub Pages theme, keep or edit [`docs/_config.yml`](./_config.yml).

## Local preview

GitHub renders these Markdown files automatically. For a quick local review, opening the files in an editor is usually enough.

If you want to preview the generated GitHub Pages site exactly, install Ruby/Jekyll and run it from the `docs` directory:

```bash
cd docs
bundle init
bundle add github-pages
bundle exec jekyll serve
```

This is optional. The project runtime does not require Ruby or Jekyll.

## Suggested public docs structure

Recommended top-level Pages navigation:

1. Home
2. README / Quickstart
3. Contracts
4. MCP tools
5. Studio
6. Pi integration
7. Content marketing plan

For now, the docs site intentionally stays minimal and links back to the main README for product usage details.
