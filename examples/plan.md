# A safer, simpler workspace invite flow

Let workspace admins invite teammates by email, with single-use links and a clear audit trail. Keep the existing sign-in flow and ship behind a workspace flag.

## Decision: use single-use, expiring invite tokens

Store only a hash of each invite token. Tokens expire after 72 hours and are consumed in the same database transaction that creates membership.
This avoids reusable links and prevents two requests from redeeming one invite.
Alternative: signed JWT invites avoid a lookup, but revocation and one-time use would still require state.
Consequence: accepting an invite now depends on a database transaction.
Files: src/server/invites.ts, prisma/schema.prisma

## Decision: deliver email through the existing job queue

Create the invite and an email outbox record in the same transaction. The worker retries delivery using the invite ID as its idempotency key.
An inline provider call is simpler, but provider outages would block the admin request.
Files: src/jobs/send-invite.ts

## Assumption: invited users have one verified email

Membership matching depends on the authentication provider returning a verified email address.
Confirm how aliases and enterprise SSO accounts behave before implementation.

## Risk: duplicate membership during concurrent acceptance

Two acceptance requests may arrive at the same time. A unique constraint on workspace and user, plus atomic token consumption, must prevent duplicate membership.

## Phase 1: add the invite data model

Add hashed token, expiry, inviter, workspace, consumed timestamp, and an outbox record. Add a unique workspace/user membership constraint.
Files: prisma/schema.prisma, prisma/migrations/add_invites.sql

## Phase 2: implement invite creation and acceptance

Add admin-only creation and resend endpoints. Validate verified email, workspace, token expiry, and single use during acceptance.
Depends on the invite data model and both architecture decisions.
Files: src/server/invites.ts, src/app/api/invites/route.ts

## Phase 3: build the admin invite experience

Add an invite dialog, pending invitation list, resend action, and acceptance states. Use the invitation endpoints from phase 2.
Files: src/components/invite-dialog.tsx, src/app/invite/page.tsx

## Phase 4: test concurrency and enable a staged rollout

Test concurrent acceptance, expired links, cross-workspace access, and email retries. Enable the flag for internal workspaces before general rollout.
Depends on the acceptance endpoints and the admin interface.
Files: tests/invites.test.ts

## Claim: an outbox keeps invitations recoverable

A committed invite always has a corresponding email job. Retrying that job does not create another invite.
Supports the decision to deliver email through the existing queue.

## Objection: 72 hours may be too short for enterprise onboarding

Security gains need to be weighed against weekend delays. Consider a configurable lifetime or a low-friction resend flow.
Challenges the default token lifetime.
