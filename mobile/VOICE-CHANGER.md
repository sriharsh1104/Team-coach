# Voice changer (mobile, Android)

In-app voice chat ke liye live voice effect: **Normal / Man / Woman / Girl / Child / Robot**.
Voice screen pe "Voice" chips se select karo — join se pehle ya baat karte karte, turant lagta hai.

## Kaise kaam karta hai

- React Native mein JS ko mic ke samples nahi milte, isliye effect native (Kotlin) hai:
  `mobile/modules/voice-changer/`.
- Yeh `@livekit/react-native-webrtc` ke `ExternalAudioProcessingFactory` pe
  **capture post-processing** hook hai: mic → echo cancel/noise suppress → **humara effect** → Opus encoder.
  Matlab phone se jo bhi nikalta hai (mediasoup ho ya LiveKit) woh changed voice hoti hai.
- DSP: delay-line pitch shifter (2 taps, crossfade, ~30 ms latency) + robot ke liye ring modulator.
  Koi FFT nahi, CPU bahut kam. Free, koi server/API nahi.
- Presets (semitones): Man −4, Woman +4, Girl +7, Child +10, Robot −2 + 45 Hz ring mod.
  Tuning `VoiceEffectProcessor.kt` ke `Preset` enum mein hai.
- Pehli baar: effect sirf WebRTC ke band 0 (0–8 kHz) pe chalta hai, upar ke bands mute —
  voice chat ke liye kaafi hai, quality "basic" hai (AI jaisi realistic nahi).

## Build

Native module hai → **Expo Go mein nahi chalega**, dev-client / APK build chahiye:

```bash
cd mobile
npx expo prebuild --platform android   # MainApplication mein VoiceChangerInstaller.install() daalta hai (plugins/withVoiceChanger.js)
npm run build:apk
```

Agar `android/` pehle se hai to bhi `prebuild` dobara chalao, warna `MainApplication.kt` mein hook nahi aayega
(module ka `OnCreate` fallback hai, par Application-level hook zyada bharosemand hai).

## Files

```
mobile/modules/voice-changer/
  expo-module.config.json
  android/build.gradle                       depends on :livekit_react-native-webrtc
  android/src/main/java/com/teamcoach/voicechanger/
    VoiceEffectProcessor.kt                  DSP (pitch shift + ring mod), AudioProcessing impl
    VoiceChangerInstaller.kt                 WebRTCModuleOptions.audioProcessingFactoryFactory
    VoiceChangerModule.kt                    Expo module: isAvailable/getPreset/setPreset/getPresets
mobile/plugins/withVoiceChanger.js           MainApplication.onCreate hook (prebuild)
mobile/src/voice/voiceChanger.ts             JS wrapper (safe no-op on iOS/web/Expo Go)
mobile/src/screens/voice/VoiceChannelScreen.tsx   "Voice" preset chips
```

## Limits / TODO

- Android only. iOS ke liye `LKRTCAudioProcessingModule` + `capturePostProcessingDelegate` (Swift) likhna padega.
- Preset app restart pe Normal ho jata hai (persist nahi kiya).
- Sirf app ke andar wali voice chat — game ke andar nahi (uske liye virtual mic chahiye).
