# Retro Draft Race v6

This build adds the larger gameplay/visual pass requested.

## Visual direction
The presentation is an original retro pixel-football look inspired by classic 8/16-bit sports games:
- football gridiron
- pixel racers
- pixel defenders
- crowd strip
- blocky score UI
- pixel-style controls and animation

No external game art or copied character assets are used.

## Character selection
Players first enter their name, then choose one of 10 exclusive humorous characters:
1. The Fridge
2. Uncle Rico
3. Grill Dad
4. Fourth-Down Wizard
5. Suspicious Mascot
6. Coach Cargo Shorts
7. Halftime Hotdog
8. Practice Squad Intern
9. Discount GOAT
10. Overconfident Kicker

Once a character is selected by a connected racer, it is unavailable to everyone else.

## Targeted football throws
- Player numbers remain lane numbers 1–10.
- Keyboard 1–9 targets racers #1–#9.
- Keyboard 0 targets racer #10.
- Throwing range increased to 30 yards.
- Throw cooldown remains 3 seconds.
- A circular ARM RELOAD dial shows cooldown progress.
- Three consecutive hits on the same racer still earns a shield.
- Shield absorbs 3 football hits.

## Nuke ball
The Nuke unlock condition is now dynamic:
- once MORE THAN HALF the racers have crossed the 50-yard line,
- every unfinished racer still behind the 50 gets access to a Nuke Ball,
- each qualifying racer can receive one,
- it can only be fired while the owner is standing/running.

When fired:
- the Nuke visually chains from the owner to the nearest lane target,
- then bounces runner-to-runner,
- every other unfinished racer is eventually hit,
- each victim is stunned for 10 seconds,
- the Nuke owner remains active and can continue running.

## Defensive wave / obstacles
When the first racer crosses midfield:
- a defensive player appears in every lane,
- defenders move slowly from right to left,
- touching one while not jumping sends that racer back to the start line.

Players can avoid the defender in two ways:
- SPACE / JUMP: jump over the defender
- F / THROW AHEAD: use your football throw to remove the defender if it is within 16 yards

Throw Ahead uses the same 3-second arm cooldown as throws at other racers.
A destroyed defender returns later so the lane does not stay permanently clear.

## Existing controls
- LEFT / RIGHT: alternate to run
- UP / DOWN: body-check adjacent lanes
- 1–9 / 0: targeted football throws
- SPACE: jump
- F: throw forward at lane defender
- N: use Nuke Ball

## Render deployment
Replace the files in your existing GitHub repository with the contents of this package and commit/push.
Your existing Render service and public URL can remain unchanged.
