## Why

The project has a comprehensive README and two working browser examples (chat + poker), but no hosted documentation site. Developers can't try the examples without cloning the repo and building locally. A GitHub Pages site gives the project a public presence, hosts live examples, and makes the API docs browsable.

## What Changes

- Create a static docs site deployable to GitHub Pages (simple HTML/CSS, no static site generator needed)
- Host the chat and poker examples as live demos accessible from the docs site
- Add a GitHub Actions workflow on `main` that builds the docs site + examples and deploys to GitHub Pages
- Examples in the CI build use the published `@salvatoret/iroh` npm package instead of `workspace:*` so they build independently

## Capabilities

### New Capabilities
- `docs-site`: Static documentation site with API reference, getting started guide, and links to live examples
- `gh-pages-deploy`: GitHub Actions workflow that builds and deploys docs + examples to GitHub Pages on push to main

### Modified Capabilities
- `chat-example`: CI build uses published npm package instead of workspace link
- `poker-example`: CI build uses published npm package instead of workspace link

## Impact

- **New files**: `docs/` directory with site content, `.github/workflows/pages.yml`
- **Modified files**: Example build process adapted for CI (npm package swap)
- **Infrastructure**: GitHub Pages enabled on the repo, deploys from GitHub Actions
- **No changes** to the core library, Rust crate, or existing tests
