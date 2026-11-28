# Release Checklist

Use this checklist for every production release.

## Source and change review
- [ ] Confirm the target branch and exact commit.
- [ ] Inspect every changed file and verify no local secrets or user data are included.
- [ ] Confirm the release does not overwrite a newer local project snapshot with an older repository snapshot.
- [ ] Confirm capability labels match implemented behavior.

## Automated verification
- [ ] GitHub Actions passes on Node.js 20.
- [ ] GitHub Actions passes on Node.js 22.
- [ ] GitHub Actions passes on Node.js 24.
- [ ] `npm run check` passes, including all Node test suites.
- [ ] No unexpected dependency or lockfile changes are present.

## Staging verification
- [ ] HTTPS and trusted-proxy configuration are correct.
- [ ] Health endpoint reports the expected database mode.
- [ ] First-run setup is disabled after the administrator exists.
- [ ] Login, session persistence, logout, and session revocation work.
- [ ] CSRF-protected requests reject missing or invalid tokens.
- [ ] Rate limits remain enabled and return useful JSON errors.
- [ ] Database persistence survives a restart.
- [ ] Backup export excludes credentials and session secrets.

## Safety and release
- [ ] External integrations are clearly marked connected, unavailable, or planned.
- [ ] No external write action runs without explicit authorization.
- [ ] Trading remains simulation-only unless a separate risk-reviewed system exists.
- [ ] Rollback revision and recovery owner are known.
- [ ] Production promotion is performed only after staging verification.
