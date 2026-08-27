# Retro Draft Race v8.3

This is a small gameplay patch based directly on the stable v8.2 build.

## New: hit 3 defensive players = shield
Successful forward football hits on the bulldozer defender now count toward a separate 3-hit reward.

- Hit bulldozer #1: 1/3
- Hit bulldozer #2: 2/3
- Hit bulldozer #3: earn a full 3-hit shield
- The defender-hit counter then resets to 0/3.

A 🚜 counter at the top of the screen shows progress.

This is separate from the existing "hit the same racer 3 times" shield reward.

## Nuke Ball eligibility fixed
The Nuke Ball now unlocks when AT LEAST 50% of the racers have crossed the 50-yard line.

Examples:
- 2 racers: when 1 crosses midfield, the racer still behind midfield gets the Nuke.
- 4 racers: when 2 cross midfield, racers still behind midfield get Nukes.
- 10 racers: when 5 cross midfield, racers still behind midfield get Nukes.

Every eligible unfinished racer behind midfield can receive one Nuke Ball.

They still must be upright/running to fire it.

## Everything else
All v8.2 behavior is retained:
- stable character selection
- bulldozer defender icon
- top-right I'M READY button
- shield protects against defensive-player collisions and is consumed
- 5-second defender reset
- one defender per lane
- jumps, Nuke chain, targeted footballs, reload dial, etc.

## Render
Replace your existing GitHub repository files with this package and commit/push.
Your existing Render URL remains unchanged.
