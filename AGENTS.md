# Olbrain SDKs — start here

Each SDK ships its own complete, offline API reference. These files are
included in the published packages, so they're available wherever the package
is installed.

| SDK | Reference | Installed at |
|---|---|---|
| JavaScript / TypeScript (`@olbrain/js-sdk`) | [packages/js/AGENTS.md](packages/js/AGENTS.md) | `node_modules/@olbrain/js-sdk/AGENTS.md` |
| Python (`olbrain-python-sdk`, import `olbrain`) | [packages/python/olbrain/AGENTS.md](packages/python/olbrain/AGENTS.md) | `site-packages/olbrain/AGENTS.md` |

Both SDKs have the conversational `AgentClient` and the `Olbrain` client for
workflow runs, approvals and research agents. JavaScript also has the browser
`ChatWidget`; its `research.live.*` polling subscriptions are JavaScript-only.

If you change a public API, update that package's `AGENTS.md` in the same PR.
