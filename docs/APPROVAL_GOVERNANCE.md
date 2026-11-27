# ULTRON v1.5 — Approval governance

- Approval request validation is centralized in `lib/approval-policy.js`.
- Requests expire after seven days. Legacy pending records without an explicit expiry use their creation time plus seven days.
- The pending queue is limited to 50; historical records are retained up to the existing 200-record cap.
- Expiration is applied when listing approvals, viewing Security Center, and attempting to review a request.
- Review decisions record timestamp and the current single-operator reviewer label.
- The authenticated `GET /api/security/center` endpoint reports approval counts, configured guardrails, and recent security events. It never returns secrets or session tokens.
- Approval means review status only. No external executor is connected. Sending messages, publishing content, deleting data, modifying calendars, and moving money remain unavailable.
- Trading remains simulation-only.
- This is not multi-user role-based access control. A future multi-user release must add identities, roles, scope checks, and immutable review attribution.
