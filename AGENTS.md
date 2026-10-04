# Guidelines

Do not worry about backward compatibility. This project is not being used in production yet.

Write readable code with proper line breaks. The existing code might be a poor example of this.

Any changes to documentation files should be for future readers. Describe the current setup and behavior without bloating the documentation files with explanations of recent edits.

## Commit Message Conventions

Use Conventional Commits for commit messages and pull request titles: `<type>: <summary>` with a concise, imperative summary. Choose the appropriate prefix, such as `feat`, `fix`, `docs`, `test`, `refactor`, or `chore`, and follow the repository's existing conventions.

For more complex changes, keep the commit message's first line concise, then add a blank line followed by bullet points describing the changes. Use the same structure for pull request descriptions: an opening summary followed by a blank line and useful bullet points. Scale the detail to the change.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
