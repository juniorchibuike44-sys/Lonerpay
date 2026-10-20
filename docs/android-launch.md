# LonerPay Android and launch preparation

Prepared 20 October 2026. A test build is not Play approval or a production launch.

## Package and architecture

- Proposed release application ID: `com.lonerpay.app`, version 1 / 1.0.0. Confirm before the first Play upload; package identity becomes fixed after publication.
- Test application ID: `com.lonerpay.app.debug`, label **LonerPay Test**. It can be installed beside a later production build. Debug keys are not production signing keys; reinstalling a differently signed test build may require uninstalling the earlier test.
- This test APK opens the existing **live** LonerPay website. The label describes the Android package, not a free-payment sandbox. Purchases through it use the existing live account/provider setup.
- Native Java launcher plus Google Android Browser Helper Trusted Web Activity. Opens `https://lonerpay.com/index.html`; no embedded WebView, JavaScript bridge, provider keys or separate wallet implementation. Payment/authentication logic remains on the existing website. Browser capabilities such as passkeys, file downloads, web sharing, microphone and optional location still require real-device checks.
- The app requests network access/state only. It requests no contacts, SMS, native camera/microphone or native location permission. Website permissions are handled by the browser; these still belong in Data safety review.
- Offline native screen and web fallback provide connection guidance. The service worker caches **only `/offline.html`**; API calls, sessions, balances, receipts and payment responses are not cached. Online HTTP errors are left unchanged. Mid-payment network failure does not imply failure or refund.
- Target/compile SDK 36, minimum 23, JDK 17, AGP 8.10.1, Gradle 8.11.1, Android Browser Helper 2.6.2 (pinned stable release).

## Build

With JDK 17 and Android SDK installed:

```sh
cd android
./gradlew :app:assembleDebug :app:bundleRelease :app:lintDebug
```

- `android/app/build/outputs/apk/debug/app-debug.apk`: installable test APK.
- `android/app/build/outputs/bundle/release/app-release.aab`: unsigned unless release signing variables are supplied. **An unsigned AAB cannot be uploaded to Play.**
- `.github/workflows/android.yml` builds these automatically after Android source changes on main. GitHub → Actions → Android test package → successful run → **LonerPay-Android-Test** artifact. This workflow does not submit anything to Google Play.
- The workflow provides an optional manual signing job after the owner securely configures `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` in GitHub repository secrets. Never commit a keystore or put passwords in chat. Upload-key storage/backup and Play App Signing must be arranged by the owner. No production key is created by this preparation.

## Website association (required for full-screen trusted mode)

Until Digital Asset Links matches the installed application's signing certificate, a browser toolbar may remain. This is expected for the initial test package and must not be advertised as the finished full-screen release.

1. Enrol in Play App Signing when preparing the actual Play release.
2. Retrieve the **app signing certificate SHA-256** from Play Console → App integrity. The upload certificate can differ from the certificate on apps distributed by Play.
3. Generate the real association using `node scripts/android-assetlinks.mjs 'SHA256:FINGERPRINT:WITH:32:BYTES' com.lonerpay.app assetlinks.json` (replace with an actual valid fingerprint; the tool rejects this illustrative text).
4. Publish the reviewed JSON at `https://lonerpay.com/.well-known/assetlinks.json`, preserving existing associations if any. Do not publish placeholder fingerprints or debug keys for the production package.
5. Check the endpoint returns 200 JSON without authentication or redirects, then verify trusted/full-screen launch from the **Play-installed** build. For direct APK testing, the specific test certificate and `.debug` package would require a separate association, which this release does not publish.

## Launch evidence and remaining work

Public links already exist in the project:

- Privacy: https://lonerpay.com/privacy.html
- Terms: https://lonerpay.com/terms.html
- Account deletion: https://lonerpay.com/delete-account.html
- Support: https://lonerpay.com/contact.html
- Support email: support@lonerpay.com; alternative lonerhublimited@gmail.com; phone +2349131123780.

Source review confirms the links and manual deletion process; actual inbox delivery and operational fulfilment still need owner verification. See `docs/account-deletion-operations.md`. No customer deletion or payment is performed in packaging checks.

Before submission:

1. Complete Play developer organisation verification/D-U-N-S and required account checks.
2. Secure signing, verify website association and retain the upload-key backup.
3. Test install/launch, offline start/reconnect, signup/login/PIN/passkeys, password reset, Back navigation, wallet funding, pending outcomes, receipts/download/share, support and deletion on a disposable test account. Test browser switching, app restart and payment-provider redirects. Compilation is not device-level proof.
4. Complete Data safety based on the actual site and provider flows. Review account/contact data, financial/payment history, KYC/BVN, security/device data, merchant/customer records/photos, optional microphone/voice processing, optional coordinates sent to Google, support messages, providers and retention. A browser wrapper does not exempt the site from declarations. Do not submit blanket 'no data collected' answers.
5. Complete Financial features, content rating, target audience, ads and app-access declarations. Provide a dedicated reviewer account and clear instructions without exposing real funds or customer identity data. Public terms specify adults 18+; confirm the matching store declarations.
6. **Policy review before Play submission:** bill/telecom payments and paid digital Business Tools have different billing treatment. The current Business Tools subscription uses website checkout; determine and implement the applicable Play Billing/program treatment before offering it through a Play-distributed app. Also review the enabled betting-wallet funding feature against Play's gambling/payment-facilitation rules and Nigeria availability. These are real submission questions, not cleared by a successful Android build. Do not claim lending, card issuing, outbound transfers, live gift cards or in-app Google place results that are not active.
7. Capture real 1080px phone screenshots after device verification and prepare the store icon (512px existing brand asset) and feature graphic. No simulated balance or fabricated transaction should be presented as a real customer result.
8. Use internal testing first. Meet the testing/release requirements shown for this developer account and obtain the required review approvals before production rollout.

## Draft store text (verify against enabled services before submission)

Name: **LonerPay**

Short description: **Airtime, data and everyday bill payments in one app.**

Full description:

LonerPay helps you manage everyday payments from one place. Buy supported airtime and data bundles, pay supported electricity and TV bills, and keep track of your transactions and receipts.

View available service options and review the recipient, amount and details before confirming a payment. Use transaction history to follow pending requests and find your reference when contacting support.

Service availability, pricing and delivery depend on the network, biller and payment provider. An internet connection and a LonerPay account are required. Some services require identity verification.

For help, contact support@lonerpay.com or visit https://lonerpay.com/contact.html. Privacy information and account deletion are available at https://lonerpay.com/privacy.html and https://lonerpay.com/delete-account.html.

LonerPay is operated by LONERHUB LIMITED.

## References checked

- https://developer.android.com/develop/ui/views/layout/webapps/trusted-web-activities
- https://developer.android.com/build/releases/agp-8-10-0-release-notes
- https://developer.android.com/google/play/requirements/target-sdk
- https://developer.android.com/training/app-links/configure-assetlinks
- https://support.google.com/googleplay/android-developer/answer/9858738
- https://support.google.com/googleplay/android-developer/answer/10144311
