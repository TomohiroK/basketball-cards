# Basketball Poker Prototype

Mobile-first web prototype for a simultaneous-resolution basketball card game.

## Tech Decision

Use **Vite + React + TypeScript** for the first Web App.

- Fast prototype loop with a small static bundle and no backend requirement.
- Pure TypeScript game engine in `src/game`, separated from React UI.
- PWA-ready shell via `manifest.webmanifest`.
- iOS/Android path: add Capacitor when WebView packaging is enough; reuse `src/game` in Expo/React Native if a deeper native UI is required later.

This keeps the current build simple while preserving the important mobile escape hatch: the rules engine is not tied to DOM, CSS, or browser APIs.

## Rule Assumptions Implemented

- Deal layout follows Texas Hold'em style:
  - Player A private cards: 2
  - Player B private cards: 2
  - Shared community cards: 4
- Each player evaluates exactly 6 available cards: their 2 private cards plus the 4 shared community cards.
- When Player A attempts to score, Player B counters with Player B's 2 private cards plus the 4 shared community cards. Player B's attempt is resolved the same way in reverse.
- Duplicate non-Free Throw cards collapse to the highest-numbered copy.
- Defense cards only counter matching shoot symbols.
- A valid defense card can stop one matching shoot attempt in the priority chain.
- Foul is forced when it exists in the countering player's private cards or in the shared community cards.
- And 1 preserves the made shoot and adds exactly one bonus Free Throw point when at least one Free Throw card exists. Extra Free Throw cards do not increase the And 1 bonus.
- No Foul cancels only And 1; it does not cancel Foul conversion.
- Clutch and Help are assigned automatically by max/min scoring:
  - attacker chooses the best Clutch target,
  - defender chooses the best Help target.
- Pure Foul free throws use `0` as the shoot-number tiebreaker because the normal shoot is stopped.
- Deep 3 uses `0` as the shoot-number tiebreaker because it is non-numbered.

## Commands

```bash
npm install
npm run dev
npm run test
npm run build
```
