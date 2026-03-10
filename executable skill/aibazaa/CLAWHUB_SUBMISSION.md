# ClawHub Submission — AIBazaa Skill

## Package Metadata

- Skill: `@aibazaa/openclaw-skill`
- Version: `1.0.0`
- Source folder: `openclaw-skill/aibazaa`
- Artifact path: `openclaw-skill/aibazaa/dist/clawhub/aibazaa-skill-1.0.0.tar.gz`

## Validation Checklist (Required)

- `pnpm run typecheck` passes
- `pnpm run lint` passes
- `pnpm run test` passes
- `pnpm run build` passes
- `pnpm run format` passes
- `pnpm run package:clawhub` generates tarball

## Submission Payload Contents

Generated archive includes:

- `aibazaa/SKILL.md`
- `aibazaa/aibazaa-client.ts`
- `aibazaa/config.json`
- `aibazaa/README.md`

## ClawHub Submission Procedure

1. Build package:
   ```bash
   pnpm run package:clawhub
   ```
2. Upload `dist/clawhub/aibazaa-skill-1.0.0.tar.gz` to ClawHub submission portal.
3. Use skill title `AIBazaa Marketplace` and include capability summary from `SKILL.md`.
4. Confirm release notes include security model: scoped keys, PKCE exchange, signed webhooks, replay protection.
