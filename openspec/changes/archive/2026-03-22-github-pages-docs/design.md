## Context

iroh-ts has a README with full API reference and two browser examples (chat, poker) that build with Vite. The package is published as `@salvatoret/iroh` on npm. Examples currently use `workspace:*` for local dev but need the published package for CI builds. The repo is at `github.com/SalvatoreT/iroh-ts`.

## Goals / Non-Goals

**Goals:**
- Static docs site hosted at `salvatoret.github.io/iroh-ts/`
- Live examples at `/iroh-ts/chat/` and `/iroh-ts/poker/`
- Single GitHub Actions workflow that builds everything and deploys on push to `main`
- Zero external dependencies for the docs site (plain HTML/CSS)

**Non-Goals:**
- Static site generators (VitePress, Docusaurus, etc.) — too heavy for this project size
- Custom domain — GitHub Pages default URL is fine
- Building the Rust/WASM crate in CI — examples use the published npm package

## Decisions

### 1. Plain HTML docs site

**Choice:** Hand-written HTML/CSS in a `docs/` directory, styled to match the project.

**Rationale:** The README already contains the full API reference. The docs site is a landing page + navigation wrapper around the same content. No build step needed for the docs themselves. Keeps it simple and fast.

### 2. GitHub Actions workflow deploys everything

**Choice:** Single `.github/workflows/pages.yml` workflow triggered on push to `main`:
1. Copies `docs/` to the output directory
2. Builds `examples/chat/` and `examples/poker/` with Vite (using published npm package)
3. Copies built example `dist/` output into the site
4. Deploys via `actions/deploy-pages`

**Rationale:** One workflow, one deployment. Examples are built fresh from source on every push using the latest published `@salvatoret/iroh` package, ensuring they always work with the released version.

### 3. Swap workspace link for published package in CI

**Choice:** The CI workflow modifies the example `package.json` files to replace `"workspace:*"` with the latest published version before running `pnpm install` + `vite build`.

**Rationale:** Locally, `workspace:*` is needed for development. In CI, we want to verify examples work with the published package. A simple `sed` swap in the workflow avoids maintaining two sets of package.json files.

### 4. Site structure

```
GitHub Pages output:
/iroh-ts/                    # docs landing page
/iroh-ts/index.html
/iroh-ts/chat/               # live chat example
/iroh-ts/chat/index.html
/iroh-ts/chat/assets/...
/iroh-ts/poker/              # live poker example
/iroh-ts/poker/index.html
/iroh-ts/poker/assets/...
```

The Vite examples need `base: '/iroh-ts/chat/'` (etc.) configured so asset paths work under the GitHub Pages subdirectory.

## Risks / Trade-offs

- **[npm package version lag]** → Examples in CI use whatever version is published. If code changes but the package isn't republished, examples may be stale. Mitigation: Publish before pushing docs changes. Could add a check in CI.

- **[Vite base path]** → Examples need correct `base` config for GitHub Pages subdirectory. Mitigation: Set via environment variable in CI workflow so local dev still uses `/`.
