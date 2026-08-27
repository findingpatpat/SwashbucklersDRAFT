# Retro Draft Race v8.2 — Minimal Patch

This version starts directly from the working v8 build.

Only two interface changes were made:

- Defensive player is now shown as a bulldozer-style emoji: 🚜
- The existing I'M READY button has been moved to the top-right beside the host indicator.

The v8 server/game logic was otherwise left untouched.

Important: v8 already includes shield protection against defensive players. When a racer with an active shield collides with the defender:
- the defender cannot tackle or reset the racer;
- the racer keeps their position;
- the shield is consumed;
- the defender resets on the existing 5-second delay.

All character-selection, race, Nuke, jump, throwing, shield, and defender logic remains the same as the working v8 version.

## Render
Replace your existing GitHub repository files with this package and commit/push.
Your existing Render URL remains the same.
