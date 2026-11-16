# RIMRUN VR

**All heart. All hoops.** A first-person, arcade half-court basketball game for Quest Browser, desktop and touch screens. Built in BasketballVR using the controller, animation and physics lessons from [Crease VR](https://github.com/Ali-sial-786/Cricket).

## Play

```sh
npm ci
npm run dev
```

Open **http://localhost:5173**. Click a mode and **Let’s run it**. The mouse is captured when the game starts; `Esc` or `M` pauses. In Quest Browser, open the hosted **HTTPS** URL and select **Play in VR**. A laptop’s plain HTTP LAN address does not provide immersive WebXR on Quest.

```sh
npm test          # Physics, match rules, complete AI games, tracking and real athlete rig
npm run build    # Self-contained static site in dist/
npm run preview  # Production build on localhost:4173
npm run test:smoke # Launches Vite + Chromium and exercises desktop/touch flows
```

The smoke runner uses `/usr/bin/chromium` by default. Set `CHROMIUM_PATH` for another installation, and optionally `SMOKE_URL` for an already-running server. Screenshots go to `test-results/`. Fonts, models, animations and audio synthesis are served locally; there are no runtime CDN dependencies.

## Modes

| Mode | Rules |
| --- | --- |
| **1v1 / Iso Ball** | You against an AI opponent. First to 11, win by 2, cap 21; 2s and 3s; 18-second clock. |
| **2v2 / Run Together** | You and AI teammate Jax against Nova and Ace. Pass, cut, call for the ball, defend your matchup. Same scoring. |
| **3PT / Make It Rain** | Five racks, five balls each, 70 seconds. Last ball of every rack is worth 2; the entire middle rack is worth 2. Maximum **34**. A release before the buzzer counts. Personal best is saved on this device. |
| **Shootaround** | No opponent or time limit. Automatic ball return, release feedback, handles and close-range jump dunks. |

After a basket, the other team checks the ball. After a defensive rebound or steal, the new offense must **clear beyond the three-point line**. Passes travel through the world and can be intercepted. Blocks, rebounds, rim bounces and the backboard use the actual ball position. Offline AI play is implemented; network multiplayer is not included.

## Desktop and touch

| Input | Action |
| --- | --- |
| **WASD / arrows**, mouse | Move and look. **Shift** sprints. |
| **Hold left mouse → release** | Gather and shoot. Release on the green band, facing the basket. |
| **Q / E / R / C** | Crossover / behind the back / spin / stepback. Chain moves to create space. |
| **Space** | Jump to block or rebound. Jump and shoot close to the basket to dunk. |
| **F / right mouse** | Reach for a steal. Exposed low dribbles are vulnerable; gathered balls are protected. |
| **Ctrl** | Defensive stance. |
| **X** | Pass to Jax, or call for the ball when he has it. |
| **Esc / M** | Pause, restart or choose another run. |

Touch screens have a movement pad and contextual action buttons. Drag the court to look. Hold/release **Shoot** for the same timing mechanic.

## Quest controllers

The default shooting hand is right; Settings can switch it. “Ball hand” and “off hand” below follow that setting.

| Input | Action |
| --- | --- |
| **Either grip → lift and release** | Gather, then shoot with a real upward flick. A downward release returns to a dribble. A chest-height forward throw in 2v2 passes. |
| **Ball-hand trigger → release** | Accessible timed shooting. Gather and release on green. On defense, trigger or grip reaches for a steal. |
| **Low hand sweep across your body** | Natural crossover; sweep behind your hip for a wrap. |
| **Ball-hand lower / upper face button** | Crossover / behind the back. |
| **Right stick up / down** | Spin / stepback. |
| **Off-hand trigger** | Quick pass or call for the ball. |
| **Off-hand lower face button** | Jump / block. Reaching a tracked hand into the shot path also blocks. |
| **Off-hand grip** | Defensive stance. |
| **Left stick**, click | Move; click to sprint. |
| **Right stick left / right** | Snap turn 30° by default; smooth/off available. |
| **Off-hand upper face button / right stick click** | In-headset pause menu. Point a controller and pull its trigger to choose a mode, change comfort settings, resume or leave VR. |

Use controller straps and a clear boundary. You can stay physically in one place; thumbstick locomotion does the running. **Comfort / blink** movement and snap turning are available. Tracking loss, focus loss and pauses discard stale throws; virtual movement is excluded from measured hand velocity.

## Feel and presentation

- Three difficulty levels adjust shooting assistance, release windows and AI. Real aiming, timing, pressure and shot form still matter.
- Dribble moves cost stamina and briefly protect the ball. Poorly timed defensive reaches leave the defender vulnerable; move chains can stagger them.
- Five heat points trigger a 14-second hot streak with a wider release window. Perfect makes build heat faster.
- Human-proportioned, smooth-skinned athletes, full anatomical hands/fingers, faces, modeled hair and footwear, sleeveless jerseys and shorts. Approximately **47k triangles** close up; a separate **9k** distant mesh is included. Four player heights, skin tones and kit numbers, plus detailed spectators.
- The supplied **Mixamo `Dribble _2_.fbx`** is retargeted onto the 17-bone athlete rig. Its 2.1-second take supplies the dribbling weight shift and arm motion; inverse kinematics fits the hands to the live ball. Walking, running and defense blend from Crease VR’s retargeted Quaternius clips.
- Sunset court, city skyline, palms, chain-link fence, physical scoreboard, animated net, ball trails, particles, haptics and original synthesized court sounds.

## Where to adjust things

| File | Purpose |
| --- | --- |
| `src/config.js` | Court dimensions, physics, scoring, difficulty, release windows, contest racks. |
| `src/game/engine.js` | Pure fixed-step game simulation, AI, possession, moves, passing, defense and contest progression. |
| `src/physics/basketball.js` | 240 Hz ball integration, swept board contact, torus rim collision, basket crossings and assisted release solver. |
| `src/input/` | Keyboard/touch/XR input, real-time reference-space motion history and gesture recognition. |
| `src/render/athletes.js` | Basketball poses, motion blending and hand/foot IK. |
| `src/render/humanoid.js`, `clips.js` | Athlete skinning, LODs, IK and animation playback adapted from Crease VR. |
| `src/render/court.js` | Court art, scene props, physical scoreboard and static mesh batching. |
| `src/xr/` | Session lifecycle, comfort preferences, world-space menu and headset HUD. |
| `src/ui.js`, `src/style.css` | Desktop menu, HUD, results and help. |

## Rebuilding character assets

Runtime models are committed; Blender is unnecessary to play or build the game. For anatomy changes, install Blender 4.3+ and run:

```sh
python3 tools/fetch_anatomy.py
blender -b -t 6 --python tools/rebuild_anatomy.py
node tools/build_athlete.mjs art-sources/generated/Athlete.glb
```

The source builder derives from Courtside/Crease VR’s CC0 MakeHuman pipeline, retaining complete skin under the new armholes and neckline, adult eye/jaw proportions, and basketball tailoring. The offline converter bakes ambient occlusion and two mesh LODs into the compact runtime files. Generated source assets live in ignored `art-sources/`.

To replace the dribble take with another user-supplied Mixamo FBX:

```sh
node tools/import_dribble.mjs "/path/to/Dribble.fbx"
npm test
```

It validates the skeleton, samples 30 fps, removes travel, keeps the crouch/weight shift, blends the loop seam, and stores compact quaternion frames. The raw Mixamo FBX is not redistributed. See [CREDITS.md](CREDITS.md) for the distinct code, model, font and animation licenses.

## Hosting and verification limits

The GitHub Actions workflow tests, builds and deploys the default branch to GitHub Pages when Pages is configured for Actions. `dist/` can also be hosted on any HTTPS static host; relative paths support a repository subdirectory.

**One-time Pages setup:** open [repository Settings → Pages](https://github.com/Ali-sial-786/BasketballVR/settings/pages), set **Build and deployment → Source → GitHub Actions**, then run **Test, build and deploy RIMRUN** from the Actions tab. The GitHub connection used to build this game can push source but cannot enable Pages (GitHub returns HTTP 403 for that administrative action). Until enabled, CI still passes and publishes a downloadable `rimrun-static-site` build artifact. Once configured, the game will be at `https://ali-sial-786.github.io/BasketballVR/`.

Automated tests cover the actual simulation and athlete assets, and Chromium checks cover desktop and touch controls. Physical Quest rendering, controller ergonomics, comfort and sustained headset frame rate require hardware testing. This is a playable first version for iteration, with human-like models rather than a photorealistic NBA production asset set.
