# Threshold 1.1.0 test build

Packaged on 21 October 2026 from the modified repository snapshot based on commit 8e346d21cc769e896af24b7b0516037cfb3cf625.

## Downloads

- threshold-1.1.0-test.apk: installable Android debug build, version 1.1.0 (version code 2).
- attendance-tracker-1.1.0-source.zip: updated project source, migrations and tests.
- attendance-tracker-1.1.0.patch: changes that apply cleanly to the original snapshot.
- SETUP-AND-SECURITY.md: backend deployment, phone-only Bluetooth setup, hardware options and security limits.
- SHA256SUMS.txt: checksums for the APK, source archive and patch.
- threshold-dashboard.png and threshold-bluetooth.png: interface previews with sample data.

## Changes

Native Android phone-to-phone Bluetooth broadcasting and scanning; rotating class signals; live dwell progress; enrollment, section and teacher ownership checks; duplicate suppression; teacher review and audited finalization; refreshed login/dashboard/navigation; QR camera retry; rotating server-backed login sessions and immediate revocation; safer Android permissions, backups and file-sharing settings. Previously missing database structures and broken admin setup operations were repaired. Both development seed scripts now refuse production execution.

## Verification

- 40 automated tests passed, including real HTTP requests to Express against an isolated PGlite PostgreSQL database created from the committed migrations.
- Frontend and backend TypeScript builds passed.
- Android assembleDebug, lintDebug and testDebugUnitTest passed after the final native lifecycle change. App lint reported 0 errors and 20 warnings; most relate to inherited Android resources and version recommendations.
- APK signature verified as an Android Debug certificate. The compiled APK contains the native Bluetooth plugin, latest teacher controls and confirmed HTTPS API address.
- The recorded production dependency audit reported zero known advisories for both client and server. This does not cover every development tool or constitute a security certification.
- Source ZIP integrity passed, contains no installed dependencies, signing keys or runtime environment files. The patch applies cleanly to the original repository snapshot.
- The development attendance-repair script was separately checked to reject production execution before database access.
- The new screens were inspected in the in-app browser against local sample data. No production credentials or student records were used.

## Required before classroom use

1. Repair or verify DNS for att.threshold.dpdns.org. The last successful DNS diagnostic, on 20 October 2026, returned SERVFAIL with refused queries at the threshold.dpdns.org delegation. Today's restricted network did not allow a fresh public-DNS check; see the dated finding in the setup guide.
2. Deploy the updated backend and reconcile its database migration history with the live schema. The APK's new authentication flow needs the updated backend.
3. Pilot with two physical Android phones. No physical-radio test was possible in this workspace.
4. Keep both phones on their Bluetooth screens with internet connected. Background attendance is not implemented.
5. Use the institution's own protected signing key for a production release. The attached APK is a test build.

Bluetooth measures a phone's proximity, not the identity of its holder. Real-time relays and modified-client signal-strength claims remain possible. Device binding, verified attestation and authenticated room hardware are documented future improvements, not features claimed by this build.

These files were built and packaged locally. See the repository history for publication status. Packaging and publishing the files do not deploy the live server, change DNS or migrate the production database.
