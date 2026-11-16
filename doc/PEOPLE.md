# PEOPLE — the people and animals of Chang'an (people.js)

Instanced, procedurally animated, **skinned** people and animals. Each body type has one mesh per LOD (near/far), drawn with
`R.crowdBatch` / `R.drawCrowd`. The animation runs in `VS_CROWD` (engine.js): 16 bones, 2-bone blending at every joint.
A cheap agent simulation on the ward nav graph drives them.
Realistic proportions: ≈7.5 heads, adult man 1.65 m, woman ≈1.57 m. Children (0.64×) have bigger heads.

## Body types (`BODY_NAMES`, 30 × 2 LODs)
- **Near LOD:** humans 2.5–4k tris; animals 4.5–6.5k (dog 3.3k, chicken 1.3k).
- **Far LOD:** humans 240–320 tris (porter 420); donkey 618, horse 684, camel 612, ox cart 834, dog 292, chicken 294.
- **Distances:** LOD switch at 24 m; nothing is drawn beyond 240 m. The far LOD is a dedicated coarse builder (`FARH`, 240–320 tris; porter 420) and casts no shadow.

**Palette slots** are picked per instance from `PAL[type]`:
- 1 main garment
- 2 secondary (trousers, jacket, kasaya, lapels, saddle, packs)
- 3 accent (belt, shawl, head cloth, cap, rider's robe)
- 4 skin

**Bodies are parametric** (`HUMAN(b, q, o)`), built from these parts:
- **Legs:** thigh and shin with a knee (trousers, or rolled to the knee), plus shoes, boots, sandals or bare feet.
- **Lower garment:** long, mid, knee or coat-length robe (folds, hem trim, ragged hem), short jacket, or a high-waisted skirt pulled over the bust. Robes and skirts are weighted to the thighs, so they swing and fold into a lap.
- **Upper body:** chest with shoulders, neck, 圓領 round collar or crossed collar, belt with pouch or knife.
- **Arms:** upper sleeve plus forearm sleeve (narrow, wide or extra-wide hanging sleeves), hands with thumbs.
- **Head:** skull with a **painted face texture** (bold eyes, brows, nose shadow, mouth). Women get 元和-style low 八字 brows, dark lips and a 花鈿; the elderly get wrinkles. Also jaw, nose and ears.
- **Hair and headwear:** 幞頭 with the raised 巾子, knot and two soft tails (officials: stiffened down-curving feet), head cloth with knot, high 峨髻 with comb and flower, 雙鬟, 總角 tufts, shaven scalp, pointed felt cap with rolled brim (Sogdian, 胡姬), fur-trimmed cap with braids (Uyghur), wrapped turban-cap (Persian), 黃冠, helmet, 帷帽 with light gauze veil, old woman's head scarf, messy hair (beggar), red band (entertainer).
- **Beards:** full, long, goatee, stubble, plus moustache.

| type | dress (815, REF_CHANGAN §6) | items (flags: 1 = hide bone 13 right hand, 2 = hide bone 14 left hand, 4 = show slot-5 straw hat) |
|---|---|---|
| man | mid-calf round-collar 袍, belt + pouch, trousers, shoes, soft 幞頭 | 13 paper lantern (night), 14 bundle |
| labourer | 短褐 jacket, crossed collar, trousers rolled to the knee, sandals, head cloth | 13 broom |
| porter | as labourer + 扁擔 carrying pole with two baskets on the shoulder (bone 15) | — |
| vendor | knee robe, apron, head cloth | 14 basket of 胡餅 |
| official | ankle robe in rank colour (紫, 深/淺緋, 深/淺綠, 深/淺青; weighted to low ranks), black belt with plaques, fish-pouch, boots, stiff 幞頭, goatee | 13 笏 tablet |
| scholar | white hemp robe ("麻衣如雪"), wide sleeves | 13 scroll |
| woman | 襦裙 skirt over the bust, short wide-sleeved jacket, 披帛 shawl, high bun | 14 round fan (團扇) |
| veil | woman with a 帷帽 (rare by 815) | — |
| huji | 胡姬: lapelled knee coat over a long skirt, boots, pointed felt cap, braids | 13 celadon wine jug |
| musician | woman with a 琵琶 across the lap (use anim 20, seated) | — |
| maid | simple 襦裙, 雙鬟 | 14 bundle |
| child / girl | tunic + trousers with 總角 tufts / small 襦裙 with 雙鬟 | — |
| monk / nun | shaven head, 褊衫 + 袈裟 with shoulder band, sandals | 13 錫杖 (monk), 14 alms bowl |
| daoist | extra-wide sleeves, dark collar band, 黃冠, long beard | 13 fly whisk |
| sogdian | 胡服: lapelled knee coat with trim, belt with pouch and knife, tall boots, pointed felt cap, full beard | — |
| persian | long robe, lapels, wrapped cap, full black beard | — |
| uyghur | lapelled coat, boots, fur-trimmed cap, long braids, knife | — |
| guard | 金吾衛: knee robe, lamellar vest with pauldrons, red 抹額 over 幞頭, boots, 橫刀 | 13 spear 槊 |
| old / oldwoman | stooped; long beard / head scarf and low bun | 13 stick |
| beggar | ragged knee robe, rolled trousers, bare feet, messy hair | 13 stick, 14 bowl |
| entertainer | 百戲 performer: short jacket, red band | 13/14 juggling balls |
| donkey | stocky, big ears, pale muzzle, upright dark mane, dorsal stripe and shoulder cross, tufted tail, small hooves; pack saddle with sacks + rolled carpet (14) or rider (13) | |
| horse | Tang steppe/Ferghana type: deep chest, short legs, thick crested neck, cropped mane with 三花 tufts, forelock, knotted tail (結尾); head with jowl, eye sockets, ears, muzzle, nostrils, bridle with noseband; saddle with pommel/cantle, 障泥 mudguards, breast strap, crupper with 杏葉; official rider with stirrups (13) | |
| camel | Bactrian: two humps with shaggy tops, long S-curved neck with a hair beard, small head, long legs with knee callosities, big padded feet; bales + rolled carpet (14) | |
| oxcart | 黃牛: shoulder hump, dewlap, sweeping horns, heavy short legs, cloven hooves, tufted tail; yoke on the neck, shafts, 犢車 with arched roof, spoked wheels (bone 12) | |
| dog | street/guard dog (土狗): deep chest, tucked belly, pricked ears, curled tail, paws; walks the lanes, lies (anim 44) at rich gates | |
| chicken | hen: plump body, wings, tail feathers, red comb and wattle, beak, yellow legs with toes; pecks (anim 43) in small groups in the lanes | |

## Heads, headwear, sleeves (round 5)
- **Head:** one continuous mesh (`HEADM`): a sphere grid reshaped by smooth profile functions — narrowing jaw, soft rounded chin, cheek fullness, occiput. Women and children get a softer, smaller jaw. Nose and ears stay separate. Same in the far LOD.
- **Fitted headwear:** every cap, cloth, band and helmet is generated from the head's own dimensions (`HF(J)`: skull radii, brow, hairline, crown point, nape, bun position).
  - `fitShell` follows the skull with a set clearance (1–2.5 cm) down to a rim line that runs from just above the brows (front) to above the nape (back).
  - `fitBand` makes bands and brims between two rim lines.
  - Hair under caps (`hairIn`) is the same shape with a smaller clearance, so it can never poke through. It shows only at the nape and temples.
  - The 幞頭 巾子 and all bun covers sit over the actual topknot (centred slightly behind the crown).
  - The 笠's crown band rests on the head just above the brows. It is built into the labourer/porter/vendor meshes as palette slot 5 and shown only with instance flag 4 (about half of them in daytime).
  - The far LOD uses the same hat functions at low resolution.
- **Shoulders:** joint at 1.33 m, half-width 0.155 (women 0.14), chest radius 0.172 (women 0.15), with a sloping profile.
- **Wrists and ankles:** a skin wrist tube runs from inside the sleeve to the hand; shins run down into the shoe. No gaps.
- **Sleeves (`SLEEVE`):** lofted forearm sleeve with an outer surface, a darker inner surface and a double-sided rolled rim, so it is never see-through. Wide sleeves sag into a 袂 pouch on the back of the forearm, which hangs down whenever the forearm is raised. The old ellipsoid "slack" is gone. Far-LOD cuffs are closed.
- **Hunch (`STOOP`, old people):** the upper spine is bent forward along a circular arc after building. The chest, neck and robe top follow smoothly; the head projects forward and down but keeps looking ahead; the arms hang from the forward shoulders. The pivots are moved too. There is no separate lump.
- **Riders:** slimmer seat and torso, so there is no big seat volume behind the saddle. The 袍 skirts are double-sided cloth panels that drape from the hips over the saddle and down the barrel to mid-shin (slit at the sides); dark trousers and boots in the stirrups show below the hem.
- **Tack (`TACK`):** saddle with pommel and cantle, 韉 saddle cloth / 障泥 mudguards, a girth round the barrel, breast strap and crupper with 杏葉, stirrups and reins in the rider's hands. Horses carry it on the body bone; donkeys carry it on the rider bone, so it shows only when ridden. Pack donkeys keep the pack saddle.
- **Animals:** the donkey's dorsal stripe is now a colour band on the back (vertex colour), not geometry. The mane is on the neck only. Tail roots sit on the rump.
- **Shadow casters:** people just outside the view whose shadow can reach into it (sphere extended along −sun, ≤ 28 m) are appended after the visible instances of the near batch. The colour pass draws `[0, nVis)`, the shadow pass `[0, n)`, all from one upload. `?nocast=1` disables this for comparison; `?lod=0` forces the far LOD for inspection.

## Cloth, collars, 披帛, necklines, led animals (round 6)
- **Fabrics** (128² layers appended by people.js; textures stay near-white so palette colours multiply; the engine builds bump from luminance, `sheen` from the def via `TXD`):

  | fabric | layer | sheen |
  |---|---|---|
  | hemp/ramie 麻 (coarse plain weave, slubs) | `p_hemp` | 0 |
  | plain silk 絹 | `p_silk` | .45 |
  | figured silk 綾 with medallions (officials) | `p_damask` | .6 |
  | gauze 紗/羅 (披帛, veil) | `p_gauze` | .25 |
  | lacquered 幞頭 gauze | `p_lacq_gauze` | .35 |
  | leather (boots, belts, pouches) | `p_leather` | .25 |
  | felt | `p_felt` | 0 |

  Faces and skin get a weak bump (0.5) so painted features don't turn into dents.
- **Folds:** painted per garment, with valleys darkened (baked occlusion), bump 3.6–4.2.
  - `p_robe_<fab>`: vertical folds widening and deepening toward the hem, plus radiating pleats at the belt. Lathe UVs: u around, v hem → waist.
  - `p_skirt`: 24 regular pleats.
  - `p_sleeve_<fab>`: lengthwise folds, bunching at the elbow. Sleeve UVs: u around, v elbow → cuff.
  - `p_trousers`: bunching at the ankle.
  - Robe and skirt lathes also get real hem lobes (7 + 13 around, growing toward the hem), so the hem isn't a perfect circle.
- **Fabric per type (`o.fab`):** officials damask; women, Sogdians, Persians, 胡姬 and Daoists silk; everyone else hemp.
- **Collars:** the 圓領 is a standing band rising from the chest surface (radius from the chest profile + 4 mm). The 交領 is a flat band lying on the chest from the left of the neck across to under the right arm (右衽), 5 mm proud. Both are in both LODs; no floating tubes.
- **披帛:** flat double-sided ribbons (`RIBBON`): gathered across the back and shoulders (chest bone), with ~15 cm ends twisting slightly as they hang from the forearms. Never tubes.
- **Necklines:** women, the 帷帽 woman and musicians (`lowNeck`) wear the short jacket with a wide low 袒領: the front is cut at the collarbones and the upper chest is bare above the skirt tied at the bust with a sash. Maids, old women, nuns and girls stay covered.
- **Led animals:** every walking pack donkey, camel and ox cart has a handler at its head, and grooms lead official horses. A lead rope runs from the halter to the handler's hand (on bone 14; hidden with flag 2 for ridden donkeys). Women ride alone. Tethered set-piece horses have no rope.
- **Rider kinds:** official (袍 skirts draped, stiff 幞頭), labourer on donkeys (short coat, trousers, head cloth over the topknot), and woman on horseback (new type `horsewoman`: high bun, longer draped skirts).

## Shoulders, 半臂, 帷帽 (round 7)
- **One skinned shoulder (`SHOULDER`)**: there is no separate upper-arm tube any more. One loft runs from the side of the neck over the dropped, sloping shoulder and down the upper arm to past the elbow (5 rings, 10 sides near / decimated far). Its vertices get chest↔upper-arm weights from `shWeights`: chest weight from the neck down to the shoulder line, falling to 0 about 10–13 cm below it in the armpit, plus a lateral term so the outer deltoid follows the arm earlier than the top of the shoulder. `skinPass` skips vertices that already have a second bone, so the elbow (upper/fore arm) and the rest keep their blends. The result is a dropped-shoulder sleeve seam that bends as one surface: arms down, walking, raised (hammer, drink), 拱手, pole carrying, reins and the seated pipa have no gap, step or twist at the shoulder (`shots/round7_shoulders_*_after.png` vs `_before`).
- Same function in the far LOD (`FARH`), so near/far silhouettes match.
- **半臂 (`o.banbi = slot`, `BANBI`)**: women (palette slot 1, damask) and musicians wear the short-sleeved over-jacket of the period, open in front over the low-necked 襦; maids a hemp one (slot 3). Its half sleeves are a second loft over the shoulder (same weights) ending in a flared hem above the elbow, with a darker inner hem ring.
- **帷帽**: the flat black board is gone. Now a wide round straw brim (Ø ≈ 46 cm) with a low crown over the bun, and a short sheer gauze curtain (`p_veil`: off-white, sparse alpha-cut weave so the face shows through) falling from the brim to the chin/shoulders around the sides and back, open at the face. The weave (2-texel threads every 6 texels, ~1 cm) shows as a fine net up close; at a distance the mip-averaged alpha stays above the cut, so the veil reads as a pale sheer band instead of vanishing.
- Shots: `shots/round7_shoulders_<pose>_{before,after}.png` (arms_down, walk, hammer, drink, bow, sleeves, carry_pole, riding_pipa), `round7_banbi_{woman,maid,musician,woman_walk,woman_raised}.png`, `round7_weimao.png`, `round7_weimao_far.png`, `round7_shoulders_street_{0,1,2}.png`. Scripts: `tool/people_shoulders.py <tag>`, `tool/people_women7.py`, `tool/people_r7b.sh`.

## Riders, sheen, attendants, ditches (round 8)
- **Riders** (horse 'official', donkey 'labourer', `horsewoman`) now use the same continuous shoulder as walkers: one loft from the side of the neck over a sloping shoulder to the elbow (bone 15, blended to the rider torso bone 13 across the shoulder), then the forearm to the reins. The rider torso profile slopes into it. Both LODs (QUAD builds both). Camels and ox carts have no riders.
- **Noses and ears** use `p_face_plain` (the face texture's skin without features), never the face texture itself (which made a 'face within a face' on the nose).
- **Sheen** lowered (engine highlight is now albedo-tinted): silk .25, damask .35, skirt silk .25, lacquered 幞頭 gauze .12, leather .1, plain gauze .15, hair .1, veil .1.
- **Attendants** (`role 'attendant'`): every 0.5 s `CITY.metaNear(cam, 82, 'spots')` is read; a static person is spawned at each spot within 70 m whose business is open (`CITY.isOpen(spot.cls, hour)`; no cls = always) and removed when it closes or is beyond 82 m. Type by role (seeded by the spot position, so the same spot always shows the same person): keeper → man/vendor/old, assistant → labourer/man/child/maid, waiter → man/maid/labourer, cook → labourer/man, hostess → 胡姬, monk → monk. `spot.anim` (name or number) is the base pose, otherwise per role. Idle variety every 5–15 s (talk, hands in sleeves, hawk, look around, sweep, pour, read, bow…). When a walker passes within ~2 m the attendant turns to them and haggles/greets/bows; about a third of the time the walker stops and haggles back for 3–8 s. Spot yaw is in the game/kit convention (forward = (−sin yaw, −cos yaw)) and is converted (+π); when a chunk-meta door lies within 12 m the attendant faces that door's outside point `a` instead (staff face the entrance/counter front). Attendants are hidden in interior mode, separate from `placeStatic` (clearStatic doesn't remove them). `CROWD.spotSource = (x, z, r) => spots` overrides the source (the people test scene puts keepers, assistants, 胡姬, waiters and monks beside shop, wine-shop and temple doors). `CROWD.attendants()` = count.
- **Ditches.** The lateral 'keep to one side' offset is clamped to `w/2 − 0.5` on every edge (gate edges = bridges). Each step of a walker, patrol or follower (led animals and their handlers too) is checked against `ctx.height` (= `CITY.height`): a step into ground below −0.3 m is undone and replaced by a move toward the edge centre line (followers: toward their leader), shrinking the side offset; if that is still in the ditch the agent stays on the bank this frame. Set pieces are never placed in a ditch. `?noditch` disables the guard (tests); `CROWD.S.ditch` counts corrections. Gate and door edges are exempt within 3.2 m of their centre line (the bridges, which `CITY.height` does not know about); gate-edge offsets stay within ±0.25 m. Walkers leaving the graph through a dead-end gate are guarded too. Test: `node tool/people_gatetest.js [frames]` simulates the crowd at every ward gate of the slice (day and curfew) and counts agents that ever stand in a ditch outside a bridge.
- **Player.** Walkers start stepping aside when the player (`G.P.pos`, feet) is up to ~3 m ahead in their path, slow down within 1.2 m, and are pushed out of a ~0.45 m + body radius disc around the player, so the player isn't blocked (no avoidance while flying).
- **Curfew gates and shut doors.** While `G.gateOpen < .35` (else by the hour), 'gate' edges are closed: they are never chosen when planning, nobody spawns on them, no one leaves the graph through a dead-end gate, and anyone already walking on one turns back once (wards keep their night life inside; 金吾衛 patrols stay on the avenues and never use gates). Nav door nodes look up the nearest chunk-meta door (`CITY.metaNear(..., 'doors')`, cached per node once its chunk is loaded): if its `cls` is shut at this hour, agents neither enter nor come out of it.

## CENSUS — the persistent population (round 11; census.js + people.js)
**Data (census.js, global `CENSUS`).** It is deterministic from the city's seeds: the same city gives the same people, names, looks, jobs and days. It is built from `CITY.lay` + `CITY.nav` in ~85 ms native (`CROWD.init` calls `CENSUS.build()` when it gets `CITY.nav`). The slice has 23,586 people in 4,441 households. A pid is stable as long as the city layout doesn't change, so missions should look people up by name and ward (`CENSUS.find`) or store the pid together with a layout version.
- **Households by lot type:**
  - house: a family of 2–7 (crafts, labourers, stallholders, porters, carters, clerks, examination candidates);
  - hut: a labourer, porter or beggar family;
  - rich/mansion: an official (rank from lot wealth) or a merchant/landlord, with family, a groom, menservants and maids;
  - shop: the owner's family, an assistant and an apprentice;
  - wine shop: the owner (Sogdian ones more often in the market), 1–2 胡姬 hostesses and a waiter;
  - inn: the innkeeper's family;
  - temple: an abbot with monks (or nuns);
  - 進奏院: a director (留後) and clerks;
  - the 北里: a madam (媽), courtesans (X兒) and maids.
  Stalls, warehouses, fields and offices are staffed from residents elsewhere.
- **Person:** `{ pid, name, call, sex, age, cls, occ, type (body type), seed (persistent look), home (lot id), work {lot, hours}, rank, retinue, master, hh, ward }`. `call` is the name the player would hear: 張三郎, 王氏, 李十一娘, 阿福, 法明, 康延慶, 王侍郎. Elite clans 崔 盧 鄭 王 李 韋 杜 裴 are favoured for officials; the 昭武九姓 for Sogdians. Calls are unique within a lot. Officials' robes take their rank colour (紫 3rd and up, 緋 4–5, 綠 6–7, 青 8–9).
- **Schedules** (`CENSUS.day(pid)`) are a list of segments `{t0, t1, k: home|in|work|at|go|off|dead, a, b (nav nodes), act}`. They are drawn per day from templates by occupation:
  - officials ride out at ~5:00 with their retinue toward the imperial city (`off` at court) and ride home in the afternoon;
  - shopkeepers keep shop hours (7–19; wine shops 9–1);
  - stallholders keep market hours;
  - labourers and porters go to work sites (porters make warehouse↔market runs);
  - servants fetch water, go to the market and run errands;
  - wives and daughters go to the well, the market or a temple;
  - children play by the gate; elders sit outside in the evening;
  - monks do alms rounds in their ward;
  - candidates make visits, and in 平康 go to the 北里 in the evening.
  Everyone is home, or inside their own ward, after curfew. Trips use A* on the nav graph (0.35 ms each, cached; if the graph ever comes apart, detached pieces get a fallback link, which never triggers on today's single-piece graph). Abstract travel runs at 4.5 km/h walking and 8 km/h riding in *game* time, because the clock runs 30× real time.
- **Queries:**
  - `CENSUS.where(pid, h?)` → `{state, x, z, lot, act}` (live agents report their real position);
  - `CENSUS.find('張')` / `find({ occ, ward, cls, type, name })`;
  - `CENSUS.person(pid)`, `CENSUS.track(pid)`, `CENSUS.kill(pid)`, `CENSUS.hurt(pid)`;
  - `CENSUS.state` / `CENSUS.load(json)`: a small delta with deaths, injuries, mourning and the day counter. The day advances when `G.hour` wraps (`CENSUS.tick`, called by the crowd).
  - A death makes the household mourn for 7 days: they stay home, and any of them seen wears white.
- **Debug:** `CENSUS.stats()` and `CENSUS.describe(pid)`. `node tool/census_test.js [samples] [all|N]` builds the census in Node, prints sample days hour by hour and verifies routes and curfew. Currently: 25,332 trips, 0 without a route, 0 gate crossings while gates are shut, 0 people outside their home ward after curfew.

**Materialisation (people.js).** Every 0.5 s the crowd asks `CENSUS.candidates(cam, 135 m, hour)`. That uses per-day bounding boxes of everyone's trips, built a few thousand people per tick, and returns those walking (`go`) or standing outside (`at`).
- People on a trip become walkers that follow their actual route node by node. They appear out of view, or stepping out of their door when near and in view.
- At the end of the route they go into the lot (door), leave the slice (court), or stand (well, alms, play, sit) until their next segment.
- Officials appear on horseback with the groom leading the horse and their menservants/guards walking behind, each a named census person.
- Shop attendants are now the census staff of that lot (owner, assistant, hostess, waiter, monk) when they are at work. Anonymous attendants are only a fallback.
- When a census agent despawns (beyond 165 m) or goes indoors, the person returns to the abstract simulation and is not re-materialised for the rest of that segment.
- Cap: 520 census agents. Filler density in lanes and sub-streets is cut to 35% while the census is on; avenues, markets and set pieces keep theirs.
- `CROWD.info(i)` → `{ …, pid, name }` (null for filler).

## Jams, overlaps, inverted items (round 12)
- **Hard separation** (`separate`, every frame after movement, via the agent hash grid): no two bodies overlap. Humans are ~0.28 m in radius and animals use their body radius. Followers keep their station next to their leader. Static people push but aren't pushed. A push never goes into a ditch. Cost is one 3×3 grid scan per agent, every frame within 90 m and every 4th frame beyond.
- **Stuck detection** (`unstick`): a walker or patrol that hasn't moved (speed < 0.12 m/s) for 4 s is handled as follows. Out of view, it is released: a census person returns to the abstract simulation and filler is removed. In view, it steps to the other side of the street and re-plans: census people re-route to their destination, filler turns back.
- **Arrivals:**
  - Going indoors keeps walking slowly into the compound (up to 6 s) instead of stopping in the doorway, so doorways never jam.
  - Census trips to compounds without a nav door (temples, the 北里, 進奏院, mansions) walk in toward the compound's middle instead of standing at the street node.
  - Alms rounds stop on the street side of a gate, not in the doorway.
  - People standing at a point (well, play, sitting) are spread around it by pid (0.7–2.3 m).
- **Inverted meshes:** the yard mortar 臼 in nature.js and two kit.js lathes (lines ~1602 and ~1688) had top-to-bottom profiles, so they rendered inside out; the profiles are now reversed. people.js has no reversed closed lathe.
- **Lanterns:** the cord and lantern are palette slot 6, a pendulum marker. In VS_CROWD they hang from the stick tip (`uPiv[13] + (−0.005, −0.08, 0.33)`, carried through the hand's bones). They stay plumb in model space, which with the instance yaw means world-vertical, whatever the forearm does. They swing a little with the gait phase and speed (back-lean while walking) plus a slow idle sway, like the player's lantern pendulum. Instance flag 8 (set for a lantern-carrying `man` whose item is shown) keeps the lantern arm low and steady in every animation (no raised forearm or gesturing). There is now a cord between the stick and the lantern. Shots: `shots/round12_lantern.png`.
- **Test:** `node tool/census_stress.js ['&nosep']` simulates 平康 at 13:00–14:00 with the clock running. It reports the most overlapping pairs (< 0.4 m) in any frame and the number of agents stuck for more than 5 s.

## At home: sleepers and home life (round 13)
- **Who:** census residents whose segment is `home`, or `in`/`work` at their own lot while it is closed, are materialised inside their own house when the lot is within 40 m of the player (released beyond 48 m). They are static instances (role `home`, `CROWD.info` → `{ role: 'home', pid, name }`); the manager runs once a second.
- **When they appear:** only where the player can't see them appear: the spot is outside the view cone, or the player is outside the lot and the spot is under a roof. The same rule applies when they leave or change pose. Release adds no schedule override, so they can step out of the door afterwards.
- **What they do:** at night (21:18–05:06) everyone sleeps (`sleep_side` 25). In the 北里, people stay up until 01:30 (pipa, talk). By day:
  - wives, daughters and maids sew (27), cook squatting at the hearth (28), or talk;
  - elders rest on their back (26) or sit cross-legged;
  - children squat or play in the yard;
  - servants sweep the yard;
  - scholars and officials write or talk;
  - monks sit;
  - everyone else sits, talks or drinks.
- **Placement:**
  - Chunk-meta spots `{kind: bed|seat|hearth|work}` are used when the architecture provides them; `bed` spots are lying slots.
  - Otherwise, points come from the loaded collision world on a 0.9 m grid in the lot. A point must be under a roof (`World.ceil`), on the floor (`World.ground` within 7 cm), and clear of walls and furniture within 0.36 m (`World.push`).
  - Lying slots need a clear 1.9 m × 0.6 m strip along the lot axes (checked at 3 points).
  - A wife lies 0.62 m beside her husband when that strip is clear. Others take the next free slot, so children usually end up near their parents.
  - Layouts are cached per lot once its collision is loaded.
  - The furnished 榻 carry a low table, so sleepers use floor mats (with quilts) unless `bed` spots exist.
- **Poses** (VS_CROWD):
  - 25 asleep on the right side, knees drawn up; 26 on the back. Both rotate the whole body about the pelvis, rest on the instance height, and breathe.
  - 27 sewing, cross-legged.
  - 28 squatting at the stove, stirring.
  - Bedding is palette slot 7, shown only when asleep: a padded quilt over the body and a glazed Tang ceramic pillow 瓷枕 under the head (the second bone picks the pillow for the side or the back). It is in both LODs.
- **Test:** `node tool/home_test.js [hour] [x z] [shotTag]` (bake `home`) prints the share of homes within 40 m with someone asleep, and the number of bodies intersecting walls or furniture or lying outside their lot. With a tag it shoots close-ups inside a hut, a house and a rich hall.

## Skeleton and animation (VS_CROWD)
- **Vertex bone byte:** `bone | slot << 5`. The second bone goes in the 2nd byte, its weight in `aN.w`.
- **Pivots:** 16 rest joint positions per body type (`R.crowdBatch(mesh, cap, piv[16])`).
- **Human bones:** 0 pelvis, 1 chest, 2 head, 3/4 left upper arm/forearm, 5/6 right upper arm/forearm, 7/8/9 left thigh/shin/foot, 10/11/12 right thigh/shin/foot, 13 right-hand item, 14 left-hand item, 15 chest item.
- **Gait:** mostly forward reach. In stance the thigh sweeps linearly from +A to −0.4·A (running −0.55·A), so feet stay planted and the trailing foot stays inside long robes. Swing knee bend ≤ ~0.6 rad, small heel lift, ankle keeps the foot flat; arms counter-swing with an elbow bend. Phase: ω = π·v / (L·(sin A + sin 0.4A)).
- **Grounding:** the pelvis height is solved every vertex so the lowest ankle stays exactly on the instance y. Standing people never float or sink.
- **Seated anims** put the hips at a seat height above y (instance y = top of the 榻, mat or ground).

**Anims:**
- **Standing / working:** 0 stand, 2 work/hammer, 3 talk, 6 sweep, 8 bow, 9 drink, 10 look around, 11 haggle, 12 squat (knees bent, feet planted), 13 read, 16 hands in sleeves, 17 hawk, 21 pour/serve.
- **Moving:** 1 walk, 4 carry pole, 7 run, 14 load on the head, 15 load on the back.
- **Seated:** 5 sit on the ground (legs forward), 18 cross-legged, 19 kneel 跪坐, 20 pipa, 22 write, 23 seated drink, 24 seated talk.
- **Animals:** 40 stand, 41 walk (lateral sequence), 42 trot (diagonal pairs), 43 graze/peck, 44 lie down (dogs). Bones: 0 body, 1 neck, 2 head, 3/4 front-left upper (forearm)/lower (knee–cannon–fetlock–pastern–hoof), 5/6 front-right, 7/8 back-left upper (gaskin)/lower (hock–cannon–hoof), 9/10 back-right, 11 tail, 12 wheel, 13 rider, 14 load, 15 rider's arms. Stance legs sweep linearly (no foot sliding) and the body is lowered so the lowest stance hoof stays on the ground (no leg stretching); swing legs fold at knee/hock; the neck nods twice per stride; the tail swishes. Built by `QUAD(b, q, {kind})` from the anatomy table `AN` (lofted barrel body, haunch/shoulder/withers muscles, tapered legs with joint bulges, blended neck/leg joints); `CHICKEN` uses the front-leg bones only.

**Phase from speed** (CPU, `gait()`):
- Humans: ω = π·v / (L·(sin A + sin 0.4A)), with A = forward thigh amplitude 0.2–0.5 rad growing with speed.
- Quadrupeds: ω = 2π·0.6·v / (amp·L).

## API
```
CROWD.init(nav, {lay, hour: () => h, height: (x, z) => y, ground: (x, z) => y})
    // builds meshes once (needs R), resets agents (static people survive), fills the bubble instantly
CROWD.update(dt) / CROWD.draw()   // ≤ 56 instanced draws (28 types × 2 LODs)
CROWD.near(x, z, r) -> [indices]  // CROWD.info(i) -> {type, x, y, z, yaw, role, anim, state}
CROWD.onStep = fn(x, y, z, strength)   // footfalls within 45 m (2 per human gait cycle, 4 per animal);
    // strength 0.08..1 (running people and big animals are high); also CROWD.steps[0..CROWD.nSteps) for this frame
CROWD.lights, CROWD.nLights      // ≤ 6 lantern lights of the nearest lantern carriers (night)
CROWD.placeStatic(list) / CROWD.clearStatic()   // fixed-pose people (interiors), see below
CROWD.setMode('interior'|'city') // interior: street crowd frozen and hidden
CROWD.lineup({x, z})             // inspection line-up (set before init)
```

**`placeStatic`** takes `[{type, x, y, z, yaw, anim, phase?, cols?, seed?, flags?, scale?, bright?, seated?, tag?}]`:
- `anim` is a number or a name: stand walk work talk carry sit_ground sweep run bow drink look haggle squat read head_load back_load sleeves hawk sit kneel pipa serve/pour write sit_drink sit_talk.
- `seated: true` turns drink, talk, read, stand and sleeves into their seated versions. If omitted, it is guessed from `G.world.ground`: feet 0.25–0.8 m above the surface below means seated.
- `type 'woman'` + `anim 'pipa'` becomes the musician; `tag '胡姬'` becomes huji.

**Ground.** `ctx.height` (cheap terrain height) is sampled per agent per frame. Without it, nav-node heights are used (`G.world.ground`, at most 2 queries per frame).

## Rendering cost
- The instances are filled once per frame (keyed on `R.time`). The shadow pass, which calls `CROWD.draw` again per cascade, only re-issues the near-LOD draws.
- `R.drawCrowd(c, more)` shares program and uniform setup across consecutive batches and uploads instances only when `c.dirty`. `drawCrowdShadow` honours `c.dirty` too.
- Measured headless on a busy machine, ~1100 agents (~970 drawn, 20 near):

  | cost | ms per frame |
  |---|---|
  | update (CPU) | ~1.9 |
  | fill + issue (CPU) | ~1.5 (issue alone ≈ 0.6) |
  | crowd GPU (0.39 M tris) | ~3.2 |

  The vertex shader is the main GPU cost.
- No per-frame allocations in update/draw. Set-piece bookkeeping no longer creates closures.

## Crowd behaviour
- **Simulation bubble:** walkers within R_ACT = 135 m (despawned beyond 165 m); set pieces within 110 m.
- **Density and schedules:** densities by street kind × hour (busy 7–18, dusk-drum rush, empty main streets after 19.6 except patrols, lanes alive until ~22, dawn exodus).
- **Speeds:**
  - Walking 1.0–1.5 m/s (elderly 0.6–0.8) with smooth acceleration.
  - Per-frame movement is capped at 1.08 × the current speed, so nobody zips.
  - Kids run rarely, for 1.5–3.5 s at ≤ 2.8 m/s.
  - At the dusk drums people hurry (≤ 1.6 m/s, a few run).
- **Never popping in view:**
  - People coming out of a door spawn 4.5 m inside the lot and walk out through the gate.
  - People going in walk 7 m into the lot; people leaving a ward walk 25 m beyond the gate. They are removed only when out of the camera cone or far away.
  - New walkers spawn out of view or beyond 75 m.
  - Set pieces (re)appear only out of view or beyond 96 m.
- **Interactions, spaced so nobody overlaps:**
  - Chats start only at 0.97–1.55 m, facing each other.
  - Pairs stand 1.2 m apart, groups of three on a 0.72 m ring.
  - Customers stand 1.15 m from vendors; a juggler has a ring of onlookers at 1.8 m.
  - Followers walk 0.7–0.9 m beside or behind (groom with a horse, driver with the ox cart, maid with her lady, child with a parent, monks in pairs, a guard pair).
- **Set pieces:**
  - Vendors and customers at shops.
  - 胡姬 and drinkers at wine shops.
  - Gatekeepers, morning sweepers and saddled horses at rich gates.
  - Monks, nuns and beggars at temples.
  - Neighbours, children and the elderly at house doors.
  - Squatting street sellers and chatting groups on main streets, a juggler (百戲) with onlookers.
  - Guards at ward gates, women at the well.

## Test scene
`?scene=people`:
- **The ward:** a small four-gate ward.
- **Human line-up:**
  - Columns (x = −14 + 1.6·i): man, labourer, porter, vendor, official, scholar, woman, veil, huji, musician, maid, child, girl, monk, nun, daoist, sogdian, persian, uyghur, guard, old, oldwoman, beggar, entertainer.
  - Rows (z = −112 − 2·j): anims 0 1 7 2 3 4 5 6 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24, with a different phase per column.
- **Animals** west of it: x = −20 − 3.4·i, rows anims 40–43.
- **Wine-shop tableau** for the static API at x≈30, z≈−114.

Tools:
- `node tool/people_shot.js "<query>" name cams…` — loads `tool/people.html`, a copy of index.html. Regenerate it with `sed 's#src="#src="../#' index.html > tool/people.html`. It also parks the `uSh` sampler on unit 3; see the note below.
- `node tool/people_prof.js` — timings plus a CPU profile.
- `node tool/people_probe.js "<query>" expr…` — evaluates expressions in a scene.
- `node tool/people_prof5.js` — spawn and ground cost distribution.

**Engine note:** when shadows are off (`S.on && S.ready` false), the `uSh` sampler2DShadow is never assigned a unit, so it sits on unit 0 next to the texture array. Every draw then fails with INVALID_OPERATION (blank frames in headless `DBG.step` shots). Fix: set `uSh` to unit 3 once per program.

## Weak / next
- **Clothing is still rigid** apart from robe/thigh blending: sleeves don't drape, and robes stretch at the front seam in wide stances.
- **Seated skirts** spread into a flat lap shape. Long robes pass through the platform when people sit near its edge.
- **No per-instance body build;** only a uniform height scale (0.93–1.05).
- **Animal heads and legs** are simple tubes and ellipsoids; there are no fetlock or hock angles beyond one fold.
- **Interactions:** no reactions (flee, gather, call the guards) and no hand contact (handing over goods).
