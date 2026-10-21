# Low-cost attendance: research findings and a measurable pilot

Research date: 21 October 2026; phone-pair proposal reviewed on 22 October 2026. This is a design recommendation and literature review, not a field-tested product or a claim of achieved accuracy.

## Recommendation

For 60 students using a mixture of Android phones and iPhones, prototype **approved phone registration + authenticated ESP Bluetooth checks + short acoustic room checks + staggered live-face verification**. Attendance stays on students' own phones. An existing classroom computer/speaker would emit room-check signals only; it would not become a check-in kiosk.

The acoustic component is the most promising low-cost addition to investigate for the corridor problem. Its performance in this room and across these phones is unproven. Do not describe the combination as 95% reliable until the complete system passes the tests below. There is no evidence in the reviewed sources that two ordinary ESP boards alone deliver all three requested outcomes against every proxy attack.

Build the room-check experiment first. If it cannot distinguish legitimate seats from the corridor without disturbing lessons or excluding phones, do not deploy it as a room-verification requirement. A failure here should stop the proposed automatic room-presence claim, rather than be hidden by adding an AI confidence score.

The recommended operating mode is an explicitly started, dimmed foreground session, with brief camera use. This follows the user's revised willingness to leave the app open. Guaranteed screen-off operation across personal Android phones and iPhones is a separate, harder requirement.

## What “95%” must mean

The user requested all three outcomes. Measure them independently and together, rather than reporting a single blended accuracy number.

| Outcome | Proposed acceptance target | Denominator and important limits |
| --- | --- | --- |
| Legitimate attendance completes automatically | At least 95% of legitimate student-class sessions complete without staff action, after the permitted automatic recovery | Include unsupported phones, permission issues and technical failures; do not silently exclude them |
| Ordinary proxy/corridor attempts are rejected | At least 95% rejected separately for each declared attack category | A large number of easy replay rejections must not conceal successful corridor attempts |
| Students remain free from active attendance interaction | At least 95% of lesson time requires no active attention, in at least 95% of student-class sessions | For an illustrative 60-minute lesson, allow at most 180 seconds of active attendance work; count retries, prompts and any required waiting |
| Teacher work during class | No routine session-start, roll-call, verification or roster-finalization action | Enrollment, maintenance and disputed exceptions can still require an administrator outside lessons |

Also measure battery consumption and prompt frequency. A phone can spend little active interaction time while still generating annoying interruptions or consuming excessive battery. One-time enrollment is excluded from the per-class interaction budget and must be reported separately.

These are proposed product targets, not performance figures taken from a paper. An end-to-end decision must satisfy identity, device and room requirements independently; strong evidence in one category cannot repair missing evidence in another.

## What the research supports

### Bluetooth signal strength and transmission power

Lower transmission power can reduce coverage. It cannot draw a boundary matching a room polygon. Walls, windows, people, receiver sensitivity and reflections all affect reception. Two receivers can provide useful comparative observations, but a weaker signal is not a dependable physical-distance measurement. This is why corridor rejection needs empirical testing in the actual room. [Bluetooth SIG: Understanding Bluetooth Range](https://www.bluetooth.com/learn-about-bluetooth/key-attributes/range/).

S3/C3 firmware can set advertising and connection transmit power separately. Calibrate both; reducing beacon power alone does not establish a secure communication radius. [Espressif: Controller and HCI](https://docs.espressif.com/projects/esp-idf/en/latest/esp32s3/api-reference/bluetooth/controller_vhci.html).

### ESP Wi-Fi sensing and room sketches

ESP-CSI provides richer amplitude/phase observations than RSSI and has motion/presence examples. The documentation also describes specialized synchronized multi-antenna arrangements. Those are different from two independent development boards. General room activity between fixed ESPs does not establish the identity or location of a particular student's phone. Use it as an experiment, not a mandatory individual-attendance decision. [Espressif: ESP-CSI solution](https://docs.espressif.com/projects/esp-techpedia/en/latest/esp-friends/solution-introduction/esp-csi/esp-csi-solution.html).

Research must be read with its implementation constraints:

| Work | What was demonstrated | Why its result does not establish our 95% target |
| --- | --- | --- |
| [DensePose From WiFi](https://arxiv.org/html/2301.00250v1) | Human pose estimation using three transmitting and three receiving antenna paths, with recordings containing 1–5 people | Different radio input and trained model; not a demonstration of 60 named students, corridor rejection or two ESP development boards |
| [Next2You](https://arxiv.org/html/2111.05224v2) | CSI-based device copresence, reporting error rates below 4% in its experiments | Its collector modifies Broadcom firmware on Nexus 5/6P phones using Nexmon. This is not a deployable capability across arbitrary unmodified Android phones and iPhones |
| [Time matters, 2025](https://openreview.net/pdf?id=TZqcUbpQGU) | Experiments studying how CSI positioning changes over time | A table reports nearly perfect same-period F1 results falling to roughly 0.50–0.65 in a later-period evaluation. This is a study-specific finding, not a universal accuracy range; it makes separate-day testing essential |
| [LatentCSI, 2025](https://arxiv.org/html/2506.10605v1) | Image generation from paired CSI/image training and a pretrained diffusion model | One dataset uses one moving person, Intel AX210 radios over 160 MHz, and synchronized camera training. A generated image is not a surveyed floor plan or proof of named attendance |
| [BFId, ACM CCS 2025](https://publikationen.bibliothek.kit.edu/1000185756) | Re-identification from beamforming feedback in a study recruiting 197 participants | The paper's experimental setup uses controlled walking paths and multiple observation perspectives. It does not validate identifying 60 seated students with S3/C3 radios. Its [technical setup](https://publikationen.bibliothek.kit.edu/1000185756/168100988) uses 160 MHz channels in the 6 GHz band |

Some sources market very high identification accuracy. Such numbers must retain their test population, train/test split, hardware, activity and environment. A result for previously recorded people walking through a controlled field is not an attendance-security guarantee.

### Wi-Fi ranging, UWB and Bluetooth Channel Sounding

Wi-Fi RTT is cooperative device-to-device ranging, not measuring a wall echo. Android documents typical 1–2 metre position estimates from three or more compatible access points. It also requires compatible phone hardware and permissions. This does not establish that every student's phone can participate or that a near-wall seat can always be distinguished from the corridor. [Android Wi-Fi RTT](https://developer.android.com/develop/connectivity/wifi/wifi-rtt).

ESP FTM studies show that multipath and calibration materially affect ranging. In one study's separate indoor test environment, machine-learning estimators offered much smaller improvements than on the original datasets. The studied chip was ESP32-S2; its numbers should not be presented as measurements of this user's S3/C3. [Fine Time Measurement for the Internet of Things](https://arxiv.org/html/2401.16517v1).

Bluetooth Channel Sounding uses phase and timing measurements, including secure distance-bounding techniques. It is not an RSSI algorithm that can simply be enabled on any existing BLE device. Hardware/PHY support must be established at both ends. [Bluetooth SIG: Channel Sounding](https://www.bluetooth.com/learn-about-bluetooth/feature-enhancements/channel-sounding/). Apple Nearby Interaction similarly depends on supported UWB devices/accessories; it is not a universal baseline for a mixed personal-phone classroom. [Apple Nearby Interaction](https://developer.apple.com/documentation/nearbyinteraction).

Neither is the recommended first purchase for this budget.

### Why investigate an acoustic check

Cisco documents ultrasonic messages for nearby room pairing, with closed doors as an important boundary condition. This shows the practical design pattern; it does not establish the accuracy of our proposed implementation. Cisco Proximity itself is discontinued, so this report is not recommending installing it. [Cisco/Webex: Proximity](https://help.webex.com/en-us/article/b5c5rab/Install-and-use-the-Cisco-Proximity-App).

Zoom also documents ultrasonic proximity sharing and explicitly notes speaker, microphone and audio-processing compatibility issues. Consequently, an arbitrary classroom speaker or phone cannot be assumed to support a usable near-ultrasonic channel. [Zoom: Direct sharing](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0068103).

The [Chirp-Loc paper](https://www.sciencedirect.com/science/article/abs/pii/S157411922200133X) studies acoustic room-response signatures as an authentication factor. It reports false acceptance rates of 4.1–9.7% in its settings and warns against using it alone. Its Android prototype and specific equipment do not certify mixed-phone classroom use. Our proposed rotating acoustic token is also not a reproduction of Chirp-Loc's classifier.

Ambient sound matching alone is not the recommendation. The [Sound-Proof authors](https://www.usenix.org/conference/usenixsecurity15/technical-sessions/presentation/karapanos) studied ambient-audio proximity for login authentication, while subsequent [research on audio manipulation](https://nsaxena.engr.tamu.edu/wp-content/uploads/sites/238/2019/12/ssss-ccs16.pdf) exposes weaknesses in that approach. A fresh emitted challenge is preferable to merely comparing the lecturer's speech, but remains vulnerable to live relaying.

### Face checks and device integrity

Use the institution-approved enrollment identity as the reference. Phone unlocking biometrics alone do not establish the college identity. A blink counter does not establish resistance to photos, replayed videos, injected camera streams or deepfakes.

NIST's evaluation of passive software face-spoof detection found substantial variation by algorithm and attack type. It did not evaluate interactive challenge-response systems, so it cannot validate our proposed random gestures. Select and test the complete capture, face-matching and presentation-attack pipeline. [NISTIR 8491](https://nvlpubs.nist.gov/nistpubs/ir/2023/NIST.IR.8491.pdf).

Use a private phone key and server-side verification of applicable app-integrity evidence. Android Play Integrity binds requests and provides app/device signals; unavailable or weak verdicts need a declared recovery policy. Apple App Attest uses a certified app key and server challenges, has availability limits, and requires re-registration after reinstall. Neither proves room location or the identity of the person before the camera. [Android Play Integrity](https://developer.android.com/google/play/integrity/overview), [Apple App Attest](https://developer.apple.com/documentation/devicecheck/establishing-your-app-s-integrity), [Android Keystore](https://developer.android.com/privacy-and-security/keystore).

## Proposed system

### Equipment and responsibilities

| Equipment | Responsibility |
| --- | --- |
| Students' own Android/iPhone apps | Foreground attendance session, brief acoustic capture, BLE exchange, short face checks and recovery UI |
| ESP32-S3 fixed inside | Authenticated classroom BLE endpoint; signed per-phone observations; optionally a future audio emitter |
| ESP32-C3 near the corridor | Independent BLE reference and calibration observations; not an identity detector |
| Existing classroom computer and wired speaker | Emit fresh room-check challenges automatically, if frequency response and coverage pass testing |
| Existing HTTPS server | Enrollment, device approval, challenge scheduling, verification, anti-replay state, attendance policy and audit trail |

An S3/C3 development board is not itself a loudspeaker. First test the existing audio equipment. If an ESP-driven emitter is later needed, an I2S audio interface/amplifier plus a suitable speaker is a possible implementation. The [MAX98357A breakout](https://www.adafruit.com/product/3006) is an example interface, not a guarantee of ultrasonic output from the assembled speaker system. No rupee price, room coverage or purchase requirement is asserted here.

Use the existing classroom network for normal uploads. Do not plan for all 60 phones to maintain permanent connections to the two boards. Espressif documents up to nine simultaneous BLE connections per board, with actual performance dependent on resources and connection parameters. Start with a smaller connection pool, short exchanges, jitter and bounded queues; benchmark the actual firmware. [S3 multi-connection guide](https://docs.espressif.com/projects/esp-idf/en/stable/esp32s3/api-guides/ble/ble-multiconnection-guide.html), [C3 guide](https://docs.espressif.com/projects/esp-idf/en/stable/esp32c3/api-guides/ble/ble-multiconnection-guide.html).

### Enrollment once, outside class

An administrator verifies the student's institutional identity and approves their face reference and phone registration. Protect templates and private keys. Replacing a phone revokes the previous registration; reinstalling cannot silently approve a new key. A student cannot replace their approved face reference through a selfie upload. This one-time human step remains necessary under the project's existing trust model.

### A normal lesson

1. The timetable opens the session automatically. Student taps Join.
2. The server checks enrollment and approved phone registration, then issues a one-use challenge.
3. The phone completes a short authenticated BLE exchange and captures the acoustic challenge. The join face check is bound to the same verification transaction.
4. If the required checks pass, the student returns to a dim attendance screen. Camera and microphone are off between capture windows.
5. Short automatic room checks collect additional device-presence evidence. The exact cadence is selected through battery, leakage and false-rejection measurements rather than assumed in advance.
6. Initially budget two unpredictable middle face checks per student, spread across the middle of the lesson, with occasional policy-controlled extra checks. This is a proposed usability setting, not proof of continuous person presence.
7. A final bounded verification completes attendance. Normal brightness and screen-timeout behavior are restored.

For a 60-minute example, four interactions averaging 20 seconds each would consume 80 seconds, leaving about 97.8% free from active attendance work. This is arithmetic on a design budget, not measured usability. Retries, attention costs and upload waits must be included in the pilot.

For 60 students, two middle checks each over a 30-minute window average four prompts per minute. Use randomized scheduling with a concurrency limit, queue-aware deadlines and no disclosed future schedule. A possible initial response window is 60–90 seconds, adjusted for accessibility and real measurements. A long response window also gives someone outside time to return; it is not a physical-presence guarantee.

### Protocol requirements that matter

- Keep room credentials separate from student credentials. Protect each board's unique key; use verified TLS, signed firmware updates and an explicit revocation process.
- Bind the challenge, room, class, phone public-key hash, evidence digests and expiry together. The server verifies signatures and consumes the challenge atomically.
- The acoustic secret must reach the room emitter through an authenticated channel. Do not also send it to the student over the API or BLE; doing so would let a client claim it heard the sound without receiving audio.
- Phones submit a signed response bound to the decoded acoustic secret and their own one-use challenge. Peers sharing a broadcast secret still cannot substitute another student's phone signature or approved face.
- A board receipt should bind the verification ID to its own counter and independently measured radio observation. Do not turn app-reported RSSI into trusted hardware evidence.
- Verify capture and anti-spoof results on the server or through a deliberately secured capture pipeline. A client-supplied `isLive: true` is not evidence.
- Freshness prevents reuse of old evidence. It does not prevent a live accomplice forwarding current audio, tokens or video. Commodity app/network timeouts are not nanosecond secure distance bounding.
- Require the identity and location checks independently. If the acoustic component is the room gate, silently falling back to BLE-only acceptance would invalidate the corridor-security claim.

These are proposed engineering requirements. They are not claims that the reviewed papers evaluated this complete protocol.

### Phone operating mode and battery

Keep the session user-visible. Apple explains that scanning can be throttled when the locked screen is off, including the iOS 26 Live Activity scenario discussed by its engineer. Android offers background BLE options, but process lifetime and service-start restrictions still matter. [Apple explanation](https://developer.apple.com/forums/thread/815189), [Android background BLE](https://developer.android.com/develop/connectivity/bluetooth/ble/background).

The initial mixed-platform pilot should therefore use the agreed foreground mode. A black page is not the system lock screen. Personal phones cannot be treated as institution-managed kiosks: Android screen pinning is escapable, and iPhone Guided Access is user-controlled. [Android lock-task guidance](https://developer.android.com/work/dpc/dedicated-devices/lock-task-mode), [Apple Guided Access](https://support.apple.com/en-us/111795).

Use brief microphone windows, no continuous camera, no GPS tracking, no animations and batched uploads. Do not use microphone background modes merely to keep the app alive. Analyze acoustic data locally where possible and discard raw buffers promptly; avoid recording or uploading lectures. Native iOS measurement-mode audio can reduce system processing, but it does not ensure a particular microphone frequency response. [Apple audio measurement mode](https://developer.apple.com/documentation/avfaudio/avaudiosession/mode-swift.struct/measurement).

An awake display still costs energy. Compare the complete app session with normal screen-off classroom standby on the same phone models. Report additional battery percentage points, heat and the 95th percentile, not only the average. A candidate budget is no more than five additional percentage points over an hour in 95% of tested devices; this may fail and is not a promise. [Android: keeping the screen on](https://developer.android.com/develop/background-work/background-tasks/awake/screen-on).

## The acoustic experiment must pass these conditions

1. At least 95% of the actual phone inventory can decode the chosen signal reliably at legitimate seats. A high audio sample rate alone does not guarantee support.
2. Required sound levels are acceptable to the class. Do not assume near-ultrasound is inaudible to everyone or compensate for poor hardware by simply increasing volume.
3. Test ordinary door/window positions, ventilation requirements, fans and occupied-room noise. If the signal leaks into the corridor in normal use, the room check fails its purpose.
4. Test pockets, bags, covered microphones, headphones, calls and permission denials. Declare which phone placement is required; count that burden in usability.
5. Test actual audio forwarding and re-recording as attacks. Hearing a fresh code alone is not proof that a relay was absent.
6. Re-test on different days and after moving furniture or audio equipment. Calibrate on one set of measurements and evaluate on separate sessions.

Do not infer the coverage of an untested classroom from Cisco's installation-specific behavior. If doors must remain open, or existing speakers/microphones cannot provide the required separation, this method may not fit the room.

## What each attack looks like

| Attempt | Main control | Remaining limitation |
| --- | --- | --- |
| Password/account sharing onto a second phone | Approved phone key and controlled replacement | Initial enrollment and recovery must be trustworthy |
| Friend carries the absent student's registered phone | Face match to approved student plus spoof detection | Replay, deepfake and camera-injection resistance require their own tests |
| Genuine student sits in corridor without an accomplice | Calibrated acoustic room gate plus BLE observations | Sound can leak through openings; this is the decisive room-specific experiment |
| Old request, token or selfie reused | Fresh bound challenge, expiry, signatures, replay state and capture checks | Live relaying is a different attack |
| An inside accomplice forwards current room audio to an outside student | Combined face/device checks raise complexity | No claimed 95% protection against a capable live relay |
| Student leaves their phone inside and briefly leaves | Random face checks may encounter the absence | Continuous phone presence does not prove continuous person presence |
| Phone changes app, receives call, dies or loses network | Explicit pause, recovery and bounded retries | These events do not establish cheating; unresolved sessions remain pending |
| Wrong person is registered initially | Supervised identity enrollment | Later matching cannot repair a wrong reference identity |

Reports must state which rows were tested. Advanced live relays, deepfakes and short unnoticed departures must not be presented as solved by good results on simple password-sharing attempts.

## A mathematical limit of occasional face checks

### Review of phone-pair, motion and timing signals

The proposed use of matching device signals needs a control group of ordinary classmates. Similarity is not sufficient evidence of one person carrying both phones.

- **Audio:** students in the same room are expected to hear similar sound. Ambient-audio authentication research uses this property to establish device proximity, not common ownership. Matching decoded room tokens should be expected for every participating phone. Do not score matching tokens as evidence of proxy attendance. [Sound-Proof](https://www.usenix.org/conference/usenixsecurity15/technical-sessions/presentation/karapanos).
- **Timing:** shared Wi-Fi, the server's own schedule, queues and retries can correlate requests. First remove those system effects before considering any unexplained pattern. No reliability figure for identifying a common carrier from request timing was established by this review.
- **Motion:** neighbouring desks, friends walking together and stationary phones are legitimate comparison cases. An accelerometer measures the device's movement; it cannot establish where its owner is or whether the owner uses a different phone elsewhere. [Android motion sensors](https://developer.android.com/develop/sensors-and-location/sensors/sensors_motion).
- **Simultaneous checks:** a small concurrent group can make sequential servicing less convenient, but simultaneous button taps or ordinary phone-unlock prompts do not verify two enrolled college identities. Any benefit must be tested using independent identity-bound live-face checks, with deadlines that legitimate students can meet.
- **Long-term patterns:** repeated similarity does not supply a fraud label. Test against confirmed, consented proxy scenarios and persistent legitimate seating arrangements. Limit retention and use patterns for an extra verification request or later review, not an automatic cheating verdict or attendance penalty.

For the stated proxy-rejection target, a face-free period is suitable only for calibration with clearly labelled phone-presence results. Do not use weak similarity flags as the only way to select students for identity checks: an attacker who avoids those flags could otherwise receive no identity check. Retain baseline face verification at join and population-wide unpredictable checks; use any validated anomaly signal only for additional checks. A flag alone does not justify loss of credit.

The frequency of actual proxy incidents at this college is unknown. This report does not assume a particular attack is the most common or that collecting several weeks of unlabelled device data will establish that.

### What random sampling can and cannot detect

For an illustrative model, let a person be absent for fraction `f` of the lesson, and let `n` checks be independent, uniformly timed and instantly verifiable. The chance that at least one lands during the absence is:

`P(detect) = 1 - (1 - f)^n`

| Absence in a 60-minute lesson | Two checks | Three checks | Checks needed for at least 95% detection |
| --- | --- | --- | --- |
| 5 minutes | 16.0% | 23.0% | 35 |
| 10 minutes | 30.6% | 42.1% | 17 |
| 20 minutes | 55.6% | 70.4% | 8 |
| 30 minutes | 75.0% | 87.5% | 5 |

These are calculations, not experimental results. They assume the absence cannot adapt to the check and that a check during absence reliably detects it. Grace windows or the ability to return can reduce detection. Thirty-five ten-second checks alone require 350 seconds, exceeding a three-minute interaction budget. Therefore, a claim of detecting at least 95% of every five-minute departure conflicts with a small number of face interactions under this model.

Automatic acoustic/BLE checks help with a phone that leaves the room. They do not solve this case when the person leaves and the phone stays. This distinction is central to an honest attendance policy.

## Pilot and release decision

### Stage 1: prove or reject room separation

Use consenting volunteers' own phones and the existing room audio equipment. No biometric enrollment is needed for this first experiment. Log successful/failed decoding and signed BLE observations at seats, doorways, corridor, neighbouring rooms, and other relevant floors. Include open and closed doors. If normal corridor positions decode the room challenge, or legitimate seats frequently fail, stop and revise the physical setup before building the complete product.

### Stage 2: evaluate the combined system

- Test the actual 60-phone mix, not only flagship Android phones or one iPhone.
- Record at least 600 legitimate student-class sessions across multiple days and occupied-room conditions. A useful engineering aim is at least 588 automatic successes out of 600, providing margin above the 95% product threshold.
- Under an independent-trial approximation, 588/600 gives a two-sided 95% Wilson lower bound of about 96.5%. Real sessions cluster by phone, person, lesson and room; also report those groups and use appropriate clustered analysis before claiming statistical confidence.
- Run separate labelled attempts for corridor use, borrowed phones, another person's account, printed photos, replayed video, expired evidence, live audio relay and relevant camera-injection attacks. Do not combine attack categories into a reassuring average.
- Use at least 60 varied attempts per category for a preliminary screen. Zero false accepts in 60 trials has an exact one-sided 95% upper false-accept bound of about 4.87%, assuming independent representative trials. Zero in 300 brings it to about 0.994%. Both depend on the test distribution and do not establish resistance to untested attacks.
- Measure first-attempt and post-retry results, full-session completion, time required, missed prompts, battery drain and failures by phone/OS. Include recovery costs.
- Fix thresholds before the final evaluation. Keep evaluation days and episodes out of calibration. Randomly splitting adjacent CSI frames is not a credible test of next-week reliability.

Ground truth is necessary during the pilot: volunteers/test staff must label where people really are and which attack is being attempted. That temporary evaluation work is separate from routine teacher duties during deployment.

### Release gates

Only claim the three 95% targets for the named classroom, tested phone population, declared attack categories and operating conditions after all three pass together. Passing a face benchmark does not compensate for failing corridor separation. Passing legitimate check-ins does not compensate for successful proxy attempts. Excluding unsupported students does not produce an honest automation rate.

If the room gate fails, release only a clearly labelled phone-proximity/identity workflow, or change the physical verification method. Do not label it verified room attendance. If strict protection against capable relays or brief departures with a phone left inside remains mandatory, a stronger physical identity/location mechanism or more interaction is required; the reviewed evidence does not justify promising all of it with the existing constraints.

## Scope of this deliverable

This research did not flash boards, capture actual classroom signals, test students' phones, enroll biometrics, deploy software, or change production data. It does not establish field accuracy or battery use.

This was a focused review of primary papers, author/university repositories and official platform/product documentation, not an exhaustive systematic review. Some publisher downloads were inaccessible; in particular, BFId's setup was checked through indexed excerpts from the university-hosted paper and its repository record. No result was independently reproduced. Generative imagery and headline accuracy figures were not accepted as evidence of physical room boundaries.

The previously delivered APK remains an Android foreground BLE build. Its setup document explicitly lists approved phone binding, real attestation, authenticated ESP firmware and background work as further additions. This research also calls for native iOS support, acoustic capture/emission and evaluated face-spoof protection. None of those should be represented as completed by this report.

The next concrete implementation should be a small **acoustic/BLE calibration tool and emitter** using the available room equipment and student phones. Its result determines whether the proposed room gate deserves further development.
