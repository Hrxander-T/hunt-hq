# Hunt HQ Capture (Android)

A small Android app (Kotlin, no login) that takes screenshots of the game from a floating button and sends them to Hunt HQ's Dump queue in the background.

## How it works

1. **Start capture** in the app asks for permission to record the screen (choose **Entire screen**), then starts a foreground service and shows the floating round shutter button.
2. **Tap the button** (or the **Capture** button in the notification): the app hides the button, grabs the newest screen frame and saves it as a PNG in its private folder. Drag the button to move it; it snaps to the nearest side and remembers the place.
3. The PNG is uploaded to Cloudinary (unsigned preset `hunt_pending`), then the edge function `ingest-shot` is told about it (protected by a token). On success the file is deleted from the phone.
4. Hunt HQ pulls the new screenshots into the Dump queue by itself. After you save or skip them, the picture is deleted from Cloudinary.

If an upload fails (no internet, wrong token), the screenshot stays on the phone. **Upload now** in the app retries. The Cloudinary answer is remembered next to the file, so a retry never uploads the picture twice.

The Share route still exists as a fallback: **Send all** (app screen or notification) shares the screenshots that are still on the phone to the installed Hunt HQ app. That opens Hunt HQ, so it is only for emergencies.

## Build and install

Needs the Android SDK (path in `local.properties`) and JDK 17+.

```
cd Automata/hunt-hq-android
./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

`local.properties` (not committed) needs two lines:

```
sdk.dir=/home/you/Android/Sdk
ingestToken=THE_SAME_TOKEN_AS_THE_SUPABASE_SECRET_INGEST_TOKEN
```

The token is built into the app (`BuildConfig.INGEST_TOKEN`), so nobody types it on the phone. Anyone who has the APK can extract it, so share the APK only with the team. To rotate it: `npx supabase secrets set INGEST_TOKEN=new` in `../hunt-hq`, update `local.properties`, rebuild.

The Supabase and Cloudinary side (table, secrets, functions) is described in `../hunt-hq/README.md` under "Android capture app".

## First run

1. Open the app, tap **Start capture**.
2. Allow notifications, then **Display over other apps** (Android opens the setting; go back and tap **Start capture** again), then choose **Entire screen** in the recording dialog.
3. The round shutter button appears. Switch to the game and tap it.

## Files

| File | What it does |
| --- | --- |
| `MainActivity.kt` | The one screen: start, upload now, send all, delete all, stop. Handles the permissions. |
| `CaptureService.kt` | Foreground service. Keeps the newest frame, saves a PNG on capture, owns the notification, resizes the capture when the phone rotates. |
| `Bubble.kt` | The floating button: shutter-ring look, fades when idle, drag and snap to the side edge (position remembered), green or red flash after an upload. |
| `Uploader.kt` | Cloudinary upload, then `ingest-shot`. Constants at the top: cloud name, preset, function URL. |
| `SendActivity.kt` | Invisible screen behind "Send all": the Share fallback. |
| `Shots.kt` | The folder of screenshots kept on the phone. |
| `res/layout/notif_big.xml` | The notification with its three buttons (drawn by us, because Xiaomi hides standard notification buttons). |

## Good to know

- **Rotation:** the capture follows the screen size (display listener in `CaptureService`). A frame of the wrong size is refused with "Screen is changing, try again".
- **Black screenshots:** some games block screen recording on purpose. Then the picture is black and nothing here can change that.
- **Xiaomi / HyperOS:** if the button disappears after a while, set the app's battery saver to **No restrictions** and allow it to run in the background.
- **Android 14+:** the recording permission is one use per start. After **Stop**, or after Android ends the recording, tap **Start capture** again.
- **No Supabase login in the app.** The only secret on the phone is the ingest token; the Cloudinary secret never leaves the server.
