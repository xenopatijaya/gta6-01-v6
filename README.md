[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/xenopatijaya/gta6-01-v6/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/xenopatijaya/gta6-01-v6/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# Porto Alba — Open-World Crime

An open-world crime game in the spirit of GTA 6, built for the
[make.fun gta6-01 bounty](https://make.fun/bounty/gta6-01). Everything is
original: the city, the characters, the story, the art and the music are all
made for this game — nothing is taken from any commercial game.

**The story.** Kai Mercer came back to Porto Alba with $150 and a debt to Vera
Solano, the fixer who runs the Alba garage. Run her jobs, steal what you need,
outrun the Alba PD — and take the city for yourself.

## Play it

```sh
node serve.ts
# open http://localhost:8080 in desktop Chrome
```

No build step, no network requests at runtime: `game/` is plain static files
(three.js r160 vendored under `game/vendor/`), and all sound is synthesized
live with WebAudio.

## The city

- **Porto Alba**, a fictional sun-soaked coastal city: a 6×6 block grid of
  roads, towers, shops, palms, Alba Plaza park, a beach and a pier.
- **On foot and by car** — walk, run, jump, steal any of the parked cars
  (press **E**), and drive with arcade handling, handbrake and wheel spin.
- **Traffic & pedestrians** — 14 AI cars cruise the road grid and stop for the
  car ahead; 26 locals stroll the sidewalks, cross at intersections and flee
  from gunfire and speeding cars.
- **Wanted 0–5** — steal a car, hit a civilian or fire a gun and the Alba PD
  answers with interceptor cars (flashing light bars, ramming) and foot
  officers who chase and shoot. Stay clean for 25 seconds to cool off a star.
- **Missions & story** — a 3-job chain from fixer Vera Solano: a courier run
  ($500), a car theft ($1,200), and a heat escape ($2,500). Finish the chain
  and Vera offers repeatable side jobs.
- **Combat** — click to shoot with tracers, muzzle flash, impacts and sparks;
  ammo and reload (R).
- **HUD + live minimap** — cash, wanted stars, health, ammo, speed, mission
  objective, toasts, and a top-down map with roads, traffic, police and the
  pulsing mission beacon.
- **Save** — progress (cash, jobs, position) autosaves to localStorage; the
  start screen offers Continue.
- **Sound** — synthesized engine hum, sirens, gunshots, chimes and a
  sunset-drive bassline loop. **M** mutes.

## Controls

| Key | Action |
| --- | --- |
| W A S D / arrows | Move / drive |
| Mouse (drag or click to lock) | Look around |
| E | Steal / exit car |
| Click / F | Shoot |
| R | Reload |
| Shift | Run |
| Space | Jump / handbrake |
| J | New side job (after the story chain) |
| M | Mute |
| P | Pause |

## Layout

- `game/index.html` — page, HUD, start screen
- `game/src/main.js` — bootstrap, camera, game loop, state machine
- `game/src/city.js` — procedural Porto Alba (roads, buildings, park, beach)
- `game/src/player.js` — Kai on foot
- `game/src/vehicles.js` — car physics, traffic AI, police chases
- `game/src/pedestrians.js` — sidewalk AI
- `game/src/police.js` — wanted system, interceptors, foot cops
- `game/src/combat.js` — shooting, tracers, hit detection
- `game/src/missions.js` — Vera's 3-job chain + repeat jobs
- `game/src/effects.js` — tracers, particles, mission beacon
- `game/src/hud.js` — HUD + live minimap
- `game/src/audio.js` — synthesized WebAudio SFX + music
- `game/src/input.js` — keyboard + mouse
- `game/src/save.js` — localStorage saves
- `game/src/util.js` — seeded RNG + math helpers
- `game/vendor/three.module.min.js` — three.js r160 (vendored, minified)
- `main.ts` — entry program: copies `game/` + `screenshots/` to `/output` and
  writes `dossier.json` with the vendored make.fun library
- `serve.ts` — static server for local play-testing
- `screenshots/` — 4 real renders of the game

## License

MIT — see [LICENSE](LICENSE).
