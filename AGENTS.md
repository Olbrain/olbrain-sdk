# Olbrain SDKs — start here

Each SDK ships its own complete, offline API reference. These files are
included in the published packages, so they're available wherever the package
is installed.

| SDK | Reference | Installed at |
|---|---|---|
| JavaScript / TypeScript (`@olbrain/js-sdk`) | [packages/js/AGENTS.md](packages/js/AGENTS.md) | `node_modules/@olbrain/js-sdk/AGENTS.md` |
| Python (`olbrain-python-sdk`, import `olbrain`) | [packages/python/olbrain/AGENTS.md](packages/python/olbrain/AGENTS.md) | `site-packages/olbrain/AGENTS.md` |

The two SDKs cover different things. Python has the conversational
`AgentClient` only. JavaScript has `AgentClient`, the `ChatWidget`, and the
`Olbrain` client for workflow runs, approvals and research agents.

If you change a public API, update that package's `AGENTS.md` in the same PR.
