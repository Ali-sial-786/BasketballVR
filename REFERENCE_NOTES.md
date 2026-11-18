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
