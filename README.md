# Retro Draft Race v8.5.1

This is a corrective update to v8.5.

The finish-time feature is now explicitly updated and displayed for every racer as soon as they finish.

Changes:
- Server immediately broadcasts the updated finish order after each player crosses the line.
- Each result row has PLACE, PLAYER, and TIME columns.
- Finish time is shown to hundredths of a second.
- Your own finish banner also shows your elapsed time.
- game.js includes a cache-busting version query so browsers do not keep using the prior JavaScript file.

Example:

PLACE    PLAYER                 TIME
#1       Patrick              58.42s
#2       Mike                 59.17s
#3       Steve                61.03s

Everything else remains based on v8.5/v8.4 gameplay.
