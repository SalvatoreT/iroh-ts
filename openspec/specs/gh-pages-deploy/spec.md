## ADDED Requirements

### Requirement: GitHub Actions workflow builds and deploys on push to main
The repository SHALL have a `.github/workflows/pages.yml` workflow that triggers on push to `main` and deploys to GitHub Pages.

#### Scenario: Push to main triggers deployment
- **WHEN** a commit is pushed to the `main` branch
- **THEN** the workflow builds the docs site and examples, then deploys to GitHub Pages

### Requirement: Workflow builds examples with published npm package
The workflow SHALL replace `workspace:*` dependencies with the published `@salvatoret/iroh` package version before building examples.

#### Scenario: Examples build in CI
- **WHEN** the workflow builds the chat and poker examples
- **THEN** they install `@salvatoret/iroh` from npm (not workspace link) and produce static output

### Requirement: Workflow assembles site output
The workflow SHALL combine the docs site and built examples into a single directory structure for GitHub Pages deployment.

#### Scenario: Site structure after build
- **WHEN** the workflow completes
- **THEN** the deployed site has `/index.html` (docs), `/chat/` (chat example), and `/poker/` (poker example)
