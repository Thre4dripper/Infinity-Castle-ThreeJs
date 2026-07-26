# Contributing to Infinity Castle

Thank you for helping improve Infinity Castle. Contributions should preserve the experience's deterministic generation, responsive controls, and ability to run smoothly across desktop and touch devices.

By participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Before You Start

- Search existing issues before opening a new one.
- Use the bug report form for reproducible defects and include the castle seed when relevant.
- Use the feature request form for behavior or design proposals.
- Keep security vulnerabilities private and follow [SECURITY.md](SECURITY.md).
- For a large change, open an issue before investing in an implementation.

## Local Setup

```sh
git clone <repository-url>
cd <repository-directory>
npm ci
npm run dev
```

Use a current Node.js release supported by the project. The development server prints the local URL when it starts.

## Development Workflow

1. Create a focused branch from `main`.
2. Make the smallest coherent change that solves the issue.
3. Preserve seeded behavior where practical. A URL such as `?seed=99` is useful for before-and-after comparisons.
4. Run the required checks.
5. Commit related changes together using a concise, imperative message.
6. Open a pull request and complete the template.

Use Conventional Commit-style subjects when possible:

```text
feat: add a new district archetype
fix: prevent tunneling at high flight speed
docs: explain the gallery routes
```

## Required Checks

```sh
npm run typecheck
npm run build
```

For rendering, controls, or procedural generation changes, also test the affected flow in a browser. Include the seed, quality tier, browser, and device class in the pull request when they matter to the result.

The development galleries can isolate geometry changes:

- `?dev=parts` for individual kit pieces
- `?dev=modules` for generated room modules

## Code Guidelines

- Follow the existing strict TypeScript style: two-space indentation, single quotes, and semicolons.
- Keep generated worlds deterministic for a given seed. Do not use unseeded randomness in generation paths.
- Dispose of Three.js geometry, materials, or render targets when their lifetime ends.
- Keep frame-loop allocations and synchronous world-building work small.
- Route desktop and touch behavior through the shared input abstractions.
- Add comments only when intent or a non-obvious constraint is not clear from the code.

## Pull Requests

A pull request should:

- Address one coherent concern.
- Explain the user-visible and technical effect.
- Link the related issue when one exists.
- Describe manual and automated validation.
- Include screenshots or a short capture for meaningful visual changes.
- Update documentation when commands, controls, behavior, or architecture change.

Maintainers may ask for a change to be split when independent concerns would be clearer as separate commits or pull requests.