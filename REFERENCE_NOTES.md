# Basketball footage review and implementation targets

Reviewed on 2026-11-17. The review used publicly available video streams, sequential frame sampling, and closer frame-by-frame sections for movement. These are visual references, not motion-capture data or a claim of hands-on testing of the commercial games.

| Reference | Sections inspected | Observations and resulting changes |
| --- | --- | --- |
| [USA Basketball — Dribbling on the Move: Crossover Dribble](https://www.usab.com/videos/2022/04/dribbling-on-the-move-crossover-dribble) | 00:18–00:29; especially 00:21.5–00:28.5 | Lower the hips before the direction change. Keep the transfer below the waist, plant the outside foot, then push past the defender. Replace position jumps with a timed plant/push/recovery and an actual ball transfer path. |
| [USA Basketball — Proper Defensive Stance](https://www.usab.com/videos/2017/12/proper-defensive-stance) | 00:12–00:42 | Wide base, bent knees, torso above the feet, a lateral lead step followed by recovery. Use lateral foot planting and acceleration limits rather than a forward running animation on a defender sliding sideways. |
| [NBA 2K25 — Official Gameplay Trailer, GameSpot](https://www.gamespot.com/videos/nba-2k25-official-gameplay-trailer/2300-6464732/) | 00:17–00:30, 00:32–00:44, 00:48–01:20 | The trailer contains edited replay-style views. Useful visual references: distinct plant/push-off, the body turning with a drive, dribble-to-gather transitions, off-hand separation on release, and close finishes. Arena references: bright hardwood, controlled overhead light, darker seating, fabric/skin material separation. |
| [NBA Playgrounds 2 — Official Gameplay Trailer, GameSpot](https://www.gamespot.com/videos/nba-playgrounds-2-official-gameplay-trailer/2300-6443891/) | 00:03–00:09, 00:23–00:29, 00:38–00:43 | Readable spacing, immediate feedback and clearly distinct move silhouettes. Preserve accessible arcade controls, but keep the new adult anatomy and smooth movement. Do not use its exaggerated head/body proportions. |
| [Wii Sports Resort — Video Review, GameSpot](https://www.gamespot.com/videos/wii-sports-resort-video-review/2300-6213871/) | Basketball at about 03:58–04:06 | Clear gather/shot phases, an obvious pass target, and little button complexity. Keep one primary shooting action and contextual defense/pass actions. |

The original YouTube sources were unavailable to this environment; public publisher/coaching streams were used instead. Reference media stays outside the repository and is not included in the game or demo recordings. RIMRUN retains its original art, generated venue, synthesized sounds and the user-provided Mixamo dribble animation.

The outdoor demo is captured from commit `fef750d` before the improvement pass. The updated recording uses the same match simulation and scoring as the playable build. Camera direction and player commands can be scripted for capture; baskets and match outcomes are not forced.
The pickup chapters use reproducible AI random seeds. The opening screen is held for two seconds; every gameplay frame is rendered from the simulation for the 24 fps recording, without motion interpolation. Recording speed on the software renderer is not a measurement of headset performance.

Implemented in this pass: adult anatomical head/jaw proportions and athletic limb shapes, 56k-triangle close models with distinct skin/fabric shading, acceleration and braking, timed move travel and low transfer paths, world-planted foot IK, asymmetric defensive hands, automatic desktop/touch shot lift, contextual layups, a movement accuracy penalty, committed AI drives and passing lanes, predictive rebounding, and The Fieldhouse indoor arena. The Watch Gameplay view uses normal AI matches, offers 1v1/2v2/3PT switching, and can hand control to the player.

## Mechanics pass: physical references

This pass was built from published dimensions and standard sports-physics figures rather than new footage, and tuned in simulation.

| Area | Reference figure | Used as |
| --- | --- | --- |
| Ring | 457 mm inside diameter, 16–20 mm steel bar, 3.05 m high | `CONFIG.hoop` radius 0.238 m to the bar centre, tube 9.5 mm |
| Ball | Size 7: about 0.24 m diameter, 0.62 kg; drag coefficient near 0.47 | Radius 0.12 m; drag 0.0206 per metre; thin-shell inertia 2/3 m r² for spin and friction |
| Rebound | A legal ball dropped from 1.8 m returns to roughly 1.2–1.4 m | Floor restitution 0.76 |
| Jump shot | Release angles commonly coached around 45–55°, higher close in; two to three revolutions of backspin per second | `shotElevation`, backspin 1.7–2.9 rev/s by distance |
| Passing | Chest passes travel on the order of 10–15 m/s | Chest 12.5 m/s, bounce 10.5 m/s into a spot about two thirds of the way |

Tuning method: (1) a Monte Carlo of the shot model across distance, timing error, contest and difficulty; (2) seeded AI-versus-AI games at each level, watching shot mix, percentages, blocks, steals and game length; (3) a scripted player driven through the same command interface as the keyboard, with a human-like spread in release timing and a quarter-second reaction lag on defense. Typical results at Park: AI mid-range about 45–65%, threes about 25%, layups about 70–80%, blocks on a small share of shots; the scripted player beats Rookie comfortably, wins most games at Park by a few points, and splits All-star. None of this replaces playing it; the numbers are a starting point.

## Shot form reference: Klay Thompson

Researched on 2026-11-18. **How this was read:** the pages below could not be opened from the build environment, and video cannot be played there at all. The findings are from search-engine excerpts of these pages, so wording is approximate and coaching-blog claims are opinion rather than measurement. Where sources disagree, both are listed and the choice is stated.

| Finding | Source | In the game |
| --- | --- | --- |
| 302 catch-and-shoot threes released within 0.79 s of touching the ball in 2016-17, at 43.4% (a threshold window, not his average) | https://fivethirtyeight.com/features/klay-thompson-only-needs-0-79-seconds-to-beat-you | Gather to release is 0.62 s (`CONFIG.shot.idealTime`), leaving a normal reaction inside 0.79 s |
| “He gets into the shooting pocket kinda quick”; wherever he catches it, “it’s right into that shot pocket” | https://www.espn.com/nba/allstar2015/story/_/id/12322332/nba-how-klay-thompson-developed-shooting-form | The ball reaches the pocket in the first 0.2 s and the lift starts at 0.07 s |
| Dips to the same spot at his right hip, then lifts straight (others say the dip is small or variable; one blog says none) | https://bleacherreport.com/articles/2430552-breaking-down-klay-thompsons-picture-perfect-jump-shot ; https://ronsenbasketball.blogspot.com/2018/01/klay-thompson-shooting-form.html ; https://hoopsking.com/blogs/default-blog/how-to-catch-and-shoot-like-klay-thompson | Pocket at the shooting hip, a straight line to the set point. A small dip was chosen |
| Wide stance, used almost always; hops into the shot most of the time; feet parallel as he elevates; shooting shoulder ahead of the other, only modestly | https://splashlabbasketball.com/klay-thompson-shooting-form/ ; https://hoopdirt.com/the-dish-sponsored-by-dr-dish-basketball-shooting-3-footwork-styles-of-nba-players/ ; https://www.skysports.com/nba/news/36244/12003321/klay-thompsons-sweet-jump-shot-howd-he-do-that | A 4 cm two-foot hop into a 43 cm base, feet parallel with the shooting foot 3.5 cm ahead, about 10° of body turn |
| Reaches the set point before his feet leave the floor, then starts pushing just after take-off; releases from the highest point possible | Splash Lab and RonSen (above); https://elitebasketballcampjapan.com/en/2022/03/23/shooters-breakdown-series-4-klay-thompson/ | Set point complete at 0.34 s, take-off at 0.36 s, push from 0.41 s, release at 0.62 s within a few centimetres of the top of a 0.46 m jump |
| Arm at about 90° at the set point, elbow in and in line with the shoulder, ball above the forehead, clear sightline | Splash Lab; ESPN; RonSen | Set point over the shooting eye, elbow pole under the ball and inside the shoulder |
| Straight up and down at release; lands wide | Bleacher Report; Sky Sports | No drift in the simulation; wide landing base |
| Guide hand on the side, fully off before the wrist snap | Splash Lab; RonSen | Guide hand leaves 0.1 s after take-off and stays at forehead height |
| Follow-through: one source says minimal; others say elbow locked out, arm straight, elbow above the head, wrist relaxed | Bleacher Report vs Splash Lab, Elite Basketball Camp Japan | The locked-out version, held for 0.7 s of a 1.0 s follow-through |
| About 46° arc on threes in 2017-18 and 2018-19 (the excerpt did not say launch or entry) | https://www.theringer.com/2022/03/08/nba/klay-thompson-golden-state-warriors | Treated as entry angle: threes launch near 50° and enter at about 46° |

Not found, so not modeled on him: off-the-dribble release time, foot angle in degrees, knee flexion, jump height on a jump shot (0.46 m is a modeling choice), backspin rate, apex height.

Video references located but not viewed: “Klay Thompson Shooting Form Slow Motion HD” (https://www.youtube.com/watch?v=aJRjrwBDLik), “Klay Thompson shooting form (Slow motion)” (https://www.youtube.com/watch?v=VN_n1RIr1C4), “Klay Thompson Shooting Form Breakdown” (https://www.youtube.com/watch?v=toZ-v2TwQrk), frame-by-frame stills at https://www.shotur.com/klay-thompson-shooting-form-slow-motion-frame/, and Gary Maitland’s breakdown at the Sky Sports link above. Anyone with a browser can check the form against them; `npm run review:motion shot` renders the game’s shot as a contact sheet for that comparison.

## Asset survey for the visual pass

The build environment could reach GitHub (git and raw files), npm and PyPI only. Poly Haven, ambientCG, Sketchfab, Kenney, Quaternius and OpenGameArt could not be reached directly, so assets were taken from GitHub mirrors whose licence text was read, and anything unverified was left out.

| Asset | Licence | Used? |
| --- | --- | --- |
| pmndrs/assets “hall” HDRI (Poly Haven selection) | CC0-1.0 | Yes: image-based lighting and reflections |
| ambientCG WoodFloor040 via Papyszoo/CC0-Public-Domain-Textures | CC0-1.0 | Yes: floor relief, gloss and grain |
| Poly Haven cotton_jersey normal via the same mirror | CC0-1.0 | Yes: knit relief on kit |
| MakeHuman base mesh, targets, rig (makehumancommunity/makehuman) | CC0-1.0 | Already the athlete; now also the source of the spectators |
| MakeHuman skins, clothes, hair (dmaugis/makehuman-py3-assets mirror; official LICENSE.md lists them as CC0) | CC0-1.0 | Not yet. The Blender rebuild runs here (bpy 5.3), but skin textures need UVs carried through `tools/build_athlete.mjs` |
| GodotVR/godot-xr-tools basketball model and maps | CC0-1.0 | No: the textures are branded with the Godot logo. The ball was rebuilt procedurally instead |
| Kenney furniture, hanging screens | CC0-1.0 | No: stylised low-poly; venue props were built procedurally |
| CMU motion capture: jump shot (124_05), dribbles (06_02–15), defensive moves (102_22–28) via una-dinosauria/cmu-mocap | Free for research and commercial use, with acknowledgment | Not yet: needs a BVH retarget onto the 17-bone rig |
| three.js example hardwood textures | No stated texture licence | No |
| Mixamo, Sketchfab models, Bandai-Namco motion set | Login / non-redistributable / non-commercial | No |

## Uniform pass

What a modern basketball uniform looks like, and how each trait is reproduced:

| Trait | In the game |
| --- | --- |
| Loose sleeveless jersey with deep armholes, worn out over the shorts | Jersey hem at 0.915 m (bind pose), draped over the body and over the finished shorts |
| Baggy shorts ending just above the knee, dropped crotch | Shorts hem at 0.59 m; the cloth spans from leg to leg across the front and the seat, then parts into wide legs |
| Cloth hangs from the chest, shoulder blades, hips and seat rather than following the waist | Hang pass: no point of the cloth sits further in than the cloth above it, less a small fall-in; then relaxed taut |
| Eyelet mesh polyester with a soft sheen | Pin-hole pattern (fades out before it can shimmer), sheen lobe tinted by the cloth colour, knit normal map |
| Tackle-twill name and numbers with a contrast outline, 10 cm on the chest and about 17 cm on the back | Print atlas per player, projected in bind space, raised from the cloth and a little glossier than it |
| Contrast side panels with piping; rib-knit neck, armhole and waist bindings; twin-needle hems | Painted in bind space by the kit shader |

Building note: with bpy 5.3 a new shape key starts from the current mix of the others, so every expression key compounded the ones before it (the head came out as a disc). `tools/rebuild_anatomy.py` now creates each key from the basis alone, which is correct in every Blender version.
