# Games section (mobile)

Drawer → **Games**. Org ke andar teammates ke saath real-time multiplayer:

| Game | Players | Rules |
| --- | --- | --- |
| Stone Paper Scissors | 2 | Best of 7, first to 4 wins. Draw round replay hota hai. Dono ke picks tab tak hidden jab tak dono choose na kar lein, phir 3 baar haath shake animation aur reveal. |
| Ludo | 2–4 | Standard: 6 pe token bahar, 6 / capture / home pe extra turn, teen 6 lagataar = turn gaya, safe squares (start + star) pe capture nahi, exact roll se home. Sab 4 token home → win. |

## Flow

1. Hub pe game card → **Create room** (Ludo mein 2/3/4 choose karo). Room org ke sab members ko "Open rooms" mein dikhta hai.
2. Lobby: players list, **Invite** (teammate ko live popup + push notification), host **Start game**.
3. Game screen. Ludo mein 30 sec turn timer: idle ho to server khud roll/move kar deta hai taaki game atke nahi. Sirf ek legal move ho to auto-move.
4. Finish → winner + **Play again** (same room, lobby pe wapas).

Disconnect (network/app background): 45 sec tak seat reserved, wapas aao to same state. Usse zyada → RPS mein forfeit, Ludo mein tokens hat jaate hain aur baaki khelte rehte hain.

## 3D

Dono games default mein **3D** chalte hain (`expo-gl` + `three` + `@react-three/fiber`):
Ludo ka tilted board, pawns jo glide/hop karke move hote hain, tumbling dice (tap karke roll),
board tumhare color ke hisaab se ghoomta hai taaki tumhara base neeche rahe. RPS mein do
low-poly 3D haath jo 3 baar pump ho ke fist/paper/scissors mein khulte hain.

- Room header mein **3D / 2D** toggle hai (slow phone ke liye). GL fail ho to automatically 2D.
- Native module hai → Expo Go nahi, APK/dev-client build chahiye. Web pe hamesha 2D.
- Scenes: `mobile/src/games/three/` (`GameCanvas.tsx` = GL check + error boundary,
  `LudoScene3D.tsx`, `RpsScene3D.tsx`). Sab geometry primitives hai, koi 3D asset file nahi.
- Metro: `three` ke liye `cjs` extension add ki (`metro.config.js`).

## Code

```
backend/src/games/
  engines/rps.engine.ts, ludo.engine.ts     pure rules (unit tests: *.spec.ts)
  games.service.ts                           in-memory rooms, timers, auto-play
  games.gateway.ts                           Socket.IO namespace /games (auth = same JWT as chat)
backend/test/games.e2e-spec.ts               create/join/start/pick/roll/leave/invite
mobile/src/api/games.ts                      types + socket connect/emit helpers
mobile/src/games/useGamesSocket.ts           one shared socket, room/lobby/invite events
mobile/src/screens/games/
  GamesHubScreen.tsx   GameRoomScreen.tsx   RpsBoard.tsx   LudoBoard.tsx (SVG board)
```

Rooms memory mein hain (single backend instance) — restart pe khatam, koi DB nahi. Naya game add karna ho: engine + service action + gateway event + board component, hub ke `GAME_CATALOG` mein entry.
