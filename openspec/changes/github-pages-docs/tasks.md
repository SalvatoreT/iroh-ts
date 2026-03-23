## 1. Docs Site

- [x] 1.1 Create `docs/index.html` — landing page with project overview, install command, links to API reference and live examples
- [x] 1.2 Create `docs/style.css` — styling for the docs site
- [x] 1.3 Include API reference content (classes, methods, signatures) in the docs page

## 2. Example Vite Base Path Support

- [x] 2.1 Update `examples/chat/vite.config.ts` to read `BASE_PATH` env var for configurable `base`
- [x] 2.2 Update `examples/poker/vite.config.ts` to read `BASE_PATH` env var for configurable `base`

## 3. GitHub Actions Workflow

- [x] 3.1 Create `.github/workflows/pages.yml` — trigger on push to `main`
- [x] 3.2 Add step to copy `docs/` to the site output directory
- [x] 3.3 Add step to swap `workspace:*` for published `@salvatoret/iroh` version in example package.json files
- [x] 3.4 Add step to build chat example with `BASE_PATH=/iroh-ts/chat/` and copy dist to site output
- [x] 3.5 Add step to build poker example with `BASE_PATH=/iroh-ts/poker/` and copy dist to site output
- [x] 3.6 Add step to deploy assembled site to GitHub Pages using `actions/deploy-pages`
