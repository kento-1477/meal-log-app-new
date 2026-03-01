# App Store Global Release Checklist (v1.0.2)

Last updated: 2026-03-01

This checklist is for finalizing global rollout tasks outside the app code.

## P0 (Blockers before submission)

1. Select the iOS build in App Store Connect (`iOS App > Build`).
2. Confirm required screenshots are uploaded for every enabled device family:
   - iPhone (required)
   - iPad (required if iPad support is enabled)
   - Apple Watch (required if watch app is enabled)
3. Complete and save all locale metadata fields for `English (U.S.)` and `Japanese`:
   - Promotional text
   - Description
   - What's New
   - Keywords
   - Support URL
   - Marketing URL (optional, but remove placeholders like `http://example.com`)
4. Re-open version page and verify no red validation markers remain, then click `Add for Review`.

## P1 (Required for review readiness / high risk if missing)

1. Update `App Review Information`:
   - Valid sign-in account
   - Password still active
   - Contact person/email/phone
2. Confirm export compliance answers are complete for the selected build.
3. Confirm in-app purchase products are in `Ready to Submit` or `Approved` state if referenced by this version.
4. Set release method (manual / automatic / scheduled) to the intended option.

## P2 (Strongly recommended before release)

1. Validate web policy pages resolve publicly:
   - `/privacy-policy.html`
   - `/terms-of-service.html`
   - `/help.html`
2. Sanity-check English UI on a real device (chat, errors, paywall, report).
3. Verify support mailbox can receive external mail.
4. Decide whether to use phased release (7-day rollout) for risk control.

## Privacy Information Update Task (App Store Connect)

Use this mapping when updating `App Privacy`:

1. **Contact Info / Identifiers**
   - Account/login identifiers (if collected)
   - Usage: app functionality, account management
2. **User Content**
   - Meal text and meal photos
   - Usage: core logging and AI nutrition analysis
3. **Health & Fitness**
   - Nutrition logs, calorie/macronutrient records, body metrics/goals
   - Usage: analytics and personalized insights
4. **Purchases**
   - Subscription/entitlement status
   - Usage: paid feature access and billing state sync
5. **Diagnostics**
   - Crash/performance/reliability telemetry
   - Usage: bug fixes and service reliability

For each category in App Store Connect, review:
- linked to user?
- used for tracking?
- purpose tags (App Functionality / Analytics / Developer Communications / etc.)

Use the strictest truthful answer and keep this aligned with the actual app behavior.
