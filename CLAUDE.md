# Launch game: project brief

A 3D car-launching game for iPhone, built for Kaiden (age 4). Pull the car back in a catapult, it races up a big ramp, flies through a toy city, and lands or crashes. Distance earns coins; coins buy upgrades; maxing a car unlocks the next one.

The working prototype is `prototype/launch-garage.html` (single file, three.js r128). Treat it as the reference for gameplay, feel, physics numbers and car designs, not as the code structure to keep.

## Audience rules (apply everywhere)
- No reading needed to play: pictures, arrows and sounds explain things.
- Big thumb-sized buttons, nothing important near screen edges.
- Every launch earns coins, even a short crash.
- One launch under ~15 seconds.
- No ads, purchases or links out.
- A tiny pull does nothing rather than a disappointing flop.

## Branding
- Bright, bold colours: hot red, flame orange, sunshine yellow, electric blue.
- Original game name and logo only. Do not use the Hot Wheels name or logo.
- Name, logo, colours and fonts live in one theme file.

## Cars (unlock order)
| # | Car | Card | Action button |
|---|---|---|---|
| 1 | Banana Buggy | 04 | Swerve: curves round the next bus or building through its gap |
| 2 | Flame Racer | 01 | Flame Boost: short blast of flames from the exhausts (~1.3 s) |
| 3 | Shark Chomper | 03 | Chomp: smashes through one building, then normal |
| 4 | Dino Stomper | 02 | Stomp: smashes through one building, then normal |
| 5 | Rocket Rider | 05 | Rocket Boost: two-second rocket blast |
| 6 | Lightning Bolt | 25 | Lightning Strike: bolt from the sky destroys the building ahead |

Each action is one use per launch and gives only a small advantage. Card art comes from the Turbo Pairs repo (`moggs12/turbo-pairs`, `public/themes/hot-wheels/`), cropped to the car only.

## Core loop
1. Car sits in a catapult at the bottom of a big launch ramp.
2. Drag down to pull back (power); drag left or right to aim. A dotted arc previews the flight.
3. Release: the car accelerates up the ramp, wheels visibly spinning, and launches off the top.
4. Rear chase camera stays a fixed distance behind the car the whole flight.
5. Obstacles across the street: cones, parked cars, buses (with a gap), buildings (some with an alley gap). Hitting one stops you at that distance. Rolling after landing always ends at the next obstacle.
6. Distance plus coins grabbed in the air are added to the total, then reset for the next launch.

## Upgrades
Engine (launch speed), Wheels (bounce and roll), Wings (glide), Boost (hold in the air). Three levels each, prices in one data file. Wings and boosters appear on the car; wheels go gold at max. All 12 bought unlocks the next car.

## Make it feel like flying (top priority for the next build)
- Big ramp launch with a speed-up run.
- Wheels clearly spinning, suspension bounce on landing.
- Speed lines or wind streaks, a small FOV kick at take-off, camera shake on landing and crashes.
- Boost and rocket flames, dust on landing, debris on crashes.
- Sounds: engine rev, whoosh, coin ping, crash. Haptic buzz on iPhone.
- Smoother, more detailed cars; later swap in Blender glTF models one at a time.

## Architecture
- TypeScript + Vite + three.js, GitHub Pages deploy via GitHub Actions, installable as a PWA.
- Layers: content (data files: cars, upgrades, levels, theme), game rules (physics, collisions, specials, economy, saves; plain code with Vitest tests), presentation (3D world, car models, camera, screens, sound), platform (web now, iPhone app via Capacitor later).
- Adding a car, city or upgrade should mean editing data, not game code.
- Saves carry a version number and migrate rather than wipe.

## Where things live
- `src/content/`: data only. `theme.ts` (name, colours, fonts), `cars.ts` (cars, base speeds, upgrade prices), `upgrades.ts` (the four upgrades, rewards), `specials.ts` (action buttons), `level.ts` (the city street and its obstacles).
- `src/rules/`: plain TypeScript, no three.js. `physics.ts`, `collisions.ts`, `layout.ts` (seeded side buildings, coins), `run.ts` (one launch end to end), `economy.ts`, `save.ts` (versioned saves + migration), `aim.ts`. Tests in `rules.test.ts`.
- `src/presentation/`: three.js and DOM. `game.ts` is the glue loop; `cars/` holds the procedural car models; `city.ts`, `catapult.ts`, `effects.ts`, `camera.ts`, `screens.ts` (HUD, result card, garage).
- `src/platform/web.ts`: localStorage + service worker. A Capacitor build swaps this.
- `prototype/launch-garage.html`: the original single-file prototype, kept for reference.

## Commands
- `npm run dev`: local dev server. Garage testing tools show in dev, or with `?test` in the URL.
- `npm test`: Vitest rules tests.
- `npm run build`: typecheck + production build to `dist/`.
- `npm run icons`: regenerate the placeholder PNG app icons.
- Push to `main` runs tests and deploys to GitHub Pages (`.github/workflows/deploy.yml`). In the repo settings, Pages source must be "GitHub Actions".

## Roadmap
1. Foundation: rebuild the prototype in this structure; plays the same as the prototype.
2. Ramp, home screen and feel: ramp launch, home screen with Start, sounds, haptics, flying feel, balance tuning.
3. Specials: polish the six action buttons and a short first-go tutorial.
4. New content: Blender car models, a second city, more cars from the 26 card designs.
5. iPhone app: Capacitor wrap, TestFlight on family devices.
