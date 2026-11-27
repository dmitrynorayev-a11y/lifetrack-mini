# VYRA Mobile — Windows development, Apple HealthKit on iPhone

This folder packages the existing VYRA RPG into an installable **Capacitor iOS application** using the open-source Cap-go Health plugin (MPL-2.0). The old GitHub Pages app is unchanged.

## Features
- First run: custom permission explanation, then the official iOS HealthKit authorization sheet (READ ONLY: steps, sleep, workouts, walking/running distance).
- Automatic daily HealthKit queries for 14 days of history, at first connection, app open/resume and while the app stays active.
- Daily step and distance totals come from HealthKit aggregated queries.
- Sleep stages exclude in-bed and awake, and overlapping intervals are merged.
- The RPG immediately receives figures, updates experience and quests, and saves data locally.
- Skipping permission is supported; requesting permission does not mean the user granted it.

## Windows 11 development
Install Node.js 22+ and Git. In PowerShell:

    git clone https://github.com/dmitrynorayev-a11y/lifetrack-mini.git
    cd lifetrack-mini\mobile
    npm install
    npm test
    npm run dev

The preview in Windows Chrome / iPhone Safari shows the UI but **cannot** request native HealthKit authorization. Run npm run build to compile the web assets.

## Automatic cloud build
Our GitHub Actions workflow (VYRA Capacitor iOS) runs on macOS with Xcode. It installs packages, checks unit tests, generates the native project, enables HealthKit, and builds an **unsigned iOS Simulator app**. It is not yet an installable IPA.

## Physical iPhone test (MacBook / Xcode)
On the borrowed MacBook (Xcode 26+), after cloning:

    cd lifetrack-mini/mobile
    npm install
    npm run build
    npx cap add ios --packagemanager SPM
    node scripts/configure-ios.mjs
    npm run ios:open

In Xcode choose Signing & Capabilities, your Apple Team, a unique Bundle ID if necessary, and verify the HealthKit capability. Select a real iPhone (with Developer Mode enabled) and Run. On first launch create a hero, tap Connect Apple Health, and select the four read permissions. All real-device permission and data behavior MUST be tested before publication.

From Windows alone, a **paid Apple Developer account and signing credentials** are needed for a cloud-signed Ad Hoc / TestFlight build. Never send Apple passwords or signing keys into chat. For a free Apple account, use borrowed MacBook + Xcode personal-team signing (the app may need reinstalling after 7 days).

## Data & privacy
- No HealthKit write permission and no health-data network upload. Data stays on device in local web view storage.
- Read permissions can be changed in Apple's Health application.
- iOS does not reliably report which individual read permissions were granted; empty data might mean no measurements or a declined authorization.
- HealthKit background sync with the app closed is NOT implemented; automatic sync runs at launch, on resume and periodically while open.
- If there are no sleep records (Apple Watch or another compatible source), the sleep value will not magically appear.
- The web and native apps have separate local storage: previous browser progress is not automatically migrated.
- The plugin version is pinned to 8.13.0. See THIRD_PARTY.md.

## Testing checklist
1. Verify daily steps in Apple Health, open installed VYRA and grant steps + sleep + workout + distance read permissions.
2. Compare steps and last-night sleep (count only asleep phases, not time in bed); verify XP and daily quests.
3. Background VYRA, add a new health record, and reopen: metrics should update.
4. In Profile tap Refresh data and Permissions; try denying sleep and make sure the app does not claim permission is granted.
