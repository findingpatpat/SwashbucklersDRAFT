# Retro Draft Race v9

## Changes in this version

### Ready button moved to top-right
The I'M READY button now sits in the top-right score/control bar next to the host indicator.

That means players no longer need to scroll past all 10 lanes to ready up.

The host's START RACE and RESET controls also live in the same top-right area.

### Kangaroo defenders
The defensive-player icon is now a kangaroo: 🦘

It keeps the same gameplay behavior but fits the intentionally silly emoji character style much better.

### Shield protection against defenders
Shield behavior is enforced explicitly:
- if a racer with any active shield collides with a kangaroo defender,
- the kangaroo bounces away,
- the racer is NOT tackled,
- the racer does NOT lose position,
- the racer's shield is fully consumed,
- and the next kangaroo waits for the normal 5-second defender reset before entering that lane.

There is still never more than one defensive player in a lane at once.

## Existing systems retained
- exclusive funny emoji racers
- retro gridiron presentation
- 30-yard targeted throws
- 3-second arm reload dial
- three-hit football shield
- body checks
- long jumps and defender stomps
- 5-second defender respawn delay
- bouncing Nuke Ball
- 10-second Nuke stun
- defensive wave beginning at midfield
- automatic reset when everyone disconnects

## Render
Replace the files in your existing GitHub repository with this package and commit/push.
Your existing Render URL stays the same.
