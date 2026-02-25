# Publishing Guide - @olbrain/js-sdk

This guide explains how to publish the Olbrain JavaScript SDK to npm under the `@olbrain` organization.

## Prerequisites

1. **npm Account** - You must have an npm account
2. **Organization Access** - You must have access to the `@olbrain` organization on npm
3. **npm Login** - Be logged in locally via `npm login`

## Pre-Publishing Checklist

Before publishing, ensure:

- [ ] All tests pass: `npm test`
- [ ] Build is clean: `npm run build`
- [ ] Version bumped in `package.json` (if updating existing version)
- [ ] Git changes committed (recommended)
- [ ] README.md is up to date
- [ ] CHANGELOG.md reflects changes (optional)

## Step 1: Verify npm Login

```bash
npm whoami
```

You should see your npm username. If not, login:

```bash
npm login
```

## Step 2: Verify Organization Access

Check that you have access to the `@olbrain` organization:

```bash
npm org ls @olbrain
```

You should see organization members listed.

## Step 3: Build the Package

```bash
cd /Users/nishants/Desktop/olbrain-js-sdk
npm run build
```

Verify `dist/` directory is populated with all outputs:
- `dist/index.js` (CJS)
- `dist/index.mjs` (ESM)
- `dist/index.global.js` (UMD)
- `dist/widget.widget.global.js` (Widget UMD)
- `dist/*.d.ts` (TypeScript definitions)

## Step 4: Dry Run (Recommended)

Test publishing without actually publishing:

```bash
npm publish --dry-run
```

This shows exactly what will be published. Verify:
- Package name: `@olbrain/js-sdk`
- All files in `dist/` are included
- No sensitive files are included
- Version number is correct

## Step 5: Publish to npm

```bash
npm publish
```

The package will be published to npm as `@olbrain/js-sdk`.

## Step 6: Verify Publication

```bash
npm view @olbrain/js-sdk
```

You should see package details, including:
- Latest version
- Tarball size
- Dependencies
- Homepage and repository links

## Step 7: Test Installation

In a different directory, test the installation:

```bash
mkdir /tmp/test-install
cd /tmp/test-install
npm init -y
npm install @olbrain/js-sdk

# Test it works
node -e "const { AgentClient } = require('@olbrain/js-sdk'); console.log('✅ Package installed successfully')"
```

## Version Management

### Initial Release
- Version: `1.0.0`
- Use `npm publish` for first-time publishing

### Updates

Use semantic versioning:

```bash
# Bug fix
npm version patch  # 1.0.0 → 1.0.1
npm publish

# New feature
npm version minor  # 1.0.1 → 1.1.0
npm publish

# Breaking change
npm version major  # 1.1.0 → 2.0.0
npm publish
```

## Updating Package

To publish a new version:

1. Make your code changes
2. Update version: `npm version minor` (or patch/major)
3. Build: `npm run build`
4. Publish: `npm publish`

## Troubleshooting

### "You do not have permission to publish"

- Verify you're logged in: `npm whoami`
- Verify organization access: `npm org ls @olbrain`
- Check that package name is `@olbrain/js-sdk`

### "Package already exists"

- Increment version in `package.json`
- Run `npm version` to auto-update version and create git tag

### "Invalid authentication token"

- Re-login: `npm logout` then `npm login`
- Or set token in `.npmrc`:
  ```
  //registry.npmjs.org/:_authToken=YOUR_TOKEN
  ```

### "Scope not associated with this user"

- The `@olbrain` organization may not be set up
- Contact npm organization admin to:
  1. Create the organization
  2. Add you as a member
  3. Grant publish permissions

## Publishing Scoped Packages

**Important:** The `publishConfig` in `package.json` ensures scoped packages are published publicly:

```json
{
  "publishConfig": {
    "access": "public"
  }
}
```

Without this, scoped packages default to private (which requires a paid npm plan).

## Browser Distribution

The published package includes multiple build formats:

```javascript
// CommonJS (Node.js)
const { AgentClient } = require('@olbrain/js-sdk');

// ES Modules
import { AgentClient } from '@olbrain/js-sdk';

// Browser (Global)
<script src="https://unpkg.com/@olbrain/js-sdk@latest/dist/index.global.js"></script>
<script>
  const client = new Olbrain.AgentClient({...});
</script>

// Browser Widget
<script src="https://unpkg.com/@olbrain/js-sdk@latest/dist/widget.widget.global.js"></script>
<script>
  new OlbrainWidget.ChatWidget({...}).mount();
</script>
```

## After Publishing

### Update Documentation

Update references in:
- `README.md` - Installation instructions
- GitHub releases - What's new in this version
- Changelog - Version history

### Announce Release

- GitHub Releases page
- Discord/Slack announcements
- Twitter/social media

### Monitor Installation

Track package usage on npmjs.com:
```
https://www.npmjs.com/package/@olbrain/js-sdk
```

## Support

For npm publishing issues:
- [npm Documentation](https://docs.npmjs.com/)
- [npm Scoped Packages](https://docs.npmjs.com/about-scopes)
- [npm Publishing](https://docs.npmjs.com/creating-and-publishing-unscoped-public-packages)
