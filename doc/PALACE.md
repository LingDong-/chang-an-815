# PALACE — the imperial palaces of Chang'an in 815 (元和十年)

Code: `engine/palace.js` (palace kit `PALK`, plan builders, the `PALACE` hooks); court archetypes appended to `engine/people.js`.
Tools: `tool/palace_zcheck.js [units] --n 8` (z-fight audit of the heaviest chunks), `tool/palace_stat.js` (verts/ms per chunk, LOD1, far), `tool/palace_bake.js` + `tool/palace.html` (`tool/palace_scene.js`): a fast Node bake of the palaces around a camera, rendered with `PAGE=tool/palace.html node tool/arch_shot.js "scene=palace&pb=<tag>&hour=7&cx=..&cz=.."`.

Every fact carries a source tag. **(?)** marks things that are uncertain or come from memory. *Choice* marks our own reconstruction.

## 0. Sources

| tag | what |
|---|---|
| [長安志 6/7/9] | 宋敏求《長安志》 卷6 東內大明宮, 卷7 皇城, 卷9 興慶宮 (四庫本, wikisource) |
| [城坊考 1] | 徐松《唐兩京城坊考》 卷1 (宮城, 皇城, 大明宮) |
| [唐六典 7] | 《唐六典》 卷7 工部 (含元殿 note: 南去丹鳳門四百餘步, 東西廣五百步; 龍尾道 委蛇屈曲凡七轉) |
| [唐會要 24/57] | 卷24 朝會, 卷57 翰林院 |
| [舊唐書 12/15/45] | 德宗紀 (梨園 abolished), 憲宗紀, 輿服志 |
| [新唐書 23上/24] | 儀衛志 (常朝 ritual), 車服志 (colours, 魚袋, 笏) |
| [通鑑 239] | 資治通鑑 卷239 (元和九–十年) |
| [考古 1959–61] | 馬得志《唐長安大明宮》 (考古所 1959) and early reports: 含元殿 殿基 75.9 × 41.3, 麟德殿 |
| [含元殿報告] | CASS 1995–96 含元殿 re-excavation and the UNESCO / 中國社科院考古所 restoration study (傅熹年 / 楊鴻勛 lineage of reconstructions) |
| [何歲利 2019] | 何歲利《唐大明宮"三朝五門"布局的考古學觀察》, 考古 2019-5: measured axis distances and inner walls |
| [華商網 2021] | interview with excavation leader 龔國強: 63 years of 大明宮 archaeology (walls, 丹鳳門, 中書省, 太液池, 三清殿) |
| [奈文研] | 奈良文化財研究所 / CASS joint 太液池 excavation 2001–05 (search snippets: west pool 484 × 310 m, 蓬萊山 mound 5–8 m) |
| [Hou 2012] | Hou et al., Frontiers of Architectural Research 2012 (含元殿 / 麟德殿 protection) |
| [zh.wiki] | zh.wikipedia: 大明宮, 含元殿, 丹鳳門, 麟德殿, 興慶宮, 太極宮, 紫宸殿 |
| [REF] | REF_CHANGAN.md (city plan, 考古 1963 measurements) |

## 1. What is where (units)

The lead streams each **unit** like a ward: ward-sized walkable chunks, one LOD1 group per unit, `PALACE.far(L, unit, level)` beyond 620 m. Units tile each complex's rectangle (`PALACE.COMPLEX`). Parts are assigned to units by their centre.

| complex | units (short names) | rect |
|---|---|---|
| 大明宮 | 西內朝 · 含元殿 · 東內苑 (S row z −4326…−5100); 翰林院 · 宣政殿 (−5100…−5650); 清思殿 (E strip −5100…−6000); 麟德殿 · 太液池 (N) | PLAN.daming |
| 太極宮 (宮城) | 掖庭宮 · 太極殿西 · 太極殿 · 東宮 (S half); 掖庭北 · 西海池 · 凌煙閣 · 東宮北 (N half) | PLAN.palace |
| 皇城 | 太社 · 朱雀門 · 太廟 (S row); 皇城西 · 皇城 · 皇城東; 安福門 · 承天門 · 延喜門 (N row) | PLAN.imperial |
| 興慶宮 | 興慶 (N half, replaces the PLANW ward 興慶) · 龍池 (S half) | E5 col, PLAN.xingqing |

Named places (`lay.lots`, type `palace`: map labels / `warp`): 含元殿, 翔鸞閣, 棲鳳閣, 丹鳳門, 左右金吾仗院, 毬場, 宣政殿, 中書省, 門下省, 延英殿, 清思殿, 紫宸殿, 蓬萊殿, 含涼殿, 太液池, 麟德殿, 三清殿, 翰林院, 少陽院; 承天門, 太極殿, 兩儀殿, 甘露殿, 凌煙閣, 掖庭宮, 東宮, 嘉德殿; 太廟, 太社, 尚書省, 中書外省, 門下外省; 興慶殿, 南薰殿, 大同殿, 勤政務本樓, 花萼相輝樓, 沉香亭, 龍池.
Walkways: `lay.streets` of kind `palace` (WARD.nav builds the graph; 1 component with the city, `tool/nav_check.js`).

City gates (`link: true`): 丹鳳門, 建福門, 望仙門 (大明宮 S wall = the city's N wall); 承天門 and the other 宮城 S gates (onto the 皇城 橫街); 含光門, 朱雀門, 安上門, 延喜門, 景風門, 安福門, 順義門 (皇城); 興慶門, 金明門, 通陽門 (興慶宮).

## 2. 大明宮 (東內): the court of 815

### 2.1 Walls and gates
- **Plan**: S wall 1674 m, W 2256, N 1135. The E wall runs 1260 m S from the NE corner, jogs 304 m E, then runs 1050 m S. The plan is a trapezoid narrowing to the N. Perimeter 7.4–7.6 km [華商網 2021; zh.wiki].
  - *Choice*: the E jog is drawn as one diagonal, as in the old far model.
- **Wall construction**: rammed earth, 10.5 m thick above ground (S 9.8). Brick facing only at gates and corners [華商網 2021].
  - *Built*: 10.5 m battered rammed-earth wall, 9.5 m high (height (?)), with a tiled coping.
- **夾城**: N 160 m and E/W 55 m outside the walls [kemingbaike via 考古所]. *Not built.*
- **Gates**: 丹鳳門 has **5 passages, each 8.5 m**, with 3.8 m piers. The base is 74.5 × 33 m [zh.wiki; 何歲利 2019]. 建福門 and 望仙門 stand **430 m** W and E of 丹鳳門 [何歲利 2019].
  - Officials enter by 建福門 / 望仙門. The 待漏院 (where they wait before dawn) stands outside them [長安志 6].
  - Other gates: 右銀臺門 and 九仙門 (W, with 翰林門 between), 左銀臺門 (E), 玄武門 (N) [長安志 6].
  - *Built*: 丹鳳門 as a 74.5 × 33 gate tower with 5 × 8.5 m passages and an 11-bay tower. Other gates have 1 passage (3 at 玄武門).
  - 列戟 racks (rows of halberds) stand inside the S gates. The 戟 rack at palace gates is a Tang institution; the exact placement is a *choice*.
- **Inner walls**: three E–W walls divide 外朝 / 中朝 / 內廷 [何歲利 2019; zh.wiki]:
  - 1st: 120 m S of the 含元殿 front. *Not built.*
  - 2nd: 145 m further N.
  - 3rd: on the 宣政 line.
  - *Built*: wall A at z −5100 (宣政門 line) and wall B at −5330 (紫宸門 line). Each has side gates at axis ±200 m and near both outer walls.

### 2.2 含元殿 (外朝; 元日 / 冬至 大朝會)
- **Distance**: 610 m N of 丹鳳門 [何歲利 2019]. 唐六典 gives 四百餘步. *Built*: hall centre at z −4936.
- **Platform**: three tiers. The top tier is 76.7 × 42.6 m [含元殿報告] (75.9 × 41.3 in 1959).
  - The floor stands **14.94 m** above the plain to the S. The lower tiers sit on the rising 龍首原 [含元殿報告].
  - *Built*: the walkable ground is flat, so the height comes from the tiers themselves:
    - tier 0: 200 × 110 m, 5.5 m high;
    - tier 1: 130 × 76 m, 4.5 m;
    - tier 2: 78 × 44 m, 3 m.
  - The hall floor is at **+13 m**. Tiers are brick-faced with a stone base course and coping, 青石 balustrades, and a 螭首 every ~5 m (王仁裕: 每間引出一石螭頭 [含元殿報告]).
- **Hall**: body 11 × 4 bays, with the 副階 13 × 6 [含元殿報告; zh.wiki].
  - Bays 5.30 m; 副階 4.41 m deep; overall 67.0 × 28.2 m.
  - Roof 四阿重屋 = double-eave 廡殿 [含元殿報告].
  - *Built*: `PALK.dian(fujie)`: bays [4.4, 11 × 5.3 (centre 5.5), 4.4] × [4.4, 4 × 4.85, 4.4].
    - Open colonnade ring under a hipped skirt roof (lower eave).
    - Walled core with doors and 直欞 windows, and an inner column grid.
    - Clerestory with the main hip roof.
- **Finish**: white lime plaster with a vermilion skirting, vermilion timber, ochre brackets. 含元殿賦: 惟鐵石丹素，無加飾 [含元殿報告]. *Built*: as described (ochre 丹粉 paint).
- **Tiles**: 青棍瓦 (polished grey-black), with **green 琉璃 trim and 鴟尾 fragments** found at 含元殿 / 丹鳳門 / 麟德殿 [含元殿報告; 華商網].
  - *Built*: blue-grey roofs (`PALK.ROOF`) with green-glazed ridges and 鴟尾 on the great halls.
  - Not yet built: the eave 剪邊. There are **no yellow roofs** (Ming–Qing).
- **龍尾道**: two ramps, one each side of the axis. The 1959 "central ramp" was corrected by the 1995–96 excavation [含元殿報告; 華商網].
  - After 670 they were S-shaped (委蛇屈曲凡七轉 [唐六典 7]), about 8 m wide, running 57–74 m from the tiers to their S ends.
  - *Built*: two straight 8 m ramps at axis ±26 m, 46 m long, up to tier 0. Stone flights lead up tiers 1–2.
  - Not modelled: the switchbacks.
- **翔鸞閣 (E) / 棲鳳閣 (W)**: 三出闕 (triple-stepped gate towers) SE / SW of the hall, joined to it by **飛廊** (elevated corridors) [含元殿報告; 長安志 6].
  - The 飛廊 base is ~7 m wide beside the hall and ~5.5 m from the bell/drum towers to the 闕.
  - **鐘樓 (E) / 鼓樓 (W)** stand on bases of 22.5 × 17 m [含元殿報告; 長安志 6].
  - *Built*:
    - 闕 at axis ±128 m, 108 m S of the hall, with three stepped bases (10 / 8.4 / 6.8 m). The main base carries a walkable two-storey 閣 (`ARCH.lou2`); the lower steps carry small towers.
    - 飛廊 from tier 1 (deck +10 m) E/W to the bell / drum tower bases (22.5 × 17), then S to the 闕.
    - The 闕 centre spacing is *choice* (not found in sources).
- **東西朝堂**: 30 m+ S of the 闕. The later E 朝堂 measured 68 × 16 m, about 13 × 3 bays [何歲利 2019].
  - 肺石 and 登聞鼓 stand by the 朝堂 under the 闕 [長安志 6].
  - *Built*: 13 × 3-bay halls; 肺石 (E) and 登聞鼓 (W). Which side holds which is (?).
- **Other plaza features**:
  - 左右金吾仗院 in front of 含元殿 [長安志 6]. *Built*: office courts at axis ±290 m; the exact plots are *choice*.
  - 御溝 / 下馬橋: a canal across the plaza with slab bridges. *Choice* (?). It is plausible: water channels and culverts were excavated E of 含元殿 [華商網].
  - 毬場 (polo field) in the W of the plaza: polo is attested in the palace, but this location is a *choice*.
  - 東內苑 garden with a pond (龍首池), E: *choice* for the form.

### 2.3 中朝: 宣政殿 (正衙; 朔望 and 常朝)
- **Axis distances** [何歲利 2019]: 含元殿 → 宣政門 170 m; 宣政門 → 宣政殿 130 m; 宣政殿 → 紫宸門 35 m; 紫宸門 → 紫宸殿 60 m.
  - *Built*: 宣政殿 at z −5245, 紫宸殿 at −5440. Our wall B (紫宸門) sits ~85 m N of 宣政殿, more than the measured 35 m, to keep a court in front of 紫宸殿.
- **宣政殿 base**: ≈ 70 × 40 m+ [zh.wiki].
  - *Built*: two tiers (80 × 46 × 2.2 m; 66 × 34 × 1.0 m), and an 11 × 5-bay single-eave 廡殿 with full brackets, an inner column grid and a throne.
- **Flanking gates and offices**:
  - 東/西上閤門 flank the hall.
  - 日華門 (E) leads to **門下省**; 月華門 (W) leads to **中書省** [長安志 6].
  - 弘文館 lies E of 門下省, 史館 beyond.
  - The 中書省 was excavated 2011–14: a walled court with polished black tiles and lotus eave tiles [華商網].
  - *Built*:
    - Corridors E/W of the court with 日華門 / 月華門 gate halls.
    - 中書省 (W) and 門下省 (E) as office courts.
    - Further office courts on both sides: 弘文館 / 史館 / 殿中內省 (unnamed, *choice*).

### 2.4 內廷
- **紫宸殿** (便殿 for 入閤 audiences): 95 m N of 宣政殿 [何歲利]. Its dimensions are unpublished.
  - *Built*: 9 × 5 bays with 副階 (double eave) on a 2.4 m terrace, inside a corridor court with a rear gate. *Choice* (?).
- **延英殿** (延英召對 with the 宰相): 延英門內有延英殿 [長安志 6]. Usually placed W of the 紫宸 court (?). *Built* there as a court.
- **Axis behind 紫宸殿**: 蓬萊殿 → 含涼殿 → 太液池 [長安志 6]. *Built* in that order.
- **太液池** (west pool): 484 × 310 m, ≈ 15 ha, ~200 m N of 紫宸殿 [奈文研; 華商網].
  - The **蓬萊山** island survives as a mound 5–8 m high.
  - A 四百間 迴廊 (gallery of 400 bays) surrounded the pool; a 15-room water pavilion stood on the NW shore.
  - *Built*:
    - Pool 484 × 272 m (rx 242, rz 136), carved 1.6 m (`PALACE.depthAt`), with stone revetment.
    - 蓬萊山 mound 9.4 m high with rocks, pines and an octagonal pavilion.
    - Willows and peaches on the shore, pavilions, a stretch of 迴廊 on the N shore.
    - A small east pool.
- **麟德殿** (banquets, envoys): W of 太液池, near the W wall [zh.wiki; 考古 1959–61].
  - Platform 130.4 × 77.6 m in two tiers, ≈ 2.5 m high.
  - Front, middle and rear halls. The middle hall is two-storey (景雲閣).
  - Front and middle roofs are single-eave 廡殿; the rear is 歇山.
  - 郁儀樓 and 結鄰樓 stand on brick platforms over 7 m high. 東亭 / 西亭 connect to the upper floor by arched 飛橋.
  - *Built*:
    - Two tiers (1.4 + 1.1 m).
    - Front hall: 11 × 4 bays, hip roof.
    - Middle hall: walkable two-storey `ARCH.lou2` (11 × 5) with throne and banquet desks.
    - Rear hall: 11 × 3, 歇山.
    - Two 樓 on 7.2 m bases with 飛橋 toward the middle hall.
    - Two front pavilions.
    - 9 vs. 11 bays is uncertain (?).
- **三清殿** (Daoist): a high platform, more than 10 m (≈ 78.6 × 47.6 × 14 m (?)), in the N / NE. Yellow, green, 三彩 and black glazed tiles were found there [華商網].
  - *Built*: two tiers (8 + 6 m) with a 7 × 5 hall with 副階.
- **翰林院**: 在銀臺門內，麟德殿西廂重廊之後 [唐會要 57]. *Built*: an office court inside 右銀臺門, W of 麟德殿.
- **少陽院** (crown prince 李恒's residence (?)): *built* as a court.
- **清思殿**: built plain. The famous mirror decoration is 敬宗's, ≈ 826, so it is an anachronism in 815 [華商網 / 舊唐書].
- **後宮 courts**: many 殿/院 are recorded (56 殿, 38 門, 8 院 … [kemingbaike]). *Built*: generic residence courts (`YUAN`, style 'gong'). Each has:
  - a wall and a gate hall;
  - a main hall with a plaque if named;
  - an inner corridor court with side halls;
  - attendants' rows along the walls;
  - a rear 寢殿 and corner rooms;
  - trees and paving.

## 3. 宮城: 太極宮 (西內), 掖庭宮, 東宮
- **Size**: 2820.3 × 1492.1 m. Widths W→E: 掖庭 702.5, 太極 1285, 東宮 832.8 [考古 1963 via REF; zh.wiki].
  - *Choice*: inner walls at x ±642, keeping the old plan.
- **Axis**: 承天門 → 太極門 → 太極殿 → 朱明門 → 兩儀殿 → 甘露殿 → 玄武門 [zh.wiki; 長安志]. The site lies under modern 西安, so dimensions are unknown.
  - *Built*:
    - 承天門 gate tower with 5 passages (passage count (?)).
    - 嘉德門 in a cross wall.
    - 太極殿 court (400 m wide) with 鐘樓 / 鼓樓, and an 11 × 5-bay hall with 副階.
    - 兩儀 court with a 9 × 4-bay hall, and 甘露 court with a 7 × 4 xieshan hall.
    - 延嘉殿, then the N garden: pools (海池), pavilions, and **凌煙閣** in the NE (two storeys).
- **815 status**: secondary. The 朝堂 moved to 含元殿 after 662. 太極殿 and 承天門 remained for some state rites (?).
  - *Built*: quiet, with guards and eunuchs and fewer people.
- **掖庭宮**: palace women's quarters, 內侍省 [長安志 7]. *Built*: a grid of residence, office and garden courts.
- **東宮**: courts along its own axis. In 815 the heir probably lived at 少陽院 in 大明宮 (?), so these courts are kept quiet.

## 4. 皇城 (offices 百司)
- **Size and streets**: 東西五里一百一十五步 × 南北三里一百四十步 (measured 2820 × 1844 m). 城中南北七街，東西五街. **承天門街 東西廣百步 (≈ 147 m)** [長安志 7].
  - There is no N wall: the 橫街 square lies in front of 承天門. Its depth is 300 步 (441 m) in the texts and ~220 m in archaeology (?).
  - *Built*:
    - 承天門街 as the 30 m+ paved axis (the full 147 m is drawn as open ground).
    - A 220 m 橫街.
    - E–W streets every ~270 m and N–S streets at ±430 and ±930.
- **Offices** (長安志 7, rows N→S): E side 門下外省, 尚書省 (row 4), … 太常寺, **太廟** (SE). W side 中書外省 …, 御史臺, 鴻臚寺, **太社** (SW).
  - *Built*:
    - Office courts on a grid, with plaques 尚書省 / 中書外省 / 門下外省.
    - **太廟**: walled precinct with four gates; an 11 × 4 hall on a two-tier terrace; 寢殿; cypresses and pines.
    - **太社**: the 社壇 of five-coloured earth (green E, red S, white W, black N, yellow top) and the 稷壇, in a walled square with four gates.
  - Every office court is named after 長安志 7 by 橫街 row and side, nearest the 承天門街 first (row 2 E: 門下外省, 殿中省, 左衛, 左千牛衛; row 4 E: 尚書省, 光祿寺, 軍器監; row 6 W: 御史臺, 宗正寺, 司天監 …). Names show on the map and in `warp`. The order inside a row and the plot sizes are *choice*.
- **815 reality**: 中書 and 門下 actually worked in 大明宮. The 皇城 held 尚書省, the 寺/監, and the largely nominal 十六衛.

## 5. 興慶宮 (南內)
- **Size**: 1080 × 1250 m [zh.wiki]. Gates: W 興慶 / 金明; E 金花 / 初陽; S 通陽 / 明義; N 躍龍 / 麗苑 / 芳苑.
- **勤政務本樓**: excavated base 26.5 × 19 m with a central 4.9 m passage, i.e. a gate tower, SW [zh.wiki; 考古 1959].
  - *Built*: a two-storey 9-bay 樓 on a 5 m base in the S wall near the SW corner, facing the avenue. It is bigger than the excavated base (*choice* for presence).
- **花萼相輝樓**: on the W side. *Built*: a two-storey 樓 on the W wall.
- **Layout**: palace halls (興慶殿, 南薰殿, 大同殿) in the N half; 龍池 and 沉香亭 (with peonies) in the S half (?).
  - 龍池 size is not found. *Built*: a 660 × 300 m lake with willows; 沉香亭 on a terrace with peony beds.
- **815**: residence of 皇太后 王氏 (順宗's empress). She died at 咸寧殿 in 816 [舊唐書 15; en.wiki].

## 6. Palace architecture rules used (PALK)
- **Platforms 台基**: brick-faced (磨磚對縫), stone base course and coping, 青石 balustrades, 螭首 spouts, stone flights with side ramps. Multi-tier for the great halls [含元殿報告].
- **Halls 殿**:
  - Vermilion columns; white walls with a red skirting.
  - Ochre brackets (`full` 斗栱 on great halls, `simple` elsewhere).
  - 直欞 windows; plank doors (cls 3: open 5–19.5).
  - Inner column grids on big halls.
  - 廡殿 (hip) for the top rank, 歇山 for the rest.
  - 副階 + 重檐 for 含元殿, 紫宸殿, 太極殿, 三清殿. Attested for 含元殿; *choice* for the others.
- **Roofs**: 青棍 dark tiles; green-glazed ridges and 鴟尾 on the great halls. The 鴟尾 is the Tang form, not the Ming 鴟吻.
- **Gates**: 殿門 halls with open passage bays (cls 4 leaves); gate towers on brick-faced bases with timber passages (排叉柱, no masonry arches).
- **Walls**:
  - Outer walls: battered rammed earth.
  - Inner court walls: plastered, with a red dado and tiled coping.
  - Court galleries (廊) walled on the outside and open to the court.
- **Furnishings** (LOD0):
  - 御座: two-step dais, lacquered 御床, three-panel 扆 screen, 雉尾扇 fans, censers, bronze lamp trees.
  - 列戟 racks at gates.
  - 儀仗 flags on 含元殿.
  - Low desks and mats for officials and scribes; floor culture, no chairs.

## 6b. Reading from afar (round 2)
- **Roofs**: every palace roof (halls, gates, towers, galleries, wall copings) is tinted to the dark 青棍瓦 tone at every LOD (`PALK.tintRoofs`, per part).
  At LOD1 / far, each hip / 歇山 hall gets green-glazed eave bands (剪邊), a green ridge and 鴟尾 silhouettes (`PALK.lodTrim`). The double-eave halls' skirt roofs carry the green band at every LOD.
- **Platforms**: light brick with white stone balustrade lines at LOD1 (and on big tiers far away).
- **Courts**: paved in a light stone-grey, distinct from the loess, the dark roofs and the green trees. The great open court before 含元殿 stays rammed earth.
- **Height accents**:
  - 角樓 (corner towers) on the corners of 大明宮, 宮城, 皇城 (S) and 興慶宮. Corner towers are known on Tang walls; at these corners they are (?).
  - Two-storey 樓 as the rear building of about a third of the large residence courts.
  - 闕, 鐘鼓樓, 麟德殿 樓, 三清殿, 凌煙閣, 勤政務本樓 / 花萼相輝樓.
- **Density**: 大明宮's empty ground is filled with plausible courts and gardens:
  - North 內苑 side, between 麟德殿 and 太液池, and east of the lake.
  - Guards' quarters and offices (仗舍) inside the S wall on both sides of the open court.
  - Rows of 槐 round the 毬場.
- **Lakes**: lotus beds (荷) float on 太液池, 龍池 and the 海池: pads and flowers at LOD0, green patches at LOD1 / far.
  - Lotus roots were excavated in 太液池 [華商網], and the 6th month is lotus time.
  - The water surface itself is the engine's murky water: its body colour `vec3(.1,.104,.074)` is fixed in FS_MAIN and the vertex colour is ignored. So from above, open water reads dark everywhere, canals included; that needs an engine change if wanted.

## 6c. Open ground and interiors: what is authentic

### Open spaces
- **Authentic open spaces**:
  - The **forecourt** between 丹鳳門 and 含元殿: ~610 m deep [何歲利 2019], a vast rammed-earth ceremonial court. It was framed by the 東西朝堂, the 鐘/鼓樓 on the 飛廊, the 金吾左右仗院 and the 御溝 with its bridges. It was furnished with 儀仗 (banners, halberd racks) at audiences.
  - The **polo field** (毬場).
  - The **water** of 太液池 (15 ha) and 龍池.
  - The **courts** in front of 宣政殿 / 太極殿 (corridor-framed, paved).
- **Built in round 2** to frame the open ground:
  - The 1st inner wall with its gate (~120 m S of 含元殿 [何歲利 2019]) and the precinct side walls up to the 宣政門 wall.
  - 儀仗 banner lines along the 御道.
  - 槐 rows along the sides of the forecourt and the polo field.
- **Dense areas**: the rest of 大明宮 was dense with halls, corridors and courts (133 recorded buildings), and so were 太極宮, 東宮, 掖庭 and the 皇城 offices. In those places the remaining ground between courts is now planted with palace trees: 槐, 梧桐, pine, willow and fruit trees (`INFILL`). The 內廷 ground is grass.

### Interiors
- **Footprints are as excavated; do not inflate them.**
  - 含元殿 is 13 × 6 bays = 67 × 28 m (core 11 × 4 bays, 58 × 19 m) on a 77 × 43 m platform [含元殿報告].
  - 麟德殿 is three halls on a 130 × 78 m platform (~5000 m² of floor in all).
- **What was wrong**: the halls felt low because a flat lid sat on the 6 m column tops.
- **Interior height now**: Tang great halls had their 平闇 ceilings raised above the bracket sets, often sloping with the rafters (as at 佛光寺東大殿, 857), with taller inner columns (內柱).
  - Every great hall now has a 平闇 that follows the roof and is flat over the centre, so the interior is about 10–14 m high (含元殿 ~14 m).
  - The column plan is 金廂斗底槽: an outer ring in the walls plus a taller inner ring one bay in, with ring beams, leaving the centre open. 含元殿 has a 9.7 m clear front-to-back span [含元殿報告].
  - Lamp trees with light run along both sides of the nave. Doors stand open in the day (5:00–19:30).
  - The ground floors of the two-storey 麟德殿 middle hall (7.2 m) and of 勤政務本樓 / 花萼相輝樓 are taller.
  - Shots: `shots/palace_int_*.png`, taken from the entrance with a standing official ~10 m inside for scale.

### 含元殿: hall versus terrace (checked)
- **Hall**: 13 × 6 bays, 67.3 × 28.2 m overall [含元殿報告]. It stands on the top tier of 78 × 44 m, so the margins are 5.4 m at the sides and 7.9 m front and back. The excavated top tier is 76.7 × 42.6 m (1959: 75.9 × 41.3): **the hall is right**.
- **The lower tiers are bigger, as in the reconstructions**:
  - tier 1: 130 × 76 m (+4.5 m);
  - tier 0: 200 × 110 m (+5.5 m).
  The excavated tier heights are 1.5 / 3.0 / 4.5 m on rising ground, with the floor 14.94 m above the plain. Ours: 5.5 / 4.5 / 3.0 m = 13 m on flat ground.
- **Ramps**: the two 龍尾道 run ~46 m south from the first tier (excavated: 57–74 m from the tiers to their S ends, in seven turns, 委蛇屈曲凡七轉; ours are straight).
- **Approach**: the 御道 runs north from 丹鳳門 through the 1st-wall gate to the terrace foot, then forks east and west to the feet of the two ramps (paving + walkways). At dawn officials climb them (5:40–6:10).
- **The 御溝 bridge**: the road stops at the bridge abutments; the bridge deck carries the way and the walk line.

## 6d. Red walls (user's reference model `ref/Reconstruction_Model_of_Hanyuan_Hall_of_Daming_Palace.jpg`)
- **The reference** paints every terrace face of 含元殿 red.
- **The excavation** reports something else for 含元殿 itself:
  - the platform faces are finely ground brick laid with tight joints (磨磚對縫), the top tier faced with stone slabs [含元殿報告];
  - so the **hall terraces stay light brick with stone coping and balustrades**.
- **Adopted (plausible)**: red-washed lime plaster (赭/朱) over a grey brick plinth on:
  - the palace's **inner walls** (宮牆: the 1st wall, the 宣政門 and 紫宸門 walls, the precinct walls);
  - the **residence courts** (offices stay white);
  - the **rammed-earth tower bases**: the 闕 (翔鸞閣/棲鳳閣), the bell/drum-tower bases, the 飛廊 bodies, the 角樓.
- **Why**: Tang buildings were lime-plastered, with red skirting excavated on 含元殿's own walls [含元殿報告]. Red and white walls are the norm in Tang depictions (Dunhuang murals, the 懿德太子墓 闕 mural).
- **Not evidenced**: the exact colour of 大明宮's palace walls is not reported, so this is a *choice*.

## 6e. Details (round 2, user feedback)
- **Lamp trees (燈樹 / 多枝燈)**:
  - A stepped bronze base, a trunk and three tiers of curved arms, each arm ending in a lamp dish with its flame (`PALK.lampTree`). They are used by the thrones and along every great hall.
  - The lamps keep clear of the dais and the axis. The inner columns of the front and back rows are omitted (減柱), so the nave and dais are free.
- **Trees on paving** stand in 樹池: a soil square in a brick kerb.
- **Courts**:
  - Bronze censers before the main hall; a side walk across the court to the side halls.
  - Varied roofs (廡殿 / 歇山 for the main halls, 懸山 or 歇山 for the side halls), bays, painting (丹粉 / 碾玉), and two-storey 樓 at the back.
  - Residence courts are red-walled; offices are white.
- **Gardens (苑 / 園 courts)**: designed rather than wild:
  - stone cross walks;
  - 牡丹 beds in brick kerbs;
  - fruit trees (peach, apricot, jujube) or willow / 梧桐 in rows;
  - a pond with lotus and a pavilion (about half of them), a central hexagonal 亭, a 軒 at the back, pines at the corners;
  - grass ground.
  - Free ground between courts is planted as groves in rows, one species per ~120 m block. 太湖石 rockeries are left out: the taste for them belongs to the 820s–840s (白居易, 牛僧孺), slightly after 815.
- **Lakes**:
  - Stone revetment with a walk on the bank, willows, lotus beds and reeds in the shallows.
  - Landing piers (棧橋) with moored pleasure boats (畫舫), and boats out on the water.
  - 蓬萊山 with rocks, pines and its pavilion.
  - The 15-room 水殿 on 太液池's NW shore [華商網], on a timber deck over the water.
  - 迴廊 on the N shore, and pavilions round the shore.
- **Polo field**: a flat rammed-earth field within a low wall, with 槐 rows.

## 6f. Walkways and people versus the architecture
- **The rule**: the palace walk graph (`lay.streets`, kind `palace` → WARD.nav) runs only along courts, alleys between courts and avenues. It passes through gates and doorways, never through a wall, hall or terrace face.
  - Walkways stop short of a court's front-gate steps.
  - The gate halls used by walkways have platforms walkers can step onto (≤ 0.45 m).
  - A walkway belongs whole (across its width) to the unit holding its centre line, so the 太極宮 axis is not split into two lines at the unit edge.
- **Routes**:
  - 建福門 / 望仙門 lead in over the 御溝 bridges to the 御道.
  - The 1st-wall, 宣政門- and 紫宸門-wall side gates.
  - Round the 延英 / 清思 courts.
  - 太極宮 / 掖庭 / 東宮 along the alleys between their courts and through gates in the inner walls.
  - 皇城: five N–S streets (承天門街, 含光門街, 安上門街, two outer ones) and the E–W 橫街 lines. Its E / W gates stand on those lines.
- **Check**: `node tool/palace_navcheck.js [units] --people`.
  - It samples every palace nav edge every 0.5 m against the LOD0 collision: a 0.25 m walker, closed-state gate leaves ignored, steps ≤ 0.5 m.
  - It also checks every static person's y against the floor or seat under them.
  - Result: 0 blocked edges, 0 people off the floor.
- **Bug fixed along the way**: the 宣政 court's corridors overlapped across 日華門 / 月華門.

## 6g. Round 2, last pass (user feedback)
- **剪邊 (green-glazed eave edging)**:
  - *What the user saw*: at far LOD the halls had a green border; up close only the double-eave halls had it.
  - *Evidence*: green-glazed tiles and 鴟尾 fragments are excavated at 含元殿, 丹鳳門 and 麟德殿, and the 含元殿 reconstruction study uses grey 青棍瓦 with green 剪邊 [含元殿報告]. Full 剪邊 on ordinary buildings is a Song–Ming convention.
  - *Decision*: 剪邊 only on the great halls (double-eave halls, halls of 9+ bays) and the skirt roofs of double-eave halls, **the same at every LOD**. Green ridges and 鴟尾 go on halls of 5+ bays. Everything else has grey ridges.
- **Wall junctions**:
  - Every palace / precinct / court wall run that ends, turns (L) or meets another (T / X) gets a junction pier (墩). The pier is a little thicker and higher than the walls, red-washed over a brick plinth, with a hipped tile cap. It applies at every LOD.
  - Gate gaps are met by the gates; the battered outer walls have 角樓 at their corners.
- **Trees**:
  - None inside buildings, under roofs or in walls. Every tree is checked against the extents of all building parts and kept ≥ 2 m from wall lines; `tool/palace_navcheck.js` checks the LOD0 collision.
  - In courts they stand in rows: 宮槐 flanking the walk from the gate to the main hall (「宮槐」 is a stock image of Tang palace poetry) and a pair before the rear building, each in a 樹池 (soil square with a brick kerb) in the paving.
  - Gardens have fruit trees in rows; open ground has groves on a grid.
- **Guards**: 監門衛 pairs on both sides (outside and inside) of every palace and 皇城 gate, including 朱雀門, the 宣政門 / 紫宸門 / 1st-wall gates, 嘉德門 and the court gates.
  - Palace walkers are mostly guards and eunuchs, few civilians; at night almost only guards.
- **凌煙閣** (643, the 24 portraits by 閻立本):
  - A three-storey 閣 on a terrace, walkable. The storey count is (?).
  - Inside, a partition carries framed portraits of standing ministers (purple / crimson robes, 幞頭, 笏) on both faces, after 「閣中有隔，隔內面北寫功高宰輔，南面寫功高侯王」.
- **Variety**: every court draws its own proportions from its seed:
  - main-hall bay count (± 2) and depth (3 / 4 bays);
  - column height (± 15 %) and platform height (0.5–1.1 m);
  - roof: 廡殿 / 歇山, 懸山 for some offices;
  - painting (丹粉 / 碾玉); side halls 歇山 / 懸山 with 3 or 5 bays;
  - a 樓 at the back in about a third of residence courts; the inner 廊院 by size;
  - gardens with or without a pond.
- **Collision**: the court paving (+5.5 cm) and the raised 御道 (+10.5 cm) have collision boxes; terraces, ramps, steps and bridge decks already had them.
- **蓬萊山 island**: walkable — stepped collision rings (≤ 0.45 m) follow the mound's profile. Piers and the 水殿 deck have collision boxes.
- **Water colour**: palace lakes are a fan of `water` polygons (col 1.05/1.16/1.2, emissive .1, the same at every LOD; `PALK.lakeArc`). The 御溝 is a `water` box (col .8/.9/.95, emissive .04; `GOU`). Lotus beds are green patches at LOD1 / far.

## 6h. Round 3: uses for the open ground, people indoors, the emperor's day

### What fills the former bare ground (大明宮)
| place | where (x, z) | evidence | built |
|---|---|---|---|
| 毬場 polo field | W of the forecourt, 1260–1630 × −5050…−4710 | Polo inside 大明宮 is attested by the stone 「含光殿及毬場等大唐太和辛亥歲乙未月建」 (831, found 1956 in the W of the palace) [唐長安城考古紀略]; emperors from 中宗 to 敬宗 played. Its position here is reconstructed. | low rammed-earth ring wall, 看殿 viewing hall on the N side (5 bays, railed front, on a 1.2 m platform) with officials and guards 15–18 h, a pair of 毬門 goal frames at the W and E ends (form *reconstructed*: two posts and a board) |
| 東內苑 | E of the forecourt, 2340–2840 × −5090…−4650 | 東內苑 with 龍首池 lay E of 大明宮's south part [長安志 6; 唐兩京城坊考 1]; 龍首池 still existed in 815 (文宗 filled it for a polo field in 大和九年 835 [舊唐書 17下 文宗紀, *verify*]). | pond, orchard blocks in rows (peach, apricot, jujube), two fenced vegetable plots of the 內園 (FIELD ground), a gardeners' hut, a labourer hoeing and a eunuch overseer by day |
| 飛龍廄 stable yard | by 九仙門, 1200–1300 × −6095…−5950 | The 飛龍廄 / 閑廄 belonged to the 禁苑 and the area N of the palace (*position uncertain*) [新唐書 47 殿中省 尚乘局; 唐會要 65 閑廄使, *verify*]. | walled yard with a gate hall on the E, two 9-bay open stall sheds facing each other, 12 horses, grooms sweeping and carrying |
| 仗舍 guard barracks | S fill of the 內廷 | 金吾 / 千牛 / 監門 guards on duty inside the palace [唐六典 25]. | courts with role `guard` (guards seated inside) |
| 內教坊 | 2337–2468 × −5693…−5567 | The outer 教坊 were in 光宅坊 / 延政坊 [教坊記]; 開元二年 「又置內教坊於蓬萊宮側」 [新唐書 22 禮樂志]. | court with role `music`: musicians and ladies seated in the hall 10–22 h |
| 尚食局 kitchens | 2482–2613 × −5693…−5567 | The 殿中省 尚食局 prepared the emperor's meals [唐六典 11]. Its location in 大明宮 is reconstructed. | court with role `kitchen`: stoves and cooks 5–20 h |
| 梨園 | not built | 梨園 was in the 禁苑 and was abolished in 779 [舊唐書 12]. | — |

### People inside buildings (`INSIDE`)
- The main hall of every court with a role gets an interior made for that role (they skip `ARCH.furnish`):
  - `office`: officials and scholars writing at low desks.
  - `residence`: palace ladies and 男裝 attendants on mats, a eunuch at the door.
  - `guard`: guards seated.
  - `music`: musicians with pipa and ladies.
  - `kitchen`: two stoves and cooks.
- Hours come from the role. Office desks are on mats (floor culture; no chairs).
- Fix: the kitchen stoves and cooks had been placed at z = 0, because the y component of `F.p` was read as z.

### The emperor's day (`PALACE.whereIs('emperor', hour)`)
- Every placement of the emperor carries a `place` label, and he is never alone (eunuchs, ladies, guards).
- The audience hours follow §7. The rest of the day is a *reconstruction*: the sleeping hall of 憲宗 is not recorded. 含涼殿 (N shore of 太液池, 長安志 6) is used as the summer hall, and boating on 太液池 is plausible for the 6th month (lotus time).

| hours | place | detail |
|---|---|---|
| 22–5 | 含涼殿 (寢) | asleep on a 床 (low platform bed with 屏 screens: no posts or canopy, which would be Ming) in the E bay; a eunuch and a kneeling lady on watch; guards at the steps |
| 5–5:54 | 含涼殿 (更衣) | dressing: two ladies, one eunuch |
| 6–8:30 | 宣政殿 (常朝) | |
| 8:30–10:30 | 紫宸殿 (入閤) | |
| 10:30–12 | 延英殿 (召對) | |
| 12–15 | 含涼殿 | resting on a 榻 dais; three ladies and a pipa player on mats; two eunuchs |
| 15–17 | 太液池 (泛舟) | seated in the cabin of a pleasure boat; a lady, a eunuch and a boatman aboard; a guard boat alongside |
| 17–18 | 水殿 | on a 榻 in the water pavilion, drinking; ladies and a musician |
| 18–22 | 麟德殿 (宴) | banquet |

- **`whereIs` API**: `PALACE.whereIs(type, hour)` returns `[{unit, place, x, y, z, anim}]` for any placed type, e.g. `palacelady` or `official`. The console hook `find emperor` is the lead's job (in core.js).
- **Fix: 水殿**: it stood at z = 0, far outside the palace, and was dropped. The same `F.p` index error caused it. It now stands on its deck on the NW shore.
- **Guards outside the outer gates**: the guards on the city side of 丹鳳門, 承天門, 朱雀門 etc. were in no unit and were never shown. They now belong to the nearest unit (within 40 m).

### Gate passages (found by `palace_navcheck`)
- **右銀臺門**: its passage ran into the W wall of the 翰林院 court 22 m inside the gate. The court now starts at x 1212, and a walk leads from the gate past the 翰林院 to the 內廷 cross walk at z −5540. (The 翰林院 was indeed 「在右銀臺門內」 [翰林志].)
- **左銀臺門**: its passage ran into the corner of the office court SW of the gate. That court now starts at z −5288.
- **Boat passengers** are skipped by the floor check, because the boat has no solid deck.
- **東內苑 vegetable plots** were moved off the walk at z −4676.

### 三清殿 stairs
- The upper tier is set back (d 56, dz −5), so the stair from the lower tier lands on the upper terrace.
- `tool/palace_climb.js` walks a player-sized body up both 三清殿 and 含元殿 (cx ± 26 ramp, then the stairs, then the centre door). Both reach the hall floor: 14.2 m and 13.2 m.

## 6i. Collision reach (user fell through the 含元殿 terrace)
- **Cause**: a part is built in the 64 m chunk that holds its (x, z), and `MultiWorld.near` only queries chunks within r + 40 m.
  - The 200 × 110 m 含元殿 lower tier was one collision box in one chunk, so beyond ~40 m past that chunk the player fell through. The 麟德殿 platform (78 × 130 m) had the same problem.
  - Long court walks (`PALK.road` strips of 100–190 m) and lake edges had the same defect.
- **Fix (engine/palace.js `PCOLL`)**:
  - Parts that reach too far get `p.ext`. TREEFILTER sets it from the part's far-level extent; lake arcs and jetties set it explicitly.
  - `PALACE.items` emits *collision clones* in every other chunk the extent touches. A clone builds the part with a throwaway mesh and keeps only the solids whose centre lies in its chunk; big boxes are cut into ≤ 60 m tiles.
  - Court walks are split into ≤ 60 m parts (`C.strip`).
  - The clones cost ~20 ms each, only at LOD0: 24 for 含元殿, 121 in all.
  - `PALACE.allParts(cname)` returns parts + clones, for tools that build chunks themselves.
- **Bug found on the way**: `PALK` had two `pier` methods. The later one (the landing pier) replaced the wall-junction pier, so every wall junction drew a plank deck. The landing pier is now `PALK.jetty`.
- **Test** (`tool/palace_reach.js`): emulates MultiWorld exactly (per-chunk worlds, 40 m margin) and checks two things:
  1. Every LOD0 solid lies within its chunk ± 39.5 m.
  2. The drawn top of every terrace tier (hall platforms and 副階 included), sampled every 2 m, and every 龍尾道 ramp, sampled every 1.5 m, has `World.ground` at the drawn height.
  - Before the fix: 489 far-reaching solids, and 2 tiers with misses (含元殿 lower tier: 1857 samples; 麟德殿: 716). Now: 0 and 0 (205,550 samples).

## 6j. Round 4 (user review 2026-11-14)

### Wall tops
- **Problem**: the tiled coping on the red and earth walls was built at the far level without an underside. From below, or level with the top, you could see through between the coping and the wall. The junction piers had the same problem.
- **Fix**: `PALK.wall` and `PALK.pier` now build the coping with `LOD.under`, at every LOD. That gives a sloped underside reaching down to the wall top, eave fascias and bargeboards.
  - Low walls without coping (`cap: false`) keep their top face.
- **Test** (`tool/palace_walltop.js`): each wall / pier part is built alone at LOD0, LOD1 and far. Along both faces every 3 m, rays come from 3 m out (below, level, above) at the inside of the coping, plus end-on rays and 4 × 2 rays per pier. Each must hit a front face.
  - Before: 116,243 see-through rays in 大明宮 alone. Now: 0 of 1,219,872 rays.
  - Cost: far meshes grow by ~10 % (掖庭宮 far 154k, within the 180k budget).

### Corridors against walls
- **Problem**: the 宣政 court corridors (日華門 / 月華門 sides) and the 紫宸 court side corridors started 3 m on the wrong side of the court walls. The sign was inverted (z grows southward), so they poked through the wall: the user's (2159, 3, −5332).
- **Fixed**:
  - The corridor end signs.
  - The 宣政 / 紫宸 court paving (it also overran its walls).
- **Test** (`tool/palace_corr.js`): no corridor centre line may cross a wall centre line or another corridor. Ending at a wall (within t/2 + 0.3 m) or running along one is allowed. 0 crossings.
- **Found on the way**: three statements had been swallowed by `//` comments written mid-line.
  - The 皇城 axis road (承天門街, `C.road(-7, zN + 5, 7, zS - 12)`), never built.
  - The 御溝 water zone, never set.
  - The interior roles (this round).
  - All three are restored. Comments inside code lines are now `/* */`.

### People against the floor
- **Test** (`tool/palace_people.js`): every static person at every hour, against `World.ground` at the spot (LOD0, clones included): within ±3 cm standing or seated. Also no body (r 0.28 / 0.22 seated) inside a solid (columns carry collision cylinders).
  - Before: 2310 off the floor, 17 inside solids. Now: 0 and 0 (3163 people).
- **Fixes**:
  - The throne's collision now follows its drawn steps: lower step +0.36, upper +0.82, seat 1.37. The old single box at +0.7 hid floating guards.
  - 千牛 guards stand on the lower step (+0.36). The attendants by the 紫宸 / 興慶 thrones stand on the floor.
  - Mats (`PALK.mat`, `PALK.desks`) carry a 4 cm solid. Everyone seated on the floor now has a mat.
  - People placed at y 0 stand on the paving / road drawn there (`FLOORS`: C.flats, 0.055 / 0.105).
  - Gate guards no longer stand inside the gate-hall platforms.
  - The 龍尾道 ramp collision follows the drawn slope (5 cm steps, top at the mid-surface).
  - `PALACE.people` passes `seated` explicitly. A standing person above the ground used to be turned into a sitter by the crowd code: the "seated man in green" at 紫宸殿.
- **The emperor**:
  - Asleep, he lies along the bed (head to the east end, using the crowd's lying convention).
  - He dresses between the column rows of 含涼殿.
  - In 延英殿 he sits on a 榻, with the 宰相 on mats facing him.
  - The 延英 hall now has its own role (`audience`): no palace-lady residence interior there.

### 常朝 at 宣政殿 (6:00–8:30)
- **Who** [唐六典 2 吏部; 新唐書 23上 儀衛志; 唐會要 24–25]: the 常參官 attended the daily court: 文官五品以上, the 兩省供奉官, 監察御史, 員外郎, 太常博士 (plus the 諸衛 generals). In the 元和 years 常朝 was held on odd days; numbers are not recorded. *Our choice*: ~240 in the court and ~20 in the hall.
- **Order**: 文東武西. Each side stands in rows by grade, one grade per row group (異位重行), facing north toward the throne, holding the 笏:
  - purple (三品以上)
  - then 緋 (四五品)
  - then 綠 (六七品)
  - then 青 (八九品)
  - Within a row, the higher post stands nearer the 御道 (*reconstruction*).
- **Built (civil, east)**:
  - The 宰相 (three in purple) stand in a front row at the head of the civil 班.
  - Then 16 purple, 48 緋, 60 綠, 16 青.
- **Built (military, west)**: 30 purple, 30 緋, 14 綠, 6 青.
- Rows of 12 at 1.3 m, 1.7 m apart, from 10.5 m off the axis. Guards line the 御道 at ±7.5 m.
- **Order keepers**: 監察御史 (青) at the outer side and the rear of each 班, facing inward; 殿中侍御史 (綠) at the foot of the steps.
- **In the hall**:
  - The 兩省供奉官 flank the way to the throne: 門下 (east: 給事中 / 諫議大夫 緋, 補闕 綠, 拾遺 青) and 中書 (west: 中書舍人 緋, …).
  - 起居郎 / 起居舍人 (綠) stand by the throne.
  - 千牛 stand on the throne's lower step.
- Robe colours come from `PALACE_RANK` through the crowd's `cols` override (slot 0 = robe).

### 延英召對 (10:30–12:00)
- **What**: after the formal court, the emperor received the 宰相 privately in 延英殿 to settle state business. The 宰相 asked for an audience (請對) or were summoned (召對). The practice began under 代宗 for the aged 宰相 苗晉卿 and became the real seat of government in the late 8th–9th c. [唐會要 24; 舊唐書 苗晉卿傳].
- **Who was absent**: no 起居 historians attended, so the 宰相 kept the record themselves (時政記).
- **In summer 815**: the business was the 淮西 war against 吳元濟 and, after 6/3, the murder of 武元衡 and whether to make peace. 憲宗 refused, and on 6/25 made the wounded 裴度 宰相 [通鑑 239].
- **Built**: the emperor on a 榻; three 宰相 (purple) kneeling on mats facing him; a eunuch standing by.

## 7. Palace life in 815 (`PALACE.people` by hour; walkers via `PALACE.walkerType`)
- **Ruler and household**: 憲宗 李純. No empress: 郭氏 was 貴妃 [zh.wiki 唐憲宗]. Heir 李恒 (?). Empress-dowager 王氏 at 興慶宮.
- **宰相** in mid-815 [通鑑 239; 舊唐書 15]:
  - 武元衡 until he was killed on 6/3 leaving 靖安坊.
  - 張弘靖 and 韋貫之.
  - 裴度, wounded the same morning in 通化坊, made 宰相 on 6/25.
- **Others**:
  - 翰林學士: 令狐楚, 錢徽, 蕭俛, 王涯.
  - Eunuch 吐突承璀, 左神策中尉.
- **The morning** [新唐書 23上; 唐會要 24]:
  1. Officials ride out at 五更 and wait in the 待漏院 outside 建福門 / 望仙門.
  2. 平明，傳點畢，內門開.
  3. Ranks form by grade left and right of the court.
  4. The fans close, the emperor takes the seat, the fans open. 千牛備身 stand beside the throne.
  - 朔望 audiences are at 宣政殿. Real business happens at 入閤 in 紫宸殿 and at 延英召對.
  - A 元和十年 rule: 其朔望及雙日勿進.
- **Schedule built** (*choice* of hours):

| hours | where | who |
|---|---|---|
| 4:30–6:15 | 朝堂 (含元殿 plaza) | officials gather |
| 6:00–8:30 | 宣政殿 | emperor on the throne (seated); ~240 常參官 in 班 by grade (文東武西), ~20 供奉官 in the hall (§6j); guards lining the 御道; 千牛 and eunuchs at the throne |
| 8:30–10:30 | 紫宸殿 | emperor; six officials before the throne; 男裝宮人 attendants |
| 10:30–12:00 | 延英殿 | emperor with three kneeling 宰相 |
| day | 翰林院 | four scholars at desks (one on night duty to 24:00) |
| 18:00–22:00 | 麟德殿 | banquet: emperor, 20 guests at low desks (incl. Sogdian envoys), five musicians, palace ladies serving |
| 15:00–18:30 | 太液池 pavilions | consorts (palace ladies) seated, maids |
| always | gates, 闕, terraces | guards; eunuchs by day |

  - 興慶宮: the empress-dowager (as a seated palace lady) receives in 興慶殿 9–12 with attendants; ladies and maids in the gardens by 沉香亭 14:30–18:30 with four musicians in the pavilion. Every court has a palace lady and maid by day and a eunuch at its gate. Office courts have an official and a doorkeeper.
  - Hall doors carry staff posts (`meta.spots`: role eunuch / palaceguard, cls 3) while open.
- **Dress** [舊唐書 45; 新唐書 24]:
  - **Emperor**: 赤黃袍 (forbidden to subjects), 折上巾 (= stiff-footed 幞頭), 九環帶, 六合靴. 袞冕 only on 元日 / 冬至 and great sacrifices. No Ming 翼善冠.
  - **Officials**: purple for rank 3+, 緋 for 4–5, green for 6–7, 碧/青 for 8–9; gold or silver 魚袋; ivory or wooden 笏.
  - **宮人**: high buns and 披帛. 男裝 is also attested (或有著丈夫衣服靴衫); its archetype is `nanzhuang`.
  - **Eunuchs** (內侍): robes in grade colours (green … purple), soft 幞頭, beardless.
  - **Guards**: helmet, lamellar 兩當, spear, 橫刀 (`palaceguard`).
- **梨園**: abolished 779 [舊唐書 12], so there are no 梨園 musicians. The 教坊 remained.

New archetypes in people.js: `emperor`, `eunuch`, `palacelady`, `nanzhuang`, `palaceguard` (+ palettes; `BODY_NAMES` capacity raised to 64). New `ATT_TYPES` roles: `eunuch`, `palaceguard`, `lady`.

## 8. Open questions and next steps
- **Not modelled yet**:
  - 龍尾道 switchbacks.
  - 剪邊 green eave trim.
  - The 1st inner wall of 大明宮.
  - 夾城.
  - 太極宮 dimensions (unknown).
- **To refine**:
  - 皇城 office names per 長安志 7 rows.
  - 延英殿 position.
  - 興慶宮 龍池 shape.
- **Terrain**: 龍首原 relief is replaced by the 含元殿 terrace (the walkable ground is flat).

## 9. Camera points (x, z; yaw 0 looks north) and hours
- 丹鳳門 → plaza → 含元殿: (2014, −4400) → (2014, −4790), dawn 6:00–6:30 (officials gathering by the 朝堂, guards on the ramps); terrace top (2014, y 13, −4900); throne inside (2014, y 14.8, −4928).
- 翔鸞閣 / 鐘樓 / 飛廊 (walkable, deck +10 m): (2142, −4936) → (2142, −4836).
- 宣政殿 dawn audience 6:00–8:30: (2014, −5150); 紫宸殿 8:30–10:30: (2014, −5400); 延英殿 10:30–12:00: (1822, −5440).
- 麟德殿 banquet 18:00–22:00: inside the middle hall (1372, y 2.7, −5770); 太液池 / 蓬萊山: (2030, −5640) looking N; 三清殿 (2190, −6340); 翰林院 (1250, −5640).
- 太極宮: 承天門 (0, −2780), 太極殿 court (0, −3060); 凌煙閣 (430, −3940).
- 皇城: 承天門街 (0, −2000); 太廟 (680, −1270); 太社 (−680, −1270).
- 興慶宮: 勤政務本樓 from the avenue (3880, −960); 沉香亭 afternoon 14:30–18:30 (4560, −1580); 龍池 (4300, −1600).

## 10. Shots (`shots/`)
- In game (tool/view.js): `palace_game_0` (含元殿 from the plaza at dawn), `palace_game_1` / `palace_game2_1` (大明宮 from the south, high), `palace_game2_0` (皇城 and 宮城 from the air).
- Palace bake (`tool/palace_bake.js` + `tool/palace.html`):
  - `palace_s1_0..3`: 含元殿 front, 鐘樓 + 飛廊, the throne room, the plaza with officials at dawn.
  - `palace_s2_0/1`: 宣政殿 court at the 常朝, the hall's corner with 鴟尾 and green ridge.
  - `palace_s3_0/1`: 麟德殿 banquet at night.
  - `palace_s4_0/1`: 太液池 and 蓬萊山.
  - `palace_s5_0/1`: 太極殿, the N pools of 太極宮.
  - `palace_s6_0/1`: the emperor enthroned in 宣政殿 with 千牛 guards and eunuchs.
  - `palace_s7_0/1`: 皇城 offices from the air, 承天門街.
- Aerials, round 2 (in game, view.js; same cameras): `palace_air_before_0..2` (round 1: 皇城 from (0, 220, −1700), 大明宮 from (2014, 160, −4200) and (2014, 350, −3800)) and `palace_air_after_0..4` (those three, plus (2014, 60, −3900) at wall height and (0, 400, −500) high over 皇城 / 宮城).
- Best: `palace_s1_3`, `palace_s1_0`, `palace_s6_0`, `palace_s2_1`, `palace_s1_2`, `palace_s7_1`, `palace_game_0`.

## 11. Integration notes
- Palace chunks get no NATURE ground scatter (lead, CITY.JOBS.lod0); trees are the palace's own.
- Palace gate towers are always open (ARCH.gateTower is static); 殿門 gate halls (menHall) use cls 4 leaves (open 7–18), hall doors cls 3 (5–19.5).
- `PALACE.depthAt` carves lakes (1.6 m) and the 御溝 (1.5 m); water planes at −0.55 / −0.6.
