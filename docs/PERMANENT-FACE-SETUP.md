# Threshold 1.4 — permanent face identity

This feature belongs to the original `com.attendance.tracker` app. It uses student accounts and approved institutional enrollment. Local demo templates are never imported or accepted as evidence.

## Use it

1. Install the current same-signature Threshold APK as an update. Keep the existing app data. Staff and student login remain unchanged.
2. Staff: open **Supervised Enrollment** in the Android app, select a student from your assigned classes, check their college ID/registration in person and record their agreement and accessible alternative. Tap **Capture approved face**. Position the phone in front lighting with a relaxed mouth and open eyes, then tap **Start face capture**. Follow both random actions and return to centre after each. Capture/upload are automatic. Wait for the **server** acceptance.
3. Student: log into your own account, tap your registered card at the classroom RC522 reader, then open **My classes / Sessions**. Under the current class, tap **Verify live face**. The server compares the captured identity with the approved template and recomputes the actions.
4. Keep the class screen visible to receive the later random check. Each student gets a server-selected time between roughly 35% and 65% of the class; late entries are adjusted within the remaining window. The camera starts only after a student taps Verify. This release does not provide guaranteed reminders while the app is closed/phone locked.
5. Teachers see entry/exit times and entry/random face status in **RFID class attendance**. HODs/admins can revoke a reference (deleting the encrypted template) or perform supervised replacement; teachers cannot silently replace an approved identity. Deactivating a student removes their template and cancels pending checks.

Mandatory face checks default **off**. The administrator can open **Face attendance policy** on the enrollment page and require both face checks plus a registered RFID visit before automatic credit. Enable this only after students are enrolled, camera checks work on their phones and an audited staff correction/alternative path is available. New policy applies to new classroom entries. Existing requirements remain unchanged. Missing checks stay uncredited for review; they are never automatically labeled misconduct or filled in as absence. Existing staff decisions are preserved.

Face status does not strengthen the separate BLE workflow automatically. The authenticated BLE screen remains distinct; unsigned lab/demo beacon codes never authorize real attendance.

## Server rollout

The existing Render service keeps its URL, database and private secrets. The versioned `render.yaml` switches its runtime to Docker, with `server` as the root directory and `./Dockerfile` / `.` as the Dockerfile/context. The image supplies Node 22 and Python 3.12, pinned vision dependencies and hash-verified public models. **Do not create a second service, reset the database or run the demo seed.** Sync/review the existing Blueprint and deploy the tested commit. The start command applies the additive Prisma migration and starts only after the face models initialize. `/ready` checks the database migration and enabled worker; it must return `face_verifier: ready`.

No private database URL, key or face template belongs in Git or an image build argument. Existing `DATABASE_URL`, JWT keys, BLE key and `RFID_CARD_HASH_SECRET` stay in Render. New tables deny Supabase browser roles through RLS and privilege revocation. Client apps use the Express API, not direct database access.

Environment:

| Variable | Purpose |
|---|---|
| `FACE_VISION_ENABLED=true` | Enable trusted server inference; set by the Docker image. A native Node deployment without the worker must not enable face enforcement. |
| `FACE_PYTHON=/opt/vision/bin/python` | Private worker executable inside the image. Local development can point to a Python environment. |
| `FACE_MODEL_DIR` | Optional override for the directory of checksum-verified models. |
| `FACE_TEMPLATE_ENCRYPTION_KEY` | Optional dedicated stable 32+ character encryption root, configured **before first enrollment**. If absent, HKDF derives a separate AES key from the existing server-only RFID hash secret. |

The encrypted template uses AES-256-GCM with fresh nonces and student/version/model binding. Back up the encryption root privately. Adding/changing the key after enrollment makes older templates unreadable; this release requires supervised re-enrollment for key/model rotation. Templates remain until staff revocation, replacement or student deactivation. The institution must define consent, access and retention practices before rollout. Camera images stay in RAM in the Android capture/HTTPS upload/worker and are discarded after processing; they are never written to the gallery, database or application logs. Minimal challenge outcomes and audit history remain institutional records.

One upload/model job is admitted at a time before JSON image decoding. Busy clients retry the same captured sequence with a bounded delay, without opening the camera again. These limits protect the small free host; they do not establish classroom capacity. Load-test 60 students and measure cold starts before enforcement. If the free host cannot meet the deadline, keep face enforcement off and use staff-reviewed attendance while selecting adequate hosting.

## Verification and limits

Software tests cover auth/scope, supervised-only enrollment, rejection of client success flags, expiry/replay, encrypted references, atomic audit rollback, revocation, busy retries and combined RFID/face credit. Public-fixture model checks establish that real inference runs, not biometric accuracy. Phone camera lifecycle, ML Kit/MediaPipe action agreement, Nothing Phone (1) lighting, accessibility, face fairness, spoof/injection resistance and classroom load still need physical pilot evidence.

This is **basic active liveness**, not validated PAD. A determined attacker may use replay editing, deepfakes, injection, remote relay or compromised phones. Face matching can falsely accept or reject. RFID cards/UIDs can be shared/cloned. BLE does not contain a signal within walls. Do not advertise 95% reliability, corridor containment, invisible background camera or iPhone support from these software checks.
