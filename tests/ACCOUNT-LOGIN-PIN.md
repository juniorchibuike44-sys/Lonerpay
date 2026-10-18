Account login PIN validation

Run `node --test tests/account-login-pin-*.test.mjs tests/session-logout.test.cjs`.

Run `supabase/account-login-pin.sql` after the existing login-pin-setup.sql. It returns installed=account-login-pin-v1. No PIN is cleared by this migration. The account proof has no expiry; 30-day device approvals remain separate.

An existing legacy PIN migrates after its next correct unlock, or after email/password login and entry of that PIN on another device. Existing device proofs, including expired ones, can validate a migration only for the authenticated account. If previous devices had different PINs, the first successfully migrated PIN becomes the account PIN; a deliberate reset remains available.

New-device linking requires an authenticated account session plus its existing PIN. Account PIN creation and reset require password re-verification. Creation cannot replace an existing account/legacy PIN. Reset revokes every old device approval. PIN attempts share a database lockout across devices; account context and proofs are service-only. No plaintext PIN, password or session secret is logged or stored by the new code.

Tests cover two devices, expired approvals, legacy migration, reset invalidation, shared lockout, denied anonymous database access, owner isolation, PIN session issuance, MFA preservation, existing-PIN UI and logout/Back protection. They use simulated accounts and PGlite PostgreSQL; real cross-device verification remains required after the production SQL update.
