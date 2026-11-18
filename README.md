# RIMRUN VR

**All heart. All hoops.** A first-person, arcade half-court basketball game in an indoor arena for Quest Browser, desktop and touch screens. Built in BasketballVR using the controller, animation and physics lessons from [Crease VR](https://github.com/Ali-sial-786/Cricket).

## Play

```sh
npm ci
npm run dev
```

Open **http://localhost:5173**. Click a mode and **Let’s run it**. Choose **Watch Gameplay** for an AI demo with a courtside camera; switch between 1v1, 2v2 and the three-point contest, or **Take Control** at any time. The mouse is captured when the game starts; `Esc` or `M` pauses. In Quest Browser, open the hosted **HTTPS** URL and select **Play in VR**. A laptop’s plain HTTP LAN address does not provide immersive WebXR on Quest.

```sh
npm test          # Ball physics, shot model, match rules, complete AI games, tracking, athlete rig and poses
npm run build    # Self-contained static site in dist/
npm run preview  # Production build on localhost:4173
npm run test:smoke # Launches Vite + Chromium and exercises desktop/touch flows
npm run review:motion shot # Contact sheet of the live rig: shot, handles, defense, pass, rim or views
```

The smoke runner and the motion review use `/usr/bin/chromium` by default. Set `CHROMIUM_PATH` for another installation, and optionally `SMOKE_URL` / `REVIEW_URL` for an already-running server. Screenshots and contact sheets go to `test-results/`. Fonts, models, animations and audio synthesis are served locally; there are no runtime CDN dependencies.

## Modes

| Mode | Rules |
| --- | --- |
| **1v1 / Iso Ball** | You against an AI opponent. First to 11, win by 2, cap 21; 2s and 3s; 18-second clock. |
| **2v2 / Run Together** | You and AI teammate Jax against Nova and Ace. Pass, cut, call for the ball, defend your matchup. Same scoring. |
| **3PT / Make It Rain** | Five racks, five balls each, 70 seconds. Last ball of every rack is worth 2; the entire middle rack is worth 2. Maximum **34**. A release before the buzzer counts. Personal best is saved on this device. |
| **Shootaround** | No opponent or time limit. Automatic ball return, a full shot report after every attempt, handles, bank layups and dunks. |

After a basket, the other team checks the ball. After a defensive rebound or steal, the new offense must **clear beyond the three-point line**. Passes lead moving teammates. Receivers can run onto the pass and defenders can intercept or deflect it. The shot clock runs during passes and loose balls. A shot that has touched the rim or glass is a rebound, not a block, and a ball touched on its way down is **goaltending**: the basket counts. Offline AI play is implemented; network multiplayer is not included.

## Desktop and touch

| Input | Action |
| --- | --- |
| **WASD / arrows**, mouse | Move and look. **Shift** sprints. Back-pedalling and sliding are slower than running where you look. |
| **V** | Switch between first person and the broadcast camera behind your shoulder. |
| **Hold left mouse → release** | Gather, rise and release **at the top of your jump**, inside the green band beside the reticle. Early is short, late is long. |
| **Tap left mouse** | Pump fake. The dribble stays alive; a defender who bites is in the air and cannot contest. |
| **Q / Z / E** | Crossover / between the legs / behind the back. Each changes hands. |
| **R / C / T** | Spin / stepback / hesitation. |
| **Ctrl** | With the ball: protect it (low dribble on the far hip, arm bar). On defense: a balanced stance that slides, holds its ground and keeps a hand up. |
| **Space** | Jump to block or rebound. Shoot inside the paint for a layup; right at the rim, with speed, to dunk. |
| **F / right mouse** | Reach for a steal, or tip a pass that is in the air. |
| **X / G / B** | Pass (the game picks the right one) / bounce pass / lob. **X** calls for the ball when Jax has it. |
| **Esc / M** | Pause, restart or choose another run. |

On touch screens, drag the pad to move and drag the court to look. Hold **Shoot** and release in the green; a quick tap is a pump fake. All six handles are available while you have the ball, and **View** switches camera. In 2v2, **Pass** changes to **Call** when Jax has possession. On defense, hold **Guard** to slide or tap **Steal** or **Jump**. The contest keeps you at the active rack.

## Quest controllers

The default shooting hand is right; Settings can switch it. “Ball hand” and “off hand” below follow that setting.

| Input | Action |
| --- | --- |
| **Either grip → lift and release** | Gather, then shoot with a real upward flick. The ball leaves along your hand’s own line and arc; the difficulty level decides how much of that is forgiven. A soft flick falls short. A downward release returns to a dribble. |
| **A real throw in 2v2** | Flat from the chest is a chest pass. Down and out is a bounce pass. |
| **Ball-hand trigger → release** | Timed shooting. Gather and release in the green; a quick tap is a pump fake. On defense, trigger or grip reaches for a steal. |
| **Low hand sweep across your body** | Natural crossover; sweep behind your hip for a wrap. |
| **Ball-hand lower / upper face button** | Crossover / behind the back. Hold the left stick click with them for between the legs / hesitation. |
| **Right stick up / down** | Spin / stepback. |
| **Off-hand trigger** | Smart pass, or call for the ball. |
| **Off-hand lower face button** | Jump. Reaching a tracked hand into a rising shot blocks it; touching one on the way down is goaltending. |
| **Off-hand grip** | Defensive stance. |
| **Left stick**, click | Move; click to sprint. |
| **Right stick left / right** | Snap turn 30° by default; smooth/off available. |
| **Off-hand upper face button / right stick click** | In-headset pause menu. Point a controller and pull its trigger to choose a mode, change comfort settings, resume or leave VR. |

Use controller straps and a clear boundary. You can stay physically in one place; thumbstick locomotion does the running. **Comfort / blink** movement and snap turning are available. Tracking loss, focus loss and pauses discard stale throws; virtual movement is excluded from measured hand velocity.

## How it plays

**Shooting.** The ball is a size 7 with real mass, air drag, backspin and Magnus lift, thrown at a regulation 457 mm ring and a glass board. Every shot is solved through that same flight model, then *your* errors are applied to the launch itself: speed and heading, not a target offset. That is why the same lapse that still drops from the elbow comes up short from the arc.

- The jump shot is modeled on Klay Thompson’s form as coaches describe it (sources and limits in [REFERENCE_NOTES.md](REFERENCE_NOTES.md)): a small hop into a wide, parallel base with the shooting shoulder a touch ahead; the ball straight into the pocket at the shooting hip and straight up to a set point over the shooting eye, elbow in, **before the feet leave the floor**; a modest jump straight up and down; the push starting just after take-off and the ball gone at the top; the guide hand off early; the elbow locked out above the head with a loose wrist and held. It is quick: 0.62 s from gather to release, inside the 0.79 s catch-and-shoot window tracking data credits him with, on an arc that enters the rim at about 46°. No name or likeness is used in the game.
- Hold to gather and release at the top of the jump. The meter beside the reticle is the motion, not a separate mini-game.
- Early leaves the legs out of it (short); late pushes it long. The window is full size at the rim and the elbow and tightens with range.
- A hand in your face, drifting feet and tired legs scatter the shot. A fadeaway is harder to contest but less accurate; straight off a catch you are in rhythm and the window is wider.
- Backspin matters after the release: it checks the ball on the rim, drags a bank shot down off the glass, and decides the bounces.
- Inside the paint a moving shooter lays it up; from the wings the layup goes off the glass. Drive right to the ring and release above it to dunk. The breakaway rim flexes.
- Every attempt gets a report: release timing in milliseconds, shot type, contest, distance, launch arc, and what the ball did — *swish*, *rim and in*, *short · front rim*, *long · back rim*, *airball*.

**Dribbling.** The live dribble rides the hand for about 40% of each beat and is pushed to the floor, not dropped. It sits waist high when you are free, goes out in front at a run, and drops to the knee on your far hip when a defender is close or you hold **protect**. Six moves: crossover, between the legs, behind the back, spin, stepback, hesitation. A move only works on a defender it actually fools: sliding the wrong way, reaching, or in the air. Then you get a first-step burst and they are a beat late. Chain moves for a combo.

**Defending.** Bodies are solid: a defender in a stance holds their ground and a dribbler who runs into them is stopped. Defenders shadow the ball with the near hand and keep the other in the passing lane; on a gather the hand goes straight up.

- **Steals** depend on where the ball is. In front of the dribbler and away from their hand it is there to take; behind their body, cradled in the hand, or protected, it is not. A good reach is a clean steal or a ball knocked loose; a bad one leaves you leaning while they go by.
- **Blocks** need a hand on the ball: you have to be in the air, close, and near the top of your jump as it leaves the shooter. Once it touches rim or glass it is a rebound. On the way down it is goaltending.
- **Pump fakes** work both ways. AI defenders decide per shot whether to leave the floor, and can be faked; AI shooters will fake you.

**Passing.** Chest passes are flat and fast. Bounce passes skip once and arrive at the waist, under a defender’s hands. Lobs go over the top. The smart pass picks one from where the defenders are; you can also call each directly. Passes lead a cutting teammate, can be picked off by a defender who is looking at them, and can be tipped loose with a reach.

**Opponents.** Three levels change the release window, shot assistance, and how the AI plays: how quickly a defender reads a move, how often they bite on a fake or leave their feet, how hard they reach, and how steady their own shooting touch is. AI ball handlers read which side you are sitting on, attack off a made move, fade when crowded, and hunt threes when left open.

## Presentation

- **Rendering.** On a desktop GPU the varnished hardwood mirrors the live scene (players, ball, LED boards), the frame is rendered in HDR with multisampling, and real light sources bloom. Lighting and reflections come from a CC0 HDRI of a hall with banks of overhead spotlights. *Settings → Graphics* switches between this and a single forward pass; **Auto** drops to Standard by itself if the machine cannot hold about 40 frames a second. Touch devices and headsets always use the forward pass, lighter spectators and no haze.
- **Crowd.** About 1,400 spectators, each a real figure built from the athlete model: seated, individually dressed (shirts, sleeves, trousers or shorts, caps, shoes), different builds, skin and hair, children among them. They shift in their seats, and get to their feet with their arms up in proportion to the play: a few for a bucket, most of the building for a dunk. Fans sit courtside round the floor; reserves in warm-ups fill both benches beside a scorer’s table.
- **Arena.** Scrolling LED ribbon boards on two levels, a band of lit suites with guests at the rail, acoustic panelling, a lighting truss of spot fixtures with faint shafts in the haze, catwalks, line-array speakers, padded broadcast stanchions, banners, and a centre-hung scoreboard whose four video screens carry a **live telephoto feed** of the game above the score.
- **Floor.** Plank relief, grain and gloss variation from a CC0 scanned wood floor under a clear coat. Reflections sharpen at grazing angles and ripple with the planks.
- **Athletes.** Skin with mottling, fine grain, flush at the knees, elbows, knuckles, ears and nose, and patches of sweat sheen that move with the body. Knit relief on jerseys and shorts, trimmed hems and side stripes, striped crew socks, shoes with a team toe cap and heel. Each player wears their own kit: compression arm or leg sleeve, headband, wristbands, shoe colour, and a fade haircut.
- **Ball.** Eight panels, recessed channels and a pebbled grain that catches the lights; it turns with the simulated spin.
- First person, or a broadcast camera over the ball-hand shoulder (**V**). Watch Gameplay uses a low sideline camera that travels with the play.
- First-person desktop and touch use the athlete’s skinned arms; the shooting hand carries the ball a little wider there so it frames the rim instead of hiding it. Quest uses the tracked controller hands.
- Motion: shooting form with a held follow-through, one-hand finishes, two-foot stepback hop, staggered between-the-legs stance, arm bar, active defensive hands, steal lunges, block reaches, chest/bounce/lob pass releases, catches, stumbles and celebrations, all eased in body space over the retargeted clips with planted-foot IK.
- The supplied **Mixamo `Dribble _2_.fbx`** is retargeted onto the 17-bone athlete rig and supplies the dribbling weight shift; inverse kinematics fits the hand to the live ball. Walking, running and defense blend from Crease VR’s retargeted Quaternius clips.
- Athletes are about **56k triangles** close up with a separate **9k** distant mesh; spectators are about 1,060 triangles in the lower rows and 330 beyond.
- Sound is synthesized: a steel rim, glass, a different net for a swish than for a ball that rattled in, sneaker chirps on hard cuts, shot-clock ticks, and a crowd murmur that swells after a make, a block or a broken ankle. Haptics follow the same events in the headset.
- Five heat points trigger a 14-second hot streak with a wider release window. Perfect makes build heat faster.

## Gameplay recordings and references

The footage review and specific movement/presentation decisions are documented in [REFERENCE_NOTES.md](REFERENCE_NOTES.md). References include USA Basketball coaching footage, NBA 2K25 and NBA Playgrounds 2 trailers, and Wii Sports Resort basketball footage. No reference video or commercial assets ship with the game.

`npm run record:demo` records an actual browser session to `RIMRUN-improved.mp4`, including the game’s synthesized sounds. It needs Chromium and ffmpeg, plus a running dev or preview server. It scripts inputs and changes camera/modes; it never forces scores. For example:

```sh
CAPTURE_URL=http://127.0.0.1:4173 CAPTURE_OUTPUT=./test-results npm run record:demo
```

The outdoor baseline was recorded from `fef750d` before the arena, anatomy, movement and mechanics pass.

## Where to adjust things

| File | Purpose |
| --- | --- |
| `src/config.js` | Court and regulation ring dimensions, ball constants (drag, lift, restitution, friction), scoring, difficulty levels, release windows, contest racks. |
| `src/physics/basketball.js` | 240 Hz ball integration with spin; rim, glass and floor contacts with friction; the launch solver; the shot error model; chest, bounce and lob pass solutions. |
| `src/game/engine.js` | Pure fixed-step simulation: possession, shooting and shot reports, contests, blocks and goaltending, steals and loose balls, passes, body contact, contest progression. |
| `src/game/ai.js` | Match AI for every athlete a person is not controlling. Uses the same engine methods a person does. |
| `src/game/movement.js` | Acceleration, the six moves and their ball paths, the live dribble profile, and the path of a gathered ball through a jump shot. |
| `src/input/` | Keyboard/touch/XR input, real-time reference-space motion history and gesture recognition. |
| `src/render/athletes.js` | Basketball poses: posture, per-arm jobs eased over the clips, hand/foot IK. |
| `src/render/humanoid.js`, `clips.js`, `footwork.js` | Athlete skinning, LODs, IK, animation playback and planted-foot stepping. |
| `src/render/arena.js`, `arena-detail.js`, `effects.js` | Indoor venue, floor material, LED boards, courtside, suites, rigging, stanchions, net, shot clock, scoreboards, ball spin and trails. |
| `src/render/crowd.js` | Instanced spectators: clothing, builds, idle motion and the seated-to-standing blend. |
| `src/render/pipeline.js` | Floor reflection, HDR and bloom, the jumbotron feed, and loading of the CC0 textures and HDRI. |
| `src/audio.js` | Synthesized court sounds and crowd. |
| `src/game/demo.js` | Contest demo commands; spectator pickup uses normal match AI. |
| `src/xr/` | Session lifecycle, comfort preferences, world-space menu and headset HUD. |
| `src/ui.js`, `src/style.css` | Desktop menu, HUD, release meter, shot report, results and help. |
| `tools/review_motion.mjs` | Renders contact sheets of the live rig for reviewing poses and motion. |
| `tools/build_crowd.mjs` | Builds the spectator model (`crowd.json` / `crowd.bin`) from the athlete. |

## Rebuilding character assets

Runtime models are committed; Blender is unnecessary to play or build the game. The spectators are derived from the committed athlete and rebuild without Blender:

```sh
npm run build:crowd
```

For anatomy changes, install Blender 4.3+ (or `pip install bpy` and run the script with Python; verified with bpy 5.3) and run:

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

Automated tests cover the ball physics, shot model, rules, complete AI games, athlete assets and the key poses, and Chromium checks cover desktop and touch controls. Balance was tuned against seeded AI-versus-AI games and a scripted player with human-like timing and reaction lag, not against people. Physical Quest rendering, controller ergonomics, comfort, sustained headset frame rate, and how the physical shot and pass gestures feel in the hand require hardware testing. The rich desktop pipeline was checked for correctness in software-rendered Chromium, not timed on real GPUs; frame-rate behaviour on integrated graphics is what the Auto setting is there for. The shot form follows written breakdowns of Klay Thompson’s mechanics; the reference videos were located but could not be played from the build environment. This is a playable first version for iteration, with human-like models rather than a photorealistic NBA production asset set.
