# Contributing to CLAUDECLAW OS

Thank you for your interest in contributing! This document provides guidelines for bug reports, feature requests, and code contributions.

## Code of Conduct

By participating in this project, you agree to abide by our Code of Conduct. Please be respectful and professional in all interactions.

## How to Contribute

### 1. Reporting Bugs
- Please check existing issues before filing a new one.
- Use the issue tracker to report bugs. Include a clear description of the issue, steps to reproduce, and any relevant logs or error messages. Let us know what environment you are running (Node version, OS).

### 2. Suggesting Features
- Feature requests are welcome! Create an issue describing the feature and its use case.
- For large features, please discuss it in an issue before writing code to ensure it aligns with the project's roadmap.

### 3. Submitting Pull Requests
1. **Fork the repository** and create a branch for your feature or bug fix (`git checkout -b feature/my-new-feature`).
2. **Setup your environment:**
   ```bash
   cp .env.example .env
   npm install
   npm run build
   ```
3. **Make your changes:** Follow the project's coding style (TypeScript, strict mode, ESM). 
4. **Test your code:** Run the test suite to ensure no regressions.
   ```bash
   npm run typecheck
   npm run test
   ```
5. **Commit your changes:** Use clear and descriptive commit messages.
6. **Push and create a PR:** Push your branch to GitHub and open a Pull Request against the `main` branch.

## Architecture & Code Structure

Before diving in, please read our [Technical Specification](docs/TECHNICAL_SPEC.md) and [Product Requirements Document](docs/PRD.md). They outline the 5-layer architecture, agent setups, and core interactions.

- `src/` — Core TypeScript engine.
- `agents/` — Agent configurations (`agent.yaml` and `CLAUDE.md`).
- `warroom/` — Python Pipecat backend and Websocket orchestrator.
- `skills/` — Custom skills integrations (like Pika).

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
