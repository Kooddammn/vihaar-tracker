# Vihaar Map Tracker

A standalone Angular application for community-shared Jain Sant vihaar updates. The public map and status cards are backed by a live Firestore stream; the check-in form writes to `vihaar_tracks`.

## Configure Firebase

1. Create a Firebase web app and copy its configuration into `src/environments/environment.ts`.
2. Enable Cloud Firestore and create the `vihaar_tracks` collection. The collection is created automatically when the first volunteer check-in is submitted.
3. The map uses OpenStreetMap tiles directly and does not need a map API key. Keep the visible map attribution in place and use tiles only for normal interactive browsing.
4. Configure Firestore security rules for your deployment. The client app intentionally does not embed server credentials.

The stored document fields are `santName`, `status`, `currentLocationName`, `nextDestinationName`, `volunteerName`, `lastUpdatedAt` (ISO string), and `coordinates` (`latitude`, `longitude`).

## Run

```bash
npm install
npm start
```

The project uses Angular 20, within the requested Angular 17+ range and compatible with AngularFire's declared peer dependencies.

## Firestore access control

`firestore.rules` keeps `vihaar_tracks` publicly readable for the map, but allows only Firebase Phone Authentication users on the volunteer allowlist to create updates. Each approved volunteer needs an administrator-managed document at `volunteers/{E.164_PHONE_NUMBER}` (for example, `volunteers/+919876543210`) with `active: true` and `displayName` exactly matching the submitted volunteer name. Do not let client users create or edit these allowlist documents.

The check-in form currently collects a required mobile number but does not send an SMS, verify the number, or include it in the public journey document. Phone verification is deferred. The current Firestore rules still require an authenticated, allowlisted volunteer to create a journey update, so the form will receive permission-denied until an authorized sign-in flow is added. When phone verification is introduced, enable the Phone provider, allow the needed SMS regions, authorize the deployed domain, and configure Firebase Authentication reCAPTCHA Enterprise bot protection in Enforce mode to omit the client verifier.

To publish the rules, select your Firebase project in the Firebase CLI and run `firebase deploy --only firestore:rules`, or copy `firestore.rules` into Firestore's Rules tab in the Firebase console.
