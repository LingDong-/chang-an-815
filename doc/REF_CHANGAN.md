# REF_CHANGAN — Chang'an 815 (元和十年) reference sheet

For city / building / people / gameplay generation. Dense notes, not prose.
Tags: [考古1963] = 中國科學院考古研究所西安唐城發掘隊《唐代長安城考古紀略》, 考古 1963.11 (figures as commonly cited; I could not read the original online, so treat as "as quoted in secondary works"). [城坊考 n] = 徐松《唐兩京城坊考》卷n (read on zh.wikisource). [長安志 n] = 宋敏求《長安志》卷n (四庫本 卷7–8 read on wikisource; others via 城坊考). [新唐書 百官志] etc. = standard texts, quoted from memory unless marked "read". **(?)** = uncertain / my reconstruction. **(fit)** = a number I fitted to make totals add up, not a measurement.
Units: 1 唐大尺 ≈ 29.5–30 cm; 1 步 = 5 尺 ≈ 1.47–1.5 m; 1 里 = 360 步 ≈ 531 m; 1 丈 = 10 尺 ≈ 2.95 m.
Game frame (DESIGN.md): x east, z south, origin = city centre on 朱雀大街. JSON (Appendix A) uses x from the W wall, z from the N wall; convert with x_game = x − 4860.8, z_game = z − 4325.9.

### 0. TL;DR for programmers
- Outer city 9721 (E–W) × 8651.7 m (N–S); earth wall 9–12 m base, ~5.3 m high; 12 gates (明德門 5 passages, others 3).
- 10 ward columns (2 × [3 outer ≈1020–1125 m wide, 2 inner ≈535 / 665 m]) and 13 rows (rows 1–4 flank palace: ~590–838 m; rows 5–13: ~500–590 m). 朱雀大街 ~130 m road (+ditches ≈150), 春明–金光 120 m, gate streets ~100–134 m, others ~40–70 m, wall streets 20–25 m.
- 宮城 2820.3 × 1492.1, 皇城 2820.3 × 1843.6 (centred, north); 大明宮 outside N wall at NE (perimeter 7.6 km); 興慶宮 1080 × 1250 (E5); markets ~925 × 1000–1030 each in col E4/W4 rows 5–6.
- Ward: rammed-earth wall (~2.5–3 m base, ~3 m high ?); outer-column wards 4 gates + 十字街 (~11–15 m), the 36 wards S of 皇城 only E/W gates + one E–W street; lanes 2–6 m; 16 blocks per big ward.
- Curfew: dusk 800 drum beats → gates shut; dawn 五更二點 3000 beats → open. 犯夜 = 20 strokes; climbing ward wall = 70; entering a house at night = 40, owner may kill on the spot. Bows/swords/shields/short spears legal; armour/crossbow/long spear illegal.
- Markets: drum 200 at noon opens, gong 300 at ~1 h 40 min before sunset closes. 5th-rank+ officials may not enter markets.
- Recommended slice: 崇仁, 平康, 宣陽, 親仁 (E3 r4–7) + 務本, 崇義, 長興, 永樂, 靖安 (E2 r5–9) + 東市 — the ministers' dawn road where 武元衡 was killed on 815-07-13.

---

## 1. CITY GEOMETRY

### 1.1 Outer wall 外郭城
- Size: E–W **9721 m** (春明門–金光門 line), N–S **8651.7 m**, area ≈ 84 km², perimeter ≈ 36.7 km [考古1963]. Text: 東西一十八里一百一十五步, 南北一十五里一百七十五步, 周六十七里 [城坊考 2, read].
- Wall: rammed earth (夯土), **base 9–12 m thick** [考古1963]; height **一丈八尺 ≈ 5.3 m** ("其崇一丈八尺") [城坊考 2, read]. No brick facing (brick only at gate passages/corners, ? ). Parapet/crenellation details unknown — use a plain earth top with low parapet (?).
- Moat outside: 隍 "廣三丈, 深二丈" (~9 m wide, ~6 m deep) per Baidu summary of Sui sources (?). Use 8–9 m wide, 3–4 m deep visible water/mud.
- The N wall of the outer city = N wall of 宮城; north of it lies 禁苑 (imperial park) and 大明宮 (on 龍首原, NE).
- Gates (12 + palace gates). Each side 3 gates [城坊考 2]:
  - S: 安化門 (W), **明德門** (centre, on 朱雀大街), 啟夏門 (E).
  - E: 通化門 (N), **春明門** (middle), 延興門 (S).
  - W: 開遠門 (N), **金光門** (middle), 延平門 (S).
  - N (west part, into 禁苑): 光化門, 景耀門, 芳林門 (W→E) (?order). N (east part) = S wall of 大明宮: 興安門(?), 建福門, **丹鳳門**, 望仙門, 延政門.
  - Passages: **明德門 5 門道**, each ~5 m wide, passage depth ~18.5 m, gate platform ~55.5 × 17.5 m [明德門 excavation, 考古 1974]; all other outer gates **3 門道** [Baike summary; 開遠門 passages est. 5–7 m]. 丹鳳門 (大明宮): 5 passages, ~8.5 m each (2005 excavation, ?). Gate towers: timber 城樓 on the earth platform (single-storey hall with hip roof; e.g. 懿德太子墓 mural for type).
- Inner-wall street 順城街 along the walls: **20–25 m** (narrowest 25 m) [Baike; 考古1963].

### 1.2 Streets
- Counts: "**南北十四街，東西十一街**" [城坊考 2, read] — in Tang usage = 14 streets running E–W (stacked N→S) and 11 streets running N–S (stacked W→E). Archaeology confirms 11 N–S + 14 E–W [考古1963]. My JSON has 11 N–S (incl. 2 wall streets + 朱雀) and 14 E–W (incl. 北/南順城街 and the 皇城南 street); the inner N row structure is a fit.
- **朱雀大街** (朱雀門→明德門, 5316 m long): 1957–63 survey **150–155 m** incl. ditches [考古1963]; 2021–22 excavation near 五橋並列 site: **~127 m road surface without ditches**; near 明德門 129.3 m [Xi'an Institute, press 2023]. Text: 東西廣百步 (≈147 m) [城坊考 2, read]. Use **~130 m surface + 2 ditches + tree rows ≈ 150 m**. 五橋並列 site (2021–23, CASS/Xi'an team) = 朱雀大街 × **第七橫街** at the NW corner of 安仁坊: an E–W water channel crosses the avenue under **five parallel bridges**; central bridge axis 63.5 m from the W bank of the E street ditch → 127 m [bjnews 2023-02-21, read]. (Counting E–W streets from the N wall street as #1, the street N of 安仁坊 (E1 r7) is #7 — matches the row model in Appendix A.) Same dig: **安仁坊 NW corner wall footing, a small corner gate (角門) in its N wall, and a brick culvert (涵洞) under the gate over the ditch** (post-盛唐) [press summary, read]. Cart ruts 1.35–1.40 m gauge found on it [Baike].
- **春明門–金光門 street** (= 皇城南第一橫街, runs along the S face of 皇城, N of both markets): **120 m** [secondary, 考古1963].
- **丹鳳門街** (S from 大明宮 丹鳳門 through 翊善/光宅 and 永昌/來庭): **176 m**, widest in the city [secondary].
- **安化門街 / 啟夏門街** (N–S, from 含光門/安上門 of 皇城 to the S gates): ~**134 m** (?) (memory of 考古1963; "two are about equal" in secondary).
- **延平門–延興門 street** (southern E–W gate street): **~55 m** (?).
- Gate streets in general: "六條通城門的大街寬度多在百米以上" except 延平–延興 [Baike summary of 考古1963].
- Ordinary (non-gate) streets: **~35–68 m** (?) — N–S ones wider than E–W. Use 60–70 m N–S, 40–55 m E–W.
- Ditches 水溝: open earth ditches on both sides of every street, between road and ward wall; on 朱雀大街 roughly **3 m wide, 1.7–2.1 m deep** (?); ordinary streets ~2 m wide, ~1 m deep (?). Small bridges/culverts at ward gates. Tree rows (槐) between ditch and roadway. Road surface: compacted earth (no paving); dusty in dry season, mud in rain (sand-spread 沙堤 for chief ministers' route — 新宰相 gets 沙堤 from his house to the palace, a real Tang custom).
- Canals into the city: 龍首渠 (from 滻水, NE → 興慶宮/大明宮/皇城), 清明渠 (from 潏水, S → W of 朱雀 → 皇城/宮城), 永安渠 (from 交水, S → past 西市 → 禁苑), 黃渠 (→ 曲江), 漕渠 (天寶, → 西市). 東市 放生池 fed from 道政坊 side [城坊考 3, read].

### 1.3 Ward grid (10 columns; rows 1–13 N→S)
Columns W→E: **W5 W4 W3 | W2 W1 | 朱雀 | E1 E2 | E3 E4 E5**. W1/W2/E1/E2 (south of 皇城) have only rows 5–13; outer columns have rows 1–13 (rows 1–4 flank 宮城/皇城).
Sizes, text [城坊考 2 + 長安志 卷7 四庫本, read]: 朱雀街東第一坊 東西350步; 第二坊 450步; 次東三坊 各650步; 皇城之南九坊 南北各350步 (one 長安志 copy reads 250 — too small vs archaeology, take 350); 皇城左右四坊: **從南第一第二坊 南北各550步, 第三第四坊 南北各400步** (i.e. rows 3–4 = 550, rows 1–2 = 400) [長安志 卷7, read]; 兩市各方600步; 朱雀街 東西廣百步.
Measured bands [考古1963 as cited: overall ranges N–S 500–838 m, E–W 550–1125 m; largest ward ≈ 0.94 km² (=1125×838) and smallest ≈ 0.275 km² per en Wikipedia "68 / 233 acres" — consistent]:
| band | wards | N–S | E–W |
|---|---|---|---|
| A: S of 皇城, columns E1/W1 & E2/W2 (36 wards, smallest) | 興道…安德 / 善和…安樂 | 500–590 m | ~520–560 (col 1), ~660–700 (col 2) |
| B: outer cols, rows 5–13 (S of 皇城 line) | 平康, 宣陽, 延壽… | 500–590 m | 1020–1125 m |
| C: outer cols, rows 1–4 (flank 宮城/皇城, largest) | 崇仁, 永興, 布政… | 660–838 m | 1020–1125 m |
Fitted values used in Appendix A **(fit)**: col1 535, col2 665, outer 1075; rows 1–2 660, rows 3–4 838, rows 5–13 533.4; streets: 朱雀 150, 安化/啟夏 134, other N–S 67.25, wall 25; E–W 100/115/100 in rows 1–4, 120 (皇城南), 45 (55 for 延平–延興), wall 25. Totals = 9721.5 × 8651.6 m. 皇城 width from fit = 2818 m vs measured 2820.3 ✓.

Ward lists N→S (read from [城坊考 2–4]; rows = absolute row numbers):
- **W1** (朱雀街西第一街, r5–13): 善和, 通化, 豐樂, 安業, 崇業(玄都觀), 永達, 道德, 光行, 延祚. (城坊考 has 光祿/□□ for the first two — name problem in the text; 長安志 & most maps: 善和, 通化 ?).
- **W2** (r5–13): 太平, 通義, 興化, 崇德, 懷貞, 宣義, 豐安, 昌明, 安樂.
- **W3** (皇城西第一街, r1–13): 修德(右神策軍營), 輔興, 頒政, 布政, 延壽, 光德(京兆府), 延康(西明寺), 崇賢, 延福, 永安, 敦義, 大通, 大安.
- **W4** (r1–13): 安定, 休祥, 金城, 醴泉, **西市 (r5–6)**, 懷遠, 長壽(長安縣廨), 嘉會, 永平, 通軌, 歸義, 昭行.
- **W5** (r1–13): 修真, 普寧, 義寧, 居德, 群賢, 懷德, 崇化, 豐邑, 待賢, 永和, 常安, 和平, 永陽.
- **E1** (朱雀街東第一街, r5–13): 興道, 開化(薦福寺), 安仁(小雁塔), 光福, 靖善(大興善寺, whole ward), 蘭陵, 開明, 保寧(昊天觀, whole ward), 安義.
- **E2** (r5–13): **務本**(國子監), **崇義**, **長興**, **永樂**, **靖安**, 安善(教弩場), 大業, 昌樂, 安德.
- **E3** (皇城東第一街, r1–13): 翊善|光宅 (split by 丹鳳門街), 永昌|來庭 (split), **永興**, **崇仁**, **平康**, **宣陽**, **親仁**, 永寧, 永崇, 昭國, **晉昌(慈恩寺/大雁塔)**, 通善(杏園), 通濟.
- **E4** (r1–13): 長樂(=延政, 大安國寺), 大寧, 安興, **勝業**, **東市 (r5–6)**, 安邑, 宣平, 昇平(樂遊原 NE), 修行, 修政, 青龍, 曲池.
- **E5** (r1–13): 十六宅 (入苑坊, princes), 興寧, 永嘉 (S half → 興慶宮), 興慶 (=興慶宮), 道政, 常樂, 靖恭, 新昌(青龍寺), 昇道, 立政, 敦化, then 曲江池/芙蓉園 occupy the SE corner (r12–13).
Count: 108–110 wards depending on how split/absorbed wards are counted [城坊考 2 says 108; 唐六典 110].
Check: row 9 = 靖善 (大興善寺) & 崇業 (玄都觀) = the 九五 ridge (see 1.5) — consistent.

### 1.4 Palace, imperial city, other walled units [考古1963 unless noted]
- **宮城** (太極宮 complex): **2820.3 × 1492.1 m**, centred on 朱雀 axis, z 0–1492. W→E: 掖庭宮 702.5 m, 太極宮 1285 m, 東宮 832.8 m. S gate 承天門 (drums of dawn start "自內" — 承天門 drum tower, ?). 815: 太極宮 is secondary; court sits in 大明宮.
- **皇城** (offices 百司): **2820.3 × 1843.6 m**, z 1492–3336; no N wall of its own; 橫街 (~220 m?, inside, in front of 承天門) between 宮城 and 皇城. S gates 含光門, **朱雀門**, 安上門; E gates 延喜門, 景風門; W gates 安福門, 順義門. Interior: 7 E–W × 5 N–S streets of offices (?). 太廟 SE, 太社 SW.
- **大明宮** (東內, the real court in 815): outside the N wall, NE, on 龍首原 (raised ~10–15 m above city, ?). Walls: S 1674 m, W 2256 m, N 1135 m, E 2614 m (trapezoid, narrower N). 丹鳳門 (5 passages) → 含元殿 (on high platform, 龍尾道 ramps, flanking 翔鸞閣/棲鳳閣 闕) → 宣政殿 → 紫宸殿; 太液池 N. Officials enter via **建福門** (W of 丹鳳門); **待漏院** built outside 建福門 in 元和二年(807?) for officials waiting before dawn (?date).
- **興慶宮** (南內): **1080 (E–W) × 1250 m (N–S)**, E5 column, 興慶坊 + S half of 永嘉坊 (N edge z≈2086 fit). 夾城 (double-walled covered way) along the inside of the E wall links 大明宮 – 興慶宮 – 曲江/芙蓉園. 815: a secondary palace (residence of empress-dowager / 宮人, banquets) (?), not the seat of court.
- **東市**: measured **~924 (E–W) × 1000+ m (N–S)**; **西市**: **927 × 1031 m** [考古1963]; Baike gives both ≈ 927 × 1025. Text: 方600步, 四面各開二門 (8 gates), 四面街各廣百步 [長安志 via 城坊考 3, read]. Detail in §4.
- **曲江池** (SE corner, E5 r12–13 and beyond the line): irregular lake, ~0.7 km² (?), N–S ≈ 1.4 km (?), fed by 黃渠; banks: 紫雲樓, 彩霞亭, 杏園 (通善坊), 慈恩寺 to its NW. **芙蓉園** (imperial park) S/SE of the lake, partly beyond the city wall line (the SE corner of the outer wall bends around it ?).
- **樂遊原**: loess ridge, highest point inside the city; NE corner of **昇平坊** (E4 r9) with 漢樂遊廟 site, running E through **新昌坊** (E5 r8, 青龍寺 on its north-facing slope) toward 延興門 [城坊考 3, read]. Top ≈ 20–30 m above surrounding wards (?). Famous view over the whole city (李商隱 "向晚意不適，驅車登古原"). Festival: 重陽 9/9, 上巳, 晦日.
- **大雁塔**: 大慈恩寺 = "**半以東**" of **晉昌坊** (E3 r11); pagoda in the temple's **west court** (寺西院浮圖) [長安志 卷8, read]. Built 652 (玄奘): 5 storeys, brick skin on earth core, ~60 m. Rebuilt **長安年間 (701–704)** as a 7-storey square brick 樓閣式 tower; **expanded to 10 storeys in 大曆 (766–779)** (cf. 章八元 "十層突兀在虛空"), later war-damaged and reduced to 7 (長興 930–933 repair) [en Wikipedia, read; storey history disputed]. 長安志 卷8 (read): "寺西院浮圖六級，崇三百尺" (6 storeys, 300 尺 ≈ 88 m — likely an older/exaggerated record). → **815: 10 storeys (likely), ~60–65 m (?)**. Today 7 storeys, 64.1 m incl. 4.2 m base, bottom storey 25 m square, 1604 Ming casing 60 cm thick — the Tang tower was ~1.2 m narrower and plainer. Use: square, 樓閣式, ~60 m, 7–10 storeys, each storey with brick pilasters dividing faces into bays, arched openings in the centre bay, corbelled brick eaves (疊澀), no timber galleries.
- **小雁塔**: 薦福寺浮圖院 in **安仁坊** (E1 r7); the temple itself is across the street in 開化坊 (E1 r6) [城坊考 2, read]. Built 707–709; **15 storeys, ~45 m** (?); square 密檐式 brick tower (tall plain first storey, then 14 closely stacked corbelled eaves, outline swelling then tapering like a bullet). Today 13 storeys, 43.4 m (top lost 1556 quake).
- Other landmarks: 大興善寺 (靖善坊, whole ward), 玄都觀 (崇業坊, peach trees – 劉禹錫 815 poem), 西明寺 (延康坊), 青龍寺 (新昌坊), 大安國寺 (長樂坊), 京兆府 (光德坊), 萬年縣廨 (宣陽坊 SE corner), 長安縣廨 (長壽坊), 國子監 (務本坊 W half), 都亭驛 (敦化坊), 右神策軍營 (修德坊).

### 1.5 Terrain — the six ridges 六坡 / 六爻
- 宇文愷 saw six E–W(ish) ridges as the six lines of the 乾 hexagram: **九二 → 宮城** (palace), **九三 → 皇城** (百司), **九五 → 玄都觀 (崇業坊) + 大興善寺 (靖善坊)**, "不欲常人居之" [元和郡縣志 / 長安志, standard quote, from memory]. 九四 ≈ row 5–7 belt (?), 上九 ≈ 樂遊原 / 曲江 rim (?), 初九 ≈ 龍首原 N (大明宮) (?).
- General slope: ground rises from **NW (~400–410 m a.s.l.) to SE (~450–470 m)** (?; modern DEM: Xi'an bell tower ~405 m, 大雁塔 base ~ 440 m, 樂遊原 top ~ 460 m; numbers approximate). Ridges trend roughly WSW–ENE, each 5–20 m high, gentle (loess), separated by shallow valleys; the city grid ignores them (streets go up and down).
- 長安志 卷7 (read): the E–W ridges "符易象乾卦之數"; 裴度's 永樂坊 house "偶當第五岡" — enemies later (c.822) used this (living on the 九五 'imperial' ridge) to smear him [長安志 卷7 / 城坊考 2, read]. → 永樂坊 (E2 r8) sits on the 5th ridge, next to 靖善/崇業 (r9).
- 龍首原 (N, under 大明宮): ~10–20 m above the city floor; 含元殿 platform adds ~10–15 m more (?).
- South: SE corner (曲江) is a natural depression inside the high ground; southernmost rows are open fields.

### 1.6 Population density by area
- Dense: N and E wards, esp. around 東市 / 皇城 / 大明宮 (officials) and around 西市 (merchants, foreigners). E side = officials and nobles; W side = commoners, merchants, Sogdians (?general consensus, e.g. 妹尾達彦).
- Sparse: "自興善寺以南四坊，東西盡郭，雖時有居者，煙火不接，耕墾種植，阡陌相連" [長安志 卷7 注, read (key phrases confirmed)] → rows 10–13 mostly fields, orchards, temples, family shrines (家廟), official gardens (官園 in 昌樂坊).

(Machine-readable JSON: Appendix A at end of file.)

---

## 2. INSIDE A WARD

### 2.1 Wall and gates
- 坊牆: rammed earth, **base ~2.5–3 m thick** [考古1963 as cited (?)]; height not preserved — use **~3 m** (en Wikipedia cites 9–10 ft) (?). Top: earth with a tile or thatch coping to shed rain (?). Climbable with a rope/ladder; "越坊市垣籬" is a crime (§7).
- Ward size by band (fit, see §1.3): A col1 535×533 m ≈ 28 ha; A col2 665×533 ≈ 35 ha; B 1075×533 ≈ 57 ha; C 1075×838 ≈ 90 ha (崇仁, 永興, 勝業, 布政…).
- Gates: "每坊皆開四門，有十字街四出趣門" [長安志 via 城坊考 2, read] → outer-column wards: **4 gates, one mid-side, 十字街**. The **36 wards south of 皇城 (E1, E2, W1, W2): only 東西二門 and one E–W 橫街** [呂大防《長安圖》 note in 城坊考 2, read; 長安志 卷7 (read): "不欲開北街洩氣以衝城闕"]. Consistent with 815: 武元衡 left 靖安坊 (E2) by its **east gate**.
- Besides the main gates, small **角門** (corner gates) existed by mid/late Tang (安仁坊 N wall, excavated, with a brick culvert across the street ditch) — a nice stealth entry point.
- Gate form: single passage with two wooden leaves, short roofed gate-house on the wall line (?); no tower. Keys held by the **坊正** ("坊置正一人，掌坊門管鑰，督察姦非，並免其課役" [通典 食貨 鄉黨 / 唐六典 戶部, from memory]). Gates shut on the 800 dusk drums and open on the dawn drums (§7).
- **武候鋪** (police posts) at city gates and ward corners: 大城門 100 men, 大鋪 30, 小城門 20, 小鋪 5 (衛士 / 彍騎) [新唐書 卷49上 百官志 左右金吾衛, read]. A ward corner post = small roofed hut + a few men, a drum (街鼓 relay) (?).

### 2.2 Streets, lanes, lots
- 十字街 inside big wards: **~11–15 m** wide. 布政坊 excavation (CASS, 2020s): N–S arm of the 大十字街 road-earth 10.8 m (early) / 11.1 m (late), "符合…大十字街的寬度標準" [press report, huanqiu 2024]. Older literature gives ~15 m (?). E–W 橫街 in small wards similar. Ward excavations (布政坊, 通義坊 2023) found lanes, courtyards, wells, everyday ceramics. Locations in texts are given relative to it: 十字街東之北, 南門之東, 西門之南, 東南隅 [城坊考, read].
- Each quarter is further cut by small cross-lanes → **16 blocks per large ward** (宿白's reconstruction; ?). Lanes 巷/曲: **~2–6 m** (?), unpaved, side gutters, dead-ends common. 曲 can carry names: 平康坊 南曲/中曲/北曲 (北里三曲), 勝業坊 "薛曲" (family lane) [城坊考 3, read].
- Lot sizes: commoners' house plots ≈ **1 畝 (~520 m²)** per family (田令 園宅地: 良口三口以下給一畝，每三口加一畝 — rule for counties; capital practice uncertain) (?). Officials: 1/16–1/4 ward (≈1.5–15 ha). Extremes: 郭子儀宅 = 1/4 of 親仁坊, "家人三千" (? 舊唐書), 大興善寺 / 昊天觀 = whole ward.
- Mix in a typical central ward: 1–3 Buddhist/Daoist temples (often a whole quarter), 2–6 big mansions, family shrines 家廟 (common in S wards), 1–3 進奏院 (NE wards), inns 旅舍/旅邸, small shops (food, wine, cloth, medicine), many small houses on lanes; open vegetable plots and orchards especially in S rows.
- Wells: everywhere (each compound; public wells at lanes) — unlined or brick-lined, ~1 m bore (?). Water also from canals in some wards.
- Trees: avenues lined with **槐** (Chinese scholar tree) — "官街樹" ; 京兆尹 吳湊 (貞元) refused elm (榆) replacements: "榆非九衢之玩", replanted 槐 [舊唐書 吳湊傳, from memory]. Willows (柳) on canals; inside compounds 槐, 桐, 竹, 松, 柏, fruit trees, and **牡丹** (peony mania in late 3rd month — 白居易《牡丹芳》, 慈恩寺 / 西明寺 / 興唐寺 peonies).
- Drainage: lanes drain to the ward's main street gutters, then through culverts under the ward wall into the avenue ditches (?).

### 2.3 What faced the avenues by 815
- Rule: "**非三品已上及坊內三絕，不合輒向街開門**" (only 3rd-rank+ officials, and lots with no access into the ward, may open a gate directly on the avenue) [唐會要 卷86 街巷, 太和五年七月, read]. Same memorial complains street doors were opened before the drum and left unlocked late at night → rule-breaking was normal.
- Other 街巷 edicts [唐會要 卷86, read]: 開元十九年 no kiln pits for bricks/tiles in the city; 廣德元年 no planting (crops) in the streets; 大曆二年 "諸坊市街曲有侵街打墻接簷造舍等…一切不許，並令毁拆"; 貞元四年 ward walls repaired with tax money; 貞元十四年 吳湊 "榆非九衢之玩，亟命易之以槐"; 太和九年 街使 plant street trees; 寶曆二年 after 5 days of rain 坊市 shut their **north gates** (rain-stopping magic) until 3 clear days. Temples and 3rd-rank+ mansions do have street gates (烏頭門 / 門屋 in the ward wall).
- 侵街 (encroachment): 大曆二年 敕 forbade "侵街打牆、接簷造舍" [唐會要 卷86]; still common by 9th c. (sheds, stalls, soldiers' and merchants' houses built in the street margins between ditch and wall, 大和 reports). Game: occasional lean-to stalls, carts, stacked goods along ward walls near markets; avenues otherwise bare walls + trees + ditches.
- "諸坊市邸店，樓屋皆不得起樓閣，臨視人家" (no upper storeys overlooking neighbours) [唐會要, 大曆 敕 (?)]. → 1-storey city with temple pagodas/halls, gate towers and a few 樓 standing out.

### 2.4 Life inside at night
- After gate closing, movement **inside** the ward is legal: wine shops, inns, lantern-lit lanes, visiting neighbours. 崇仁坊: "…**工賈輻湊，遂傾兩市，晝夜喧呼，燈火不絕**" (because 選人 without houses lodge there — "選人京城無第宅者多停憩此" — near the 尚書省選院 and 東市) [長安志 卷8 四庫本 + 城坊考 3, read].
- 平康坊 北里 (courtesans, 3 lanes) at night: candidates, officials, merchants; 北里志 (884, later) describes 南曲/中曲 = elite houses, 北曲 = cheaper [城坊考 3, read].
- Night markets existed until banned: 開成五年十二月 "京夜市宜令禁斷" [唐會要 卷86, read].
- 鬼市 at the W gate of 務本坊 — "風雨曛晦，皆聞其喧聚之聲" (ghost market heard on stormy nights) [輦下歲時記 via 城坊考 2, read]. Great ambient legend.
- Sounds: watchmen, dogs, temple bells/鐘 at dusk and dawn (temples rang 鐘 for services), drums at gates.

---

## 3. CANDIDATE WALKABLE SLICE

### 3.1 Recommendation: "the ministers' road" (10 units, contiguous, true scale)
Spine = the N–S street **皇城東第一街** between columns E2 and E3 — the route ministers took at dawn from their wards to 大明宮 建福門. On 元和十年六月三日 (13 July 815) 武元衡 left 靖安坊's east gate onto exactly this street; the E gate is mid-way along the ward's E wall, so he came straight out onto it; he was then led "東南行十餘步" (~15 m SE, i.e. into the street toward the 永崇坊 side) and killed.
| unit | col,row | size (fit) | why |
|---|---|---|---|
| 崇仁坊 | E3 r4 | 1075×838 | 23 進奏院 incl. **淄青 (李師道)**, 幽州, 太原, 淮南…; lodgings of 選人; 晝夜喧呼; 資聖寺; 造樂器趙家 |
| 平康坊 | E3 r5 | 1075×533 | **北里** 三曲 courtesans ("入北門東回三曲" — NE quarter); 12 進奏院 (同華, 河中, 河陽, 襄, 徐, **魏(博)**, 涇原, 靈武, 夏州, 昭義, 浙西, 浙東, 容州); 菩提寺 (S gate E side), 陽化寺 (N of the street), 李林甫 old mansion; 李穆 old house (NW) |
| 宣陽坊 | E3 r6 | 1075×533 | **萬年縣廨** (SE corner: police/jail/court of the E half); 淨域寺, 奉慈寺; 邠寧, 東川, 振武, 鄂州 進奏院; 楊國忠 old house |
| 親仁坊 | E3 r7 | 1075×533 | 郭子儀 family mansion (1/4 ward; 憲宗's consort 郭氏 is his granddaughter); 回元觀 (ex-安祿山宅); inns |
| 務本坊 | E2 r5 | 665×533 | **國子監** (W half, 六學 students); 先天觀; 西川, 齊州 進奏院; inns; **鬼市** at W gate |
| 崇義坊 | E2 r6 | 665×533 | 興元, 鄜坊, **易定** 進奏院; 招福寺; 李賀's old house (he left ~813) |
| 長興坊 | E2 r7 | 665×533 | **鎮州進奏院 (成德, 王承宗)**; **禮賓院** (foreign envoys' hostel, est. 元和九年六月=814) on N street; **畢羅店**; inns (段成式 lodged here 元和中); 乾元觀 |
| 永樂坊 | E2 r8 | 665×533 | **裴度's house** (城坊考; but 815 attack was in 通化坊 — conflict, see §8); 清都觀, 永壽寺 |
| 靖安坊 | E2 r9 | 665×533 | **武元衡宅**, assassination at the **E gate**; 韓愈 (later died here 824), 元稹 family house, 張籍 (later), 李宗閔; 崇敬尼寺; an inn |
| 東市 | E4 r5–6 | ~924×1000 | market (§4), opposite 平康/宣陽 |
All from [城坊考 2–3, read].
Extent (Appendix A coords): x ≈ 5605–8554 m, z ≈ 2498–6313 m → ~3.0 × 3.8 km (L-shape, ~7 km² walkable incl. avenues). Natural boundaries: 皇城 E wall with 景風門 (W of 崇仁, across 皇城東第一街); 皇城 S wall with 安上門 (N of 務本, across the 120 m 春明門–金光門 avenue, which also separates 崇仁 from 平康); 啟夏門街 (134 m ?) W of E2; 皇城東第二街 E of E3 (except where 東市 is included).
Optional adds (all adjacent): **勝業坊** (E4 r4; 陝府/鄭/滑 進奏院; 霍小玉 house legend; 勝業寺), **道政坊** (E5 r5, E of 東市; **東平 進奏院**, bought by 平盧/淄青 governor 李師古; his half-brother **李師道** inherited the province in 806, so this is plausibly 李師道's office in 815 (?)), **永寧/永崇** (E3 r8–9), **昭國坊** (E3 r10, **白居易's house in 815**), **昇平坊** (E4 r9, **樂遊原** viewpoint, NE corner).

### 3.2 Relative positions (fit coords, centre of ward; metres)
- 靖安 (E2 r9) centre ≈ (5937, 6046). 東市 centre ≈ (8017, 4012). Distance ≈ 2.9 km.
- 大雁塔 / 晉昌坊 (E3 r11) ≈ (6875, 7203): ~1.5 km SSE of 靖安 — clearly visible from the slice (60 m tower).
- 樂遊原 (昇平 E4 r9 NE corner) ≈ (8400, 5800): ~0.9 km E of 永崇; a 20–30 m ridge on the SE horizon.
- 曲江池 (E5 r12–13) ≈ (9100, 8000): ~3.5 km SE of 靖安.
- 小雁塔 / 安仁 (E1 r7) ≈ (5203, 4879): just W across 啟夏門街 from 長興 — visible.
- 大興善寺 (靖善 E1 r9) directly W of 靖安 across 啟夏門街.
- 通化坊 (W1 r6, 裴度 attack) ≈ (4518, 4301): W of 朱雀大街, ~2.2 km from 靖安 — outside slice; could be a far-city set piece reached by riding along 春明–金光 street or the r6/r7 street.
- 大明宮 建福門 ≈ (6400, 0): ~6 km N of 靖安; dawn route passes the slice northward along 皇城東第一街.
- 西市 (W4 r5–6) ≈ (1705, 4012): 6.3 km W of 東市 along the 春明–金光 avenue (120 m) past 朱雀門 — **second region** candidate: 西市 + 醴泉 (祆祠, 波斯寺), 布政 (祆祠, 李娃 inn), 延壽, 懷遠 (大雲寺), 光德 (京兆府) for Sogdian/Persian/Uyghur content.
- Festival region: 曲江 + 芙蓉園 + 晉昌/通善 (杏園) + 昇平 (樂遊原) — 上巳, 進士 曲江宴, 雁塔題名 (third region, optional).

### 3.3 Story hooks inside the slice (all attested)
- Two rival provinces' 進奏院 within 1 km: 淄青 (崇仁) and 成德/鎮州 (長興) — the two warlords blamed for 815 assassination; 魏博 (平康, loyal since 812 under 田弘正); 易定 (崇義); 幽州 (崇仁).
- 國子監 students and 舉人 (務本), 選人 (崇仁), courtesans (平康), county court (宣陽), foreign envoys (長興 禮賓院), Uyghur/Sogdian merchants (東市), a minister's dawn ride (靖安 → N).

---

## 4. MARKETS

### 4.1 Layout
- **東市** (E4 r5–6): ~924 × 1000+ m measured [考古1963]; text 方600步, "**四面各開二門**" (8 gates), "四面街各廣百步", "北街當皇城南之大街，東出春明門" [長安志 via 城坊考 3, read]. **西市** (W4 r5–6): 927 × 1031 m [考古1963], "南北盡兩坊之地" [城坊考 4, read].
- Inside: **two E–W + two N–S streets → 井字, 9 blocks** [考古1963; en Wikipedia]. Inner streets ~**16 m** wide in 西市 (?, often quoted; 東市 streets wider, ~30 m ?). Drains along streets; shop rows face the streets; back lanes (巷) between rows. Market wall rammed earth (~4 m base ?).
- Shops 肆/鋪/店: small units, **frontage ~3–4 m, depth ~3–10 m** (?, 西市 excavation lore). 邸 = warehouse-hostels for merchants ("四面立邸，四方珍奇，皆所積集" [長安志 東市]). Upper floors rare (樓 = wine-house: 西市 **張家樓** [城坊考 4, read]).
- **放生池** (fish-release pond): 東市 NE corner, fed from 道政坊, popularly 海池 [城坊考 3, read]; 西市 also had one (城坊考 4 lists 放生池) — 西市 pond = the 小海池 that 竇乂 filled to build 20 shops (太平廣記 竇乂, ?).
- 常平倉 (price-stabilising granary) in the markets: attested for 天寶-era 京師東西市 (?) — uncertain; omit or make it a small walled granary yard.
- Offices: 東市局 / 西市局 (=市署) and 平準局 in each market [城坊考 3–4, read].
- Execution grounds: 西市 **獨柳** (獨柳樹) [城坊考 4, read]; 東市 西北 **狗脊嶺** (?) — public executions by the market crowd.

### 4.2 Hours and officials
- "其市當以**午擊鼓二百下**，而衆大會；**日入前七刻，擊鉦三百下**，散" [唐會要 卷86 市, 景龍元年(707)十一月, read] → **drum 200 at noon opens; gong (鉦) 300 ≈ 1 h 40 min before sunset closes** (1 刻 = 14.4 min). Note: 300 is the gong, the opening drum is 200.
- 太府寺 → **兩京諸市署**: 令 1 (從六品上), 丞 2 (正八品上), + 錄事, 府, 史, 價人?, 帥, 倉督 (?) [唐六典 卷20, from memory]. Duties: "建標立候，陳肆辨物"; "以二物平市" (秤 weighed, 斗 levelled by 概); "**以三賈均市**" (上/中/下 price for each good, recorded every 10 days 旬) [唐六典 卷20]. Weights/measures checked yearly (8th month) by 太府寺 (?).
- **平準署** (令 2): government buying/selling, disposal of confiscated goods [唐六典 卷20].
- 市 boundaries: every shop row shows its trade name on a 標 (sign/post) (建標) — shop signs = vertical boards/flags (酒旗/望子 for wine shops: 酒旗 attested in Tang poetry).
- "**五品以上不得入市**" (貞觀元年十月) [唐會要 卷86, read] — high officials don't shop in person; servants do. A 5th-rank+ official in the market = odd/suspicious.
- 宮市 (palace purchasing by eunuchs, "白望" scouts, paying a few feet of red gauze for a cartload of charcoal): notorious in 貞元; abolished 805 under 順宗 but evidently back or remembered — 白居易《賣炭翁》 (新樂府, 809) treats it as current (?) — a living grievance in 815.

### 4.3 Trades 行 (220 in 東市 "二百二十行") — named in sources
- 東市 offices: "當中東市局，次東平准局" (market office in the centre block, 平準局 next to it E) [長安志 卷8, read].
- 東市: **鐵行** [城坊考 3, read]; **筆行** (?); **肉行** (?); **凶肆** (funeral-goods shops: 李娃傳 has the 東肆 vs 西肆 dirge-singing contest on 天門街) [李娃傳]; 酒肆; 畢羅肆 (?); 賃驢 (donkey hire) (?); 印刷 — calendars printed "上都東市大刁家" (9th c., ?; printing rare); 東市 has musical-instrument and luxury trades nearer the officials' wards (?).
- 西市: **衣肆, 鞦轡行 (harness), 秤行 (scales)** [城坊考 4, read]; **絹行, 大衣行, 藥行** (宋清 = "長安西部藥市人", 柳宗元《宋清傳》 c.800s); 金銀行 (?); 波斯邸 / 胡店 for jewels, spices, glass (?); 酒肆 with 胡姬 (李白 "落花踏盡遊何處，笑入胡姬酒肆中"); pawn/credit (櫃坊) (?).
- Other attested trades in wards: 永昌坊 茶肆 (835) [城坊考 3]; 長興坊 畢羅店 [城坊考 2]; 輔興坊 胡餅 (白居易 "胡麻餅樣學京都", ?); 豐邑坊 funeral goods (凶器) rental [城坊考 4 note]; 崇仁坊 造樂器趙家 [城坊考 3]; 宣平坊 油餅 (?); 勝業坊 蒸餅 (?).
- Goods: silk (絹/綾/錦), hemp cloth, grain, salt, iron tools, weapons (swords, bows legal), saddlery, horses & donkeys (馬行 ?), sheep, pottery (越/邢/長沙), lacquer, paper, brushes, ink, books (manuscript), medicine, perfume/incense (香料), spices (胡椒, 蓽撥), jewels, glass, Persian silver, brocade, fur, slaves (奴婢 were legally traded with 市券) (?).

### 4.4 Foreigners in 815
- **Sogdians** (粟特, 昭武九姓 surnames 康 安 曹 石 米 何 史): long settled, many in W wards near 西市 (醴泉, 布政, 普寧 祆祠; 靖恭坊 祆祠 on the E side) [城坊考 3–4, read]. After 安史 (755–763) Sogdians were viewed with suspicion; many sinicised.
- **Persians** (波斯): 波斯寺 (Nestorian 大秦寺) in 義寧坊 [城坊考 4]; 波斯 merchants as jewel-dealers in tales (?).
- **Uyghurs** (回鶻, name changed from 回紇 in 788): the steppe ally; horse-for-silk trade (1 horse ≈ 40 匹 絹, ?); Uyghur envoys and merchants in the capital, Manichaean (摩尼) temples allowed since 768/807 (?); known for brawls and lending money to officials; 回鶻 envoys may lodge at 鴻臚客館 / 禮賓院 (長興坊, est. 814).
- "胡客" stranded since the Tibetans cut the Hexi road: in 787 ~4000 foreign households were found living on state allowances; many were enrolled in 神策軍 [資治通鑑 貞元三年, from memory].
- Others: 新羅 students/monks/merchants, 吐蕃 and 南詔 envoys, 天竺/西域 monks, few 大食 (Arabs), 日本 monks (空海 left 806; no embassy in 815). 崑崙奴 (dark-skinned slaves from SE Asia) in rich households — fits 崑崙奴 archetype.

---

## 5. ARCHITECTURE (Tang, c. 800) — kit rules

### 5.1 Surviving/primary references
- **南禪寺大殿** (782, 五台): 3×3 bays, ~11.75 × 10 m, 歇山, 五鋪作 雙杪 brackets, roof rise ≈ **1:5.15** of span (very flat) (?numbers from memory).
- **佛光寺東大殿** (857): 7×4 bays, **34.0 × 17.66 m**; front bays 5.04 m (centre five), 4.40 m (ends); **eave columns ~4.99 m high, ~0.54 m dia (H/D ≈ 9)**; 七鋪作 雙杪雙下昂 brackets **~0.5 × column height**; eave overhang **~4 m** beyond column line; rise ≈ **1:4.77**; 材 30×20.5 cm (一等材); 廡殿 roof [梁思成 1937 survey; standard figures, from memory].
- 懿德太子墓 (706) mural: 三出闕 gate towers, city wall, 樓; Dunhuang murals (盛唐–中唐 caves 172, 217, 148, 159; 晚唐 85): temple courtyards with 迴廊, 樓閣 with 平坐, houses; 大雁塔 門楣石刻 (lintel engraving of a Tang hall); 含元殿/麟德殿/青龍寺/西明寺 excavated plans.

### 5.2 Proportions (use as generator defaults)
| element | rule |
|---|---|
| bay width 間 | main halls 4.5–5.5 m; temple side halls/gates 4–5 m; houses 3–4 m; 1 架 (purlin spacing) ≈ 1.3–1.8 m horizontally |
| column height H | ≈ bay width (H/bay 0.9–1.0) on halls; houses 2.8–3.5 m |
| column diameter | H/9 – H/10 (halls), H/12 (houses); slight entasis 梭柱, inward lean 側腳 (~1%), corner columns taller 生起 (+5–15 cm) |
| bracket set 鋪作 height | 0.4–0.5 H on great halls (4–7 鋪作, 1–2 sets per bay only: **few, big brackets**, 補間 often absent or a single 駝峰/人字栱); 0.2–0.3 H on secondary; houses: plain 斗口跳 or beam ends on capitals |
| eave overhang | 0.6–0.8 H with brackets; houses ~1–1.5 m |
| roof pitch | total rise/span ≈ **1:4.8–1:5.2** (≈ 22–25° mean slope), gentle concave 舉折; corners rise only slightly (起翹 ≤ ~0.5 m on halls). Qing/Ming roofs are ~1:3 and much steeper at top — avoid |
| platform 台基 | halls 0.8–1.5 m (palaces several m), houses 0.2–0.5 m; brick/stone edged for rich; front 踏道 steps + side 慢道 ramps |
| storeys | city is 1-storey; 樓/閣 only for temples, gates, palaces, wine houses; upper floors carried on **平坐** (bracketed balcony) with railing |

### 5.3 Roofs, tiles, ornaments
- Roof types by rank: 廡殿 (hip) – palace/temple main halls; **歇山 (九脊/廈兩頭)** – halls, gates, rich houses; **懸山 (不廈兩頭)** – ordinary houses; 攢尖 – pavilions/pagoda tops. 硬山 (gable-wall flush) is basically Ming+ → avoid.
- Tiles: grey unglazed **板瓦 (concave) + 筒瓦 (semicircular cover)**, eave ends with round **瓦當, lotus-pattern (蓮花紋)** — the Tang standard; eave flat tiles with thick lip 重唇板瓦. Palaces: polished black 青棍瓦 and some **green glaze** (綠琉璃) trims; yellow glaze is NOT a Tang palace convention (?).
- Ridge: stacked-tile ridge (疊瓦脊), modest height; **鴟尾** at both ends of the main ridge: tall fin curving inward over the ridge, outer edge with a scalloped fin, body with feather/scale bands, **no open mouth swallowing the ridge** (that is the late-Tang/Song 鴟吻). 鴟尾 height ≈ 0.3–0.5 of roof height on halls (?). Hip ridges end in a simple tile or 獸頭; **no rows of small ridge beasts** (仙人走獸 = Ming/Qing).
- 瓦獸, 懸魚 (gable fish), 對鳳 = restricted to 常參官 (營繕令, 5.6).

### 5.4 Walls, openings, colour
- Walls: rammed earth or adobe, **white lime plaster**; timber frame exposed: columns, 闌額, brackets painted **朱/丹 (vermilion) or 土朱 (red ochre)** with white edges ("丹粉刷飾"); 闌額 sometimes 七朱八白 (red with white rectangles) (?). Palace/temple: 青綠 decoration on brackets and beams (暈繝) (?). Commoners: bare wood, mud walls, maybe whitewash.
- Windows: **直欞窗 / 破子欞窗** (vertical square or triangular bars) on walls between columns; no ornate lattice patterns (格子門 mostly Song+). Openings backed by paper or cloth (?), bamboo blinds 簾 very common, hanging curtains 帷/幔 inside.
- Doors: **板門** (plank leaves), large gates with rows of **門釘** and 鋪首 rings; 門簪 (2 pegs on lintel); 門砧 stone pivots; low threshold.
- **烏頭門**: free-standing gate = 2 tall posts with black-tipped (烏頭) caps + lintel, leaves between; allowed for 五品以上 (營繕令).
- **門屋** (gatehouse): 1–5 bays, the passage in the centre bay; rank-limited (5.6).
- **闕**: paired towers at palace gates (含元殿 翔鸞/棲鳳, 三出闕 = triple-stepped for emperor), not for private use.
- Brick: pagodas, tombs, wells, wall facing of palaces, platform edging, drains; houses are NOT brick-walled.
- Ground: compacted earth yards; brick paving in temples/palaces (square bricks with lotus patterns).

### 5.5 Compound layouts
- **廊院** (corridor courtyard): gate (門屋) → court enclosed by **迴廊** (covered corridors) → main hall (堂) on axis; the standard Tang temple and mansion unit (Dunhuang). Side buildings are often the corridors themselves, not separate wings.
- Mansion: 大門 (street or lane) → outer court (stables, servants, guests) → **中門** → 堂 (formal hall, 前堂) → 寢 (private rooms, 後寢) behind, women's quarters at back; side courts (廚, 庫, 馬廄), garden (池, 亭, 竹, 太湖石 — collected by 牛僧孺/白居易 in this era) at side or back; series of courts = 進.
- Temple: 山門 → 中門 → 佛殿 (main hall) → 講堂/法堂 → 僧房 around; pagoda in front of or beside main hall or in a separate 塔院 (薦福寺 塔院 in another ward!); multiple 院 (慈恩寺 had 十餘院, 1897 rooms ?).
- 進奏院: like an official's mansion: gate, hall for receptions, 院 for clerks/messengers, stables (riders!), storerooms for 'tribute' goods (?).
- Commoner house: walled yard (土牆, 柴門 or 板門), 3-bay main house (one 'hall' in the middle, rooms either side), kitchen shed, well, maybe a 2nd small house; thatch (茅) or tile. 白居易 as a 校書郎 (803) rented "**茅屋四五間，一馬二僕夫，俸錢萬六千，月給亦有餘**" in 常樂坊 [白居易《常樂里閒居》, from memory] → thatched houses even for minor officials.
- Shops: shop room open to the lane/market street with removable boards, 1–2 bays, living quarters behind.

### 5.6 Sumptuary rules (營繕令) [唐會要 卷31, 四庫本 on wikisource, read via summary; cited in 太和 entries]
- 三公已下 舍屋 **不得施重栱、藻井**.
- 三品已上: 堂舍 ≤ **5間 9架** (most modern citations; the 四庫本 summary I got said 5間7架 — verify); 廳廈兩頭門屋 ≤ 5間 5架.
- 五品以上: 堂舍 ≤ **5間 7架**; 廳廈兩頭門屋 ≤ 3間 2架; 仍通作**烏頭大門**.
- 六品七品以下: 堂舍 ≤ **3間 5架**; 門屋 ≤ 1間 2架.
- 非常參官 不得造 抽心舍 (軸心舍), 及施 懸魚、對鳳、瓦獸、通栿乳梁 裝飾.
- **庶人**: 堂舍 ≤ **3間 4架**, 門屋 1間 2架, 不得輒施裝飾.
- Gardens/pavilions (園亭) not limited (?). Rules often broken by the powerful (stories of 侵街 and luxurious mansions, e.g. 涇原節度使 馬璘's over-luxurious mansion in **長興坊** was confiscated after his death and turned into 乾元觀 (778) [城坊考 2, read]).

### 5.7 Pagodas (815)
- 大雁塔: square brick 樓閣式, **10 storeys in 815** (likely; 7 before 大曆), ~60–65 m, bottom ~24 m square; storeys diminish; brick pilasters & 闌額 in relief; arched door in each face; top spire (塔剎). Could be climbed (雁塔題名 inscriptions by 進士 — names written on walls).
- 小雁塔: square brick 密檐式, **15 storeys, ~45 m**; tall first storey on a high base; tight corbelled eaves; slight bulge in profile.
- Other tall things in the skyline: 大興善寺, 大薦福寺, 大莊嚴寺 / 大總持寺 twin Sui wooden pagodas (和平坊/永陽坊, W5 r12–13; very tall, ~100 m claimed, ?), 光宅寺 七寶臺, 玄都觀, 青龍寺 on 樂遊原, gate towers, 含元殿 on its platform (visible from all over the city).

---

## 6. PEOPLE

### 6.1 Officials' colours and insignia [唐會要 卷31 read; 上元元年 details from 新唐書 車服志, memory]
- 貞觀四年(630): "三品已上服紫，四品五品已下服緋，六品七品以綠，八品九品以青"; wives follow husbands' colour [唐會要 卷31, read].
- 上元元年(674), the system in force in 815: 三品以上 紫 + 金玉帶 (13 銙); 四品 深緋 + 金帶 (11); 五品 淺緋 + 金帶 (10); 六品 深綠 / 七品 淺綠 + 銀帶 (9); 八品 深青 / 九品 淺青 + 鍮石帶 (8); 流外官 & 庶人 **黃** + 銅鐵帶 (7); 太和六年 restates 庶人 黃 + 銅鐵, 部曲/奴婢 黃 or 白 coarse silk/cloth [唐會要 卷31, read]. 赭黃 reserved for the emperor; in practice commoners wear **yellowish/undyed hemp, white, brown 褐, black 皂**. So DESIGN.md's purple / red / green / blue is right; add **light vs dark shades** for adjacent grades.
- 魚袋 (fish tally pouch at belt): 三品以上 金, 五品以上 銀. 賜紫/賜緋 = honorary colour above actual rank (common: many officials in purple/red).
- 笏 (court tablet): 五品以上 ivory, below wood/bamboo. Examination candidates (舉子) wore **white hemp robes** ("麻衣如雪", "白衣").

### 6.2 Men (all classes)
- **幞頭**: black gauze/silk kerchief tied over a stiff inner 巾子 (topknot cover). c.815: 巾子 high and rounded, tilted slightly forward; the two rear tails (腳) **soft, long, hanging behind** (some stiffened/curving outward = 中晚唐 trend; straight horizontal rigid wings = 五代/Song, avoid) (?). Worn by officials, commoners, servants alike (commoners' cloth coarser).
- **圓領袍/衫** (round-collar robe, to shin/ankle), side slits; **缺胯袍** (high slits) for soldiers/servants/riders; belt 革帶 with plaques; under it 半臂 and 袴 (trousers); **烏皮靴** (black leather boots, 六合靴) for officials/riders, 麻鞋 / 草鞋 / 線鞋 for commoners. Labourers: short 衫 + 袴, 頭巾 or bare topknot, 蓑衣 + 斗笠 in rain.
- Beards and moustaches common among adult men; no queue, no shaved forehead.
- Scholars at leisure: 紗帽 (?), wide-sleeved 衫. Sleeves grew huge in the 9th c.: 太和六年 rules cap men's sleeves at 1尺3寸, women's at 1尺5寸, skirts ≤ 5 幅, robes trailing ≤ 2寸; 開成四年 李德裕 cut women's sleeves in 淮南 **from 4 尺 to 1尺5寸** [唐會要 卷31, read] → in 815 fashionable women's sleeves can be very wide (~0.5–1 m).

### 6.3 Women
- Basic: short top (襦/衫) + **long high-waisted skirt** (裙, tied above the bust or at the bust), **披帛** (long narrow shawl), 半臂 (short-sleeved jacket, less fashionable by 815), soft shoes with raised toes (**高頭履/重台履**), or 線鞋.
- c.800–820 fashion (cf. 《簪花仕女圖》, late 8th–9th c.): **very high piled buns** (高髻, 峨髻, 拋家髻), big flowers / combs / pins in the hair, **wide sleeves**, gauze over-robes (大袖紗羅衫), fuller figures.
- **元和 make-up** — 白居易《時世妝》(c.810): "**腮不施朱面無粉，烏膏注唇唇似泥，雙眉畫作八字低…圓鬟無鬢堆髻樣，斜紅不暈赭面狀…元和妝梳君記取，髻堆面赭非華風**": no rouge/powder, **dark (black-brown) lip paste**, low "八"-shaped brows, ochre face (赭面, Tibetan-style), piled bun without side locks. Also 花鈿 (forehead ornament), 面靨 dots.
- In public: women walk, ride horses (less than in 開元 but still), or ride in ox-carts / 檐子 (rank). 帷帽/冪䍦 veils are early-Tang, mostly gone by 815 (DESIGN.md OK). Maids often in **men's robes and 幞頭** (tomb murals) or double side-buns 雙鬟.
- Courtesans (平康 北里): fashionable dress, music (琵琶, 歌), poetry; overseen by a "假母" (madam) (北里志, later).

### 6.4 Religious
- Monks/nuns: shaved head, 袈裟 over 褊衫 + skirt; colours dark (緇 = black-grey, brown 褐, 木蘭 reddish-brown); **紫袈裟** imperial award. Begging bowl, staff (錫杖), straw sandals. Many monasteries: few hundred to ~1000 monks in the biggest (?).
- Daoist priests: **黃冠** (yellow crown/headdress), robes 黃 or 褐 (?), 女冠 (Daoist nuns — often aristocratic women, 女冠觀 in 興道/大業/輔興).
- Zoroastrian 祆 priests (薩寶 office for Sogdian communities); Manichaean (摩尼) priests in white (?); Nestorian (景教) priests (大秦寺, 義寧坊).

### 6.5 Soldiers and police
- **金吾衛** (左右金吾衛, the city police; left = E half 萬年縣, right = W half 長安縣): 左右街使 1 each, 判官 2 each; 翊府中郎將 "督京城左右六街鋪巡警，以果毅二人助巡探" [新唐書 百官志, read]. Night: "乙夜，街使以騎卒循行嘂謼(shouting)，武官暗探(plain-clothes)" [ibid., read]. Look: red/緋 robes or armour, **抹額** (red headband) (?), 弓, 橫刀, 槊/儀刀; mounted patrols of a few riders.
- 武候鋪 men: 衛士/彍騎 (conscript guards).
- **神策軍** (left/right, commanded by eunuch 護軍中尉): the real armed force in the capital (camps N of the city in 禁苑; 右神策軍營 in 修德坊 [城坊考 4]); many shopkeepers/rich boys bought enrolment to escape county law and taxes — **神策 men are effectively above 京兆府/金吾 justice** (cf. 許孟容 as 京兆尹 jailing a 神策 officer for debt, 809 — famous because rare) (?).
- Armour: 明光甲 / 兩當 lamellar, leather; helmets 兜鍪; shields 楯; bows, crossbows (military), 陌刀 (long two-handed blade, army), 槊 (lance), 橫刀 (straight single-edged sword, the standard). No Ming-style uniforms with 補子 or 勇 badges.
- House guards of great families/warlords: armed retainers (家兵), 進奏院 riders (邸吏, 驛騎).

### 6.6 Foreigners, children, servants
- Sogdian/Persian/Uyghur men: pointed or rolled-brim felt caps (卷檐虛帽 / 渾脫帽), **lapelled tunics (翻領)**, narrow sleeves, belts with pouches, boots, beards; camels.
- 崑崙奴 (dark-skinned SE Asian servants), 新羅婢 (Korean maids) — attested household types.
- Children: hair in two tufts/knots (總角, 丫髻), short robes or tunics + trousers; toys: 竹馬, kites (紙鳶 ?), balls (蹴鞠 for youths), 鬥雞 (cockfighting — popular among young men).
- Slaves 奴婢 legally bought/sold with contracts (市券); 部曲 semi-free retainers.

### 6.7 Population and schedule
- Population ~**0.8–1.0 million** (estimates vary 0.5–1 M; en Wikipedia 800k–1M) incl. ~ tens of thousands of 神策 soldiers + families, several thousand 宦官 (?), thousands of 宮人, a few thousand monks/nuns, ~1–2 thousand examination candidates each winter–spring (?), students of 國子監 (~2000 nominal, fewer in 815 ?).
- Distribution: dense N/E (officials, 東市), W around 西市 (merchants, Sogdians, artisans); rows 10–13 thin (fields, temples, shrines) [長安志 quote §1.6]. Density for crowds: N wards ~ 15–25 thousand people/ward-size-C (?); S rows < 2 thousand (?). **(guess for gameplay)**
- Day (官員): wake 五更 (~3–4 h before sunrise); ride at the dawn drums to 大明宮 (建福門 / 待漏院), court at first light; office work to ~noon ("午後放衙" ?); afternoons for visits, poetry gatherings, banquets, 平康.
- Day (commoners): gates open at dawn drums → work in ward/workshops; markets open at noon drum, close ~1 h 40 min before sunset; hurry home before 800 dusk drums finish; evening inside ward.
- Calendar: officials get every 10th day off (旬假) + festival holidays (寒食–清明, 冬至, 元日 several days each).

### 6.8 Transport
- **Horse**: normal for officials (court riding is obligatory; even 宰相 rode — 武元衡 on horseback with a few attendants and torches/lanterns); young men, couriers, 金吾. 宰相 after 815 escorted by 金吾 riders.
- **Donkey**: everyman's ride; **hired donkeys** (賃驢/僦驢) at gates and markets (tales: 賃驢 to the suburbs) (?). Mules for loads.
- **Ox cart** (牛車, 犢車 with roofed box): women of status, elderly, goods; slow, wide. Hand carts and wheelbarrows (? 獨輪車 attested in Tang? use 2-wheel hand carts).
- **Camels**: caravans, 西市 / 開遠門 / 金光門; also rich households.
- **Litters** (肩輿, 檐子, 步輦): restricted. Men: 開成五年 (840) rule allows 檐子 only for 宰相, 三公, 師保, 尚書令, 僕射, and ill retired officials; everyone else rides [唐會要 卷31, read]. Women: 外命婦 by rank with bearer counts (up to 8 for ministers' mothers/wives); merchants' wives may not use 車/檐子 [ibid.]. In 815 a man in a litter = minister/old grandee.
- Speed law: "諸於城內街巷及人衆中，無故走車馬者，笞五十；以故殺傷人者，減鬬殺傷一等" (crowd = 3+ people; urgent public/private business exempt) [唐律疏議 卷26 雜律, read].

---

## 7. TIME & LAW

### 7.1 Drums and gates — exact texts
- "凡城門坊角，有武候鋪，衞士、彍騎分守，大城門百人，大鋪三十人，小城門二十人，小鋪五人，**日暮，鼓八百聲而門閉**；**乙夜，街使以騎卒循行嘂謼，武官暗探；五更二點，鼓自内發，諸街鼓承振，坊市門皆啓，鼓三千撾，辨色而止**" [新唐書 卷49上 百官志 左右金吾衛, read].
  - Who/where: dawn drums start **inside the palace** ("自內" — 承天門 / 大明宮 gate drum, ?), relayed by **street drums at the 武候鋪 along the six main streets (六街)**; ward and market gates open; 3000 strokes, stop when one can distinguish colours (dawn twilight). Dusk: 800 strokes, then gates shut.
  - Origin: 貞觀 (馬周) replaced shouting criers with **街鼓** ("鼕鼕鼓") (?).
  - 監門式: "鼓聲絶，則禁人行；曉鼓聲動，即聽行" [唐律疏議 卷8 疏議, read].
- Time units: night = 5 更 × 5 點 from dusk to dawn (length varies with season). **五更二點** ≈ late night; in midsummer (815-06, ~July) ≈ 03:30–04:00, midwinter ≈ 05:30–06:00 (?). 1 day = 100 刻 (1 刻 = 14.4 min); 12 時辰.
- **犯夜**: "諸犯夜者，**笞二十**；有故者，不坐。〈閉門鼓後、開門鼓前行者，皆爲犯夜。故，謂公事急速及吉、凶、疾病之類。〉" 疏議: "皆須得**本縣或本坊文牒**，然始合行，若不得公驗，雖復無罪，街鋪之人不合許過" [唐律疏議 卷26 雜律, read]. → a pass (文牒/公驗) from county or 坊正 lets you move at night for weddings, funerals, illness, official business.
- Watchmen: "其直宿坊街，若應聽行而不聽及不應聽行而聽者，笞三十"; failing to notice a thief passing the post: 笞五十 [ibid., read].
- Walls: "越官府廨垣及**坊市垣籬**者，**杖七十**"; 越州鎮戍城/武庫垣 徒一年; 縣城 杖九十; gatekeeper who opens/closes without cause = same as crossing [唐律疏議 卷8 衛禁, read]. 越皇城/宮垣 much heavier (徒/流; ?).
- **夜無故入人家**: **笞四十**; "**主人登時殺者，勿論**" (owner may kill on the spot); killing a known non-threat: 鬬殺傷減二等; killing after restraint → 加役流 if death [唐律疏議 卷18 賊盜, read]. → huge for stealth gameplay: house guards can lawfully kill intruders at night.
- **上元**: 正月十四–十六 the curfew lifted: "正月十五日夜，敕金吾弛禁，前後各一日以看燈" [韋述《兩京新記》, as quoted in secondary works]; lanterns, 踏歌, crowds in streets all night. Other nights: occasional imperial grants (大酺) (?).

### 7.2 Weapons law [唐律疏議 卷16 擅興, read]
- "諸私有禁兵器者，**徒一年半**；〈謂**非弓、箭、刀、楯、短矛**者。〉" → bows, arrows, swords/knives, shields, short spears are LEGAL.
- 疏議: 禁兵器 = "**甲、弩、矛、矟、具裝**等，依令私家不合有". 弩 1 → 徒二年半; 甲 1 or 弩 3 → 流二千里; 甲 3 or 弩 5 → **絞**; 私造 +1 degree; 甲 includes 皮、鐵; 具裝 (horse armour) = 甲. Banners/insignia (旌旗、幡幟、儀仗) in private hands → 杖八十.

### 7.3 Punishments (五刑)
- 笞 10–50; 杖 60–100; 徒 1, 1.5, 2, 2.5, 3 years; 流 2000/2500/3000 里 (+加役流); 死 = 絞 or 斬. Redemption with copper (贖) for officials/relatives/elderly. Torture in investigation allowed (拷訊, limited).
- 謀殺人 徒三年; 已傷 絞; 已殺 斬 [唐律 賊盜, from memory]. 故殺 斬, 鬬殺 絞.
- 強盜: 不得財 徒二年; 1 尺 徒三年; …; 10 匹 or wounding → 絞; killing → 斬. 竊盜: 不得財 笞五十; 1 尺 杖六十; 5 匹 徒一年; 50 匹 加役流 [唐律 賊盜, from memory].
- Practice in 815: executions in the markets (西市 獨柳, 東市 狗脊嶺?); beatings to death by 京兆尹 (杖殺) common for gangsters (酉陽雜俎: 京兆尹 薛元賞 (840s) beat to death tattooed 惡少 — later than 815 but indicative).
- Investigation: 萬年縣 (E half, office 宣陽坊) / 長安縣 (W, 長壽坊) under 京兆府 (光德坊); 金吾 for streets; 神策 handles its own men; 御史臺 for officials.

### 7.4 Money and prices (rough; Tang figures are sparse) 
- Currency: **開元通寶** bronze coin (1 文), strings of 1000 = 1 貫/緡; **絹 (silk bolts, 匹 ≈ 12 m)** as money; gold/silver ingots (鋌) for big sums. **No paper money.** **飛錢** (remittance certificates, 憲宗 era): "商賈至京師，委錢諸道**進奏院**及諸軍、諸使富家，以輕裝趨四方，合券乃取之，號飛錢" [新唐書 卷54 食貨志; confirmed via secondary quotes] — context: 憲宗 "以錢少，復禁用銅器" → 進奏院 are also banks.
- 元和 = deflation (錢重物輕): 1 匹 絹 ≈ 800–1000 文 (vs 3200 in 780s) (?).
- Salary: 白居易 as 校書郎 (正九品上) 16,000 文/month, enough for "茅屋四五間，一馬二僕夫" [白居易 詩, from memory].
- Wine: 1 斗 (~6 l) ≈ 300 文 in the 750s [杜甫 "恰有三百青銅錢"]; poetic "斗十千" (10,000) = luxury wine.
- Labour: 1 day = 絹 3 尺 (庸 standard) ≈ 60–80 文 in 815 (?).
- Horse: Uyghur horse trade ~**40 匹 絹/horse** (state, inflated) (?); a decent market horse maybe 15–25 匹 (?).
- Rice/millet: 1 斗 ≈ 50–100 文 in normal 元和 years (?).
- Swords/knives: no reliable figure → invent within 1–5 貫 for a good 橫刀 (?).

---

## 8. 815 EVENTS (元和十年) — timeline
Dates: Chinese calendar; 元和十年 ≈ Feb 815 – Jan 816. [資治通鑑 卷239, read] unless noted. 武元衡 b. c.758, aged ~57. en Wikipedia: **8 成德 officers led by 張晏** arrested, confessed under torture, executed; real killers were 李師道's (平盧) men.
- 元和九年 閏八月: 淮西 (彰義, 蔡州) governor 吳少陽 dies; son **吳元濟** conceals death, seizes power, raids neighbours → war.
- 元和十年 正月: 吳元濟 stripped of titles, 16 circuits ordered to attack (?). Court divided: **武元衡** (宰相, 門下侍郎) and **裴度** (御史中丞) lead the war party.
- 正月–二月: 柳宗元, 劉禹錫 (exiled since 805) recalled to Chang'an; 劉禹錫's 玄都觀 peach-blossom poem (玄都觀 = 崇業坊) offends; **三月乙酉** sent out again (柳 → 柳州; 劉 → 播州, changed to 連州 at 裴度's plea). 元稹 also recalled (spring), sent to 通州 司馬 (三月?) (?).
- Spring (辛亥; 三/四/五月?): agents of **李師道** (淄青/平盧, capital 鄆州) burn the **河陰轉運院** (Grand Canal depot): "錢帛三十餘萬緡匹、穀二萬餘斛"; "人情恇懼" — pressure to end the war. Also cut 47 halberds at 建陵 gate (?).
- 五月: 裴度 sent to inspect the front; 李光顏 wins at 時曲 (?).
- **六月癸卯 (3rd) = 13 July 815 (Julian) [en Wikipedia Wu Yuanheng, read], before dawn**: "天未明，元衡入朝，**出所居靖安坊東門**" — assassins in the dark (one shouts to put out the torches/candles 滅燭 in some versions — 舊唐書), **arrow in the shoulder**, another springs from **tree shade** and strikes his **left thigh with a cudgel (棓)**, they **lead his horse 十餘步 SE** and kill him, **take his head (顱骨)** [通鑑 239 + 城坊考 2 note, read]. Attendants scatter; cries along the streets.
- Same morning: **裴度** attacked in **通化坊** (W1 r6, W of 朱雀) — slashed (boot strap, back, head), falls **into the street ditch**; **thick felt hat (氈帽)** saves him; servant **王義** grabs an assassin from behind, has his arm cut off; assassins think 度 dead [通鑑 239, read]. (城坊考 places 裴度's house in 永樂坊 — conflict; 815 he may have lived/passed via 通化坊.)
- Aftermath: notes left at 金吾 and 府縣: "**毋急捕我，我先殺汝**"; 宰相 escorted by 金吾 riders "**張弦露刃**", gates searched; "**朝士未曉不敢出門**" — court waits for daylight; 許孟容: "自古未有宰相橫屍路隅而盜不獲者". **戊申**: city-wide search 京城大索, reward, harbourers' clans executed; houses with **複壁 / 重橑** (double walls / double roofs) searched [通鑑 239, read].
- **庚戌**: 神策將軍 王士則 accuses **王承宗** (成德, 鎮州 — his 進奏院 in 長興坊!) of sending **張晏** et al.; **戊辰**: 張晏 + 4 executed, 14 more killed; the real killers (李師道's men) escape. Earlier 王承宗's 邸吏 尹少卿 had come to plead for 承宗 and was thrown out by 武元衡 (motive) (?).
- **乙丑**: 裴度 (recovering) made **中書侍郎 同平章事** (chief minister), insists the 淮西 war go on.
- 六–八月: **白居易** (太子左贊善大夫, lives **昭國坊**) is first to memorialise demanding capture → attacked for overstepping (a 宮官, not 諫官) and for poems on flowers/wells after his mother's death in a well accident → demoted 江州刺史, then **江州司馬**; leaves Chang'an (autumn) (?).
- 八月 (?): **東都 plot** of 李師道's 留後院 in Luoyang: "數十百人" planned to burn the palace and sack the city; betrayed, crushed by 東都留守 **呂元膺**; leader 80-year-old monk **圓淨** of 中岳寺 with 山棚 (mountain hunters): "誤我事，不得使洛城流血！"; 訾嘉珍、門察 confess they killed 武元衡 for 李師道 [通鑑 239, read].
- 甲戌 (七月?): 王承宗 cut off. 元和十一年正月癸未: 王承宗's titles stripped, six circuits to attack him. 元和十二年 十月 (817): 李愬 takes 蔡州 in the snow, 吳元濟 captured; 元和十四年 (819) 李師道 killed by his own officers.
- Who is in Chang'an 815: 憲宗 (r. 805–820, age 37); 宰相 武元衡 (to 6/3), 張弘靖, 韋貫之, then 裴度; **韓愈** (考功郎中 知制誥; war party) ; 張籍 (太常寺太祝, poor, eye disease); 王建 (?), 賈島 (延壽坊 精舍 [城坊考 4]), 姚合, 李紳, 牛僧孺, 李翱, 沈亞之 (?), 段成式 (boy, 長興坊); 白居易 (to autumn); 元稹 (to spring); 柳宗元 & 劉禹錫 (spring only); 李賀 gone (d. 816/817). 郭氏 (憲宗's consort, granddaughter of 郭子儀). Eunuch power: 神策 中尉 (吐突承璀 was out of favour 810–?, ?).
- Season of the assassination: high summer (sunrise ~05:00, 五更 ~03:30–04:30), short nights, hot dusty days, sudden thunderstorms; trees in full leaf (the assassin hid in tree shade — 槐 by the ward wall).

---

## 9. ANACHRONISM WATCHLIST

### 9.1 Furniture and posture
- 815 = **floor/platform culture in transition**. People sit cross-legged or kneel on **床/榻** (low platforms, often with screens 屏風 behind and curtains 帳), mats 席, cushions 茵, arm-rests 憑几/隱囊; low tables 案/几, low food trays. Beds = curtained platforms.
- **胡床** (folding X-stool) common outdoors, for travel, hunting, generals. **繩床** (rope-seat chair with back) used by monks (meditation chairs). High chairs (倚子/椅子) and high tables appear in the 8th–9th c. (高元珪墓 756 mural of a man on a chair; 《宮樂圖》 late Tang shows women at a high table on 月牙凳) — so: **a few chairs in temples and rich houses OK, but no chair-and-table interiors as the norm.** No 太師椅, no Ming hardwood furniture, no 八仙桌, no 炕 (N China heated bed: mostly later; avoid).
- Eating: individual trays/low tables; chopsticks (箸) AND spoons (匕) both used; communal high-table banquets are a late-Tang novelty (OK in a few rich houses).

### 9.2 Architecture — do NOT use
- Ming/Qing: 硬山 gables, steep roofs, sharply upturned corners (Southern style), rows of ridge beasts (仙人走獸), 鴟吻 with dragon mouth swallowing the ridge, yellow-glazed tiles everywhere, elaborate 彩畫 (和璽/旋子), lattice windows/doors (格扇 with patterns), 牌樓/牌坊, 四合院 Beijing type with 倒座/垂花門, grey brick house walls, round moon gates (rare/later), red lanterns hanging in rows, 照壁 as a standard element (screen walls existed — 蕭牆 — keep rare), stone lions everywhere (some at tombs/palaces), 華表 street posts (?), glass windows.
- Use: earth walls, white plaster, red timber, few big brackets, flat grey roofs, 鴟尾, 直欞窗, bamboo blinds, plank doors with nails.

### 9.3 Dress & body
- No Qing queue/shaved forehead, no 馬褂/旗袍/長衫 with frogs, no Ming 補子 (rank badges) or 烏紗帽 with rigid wings, no 道袍/圓領 with Ming cuts, no 鳳冠霞帔, no **foot-binding** (Song+), no 漢服 'hanfu-movement' cross-collar flowing robes as everyday male wear (Tang men wore round-collar robes).
- No visible tattoo rarity: actually Tang toughs **were tattooed** (酉陽雜俎 卷8 黥: poems and pictures on arms) — keep.

### 9.4 Music & sound
- Tang instruments: **琵琶** (held near-horizontal, played with a large plectrum 撥), 五弦琵琶, 箜篌 (harps), 箏, 琴 (zither, scholars), 篳篥 (double-reed pipe — the "oboe" sound), 橫笛, 簫 (vertical), 笙, 方響 (metal slabs), 拍板, **羯鼓**, 腰鼓, bells/chimes in temples. 奚琴 (bowed with a bamboo stick) is late Tang and rare.
- **No 二胡 (erhu), no 嗩吶 (suona, Ming), no 京劇 / gong-and-cymbal opera percussion, no 揚琴 (Qing).** Gongs: 鉦 at market closing is OK; big 'gong crash' clichés are not.
- City sounds: drums (街鼓), temple bells (鐘) and 磬, criers, hooves, ox-cart wheels, 胡 music from wine-houses.

### 9.5 Food & drink (OK)
- Staples: **粟 (millet), 麥 (wheat — 餅 everything), 稻 (rice, less), 黍, 豆**. 
- Breads/doughs: **胡餅** (sesame flatbread baked in clay ovens — 輔興坊 famous), **蒸餅** (steamed bun), **湯餅 / 餺飥** (noodle-dough soup pieces), 冷淘 (cold noodles), **畢羅/饆饠** (filled pastry or pilaf — 長興坊 畢羅店), 餛飩, 油餅, 粽 (5/5), 寒具 (fried twists, 寒食).
- Meat: **mutton/lamb (most prized)**, pork, chicken, goose, fish incl. **膾** (raw sliced fish), venison; beef restricted (ploughing oxen; slaughter forbidden in principle).
- Dairy: 酪, 酥, 醍醐 (Central Asian influence).
- Vegetables: 葵 (mallow, the main leaf veg), 韭, 蔥, 蒜, 蘿蔔/蘆菔, 蔓菁, 菘 (Chinese cabbage), 茄子, 胡瓜 (cucumber), 冬瓜, 波稜 (spinach, arrived 647), 竹筍, 芋, 蓮藕, mushrooms.
- Fruit: 桃, 杏, 李, 梨, 棗, 柿, 石榴, 葡萄, 櫻桃 (cherry feast after 進士 results), 林檎, 柑橘 (imported), **荔枝** (imported for the rich), 胡桃.
- Flavours: salt, 醬, 豉, 醋, 花椒, 薑, 茱萸, **胡椒 (black pepper — imported, expensive)**, 蓽撥, honey, cane sugar (石蜜/砂糖, rare), 酥.
- Drinks: grain **酒** (fermented, low-strength, often cloudy 濁酒 or filtered 清酒; served warm; famous: 郎官清, 蝦蟆陵 酒 in 常樂坊 ?), 葡萄酒, 三勒漿 (Persian fruit drink), **tea = 煎茶**: cake/brick tea roasted, ground, **boiled in a 鍑 with salt**, froth admired (陸羽《茶經》, c.780); 茶肆 existed (永昌坊). No loose-leaf steeping in teapots, no gongfu sets.
- Do NOT show: **chili, maize, potato, sweet potato, peanuts, tomato, pumpkin(?), tobacco, sunflower** (New World); **西瓜 (watermelon, 10th c.+)**; distilled spirits 白酒 (likely later; avoid); 豆腐 (attested only from Song — avoid or make rare); stir-fry woks as the main cooking (use boiling, steaming, roasting, griddles, clay ovens); fortune cookies (obviously).

### 9.6 Material culture
- Ceramics: **越窯 青瓷** (green celadon, south), **邢窯 白瓷** (white, north) — "南青北白"; **長沙窯** (underglaze brown/green painted wares, poems on jugs — 9th c., cheap, everywhere); 鞏縣 white/三彩 (三彩 mostly 8th c. tomb goods; some in use); 秘色瓷 is late 9th c. elite. **No blue-and-white (青花) as normal ware** (rare Tang 鞏縣 blue — avoid), no Ming 五彩.
- Metal: silver vessels (Persian-style, rich), bronze mirrors (octagonal/lobed, 海獸葡萄紋), lacquer.
- Lighting: **oil lamps** (vegetable oil — 麻油/荏油 — in ceramic/bronze dishes on stands 燈檠), **candles (蠟燭, beeswax) for the rich** and palaces, torches (炬) for night riding, paper/silk lanterns (燈籠) (?), street darkness otherwise — the avenues are pitch black at night except moonlight and patrol torches. Up 上元 only: lamp-wheels 燈輪 and lantern trees.
- Writing: manuscript **scrolls (卷軸)**, brush and ink; paper common; **woodblock printing exists but rare** (calendars, Buddhist charms, 金剛經 868 is later); no printed books in shops as a norm; folded sutras (經摺) emerging.
- Money: coins + silk; **no paper money** (飛錢 = drafts, not currency).
- Games: 圍棋, 雙陸 (backgammon-type), 樗蒲 (dice), 葉子戲 (card-like, late Tang ?), 打馬毬 (polo — very popular, fields in palaces and some rich houses), 蹴鞠, 鬥雞, 拔河. No mahjong (Qing).
- Weapons: 橫刀 (straight sword) not curved dao/sabres (Ming 柳葉刀/苗刀/繡春刀 wrong); 劍 mainly ceremonial; bows composite; crossbows military; no firearms, no gunpowder weapons (gunpowder formula experiments only).
- Animals: horses, donkeys, mules, camels, oxen, sheep, pigs, chickens, dogs (house guards), cats (rare-ish pets), falcons (鷹, hunting; DESIGN epigraph 飛鷹).

### 9.7 Outskirts and agriculture (visible from walls/heights)
- S rows of the city and around: fields of **粟, 麥** (winter wheat green in spring, harvested 5–6th month), 豆, 麻 (hemp), 蔬圃, orchards, 桑 (mulberry), 苜蓿 (alfalfa for horses), some 稻 paddies along the 灃/滈/潏 rivers (?), vineyards (?). 
- 815-06 (July): wheat just harvested — stubble fields, threshing floors; millet growing.
- Beyond walls: 禁苑 (imperial park, N, walled, with 渭水 beyond), tombs on 少陵原/鳳棲原 (S/SE), villas (別業) in 終南山 foothills (終南山 visible to the S, ~30 km), 灞橋 (E, willows, farewells), 渭橋 (N/NW — DESIGN epigraph).

### 9.8 Language & names
- Place names written in traditional characters; ward names on gate plaques (?). People address: 郎 / 娘子, 某官 by office (武相公 = minister 武元衡), 十郎/二十二郎 style numbering (排行 among cousins — very Tang, e.g. 元九 = 元稹, 白二十二 = 白居易, 韓十八 = 韓愈 (?)).

---


## SOURCES (actually consulted this session) and open questions
- Read on zh.wikisource: 徐松《唐兩京城坊考》卷2 (街東 E1–E2), 卷3 (E3–E5, 東市), 卷4 (街西, 西市); 宋敏求《長安志》(四庫本) 卷7, 卷8; 《資治通鑑》卷239; 《新唐書》卷49上 百官志 (金吾衛); 《唐律疏議》卷8 衛禁, 卷16 擅興, 卷18 賊盜, 卷26 雜律; 《唐會要》(四庫本) 卷31 (輿服), 卷86 (街巷, 市).
- en Wikipedia: Chang'an; Giant Wild Goose Pagoda; Wu Yuanheng. Baidu Baike 外郭城 (summary of 考古 figures). Press: bjnews 2023-02-21 (朱雀大街 127 m, 五橋, 安仁坊), huanqiu 2024 (布政坊 十字街 10.8–11.1 m), 163.com 2024 (朱雀 127 m).
- From memory (flagged "from memory"): 考古1963 street/ward figures, 明德門 dimensions, 大明宮/興慶宮/市 sizes, 唐六典 市署, 新唐書 車服志 上元元年 colours, 通典 坊正, 白居易 poems, 兩京新記 上元, 新唐書 食貨志 飛錢, 佛光寺/南禪寺 numbers (梁思成).
- Open questions worth checking in the original 考古1963 / 《隋唐長安城遺址》 report: individual street widths (which N–S streets are 134 m vs ~60 m), exact column widths per column, ward-wall height, the street dividing rows 8/9 (延平–延興 street position), 曲江池/芙蓉園 outline, 東市/西市 inner street widths, 大雁塔 storeys in 815, 裴度's residence in 815 (永樂 vs 通化).

## APPENDIX A — machine-readable city plan (APPROXIMATE, see _note)

```json
{
 "_note":"APPROXIMATE reconstruction. Totals match measured outer 9721 x 8651.7 m [考古1963]; palace/imperial city exact [考古1963]; individual column/row/street widths are fitted to measured ranges and 長安志 步 ratios, not individually measured. x east from W wall, z south from N wall, metres.",
 "outer":{"w":9721.0,"h":8651.7,"wall_base_thickness":"9-12","wall_height":5.3},
 "cols":[
  {"id":"W5","x0":25.0,"x1":1100.0},
  {"id":"W4","x0":1167.2,"x1":2242.2},
  {"id":"W3","x0":2309.5,"x1":3384.5},
  {"id":"W2","x0":3451.8,"x1":4116.8},
  {"id":"W1","x0":4250.8,"x1":4785.8},
  {"id":"E1","x0":4935.8,"x1":5470.8},
  {"id":"E2","x0":5604.8,"x1":6269.8},
  {"id":"E3","x0":6337.0,"x1":7412.0},
  {"id":"E4","x0":7479.2,"x1":8554.2},
  {"id":"E5","x0":8621.5,"x1":9696.5}
 ],
 "rows":[
  {"row":1,"z0":25.0,"z1":685.0},
  {"row":2,"z0":785.0,"z1":1445.0},
  {"row":3,"z0":1560.0,"z1":2398.0},
  {"row":4,"z0":2498.0,"z1":3336.0},
  {"row":5,"z0":3456.0,"z1":3989.4},
  {"row":6,"z0":4034.4,"z1":4567.8},
  {"row":7,"z0":4612.8,"z1":5146.2},
  {"row":8,"z0":5191.2,"z1":5724.6},
  {"row":9,"z0":5779.6,"z1":6313.0},
  {"row":10,"z0":6358.0,"z1":6891.4},
  {"row":11,"z0":6936.4,"z1":7469.8},
  {"row":12,"z0":7514.8,"z1":8048.2},
  {"row":13,"z0":8093.2,"z1":8626.6}
 ],
 "streets":[
  {"name":"西順城街","axis":"N-S","x0":0,"x1":25.0,"width":25.0},
  {"name":"皇城西第三街","axis":"N-S","x0":1100.0,"x1":1167.2,"width":67.25},
  {"name":"皇城西第二街","axis":"N-S","x0":2242.2,"x1":2309.5,"width":67.25},
  {"name":"皇城西第一街","axis":"N-S","x0":3384.5,"x1":3451.8,"width":67.25},
  {"name":"安化門街(含光門街)","axis":"N-S","x0":4116.8,"x1":4250.8,"width":134.0},
  {"name":"朱雀大街","axis":"N-S","x0":4785.8,"x1":4935.8,"width":150.0},
  {"name":"啟夏門街(安上門街)","axis":"N-S","x0":5470.8,"x1":5604.8,"width":134.0},
  {"name":"皇城東第一街","axis":"N-S","x0":6269.8,"x1":6337.0,"width":67.25},
  {"name":"皇城東第二街","axis":"N-S","x0":7412.0,"x1":7479.2,"width":67.25},
  {"name":"皇城東第三街","axis":"N-S","x0":8554.2,"x1":8621.5,"width":67.25},
  {"name":"東順城街","axis":"N-S","x0":9696.5,"x1":9721.5,"width":25.0},
  {"name":"北順城街(outer cols only)","axis":"E-W","z0":0,"z1":25,"width":25},
  {"name":"r1/r2街","axis":"E-W","z0":685.0,"z1":785.0,"width":100},
  {"name":"通化門—開遠門街","axis":"E-W","z0":1445.0,"z1":1560.0,"width":115},
  {"name":"r3/r4街","axis":"E-W","z0":2398.0,"z1":2498.0,"width":100},
  {"name":"皇城南第一橫街=春明門—金光門街","axis":"E-W","z0":3336.0,"z1":3456.0,"width":120},
  {"name":"r5/r6街","axis":"E-W","z0":3989.4,"z1":4034.4,"width":45.0},
  {"name":"r6/r7街","axis":"E-W","z0":4567.8,"z1":4612.8,"width":45.0},
  {"name":"r7/r8街","axis":"E-W","z0":5146.2,"z1":5191.2,"width":45.0},
  {"name":"延興門—延平門街 (row8/9? uncertain)","axis":"E-W","z0":5724.6,"z1":5779.6,"width":55.0},
  {"name":"r9/r10街","axis":"E-W","z0":6313.0,"z1":6358.0,"width":45.0},
  {"name":"r10/r11街","axis":"E-W","z0":6891.4,"z1":6936.4,"width":45.0},
  {"name":"r11/r12街","axis":"E-W","z0":7469.8,"z1":7514.8,"width":45.0},
  {"name":"r12/r13街","axis":"E-W","z0":8048.2,"z1":8093.2,"width":45.0},
  {"name":"南順城街","axis":"E-W","z0":8626.6,"z1":8651.6,"width":25}
 ],
 "wards":[
  {"name":"善和(城坊考作光祿?)","col":"W1","row":5,"notes":"E-W street only, gates E+W"},
  {"name":"通化(城坊考缺名?)","col":"W1","row":6,"notes":"裴度 attacked here 815 (舊唐書); E-W street only, gates E+W"},
  {"name":"豐樂","col":"W1","row":7,"notes":"E-W street only, gates E+W"},
  {"name":"安業","col":"W1","row":8,"notes":"E-W street only, gates E+W"},
  {"name":"崇業","col":"W1","row":9,"notes":"玄都觀; 九五 ridge; E-W street only, gates E+W"},
  {"name":"永達","col":"W1","row":10,"notes":"E-W street only, gates E+W"},
  {"name":"道德","col":"W1","row":11,"notes":"E-W street only, gates E+W"},
  {"name":"光行","col":"W1","row":12,"notes":"E-W street only, gates E+W"},
  {"name":"延祚","col":"W1","row":13,"notes":"E-W street only, gates E+W"},
  {"name":"太平","col":"W2","row":5,"notes":"E-W street only, gates E+W"},
  {"name":"通義","col":"W2","row":6,"notes":"E-W street only, gates E+W"},
  {"name":"興化","col":"W2","row":7,"notes":"E-W street only, gates E+W"},
  {"name":"崇德","col":"W2","row":8,"notes":"E-W street only, gates E+W"},
  {"name":"懷貞","col":"W2","row":9,"notes":"E-W street only, gates E+W"},
  {"name":"宣義","col":"W2","row":10,"notes":"E-W street only, gates E+W"},
  {"name":"豐安","col":"W2","row":11,"notes":"E-W street only, gates E+W"},
  {"name":"昌明","col":"W2","row":12,"notes":"E-W street only, gates E+W"},
  {"name":"安樂","col":"W2","row":13,"notes":"E-W street only, gates E+W"},
  {"name":"修德","col":"W3","row":1,"notes":"右神策軍營; 十字街, 4 gates"},
  {"name":"輔興","col":"W3","row":2,"notes":"十字街, 4 gates"},
  {"name":"頒政","col":"W3","row":3,"notes":"十字街, 4 gates"},
  {"name":"布政","col":"W3","row":4,"notes":"祆祠; 十字街, 4 gates"},
  {"name":"延壽","col":"W3","row":5,"notes":"十字街, 4 gates"},
  {"name":"光德","col":"W3","row":6,"notes":"京兆府廨; 十字街, 4 gates"},
  {"name":"延康","col":"W3","row":7,"notes":"十字街, 4 gates"},
  {"name":"崇賢","col":"W3","row":8,"notes":"十字街, 4 gates"},
  {"name":"延福","col":"W3","row":9,"notes":"十字街, 4 gates"},
  {"name":"永安","col":"W3","row":10,"notes":"十字街, 4 gates"},
  {"name":"敦義","col":"W3","row":11,"notes":"十字街, 4 gates"},
  {"name":"大通","col":"W3","row":12,"notes":"十字街, 4 gates"},
  {"name":"大安","col":"W3","row":13,"notes":"十字街, 4 gates"},
  {"name":"安定","col":"W4","row":1,"notes":"十字街, 4 gates"},
  {"name":"休祥","col":"W4","row":2,"notes":"十字街, 4 gates"},
  {"name":"金城","col":"W4","row":3,"notes":"十字街, 4 gates"},
  {"name":"醴泉","col":"W4","row":4,"notes":"波斯寺, 祆祠?; 十字街, 4 gates"},
  {"name":"西市","col":"W4","row":5,"notes":"market rows 5-6"},
  {"name":"西市","col":"W4","row":6,"notes":"market rows 5-6"},
  {"name":"懷遠","col":"W4","row":7,"notes":"十字街, 4 gates"},
  {"name":"長壽","col":"W4","row":8,"notes":"長安縣廨; 十字街, 4 gates"},
  {"name":"嘉會","col":"W4","row":9,"notes":"十字街, 4 gates"},
  {"name":"永平","col":"W4","row":10,"notes":"十字街, 4 gates"},
  {"name":"通軌","col":"W4","row":11,"notes":"十字街, 4 gates"},
  {"name":"歸義","col":"W4","row":12,"notes":"十字街, 4 gates"},
  {"name":"昭行","col":"W4","row":13,"notes":"十字街, 4 gates"},
  {"name":"修真","col":"W5","row":1,"notes":"十字街, 4 gates"},
  {"name":"普寧","col":"W5","row":2,"notes":"祆祠; 十字街, 4 gates"},
  {"name":"義寧","col":"W5","row":3,"notes":"波斯胡寺(大秦寺); 十字街, 4 gates"},
  {"name":"居德","col":"W5","row":4,"notes":"十字街, 4 gates"},
  {"name":"群賢","col":"W5","row":5,"notes":"十字街, 4 gates"},
  {"name":"懷德","col":"W5","row":6,"notes":"十字街, 4 gates"},
  {"name":"崇化","col":"W5","row":7,"notes":"十字街, 4 gates"},
  {"name":"豐邑","col":"W5","row":8,"notes":"十字街, 4 gates"},
  {"name":"待賢","col":"W5","row":9,"notes":"十字街, 4 gates"},
  {"name":"永和","col":"W5","row":10,"notes":"十字街, 4 gates"},
  {"name":"常安","col":"W5","row":11,"notes":"十字街, 4 gates"},
  {"name":"和平","col":"W5","row":12,"notes":"十字街, 4 gates"},
  {"name":"永陽","col":"W5","row":13,"notes":"十字街, 4 gates"},
  {"name":"興道","col":"E1","row":5,"notes":"E-W street only, gates E+W"},
  {"name":"開化","col":"E1","row":6,"notes":"薦福寺; E-W street only, gates E+W"},
  {"name":"安仁","col":"E1","row":7,"notes":"薦福寺塔院 小雁塔; E-W street only, gates E+W"},
  {"name":"光福","col":"E1","row":8,"notes":"E-W street only, gates E+W"},
  {"name":"靖善","col":"E1","row":9,"notes":"大興善寺 whole ward; 九五 ridge; E-W street only, gates E+W"},
  {"name":"蘭陵","col":"E1","row":10,"notes":"E-W street only, gates E+W"},
  {"name":"開明","col":"E1","row":11,"notes":"E-W street only, gates E+W"},
  {"name":"保寧","col":"E1","row":12,"notes":"E-W street only, gates E+W"},
  {"name":"安義","col":"E1","row":13,"notes":"E-W street only, gates E+W"},
  {"name":"務本","col":"E2","row":5,"notes":"國子監 west half; 鬼市 at W gate; E-W street only, gates E+W"},
  {"name":"崇義","col":"E2","row":6,"notes":"興元/鄜坊/易定 進奏院; E-W street only, gates E+W"},
  {"name":"長興","col":"E2","row":7,"notes":"禮賓院(814); 畢羅店; 鎮州(成德/王承宗)進奏院; E-W street only, gates E+W"},
  {"name":"永樂","col":"E2","row":8,"notes":"裴度宅 (城坊考), on 第五岡; E-W street only, gates E+W"},
  {"name":"靖安","col":"E2","row":9,"notes":"武元衡宅, 韓愈宅; 815-06-03 assassination at E gate; E-W street only, gates E+W"},
  {"name":"安善","col":"E2","row":10,"notes":"E-W street only, gates E+W"},
  {"name":"大業","col":"E2","row":11,"notes":"E-W street only, gates E+W"},
  {"name":"昌樂","col":"E2","row":12,"notes":"E-W street only, gates E+W"},
  {"name":"安德","col":"E2","row":13,"notes":"E-W street only, gates E+W"},
  {"name":"翊善|光宅","col":"E3","row":1,"notes":"十字街, 4 gates"},
  {"name":"永昌|來庭","col":"E3","row":2,"notes":"十字街, 4 gates"},
  {"name":"永興","col":"E3","row":3,"notes":"十字街, 4 gates"},
  {"name":"崇仁","col":"E3","row":4,"notes":"23 進奏院 incl 淄青; 晝夜喧呼 燈火不絕; near 尚書省選院; 十字街, 4 gates"},
  {"name":"平康","col":"E3","row":5,"notes":"北里 三曲 (courtesans, NE quarter); 12 進奏院; 菩提寺; 十字街, 4 gates"},
  {"name":"宣陽","col":"E3","row":6,"notes":"萬年縣廨 SE corner; 4 進奏院; 十字街, 4 gates"},
  {"name":"親仁","col":"E3","row":7,"notes":"郭子儀宅; 十字街, 4 gates"},
  {"name":"永寧","col":"E3","row":8,"notes":"十字街, 4 gates"},
  {"name":"永崇","col":"E3","row":9,"notes":"十字街, 4 gates"},
  {"name":"昭國","col":"E3","row":10,"notes":"白居易宅 (815); 十字街, 4 gates"},
  {"name":"晉昌","col":"E3","row":11,"notes":"慈恩寺 大雁塔 (E half); 十字街, 4 gates"},
  {"name":"通善","col":"E3","row":12,"notes":"十字街, 4 gates"},
  {"name":"通濟","col":"E3","row":13,"notes":"十字街, 4 gates"},
  {"name":"長樂(延政)","col":"E4","row":1,"notes":"十字街, 4 gates"},
  {"name":"大寧","col":"E4","row":2,"notes":"十字街, 4 gates"},
  {"name":"安興","col":"E4","row":3,"notes":"十字街, 4 gates"},
  {"name":"勝業","col":"E4","row":4,"notes":"十字街, 4 gates"},
  {"name":"東市","col":"E4","row":5,"notes":"market rows 5-6"},
  {"name":"東市","col":"E4","row":6,"notes":"market rows 5-6"},
  {"name":"安邑","col":"E4","row":7,"notes":"十字街, 4 gates"},
  {"name":"宣平","col":"E4","row":8,"notes":"十字街, 4 gates"},
  {"name":"昇平","col":"E4","row":9,"notes":"樂遊原 NE corner; 十字街, 4 gates"},
  {"name":"修行","col":"E4","row":10,"notes":"十字街, 4 gates"},
  {"name":"修政","col":"E4","row":11,"notes":"十字街, 4 gates"},
  {"name":"青龍","col":"E4","row":12,"notes":"十字街, 4 gates"},
  {"name":"曲池","col":"E4","row":13,"notes":"十字街, 4 gates"},
  {"name":"十六宅(入苑坊)","col":"E5","row":1,"notes":"princes compound; 十字街, 4 gates"},
  {"name":"興寧","col":"E5","row":2,"notes":"十字街, 4 gates"},
  {"name":"永嘉","col":"E5","row":3,"notes":"十字街, 4 gates"},
  {"name":"興慶(興慶宮)","col":"E5","row":4,"notes":"興慶宮 (+S half of 永嘉); 十字街, 4 gates"},
  {"name":"道政","col":"E5","row":5,"notes":"東平(李師古)進奏院; 十字街, 4 gates"},
  {"name":"常樂","col":"E5","row":6,"notes":"十字街, 4 gates"},
  {"name":"靖恭","col":"E5","row":7,"notes":"祆祠; 十字街, 4 gates"},
  {"name":"新昌","col":"E5","row":8,"notes":"青龍寺 on 樂遊原; 十字街, 4 gates"},
  {"name":"昇道","col":"E5","row":9,"notes":"十字街, 4 gates"},
  {"name":"立政","col":"E5","row":10,"notes":"十字街, 4 gates"},
  {"name":"敦化","col":"E5","row":11,"notes":"十字街, 4 gates"},
  {"name":"曲江池","col":"E5","row":12,"notes":"十字街, 4 gates"},
  {"name":"曲江池/芙蓉園","col":"E5","row":13,"notes":"十字街, 4 gates"}
 ],
 "palace":{"name":"宮城","x0":3450.3,"x1":6270.6,"z0":0,"z1":1492.1,"parts_W_to_E":[{"掖庭宮":702.5},{"太極宮":1285.0},{"東宮":832.8}]},
 "imperial":{"name":"皇城","x0":3450.3,"x1":6270.6,"z0":1492.1,"z1":3335.7,"note":"no north wall; 220 m 橫街 between 宮城 and 皇城 counted inside (uncertain); 3 south gates 含光/朱雀/安上"},
 "daming":{"name":"大明宮","outside_north_wall":true,"south_wall":1674,"west_wall":2256,"north_wall":1135,"east_wall":2614,"approx_x0":6040,"approx_x1":7714,"z0":-2256,"z1":0,"note":"trapezoid narrowing north; 丹鳳門 opposite E3 column (丹鳳門街 splits 翊善/光宅)"},
 "xingqing":{"name":"興慶宮","w":1080,"h":1250,"col":"E5","approx_z0":2086,"approx_z1":3336},
 "markets":[
  {"name":"東市","col":"E4","rows":[5,6],"w":924,"h":1000,"note":"centred in slot; h measured \"1000+\""},
  {"name":"西市","col":"W4","rows":[5,6],"w":927,"h":1031}
 ],
 "qujiang":{"note":"曲江池 in SE corner, E5 rows 12-13 + beyond; pond ~0.7 km2 (uncertain); 芙蓉園 south/east of it, partly outside wall"},
 "slice_recommended":{"core":[["崇仁","E3",4],["平康","E3",5],["宣陽","E3",6],["親仁","E3",7],["務本","E2",5],["崇義","E2",6],["長興","E2",7],["永樂","E2",8],["靖安","E2",9],["東市","E4","5-6"]],"optional":[["勝業","E4",4],["道政","E5",5],["永寧","E3",8],["永崇","E3",9],["昭國","E3",10],["昇平","E4",9]],"spine_street":"皇城東第一街 (N–S between E2 and E3)"}
}
```
