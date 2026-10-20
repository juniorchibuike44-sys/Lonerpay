# Google Play Data Safety review worksheet
Prepared 20 October 2026. Draft only; not submitted or approved.

## Evidence and limits
Reviewed the current repository privacy.html and docs/android-launch.md. This is an initial mapping of the disclosed practices, not a completed code, SDK, network, contract or retention audit. The owner confirmed the revised test APK opens and the main phone flows work on Redmi Note 14 Pro / Android 15. That does not verify all data practices or establish Play policy compliance.

Reference: https://support.google.com/googleplay/android-developer/answer/10787469
Privacy: https://lonerpay.com/privacy.html
Deletion: https://lonerpay.com/delete-account.html
Support: https://lonerpay.com/contact.html

The Android package opens LonerPay's controlled website. Assess the website, providers and enabled features as part of the app; native permissions alone do not establish data collection. Google defines collection as transmission off-device; ephemeral processing can still require a form response. Local-only processing is treated differently.

## Initial category mapping
| Google category | Disclosed LonerPay information | Review before submitting |
| --- | --- | --- |
| Personal info: name, email, phone, user IDs | Account/profile, authentication, recipient/customer identifiers | Determine required versus optional per data type and every enabled use. |
| Personal info: other info | BVN and other verification details | Verify fields and which party receives/processes each; do not claim all users must provide BVN. |
| Financial info: payment info, purchase history, other financial info as applicable | Wallet/funding, payment references, service purchases, invoices, repayment/credit records | Map actual fields to current Console definitions. Include provider checkout where applicable; not storing PAN/CVV does not by itself mean no payment-data declaration. |
| Messages: other in-app messages as applicable | Support and deletion requests | Confirm implementation and Console category definitions. |
| Photos and videos: photos | Business Tools product uploads | Confirm upload flow, storage, optional nature and public store-link behaviour. |
| Device or other IDs; app info/performance as applicable | Approved-device identifiers, security records, IP/technical logs | Inspect actual logs, IDs and SDK requests. Do not automatically call all technical information diagnostics. |
| Location: approximate/precise as applicable | Optional location and manual area search when in-app Places is enabled | Currently blocked on Google billing; verify release behaviour including external Maps. Classify coordinates by actual precision. Reassess before enabling. |
| Audio: voice/sound recordings, if applicable | Optional browser speech recognition may transmit audio to browser provider | Verify supported browsers, provider handling and any applicable system-service exclusions. Do not select “not collected” just because LonerPay does not retain audio. |

The privacy policy says device biometric checks do not deliver fingerprint images or face scans to LonerPay. Verify passkey implementation; public credentials and authentication metadata still require appropriate mapping.

## Purposes, sharing and security
- Candidate purposes: app functionality, account management, fraud prevention/security/compliance, developer communications where supported by actual use. Determine each separately for each data type.
- Distinguish collected from shared. Review payment/fulfilment providers, Supabase, Vercel, mail services, speech services, Maps and user-directed exports against actual roles and contracts.
- Google lists sharing exceptions for qualifying service providers, certain legal transfers and qualifying user-directed actions. Do not mark every provider transfer as shared automatically, or claim no sharing without checking these conditions.
- Verify every app/website/SDK data transmission is encrypted before affirming encryption in transit. HTTPS on the main website alone is not a complete audit.
- Verify deletion request delivery, identity checks, fulfilment and provider removal. Account freezing is not deletion. Document financial/security retention exceptions and actual periods; the policy's 30-day service target is not a universal erasure guarantee.
- No blanket “no data collected” declaration.
- Keep declarations aligned with all active versions/features distributed through Play.

## Release preparation status
- Store text drafted; gold/cream banner concept created.
- A privacy-redacted dashboard image was generated for review. It is an edited preview, not proof of final screenshot dimensions or pixel-faithful UI.
- User supplied services and data screenshots. Data screenshot displays saved bundles and a refresh warning: retain honest behaviour; do not fabricate a successful refresh.
- Final screenshots should be captured from the finished Play-installed release, without customer account identifiers or floating controls. Verify required image formats/dimensions at export.
- Production signing and website certificate association remain pending. A test debug APK is not the release upload bundle.
- D-U-N-S application status is awaiting provider clarification. Prestmit KYB is paused until the owner has the documents; gift cards remain preview-only.

## Material policy questions before Play upload
1. Business Tools digital subscription uses website checkout. Review applicable Play billing requirements/programs and implement the required release behaviour.
2. Enabled betting-wallet funding requires review against Play gambling/payment-facilitation rules and supported-country requirements.
3. Complete Financial features, app access/reviewer account, age/content rating and other Console declarations from actual functionality.

Do not resolve these by merely omitting services from the store description or screenshots. This worksheet does not authorise public rollout.
