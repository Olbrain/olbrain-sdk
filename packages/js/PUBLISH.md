# Publishing @olbrain/js-sdk

Releases are published by `.github/workflows/publish-js-sdk.yml` when a tag `js-v<version>` is pushed.

1. Bump `version` in `packages/js/package.json` and `VERSION` in `packages/js/src/index.ts`, and merge to `main`.
2. Tag the merge commit: `git tag js-v1.2.0 <sha> && git push origin js-v1.2.0`.
3. The workflow checks that the tag matches `package.json`, then runs the typecheck, tests and build, and publishes to npm.

The workflow needs the repository secret `NPM_TOKEN`, an npm automation token with publish rights on the `@olbrain` scope.
