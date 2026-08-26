# 100 Yard Draft Race v3

## New collision mechanic

The race now has four keyboard controls:

- LEFT / RIGHT arrows: alternate to run.
- UP arrow: hit the runner in the lane directly above you.
- DOWN arrow: hit the runner in the lane directly below you.

A hit can only connect if the target is in the adjacent lane and within 3 yards of your current field position.

### Hit resolution

- If Player A attacks first, Player B falls.
- If Player B attacks first, Player A falls.
- If both attacks reach the server within a 140 ms simultaneous window, the attacks cancel and neither player falls.
- A fallen player is disabled for 1.6 seconds and loses 1.2 yards.
- Attacks have a 650 ms cooldown.

All collision decisions are made by the server.

## Race pacing

- 0.40 yards per valid LEFT/RIGHT stride.
- 250 valid alternating strides = 100 yards.
- Around 4 valid strides per second = roughly 62.5 seconds before knockdowns.

## Automatic reset

If every player closes/disconnects from the game, the server now fully resets:
- host
- race state
- finish order
- positions
- ready state

The next person to join becomes host and gets a fresh lobby.

## Update Render

Replace the files in your current GitHub repository with these files, commit, and push.
If Render Auto-Deploy is enabled, your existing URL will update automatically.
