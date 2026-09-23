# research/archetypes.md — SBI Clerk & IBPS Clerk prelims question archetypes

Compiled 24 Sep 2026 for MockHall generators and authored content. Prelims only (English 30 / Numerical 35 / Reasoning 35).
No question text is reproduced here. Formats are paraphrased, and number examples are representative ranges, not original items.

**Legend**
- Cycle labels use the recruitment year plus the month the prelims were held:
  - SBI: SBI'19 (Jun-19), SBI'20 (Feb–Mar-20), SBI'21 (Jul-21), SBI'22 (Nov-22), SBI'23 (Jan-24), SBI'24 (Feb–Mar-25), SBI'25 (Sep-25), SBI'26bk (16-Sep-26 backlog drive).
  - IBPS: IBPS'19 (Dec-19), IBPS'20 (Dec-20/Jan-21), IBPS'21 (Dec-21), IBPS'22 (Aug–Sep-22), IBPS'23 (Aug–Sep-23), IBPS'24 (Aug-24), IBPS'25 (4–5 Oct-25).
- Evidence weight (SPEC §3.5): **H** = 2022–26, **M** = 2019–21.
- Counts are questions per shift. "S1" means shift 1.
- **M1–M5** are full memory-based papers (Adda247/Bankersadda) that I read end to end. They are the structural samples:
  - M1 = IBPS'25 4-Oct S1
  - M2 = SBI'25 20-Sep S1
  - M3 = SBI'25 21-Sep S1
  - M4 = SBI'26bk 16-Sep S1
  - M5 = IBPS'24 24-Aug S1
- Memory-based papers are recollections. Their structure and number styles are reliable. Their option order, duplicate options and typos are **not**, so generators must always enforce 5 distinct options.

---

## 0. Pattern check (SPEC §3 against sources, Sep 2026)

| Item | SPEC says | Sources say | Verdict |
|---|---|---|---|
| SBI Clerk 2026 regular prelims | 26 & 27 Sep, 3 Oct 2026 | **26 & 27 Sep 2026** (PW schedule article of 17 Sep; Bankersadda and Testbook admit-card articles). "3 Oct" appears only in PracticeMock ("27 Sep & 3 Oct") and in a Shiksha/KollegeApply search snippet (page returned 403). | ⚠ 3 Oct is **unconfirmed**. Show as "reported", don't hard-code |
| SBI backlog prelims | 16 Sep 2026 | 16 Sep 2026, 3 shifts analysed (PracticeMock mentions a 4th) | ✓ |
| SBI admit card / mains | mains ~Nov 2026 | Admit card 21 Sep 2026; mains "expected Nov 2026" | ✓ |
| IBPS Clerk 2026 (CRP CSA-XVI) | prelims 10–11 Oct; mains 27 Dec | Same. Notification 27 Jul; applications 1–28 Aug; 11,403 posts. | ✓ |
| Prelims structure | E30/N35/R35, 20 min each, 5 options, −0.25 | Same for SBI'24, '25, '26bk, IBPS'24, '25 and the IBPS'26 notice ("unchanged") | ✓ |
| SBI section order | E→Q→R | E→Q→R in every SBI'24, SBI'25 and SBI'26bk shift reported | ✓ |
| IBPS 2025 section order | Q→E→R | Q→E→R (Adda 5-Oct S1; Guidely "typically"; M1 paper order) | ✓ |
| IBPS 2024 section order | — | R→E→Q (M5 paper order) | ➕ add an "IBPS-2024" order preset |
| IBPS 2026 section order | — | Unknown. IBPS **PO** 2026 prelims (22–23 Aug 2026) ran **E→Q→R**. | ➕ keep configurable; default IBPS mock to Q→E→R, offer E→Q→R |
| Shift timings | — | 09:00–10:00, 11:30–12:30, 14:00–15:00, 16:30–17:30. Careerpower lists SBI'26bk S3 at 14:30. | info |
| Good-attempt rows (§3.3) | 3 rows | All three match. Other outlets differ by ±3–5, e.g. SBI'26bk S1: Testbook 71–82, Guidely 73–86, Adda/PracticeMock 74–81. | ✓ show as ranges |
| IBPS mains 2026 (Phase 3) | 27 Dec | Adda reports a **revised** mains: 160 Q / 125 min (GA 40Q-50M, Eng 40-40, Reas 40-60, Quant 40-50) | ➕ verify before Phase 3 |

**SPEC §3.4 / §8 / §9 claims that the evidence contradicts or extends**

1. **Approximation is overstated.**
   - SPEC Q1 centres on near-integer approximation (for example 24.98% of 1199.87).
   - All 5 full papers from 2024–26 contain **only exact "?" simplification**: 57 items, 0 approximation.
     - No direction line says "approximate value".
     - The ~20 image-only items also have integer-style options, several with "None of these", which approximation items don't use.
   - Analysts still label the topic "simplification/approximation". Approximation items are documented in 2019–22 papers.
   - Action: limit approximation to ≤2 items in a 12-item block, and add a "legacy" subtype chip.
2. **Squares and cubes range.**
   - Seen: squares up to 45² (11², 14², 16², 17², 38², 40², 45²); cubes 7³; ∛729 and ∛1331.
   - Action: squares ≤50, cubes/cube roots ≤15. SPEC's "cubes to 25" is too heavy.
3. **Coded inequality** does not appear in any 2024–26 analysis or paper. All inequalities are direct, including two-chain comma/semicolon forms. Keep coded as an H/X subtype only.
4. **Coding "full 5-Q set in IBPS 2025"** is confirmed by Adda for 5-Oct S1 (Chinese coding, "double words", 5 Qs). Guidely shows 4-question sets in other IBPS'25 shifts. 5-question sentence-coding sets also appeared in SBI'26bk S2, SBI'24 S2/S3, SBI'23 S3, IBPS'23 and SBI'21.
5. **Quant ranges are wider than SPEC.**
   - DI: 10–13 in SPEC; observed **5–15**. IBPS'24 24-Aug S1 had one 5-Q set; SBI'25 20-Sep S1 had 15.
   - Arithmetic: observed 9–15. Blueprint Variant C ("2024-style") shows arithmetic 10, but IBPS'24 24-Aug S1 actually had **15**.
6. **Quadratic.** Last seen SBI'22 (12-Nov S2: 6) and IBPS'23 (27-Aug S1: 5). It is **0 in every 2024–26 shift table** checked. Guidely's "0–5" for SBI'24/'25 is not supported by any shift table.
7. **Direction and blood relation** each come as **3-question sets**. Usually only one of the two appears per shift (0–3 each). SPEC blueprint A uses "2+2"; use one 3-Q set, sometimes both.
8. **English formats missing from SPEC §8:**
   - Fragment rearrangement: 5 parts of one sentence, 2–5 Qs.
   - 3-word rearrangement: options ACB/BAC/CAB/CBA plus "none", 3–6 Qs.
   - Pick the grammatically incorrect sentence: 4 sentences plus "All are correct", 2–5 Qs.
   - Cloze is common in IBPS'25 (5–6 Qs in 4 of 8 shifts), but blueprint B has no cloze.
9. **"No change" answer rates are lower than SPEC's 15%.** From the M1–M5 answer keys:
   - "No replacement/improvement/correction required": 0 of 11.
   - "No error": 1 of 20.
   - "No interchange/rearrangement required": 1 of 15.
   - "All are correct": 0 of 8.
   - Action: use 5–10%.
10. **Missing quant chapter.** Problems on numbers / linear equations (ticket counts, sharing with absentees, digit reversal, two numbers with a % relation) appear in 4 of 5 papers. Add **Q18**.
11. **Zero in the 2024–26 samples:** pie charts, missing-value tables, 3D mensuration, circles, pipes with leaks or alternate opening, CI half-yearly/quarterly, coded blood relations, shadow directions, input–output, data sufficiency, statement-based critical reasoning. Down-weight these in prelims mocks.
12. **Blueprints.** Reasoning Variant A matches SBI'25/'26 exactly (3 sets × 5 + a 3-Q mini set = 18). Puzzle **sets are mostly single-attribute** (names ↔ positions). Second attributes are limited to month+date, floor+flat and designation.

Sources for §0:
- https://www.pw.live/banking/exams/sbi-clerk-prelims-exam-date-2026-out
- https://www.bankersadda.com/sbi-clerk-prelims-admit-card-2026-out/
- https://testbook.com/news/sbi-clerk-prelims-admit-card-2026-out-link-active/
- https://www.practicemock.com/blog/sbi-clerk-prelims-exam-analysis/
- https://www.adda247.com/exams/bank/ibps-clerk-notification-2026/
- https://www.bankersadda.com/ibps-po-prelims-exam-analysis-2026-23-august-2nd-shift/
- https://www.adda247.com/exams/bank/ibps-clerk-prelims-exam-analysis-2025-shift-1-5th-october/
- https://guidely.in/exams/bank-insurance/ibps-clerk-exam-analysis
- https://www.pw.live/banking/exams/ibps-clerk-exam-analysis-2025
- https://www.careerpower.in/blog/sbi-clerk-prelims-exam-analysis-2026
- https://guidely.in/exams/bank-insurance/sbi-clerk-exam-analysis
- https://www.adda247.com/exams/bank/sbi-clerk-backlog-exam-analysis-2026/
- https://testbook.com/news/sbi-clerk-exam-analysis-2026/
- https://www.shiksha.com/news/sarkari-exams-sbi-clerk-prelims-exam-dates-2026-for-backlog-regular-vacancies-out-check-admit-card-release-date-blogId-241179 (seen only as a search snippet)

---

## 1. Quantitative Aptitude (35)

### 1.0 Section mix (Qs per shift)

| Topic | 2019–21 (M) | 2022–23 (H) | 2024–26 (H) | M1 / M2 / M3 / M4 / M5 |
|---|---|---|---|---|
| Simplification (exact) | 10–15, approximation common | 10–15 (SBI'22 S2: 14; SBI'23: 12–15; IBPS'23: 10–15) | 8–15 | 12 / 9 / 10 / 13 / 13 |
| DI, all sets | 5–15 (SBI'21 S1: 15 incl. caselet; IBPS'21: 5–10) | 5–10 | 5–15 | 10 / 14 / 15 / 10 / 5 |
| – of which caselet | 0–5 | 0–5 | 0–6 | 0 / 4 / 5 / 0 / 0 |
| Number series (missing/wrong) | 0–5 | 5 | 0–5 | 0 / 0 / 0 / 0 / 5 |
| Quadratic equations | 2–5 | 0–6 | **0** | 0 |
| Arithmetic word problems | 8–13 | 8–12 | 9–15 | 13 / 12 / 10 / 12 / 12 |
| Quantity comparison (Q1/Q2) | 2–4 (SBI'21 only) | 0 | 0 | 0 |

**Difficulty reported**
- The section is usually easy–moderate and is the hardest of the three sections in most shifts.
- Reported "Difficult": SBI'24 22-Feb S3.
- Reported "Moderate": SBI'25 21-Sep S1, SBI'26bk S2, SBI'21 S1.
- DI was called "difficult" in SBI'22 S1.

**Arithmetic chapter hits across M1–M5 (59 arithmetic items)**

| Chapter | Papers with ≥1 item (of 5) |
|---|---|
| Mixture | 5 |
| Partnership | 5 |
| SI/CI | 5 (6 items) |
| Boat & stream | 5 |
| Ages | 5 |
| Profit & loss | 5 |
| Speed-distance-time / trains | 5 |
| Mensuration 2D | 4 |
| Time & work | 4 |
| Percentage | 4 |
| Problems on numbers / linear equations | 4 (6 items) |
| Pipes | 2 |
| Ratio | 2 |
| Averages | 1 |
| Mensuration 3D | 0 |

Arithmetic draws roughly 1 item per chapter per shift. The same **templates recur across shifts of one cycle**, for example the "x% did A, y% did B, rest = N, find the difference" percentage item and the two-scheme SI item.

**Option style, all quant**
- 5 options, numeric, with units appended (Rs, km/hr, years, cm², sec, litres).
- Adda reconstructions are mostly **unsorted**; many SBI'26bk items are sorted ascending (one was sorted descending).
- "None of these" appears in about 20% of IBPS'24 simplification items. It is not seen in 2025–26 arithmetic.
- "Cannot be determined" never appears in quant.
- Ratio answers are usually paired with their **reverse** as a distractor (e.g. 3:2 & 2:3, 7:4 & 4:7, 16:5 & 5:16). This happened in every paper.

### Q1. Simplification & Approximation — P1 (largest scoring block)

**Frequency:** see table 1.0.
- SBI'26bk: S1 12 (Guidely 15), S2 10–12, S3 10.
- IBPS'25 shifts: 8, 10, 11, 12, 12, 13, 13, 13.
- Rated "easy".

**Subtypes seen in 2024–26** (all have an exact answer):

| Subtype | Style | Share in M1–M5 |
|---|---|---|
| Plain chain, "?" alone on RHS | 3–5 terms of +, −, ×, ÷ with 3–4-digit integers; divisions engineered to be exact (4-digit ÷ 11/21/26/34/36/45) | ~35% |
| "?" on both sides / inside | expr = a − ? + b; (a+b) ÷ ? = c; k × ? = p% of q | ~20% |
| Power/root unknown | base^? = value (answer 1–5); ?² term (? = 9–25); √ and ∛ terms inside | ~15% |
| Percentage sums | p% of a + q% of b (+ r% of c). p ∈ {2.5, 4.5, 10, 11, 12, 19, 24, 35, 45, 48, 62.5, 65, 144, 160, 225}; bases 20–8900 chosen so each term is an integer or .5 | ~15% |
| Fraction chains | a/b of c/d of e/f of N; mixed fractions (2⅓, 4²⁄₇, 3⅓) resolving to an integer; answer can itself be a fraction (options are 5 unit fractions/fifths) | ~10% |
| Squares/cubes | squares 11²–45²; 7³; √144, √225, √256, √1225; ∛729, ∛1331 | inside the above |
| Approximation (near-integer decimals) | Not present in 2024–26 samples. Legacy (≤2022) and PO style. | 0% |

**Numbers**
- Answers are integers in ≈85% of items. The rest are .5 decimals (e.g. 26.5, 18.5) or simple fractions.
- One negative answer appeared (IBPS'24). Answer magnitude ranges from 1 to 16,000.

**Options**
- 5 options. Distractors are mostly within ±5–25% of the answer, often share its last digit, and include one near-miss (±1 to ±10).
- When the answer is a square, all 5 options are perfect squares (81/121/144/225/324).
- "None of these" is option (e) in some IBPS items.

**Traps**
- Left-to-right order in ÷ ÷ × chains.
- "of" precedence.
- % base.
- ?² ⇒ take the positive root.
- Mixed fraction → improper fraction.
- Fractional answers.

### Q2. Number Series — P2 (0–5; appears as one 5-Q set or not at all)

**Frequency:**
- SBI'23: WNS 5 (S1), MNS 5 (S2–S4).
- SBI'24: MNS 4–5 in S1, absent in S2–S4.
- SBI'25: MNS 5 in 27-Sep S2, absent in 20/21-Sep S1.
- SBI'26bk: WNS 5 in S2 only.
- IBPS'19/'22/'23: 5.
- IBPS'24: MNS 3–5.
- IBPS'25: 0–2 (2 MNS in 4-Oct S3; 2 WNS in 5-Oct S3).
- Rated easy.

**Patterns seen (2023–24)**
- Differences are factorials (1, 2, 6, 24, 120).
- Successive division by 7, 6, 5, 4, 3 (starting from a 5-digit number).
- Alternating ± with |d| growing by 4 (−13, +17, −21, +25).
- Alternating cubes and squares on descending bases (6³, 5², 4³, 3², 2³).
- ×n + n (×2+2, ×3+3, …).
- Plain AP (+4).

**Values:** growing series start at 5–25 and end at 3–5 digits. Shrinking series start at 4–5 digits.

**Blank position:** first, second, second-to-last or last term. M5's five items used each of these positions.

**Wrong-number series:**
- One term perturbed by a small amount (±1 to ±10).
- Options are 5 terms taken from the series.
- Make sure no other single change also restores a valid pattern.

**Options:** 5 integers, no "None".

**Traps:** second-level differences; alternating twin series; the wrong term placed next to a legitimately irregular term.

### Q3. Percentage — P1

**Frequency:** 4 of 5 papers (1 each). Also inside every DI set.

**Subtypes seen**
- Participation split: a% did X, b% did Y, the rest (N people) did Z → difference between X and Y. This template recurred across SBI'25 and IBPS'25.
- Yearly growth of p%, then spend q% → balance.
- Nested %: share female → share of males who are graduates → given a count of non-graduate males → find females.
- p% of the bigger number = q% of the smaller, difference given.
- Numerator and denominator change by % → original fraction.

**Numbers:** % in multiples of 5 (plus 12.5/33.33 inside DI). Totals are 3–5 digits. Money Rs 10k–20k.

**Traps:** wrong base; adding successive %; "rest" computed as a share of the wrong total.

### Q4. Profit & Loss — P1

**Frequency:** 5 of 5 papers (1 each), plus a P&L item inside DI (SBI'26bk: SP and profit % per unit → total CP).

**Subtypes seen**
- Two articles whose CPs differ by a fixed amount; one sold at +x%, one at −x%; total SP given → CP.
- Mark-up + discount chain with the profit amount given → a second article with CP k% higher sold at a loss → its SP.
- CP:MP ratio with SP and profit amount → MP.
- Equal CPs at +a% and −b% with net loss given → price for a target profit %.
- "Sold at x% profit; Rs y more would give z%" → CP.

**Numbers:** CP Rs 200–2,500; % from {10, 20, 25, 30, 40}; amounts Rs 50–1,000.

**Options:** clustered within about ±60 of the answer (e.g. five values in the 640–700 band).

**Traps:** profit on SP vs CP; mark-up/discount applied additively; equal CP vs equal SP.

### Q5. Ratio & Proportion — P1

**Frequency:** 2 of 5 papers, plus inside ages, mixture, partnership and DI.

**Subtypes seen**
- Two numbers in ratio a:b; subtract k from one and add k to the other → new ratio → original value.
- Chained ratio with an offset, e.g. X:(X+c) and then (X+d):(Y+e) → X+Y.

**Numbers:** ratio terms ≤30; offsets 5–50; answers ≤400.

**Traps:** a reversed ratio is always among the options; the offset is applied to only one side.

### Q6. Partnership — P1

**Frequency:** 5 of 5 papers (1 each).

**Subtypes seen**
- B joins after m months → B's capital from the profit ratio.
- A partner leaves after X months → find X from that partner's share and the total profit.
- One partner leaves while another withdraws ⅓ of capital at the same time.
- Capital ratio from the profit ratio and the time a partner leaves.

**Numbers:** capital Rs 2,400–11,200 (multiples of 200/400/1,000); profit Rs 1,500–5,400; months 3–10.

**Options:** months 5–10, or capitals 1,000–1,800.

**Traps:** months counted as 12 − joining month; withdrawals split the year into periods.

### Q7. Speed, Distance & Time (with trains) — P1

**Frequency:** 5 of 5 papers.

**Subtypes seen**
- Two-leg harmonic average speed (e.g. 60 and 90).
- Speed of vehicle 1 from distance/time; vehicle 2 = fraction (3/8, 4/5) of it → speed or ratio of distances.
- Train length from pole-crossing time; speed increased (in m/s) → new time.
- Train crosses a man and a platform → its length and speed → overtaking by another train in the same direction.

**Numbers:**
- km/h in multiples of 18 (72) for m/s conversion.
- Speeds 12–28 m/s; trains/platforms 240–360 m; times 12–30 s.
- Road distances 150–320 km over 5–6 h.

**Traps:** ×5/18; relative speed in the same direction (subtract) vs opposite (add); average speed ≠ arithmetic mean.

### Q8. Boat & Stream — P1

**Frequency:** 5 of 5 papers.

**Subtypes seen**
- Downstream and upstream (distance, time) → still-water speed → changed by −20% → distance in t hours.
- Upstream takes t h more than downstream for the same distance, plus boat:stream ratio (5:1) → still-water speed.
- Sum of upstream and downstream speeds → still-water time for a distance.
- Upstream:current ratio (4:1) plus downstream distance/time → current speed.
- Boat:stream ratio 4:1 with a total time for a down + up trip → time for another upstream distance ("approx." wording).

**Numbers:** speeds 4–48 km/h; distances 40–210 km; times 2.5–18 h; ratios 4:1, 5:1.

**Traps:** still water = (D+U)/2; stream = (D−U)/2; the given ratio refers to the upstream speed, not the boat speed.

### Q9. Simple & Compound Interest — P1

**Frequency:** 5 of 5 papers (6 items), plus SI/CI caselet DI (SBI'26bk S1: 3 Qs; Guidely lists "SI caselet").

**Subtypes seen**
- Rate from a given SI, then rate +5% for a new period → new SI.
- Two schemes (P, r, t each) with the interest **ratio** given → unknown P.
- Two schemes with the interest **difference** given → unknown P.
- Principals X + k and X at different rates earn equal interest → X.
- Time needed to earn a given SI.
- 2-year annual CI vs SI at a different rate, difference given → P.

**Numbers:**
- P Rs 1,500–75,000. Rate 5–30% (a derived rate like 10.5% is possible). Time 2–9 years.
- CI is only annual and only 2 years. Half-yearly/quarterly and 3-year CI−SI were not seen in 2024–26.

**Traps:** SI/CI mix-up; CI = P[(1+r)²−1]; which scheme is larger when the difference is given.

### Q10. Averages — P1

**Frequency:** 1 of 5 standalone (M2); the "average of …" question appears in most DI sets.

**Subtypes seen:** a new member contributes k more than the current average → total. DI averages over 2–5 entries (answers 42–173).

**Traps:** the new average vs the old average.

### Q11. Time & Work — P1

**Frequency:** 4 of 5 papers.

**Subtypes seen**
- (A+B+C) and (B+C) times → A alone, or A alone for 60% of the work.
- A and B together for d days, then B leaves → remaining days.
- Q works alone for d days, then P joins → total time.

**Numbers:** 4–25 days, including fractional (20/3); LCM 50–60 units.

**Options:** decimal-heavy (6.67 / 8.33 / 12.5 / 13.33 / 16.67; 9.3 / 10.8 / 11.4).

**Traps:** part of the work vs the whole; days of joint work.

### Q12. Pipes & Cisterns — P2

**Frequency:** 2 of 5 papers (both SBI'25 days). Only one form seen: 3 inlet pipes with individual times (LCM 24–30) → time together (answers 2.5–4 h).

**Not seen in 2024–26:** leaks, alternate opening, pipe closed after t, a partly full tank.

### Q13. Quadratic Equations — P2 prelims (P1 mains)

**Frequency:**
- IBPS'19–'21: 5; IBPS'21: 3–5.
- SBI'21: 2–4 ("very easy").
- SBI'22 12-Nov S2: 6.
- IBPS'23 27-Aug S1: 5.
- **0 in all 2024–26 shift tables checked** (SBI'23 4 shifts, SBI'24 4, SBI'25 3, SBI'26bk 3, IBPS'24 2, IBPS'25 8).

**Format (standard):** equations I and II in x and y; 5 options: x>y, x<y, x≥y, x≤y, x=y or relation cannot be established. SPEC is correct here.

**Recommendation:** use only in a "classic pattern" blueprint variant (5 Qs), and in mains.

### Q14. Mensuration 2D & 3D — P2

**Frequency:** 4 of 5 papers, 1 each, **2D only**.

**Subtypes seen**
- Right-triangle area and height → base → a square whose side is related to the base → its area.
- Rectangle L:B ratio with perimeter (or 2 × perimeter) → area.
- Rectangle ratio and area → sides changed by +10% and −20% → new perimeter.
- Length:perimeter ratio → breadth:length.

**Numbers:** areas 135–300 cm²; sides 9–25 cm.

**Options:** perfect squares for square areas.

**Not seen 2024–26:** circles, 3D, paths.

### Q15. Data Interpretation — P1

**Frequency:**

| Cycle | DI per shift and set types |
|---|---|
| SBI'23 | 5–8 |
| SBI'24 | 8–15 (S3: caselet + table + line) |
| SBI'25 | 5–15 (20-Sep S1: table + bar + caselet) |
| SBI'26bk | S1 table 6 + bar 3 + caselet 3; S2 bar 5; S3 table + line + caselet 3 |
| IBPS'24 | 5 (24-Aug S1) or 10 (31-Aug S1: bar + table) |
| IBPS'25 | 9–12 in every shift (bar/line + table; 4-Oct S4: bar + 2 caselet + line) |

**Set types observed 2024–26**

| Type | Shape | Value style |
|---|---|---|
| Table | 2–5 entities × 2–3 columns (sellers × languages; stores × months; days × two products; schools × games; male/female; LMB/HMB) | Small integers 20–280 |
| Bar | 2 series × 3 categories, or 4–5 single bars (bags, runs, colleges, population, builders) | Axis 0–500, step 100; values are multiples of 10–50 |
| Line | 4–5 points, single line (malls, parks, restaurants) or 2 lines (2BHK/3BHK) | 20–440; gridlines step 20–40 |
| Caselet | 2 companies × 3 cities (two 4-digit totals plus %/ratio links between cells); 3 companies with a male/female split and one 2-digit total given; SI/CI caselet; a 2-Q subject caselet | 3–5 Qs |
| Not seen in 2024–26 prelims | Pie, stacked bar, missing-value table | — |

**Question types per 5-Q set, in order of frequency**
1. Ratio (answers like 11:14, 3:2).
2. "What % of" (2-dp answers such as 80.95, 61.36, 366.66).
3. "% more/less than" (14.28 / 20 / 25 / 33.33 / 66.66).
4. Average of 2–3 cells.
5. Sum or difference.
6. **Derived entity:** a new entity E or F defined by % or ratio from an existing cell (in every paper).
7. **Sub-split:** male:female 3:1, 25% veg, 10% defective returned, 30%/25% foreign-language share.
8. Next-period change (+25% / −10%).
9. P&L inside DI.

**Traps:** "% more than" base; mixing up the row and column; gridline reading.

### Q16. Problems on Ages — P1

**Frequency:** 5 of 5 papers.

**Subtypes seen**
- Present ratio plus a mixed-offset ratio (A some years hence vs B some years ago) → sum after n years.
- Three persons: C is older than one by k₁ and younger than the other by k₂, plus a ratio → an age n years ago.
- Fractional equality (a/b of A = c/d of B) plus a future sum.
- Two future ratios at different horizons.

**Numbers:** ages 5–60; offsets 3–12 years; ratio terms ≤16.

**Traps:** offset applied to only one person; "hence" vs "ago".

### Q17. Mixture & Alligation — P1

**Frequency:** 5 of 5 papers.

**Subtypes seen**
- Add water to reach a target ratio.
- Remove part of the mixture, then add water to reach a target % or ratio.
- Remove, add, target ratio → **initial** milk.
- "Water is p% of milk", then add water → new ratio.

**Numbers:** 50–200 L; removals 14–40 L; ratios 4:3, 5:2, 8:7, 11:6, 15:8.

**Not seen 2024–26:** price alligation, repeated replacement.

**Traps:** removal takes both components proportionally; "% of milk" vs "% of mixture".

### Q18. (NEW — not in SPEC) Problems on numbers / linear equations — P1, GEN

**Frequency:** 4 of 5 papers (1–2 each).

**Subtypes seen**
- Two-category counting: N people split into adults and children, prices a and b, total takings → adults. N = 50–70, prices Rs 20–50.
- Sharing with absentees: X items shared equally among n people; k are absent; each gets 1 more → X.
- Two-digit number = k × its digit sum, and adding 9m reverses its digits.
- Two numbers with a known difference where p% of one = q% of the other.

**Options:** small integers.

**Traps:** setting up the equation with the categories swapped.

Sources for §1:
- M1–M5 PDFs:
  - https://www.bankersadda.com/wp-content/uploads/multisite/2025/10/04163016/IBPS-Clerk-Pre-2025-Memory-Based-Paper-Based-on-4-Oct-1st-Shift.pdf
  - https://www.adda247.com/jobs/wp-content/uploads/sites/22/2025/09/20143321/SBI-Clerk-Pre-2025-Memory-Based-Paper-Based-on-20th-Sep-1st-Shift.pdf
  - https://www.adda247.com/jobs/wp-content/uploads/sites/22/2025/09/23102341/SBI-Clerk-Pre-2025-Memory-Based-Paper-21-Sep-2025-1st-shift-1.pdf
  - https://www.bankersadda.com/wp-content/uploads/multisite/2026/09/16151752/SBI-Clerk-Pre-Memory-Based-Paper-Backlog-16-September-2026-S1-exam.pdf
  - https://www.bankersadda.com/wp-content/uploads/multisite/2024/08/26110728/IBPS-Clerk-Pre-2024-Memory-Based-Paper-Based-on-24th-August-1st-Shift.pdf
- Year-wise weightage and shift tables:
  - https://guidely.in/blog/sbi-clerk-topic-wise-weightage
  - https://guidely.in/blog/ibps-clerk-topic-wise-weightage
  - https://www.oliveboard.in/blog/ibps-clerk-topic-wise-weightage/
  - https://www.oliveboard.in/blog/ibps-clerk-exam-analysis-2022/ (IBPS'21 data)
  - https://testbook.com/blog/sbi-clerk-prelims-exam-analysis-shift-1-12-july-2021/
  - https://www.bankersadda.com/sbi-clerk-exam-analysis-2022-shift-2-12th-november/
  - https://www.oliveboard.in/blog/sbi-clerk-prelims-exam-analysis-2024-5th-january/
  - https://www.careerpower.in/blog/ibps-clerk-prelims-exam-analysis-27-august-2023-shift-1
  - https://www.oliveboard.in/blog/ibps-clerk-prelims-exam-analysis-26th-august-2023/
  - https://www.adda247.com/jobs/ibps-clerk-exam-analysis-2024-shift-1-august-24/
  - https://www.careerpower.in/blog/ibps-clerk-prelims-exam-analysis-31st-august-2024
  - https://www.practicemock.com/blog/sbi-clerk-exam-analysis-2025/
  - https://www.careerpower.in/blog/sbi-clerk-prelims-exam-analysis-22-february-2025-shift-1
  - https://www.adda247.com/exams/bank/sbi-clerk-prelims-exam-analysis-2025-shift-1-20-september/
  - https://www.pw.live/banking/exams/sbi-clerk-exam-analysis-2025-shift-1-20-sept
  - https://www.careerpower.in/blog/sbi-clerk-today-exam-analysis-21-september-2025
  - https://www.pw.live/banking/exams/sbi-clerk-prelims-exam-analysis-2025-27-september-shift-2
  - The §0 2026 and IBPS'25 pages

---

## 2. Reasoning Ability (35)

### 2.0 Section mix (Qs per shift)

| Topic | 2019–21 (M) | 2022–23 (H) | 2024–26 (H) | M1 / M2 / M3 / M4 / M5 |
|---|---|---|---|---|
| Puzzles + seating | 10–23 | 13–21 | 15–22 | 18 / 18 / 18 / 18 / 22 |
| Inequality | 2–5 | 0–5 | 0–5 | 3 / 3 / 3 / 3 / 5 |
| Syllogism | 0–5 | 2–5 | 0–5 | 0 / 3 / 3 / 3 / 0 |
| Series (alphanumeric, digit, word, 3-digit) | 0–5 | 5 | 4–5 | 5 / 5 / 5 / 5 / 5 |
| Coding–decoding | 0–5 | 0–5 | 0–5 | 0 / 1 / 0 / 0 / 0 |
| Blood relation | 0–5 | 1–5 | 0–3 | 3 / 0 / 0 / 3 / 0 |
| Direction | 0–5 | 1–4 | 0–3 | 3 / 3 / 3 / 0 / 0 |
| Comparison / order-ranking | 0–5 | 0–3 | 0–4 | 0 / 0 / 0 / 3 / 3 (counted inside puzzles) |
| Misc single Qs | 0–7 | 1–4 | 1–4 | 3 / 2 / 3 / 3 / 3 |

**Difficulty reported:** easy to easy–moderate in almost every shift. Puzzles are described as "lengthy". In SBI'21 S1, syllogism and blood relation were rated "moderate".

### R1. Coding–Decoding — P1/P2

**Frequency:**
- SBI'21 S1: 5 (Chinese).
- SBI'23: 4–5 (S1 4, S3 5).
- SBI'24: 5 in S2 and S3, 0 in S1 and S4.
- SBI'25: 0–4 (20-Sep S1: 1 letter-coding item; 27-Sep S2: 3–4).
- SBI'26bk: S2 5 (Chinese), S1/S3 0.
- IBPS'21: 1–5. IBPS'22: 3. IBPS'23: 4–5 (27-Aug S1 5 Chinese). IBPS'24: 0–5.
- IBPS'25: 0–5 (5-Oct S1: 5 "Chinese coding – double words"; Guidely: 4 in several shifts; PW: "3-word coded sentence" format).

**Formats**
1. **Sentence ("Chinese") coding set, 5 Qs** (standard format):
   - 4 statements of 3–4 words, each word ↔ a code token.
   - Questions: code of a word; word for a code; code for a new phrase ("may be"); which word shares a code; which code is certain.
   - Options include "Cannot be determined" or "Either X or Y" when a word is not pinned down.
   - The "double words" variant (IBPS'25) is reported but not detailed. Support 2-part tokens (e.g. "ka pi") or 2-word phrases.
2. **Single letter coding, 1 Q:** a 6-letter word → code by alternating −1/+1 shifts (or a similar positional rule) → apply to a new word. The 5 option codes differ in 1–2 letters.
3. **Letter-number coding with conditions:** mains only.

**Traps:** shared words across statements; the alternating-shift parity starting on the wrong letter.

### R2. Classification (odd one out) — P2

**Frequency:** 0–1 per shift (M1, M3, M4). "Four of the five pairs are alike" is also the **standard 4th question of almost every puzzle set** (11 of 12 sets in M1–M5).

**Formats:** letter triplets built from position gaps; one breaks the gap pattern. Options are 3-letter groups. Number odd-one-out is occasional (SBI'23 S4).

**Traps:** forward vs backward gaps; wrap-around; opposite letters.

### R3. Arrangement & Pattern (series + misc letter/number items) — P1

**Frequency:** one 5-Q set in nearly every shift 2019–26, plus 1–3 misc single items.

**5-Q set types (2023–26)**

| Set type | Shape | Seen in |
|---|---|---|
| Alphanumeric-symbol | letters + digits + symbols, 24–26 elements | IBPS'24, SBI'23 |
| Digit + symbol | no letters, 22–26 elements | M1, M4 |
| Digit-only | 24 digits | M3, SBI'24 S1 |
| Word series | five 3-letter words | M2; IBPS'25 5-Oct S2/S3 |
| 3-digit number set | five 3-digit numbers with operations | IBPS'25 4-Oct S2; SBI'24 S3/S4; SBI'22; IBPS'23 |
| Letter series | letters only | SBI'23 S3 |

**Question stems (paraphrased)**
- Count elements that meet neighbour conditions (e.g. elements of class P immediately preceded by class A and followed by class B, where the classes are digit parity, symbol, vowel or consonant).
- k-th element from the right end.
- m-th element to the right of the n-th from the left.
- Count odd digits between two named symbols.
- The p-th element of class A to the right of the q-th element of class B.
- After an operation (reverse the first 5 elements, reverse the second half, delete all square digits, drop all symbols) → a position question.
- Sum of the digits that meet a condition.
- Odd one out among triplets taken by position.
- Word-series operations: dictionary order → position; replace the first letter → count meaningful words; sort letters within each word → count unchanged; shift letters to the next letter → count words with more than one vowel; swap letter positions → count words ending in a consonant.
- 3-digit sets: reverse digits / add 1 to a digit / product or difference of digits of the highest or lowest number.

**Options:** counts written as words ("One" … "Four", "More than four", "None"), or elements. "None of these" appears sometimes.

**Misc single items (1–3 per shift)**
- **Meaningful word** from letters at given positions of a long word. It appeared in **5 of 5 papers**. Options are 3 letters plus two code letters for "none" and "more than one"; the code letters differ between papers (X/Y, X/Z, Y/Z).
- Letter pairs in a word with as many letters between them as in the alphabet, both directions (M3).
- The same for digit pairs in a number (M1).
- Sort a word's letters alphabetically → how many keep their position; "X" if none (M2).
- **Number-based digit transforms:** digits <5 doubled and >5 reduced by 1 → how many digits repeat (M4); a similar ±3/+2 rule → which digits occur more than once (M5); sum of even digits − sum of odd digits (M5).

**Traps:** "immediately preceded/followed" direction; counting from the right; the order of operations.

### R4. Inequality — P1

**Frequency:**
- SBI'23: ~3. SBI'24: 3 (S1, S4), 0 (S2, S3). SBI'25: 3. SBI'26bk: 3–4.
- IBPS'23: 0–5. IBPS'24: 3–5 (M5: 5). IBPS'25: 3–4 (in about half the shifts).
- Rated easy.

**Formats (2024–26): direct only**
- A single chain of 5–10 letters, or two chains joined by a comma/semicolon that share at least one element.
- Two conclusions per item. The conclusions include **complementary pairs** (X > Y and X = Y from X ≥ Y ⇒ "either").
- Variants named by analysts: "comma / without comma" (IBPS'24), "single comma, word-based" (SBI'25 20-Sep), "non-common style" (SBI'26bk S2, not described).
- Coded symbols (@ # $ …) were not seen in 2024–26. Keep them only as an H/X subtype.

**Options:** always the same 5 (only I, only II, either I or II, both, neither), but the positions of "both" and "neither" swap **between and even within papers**. Pick one order per set and keep it consistent.

**Traps:** a reversed sign breaks the chain; mixing ≥ and >; "either" requires a complementary pair on the same two elements.

### R5. Syllogism & Venn — P1

**Frequency:**
- SBI'19: 4–5. SBI'20: 3–4. SBI'21: 0–5. SBI'22: 2–4. SBI'23: 3–5. SBI'24: 4–5. SBI'25: 3 (0 in some shifts). SBI'26bk: 3–5.
- IBPS'19: 5. IBPS'20: 3. IBPS'21: 4–5. IBPS'22: 3–4. IBPS'23: 2–5. IBPS'24: 0–4 (24-Aug S1: none). IBPS'25: 0–4 (absent in 4-Oct S1 and S4).

**Formats**
- 3 statements, 2 conclusions.
- **"Only a few" appears in 8 of 9 sample items (M2–M4)**.
- Possibility conclusions ("… being … is a possibility"), "can never be", "some … are not".
- Either-or complementary pairs (Some A are B / No A is B).
- Reverse and Venn-diagram formats: none in prelims.

**Options:** 5 fixed outcomes, in varying order.

**Traps:** "only a few A are B" ⇒ some A are B **and** some A are not B; "All B are A" is impossible under "only a few"; possibility vs definite.

### R6. Input–Output — P2/P3

0 occurrences in any clerk prelims shift table from 2019–2026 reviewed. Mains only.

### R7. Order & Ranking / Comparison — P1

**Frequency:** a 2–4-Q comparison mini-puzzle in ≈40% of 2024–26 shifts (SBI'26bk S1: 3; IBPS'25 5-Oct S1: 4; IBPS'24: 3; SBI'24 S2: 2; IBPS'25 order-ranking 3 in 3 shifts). Ranking from both ends is also embedded in uncertain-count linear puzzles.

**Formats**
- 5–6 persons by height or weight.
- Clue styles:
  - "k-th tallest"
  - "n persons between"
  - "taller than A but shorter than B"
  - "not the tallest"
  - "as many between C and F as between F and D"
- **Numeric extension (new, both M4 and M5):** one height is given (e.g. the 2nd tallest = 1xx cm), plus sums or differences of two heights → find another sum. Values 50–180.

**Questions:** k-th tallest; how many are taller or shorter; how many are between two people; a numeric sum.

### R8. Seating Arrangement — P1

2–3 seating sets per shift. See §4 for types, sizes, clues and question styles.

### R9. Puzzle — P1

1–2 puzzle sets per shift, plus the comparison mini set. See §4.

### R10. Blood Relation — P1

**Frequency:**
- SBI'19: 2–4. SBI'22: 3–4. SBI'23: 2–3. SBI'24: 3 (S1, S4). SBI'25: 0–3 (27-Sep S2: 3). SBI'26bk: 3 (S1, S2).
- IBPS'19: 3. IBPS'21: 3–5. IBPS'22: 1–4. IBPS'23: 2–5. IBPS'24/'25: 0–3.

**Format (2024–26): one 3-Q family puzzle.**
- 6–8 members, up to 3 generations.
- Clue styles: "only daughter", "has no siblings", "sister-in-law of", "mother-in-law of", "not married", "has one daughter", "no single parent" (every child has two parents in the family), "three generations".
- Questions: relation of X to Y; which person is X's daughter; count the female members; a conditional ("if X marries Y, how is X related to Z").
- Options are relation words, plus "Either B or V" style options. "Cannot be determined" is standard but was not seen in the samples.
- Coded relations ("A + B means…") were not seen in 2024–26.

**Traps:** inferring gender from "husband/wife"; son-in-law vs brother-in-law; the implied spouse from "no single parent".

### R11. Distance & Direction — P1

**Frequency:**
- SBI'20: 3–5. SBI'21/'22: 1–3. SBI'23: 0–3. SBI'24: 3 (S2, S3). SBI'25: 3 (20- and 21-Sep S1). SBI'26bk: 3 (S3).
- IBPS'19–'20: 0–1. IBPS'21–'22: 1–3. IBPS'23: 2–4. IBPS'24–'25: 0–3.

**Format: one 3-Q point set.**
- 6–9 points chained by "P is d m <direction> of Q", distances 2–24 m (one clue can reference two points).
- Questions:
  - Shortest distance: Pythagorean (9-12-15, 5-12-13) or a surd (√244-type).
  - Direction of X w.r.t. Y (8-point compass).
  - "Four of the five pairs are alike" (same relative direction).
  - A total or composite distance after adding a new point.

**Options:** distances with "m"; adjacent surds (√244 vs √245); "None of the above".

**Not seen 2024–26:** coded directions, shadow/sun-based items, turning walks.

**Traps:** NE vs E when one coordinate is equal; a sign slip in the chain.

### R12–R17. Data Sufficiency; Statement & Conclusion / Assumption / Argument / Course of Action; Cause & Effect — P3

**0 in every clerk prelims shift table reviewed, 2019–2026 (SBI and IBPS).** Mains or PO only. Keep them out of prelims blueprints.

Sources for §2: M1–M5 PDFs; the §1 year-wise and shift tables; the §0 2025/2026 analysis pages.

---

## 3. English Language (30)

### 3.0 Section mix (Qs per shift)

| Topic | 2019–21 (M) | 2022–23 (H) | 2024–26 (H) | M1 / M2 / M3 / M4 / M5 |
|---|---|---|---|---|
| Reading comprehension | 6–10 | 7–10 | 7–10 | 9 / 10 / 10 / 9 / 9 |
| Cloze | 0–8 | 0–7 | 0–7 | 6 / 0 / 6 / 0 / 0 |
| Error spotting (4-part) | 3–7 | 4–5 | 0–5 | 5 / 5 / 5 / 5 / 0 |
| Pick the incorrect sentence | — | 0–5 | 0–5 | 0 / 0 / 0 / 0 / 4 |
| Phrase replacement / improvement | 0–6 | 0–5 | 0–5 | 4 / 0 / 0 / 3 / 4 |
| Fillers (single blank) | 0–5 | 0–7 | 0–6 | 0 / 5 / 2 / 0 / 4 |
| Misspelt | 0–6 | 0–6 | 0–5 | 0 / 0 / 0 / 4 / 0 |
| Para jumble (5 sentences) | 0–5 | 0–5 | 0–5 | 0 / 5 / 0 / 5 / 5 |
| Fragment rearrangement (1 sentence) | 0–5 | 2–5 | 0–5 | 0 / 0 / 2 / 2 / 0 |
| Word swap / 3-word rearrangement | 0–5 | 0–5 | 0–6 | 5 / 4 / 3 / 0 / 3 |
| Word usage | 0–5 | 0–5 | 0–5 | 1 / 1 / 1 / 1 / 1 |
| Match the column | — | 0–3 | 0–3 | 0 / 0 / 1 / 1 / 0 |

**Difficulty reported:** English is the easiest section in almost every shift ("easy"). Word usage is sometimes "moderate".

### E1. Basic Grammar — P2

Tested through E2, E3, E4 and the incorrect-sentence item. **Error-type tally over 24 sample error items (M1–M5):**

| Error type | Items |
|---|---|
| Subject–verb agreement (2 of them neither…nor proximity) | 7 |
| Tense/aspect ("has being", present perfect after "since", reported will→would, "use to") | 5 |
| Verb form after a modal/"to"/auxiliary | 4 |
| Countability / number ("informations", singular for plural, bare verb as adjective) | 3 |
| Adjective vs adverb | 1 |
| Pronoun case after a verb | 1 |
| few vs little | 1 |
| Preposition | 1 |
| Missing finite verb | 1 |

Tag every item with its concept.

### E2. Error Spotting — P1

**Frequency:** 3–7 per shift in nearly all shifts. In SBI'24 S4 and IBPS'25 5-Oct S1 it was partly replaced by sentence-level items.

**Format:** a sentence in 4 parts (A)–(D) plus (e) "No error"; punctuation is ignored. **"No error" was correct in 1 of 20 sample items.**

**Variant (2023–26):** 4 separate sentences, choose the grammatically incorrect one, (e) "All are correct". Seen in IBPS'24 (4), SBI'24 S4 ("correct sentence", 5), IBPS'23 ("correct statements", 4) and IBPS'25 ("sentence-based error", 2).

**Traps:** agreement across an intervening phrase; either/neither proximity; "one of the" + plural; tense consistency with time markers.

### E3. Sentence Improvement / Phrase Replacement — P1

**Frequency:** 3–5 (IBPS'22–'25; SBI'26bk 3–4; SBI'24 3–5). 0 in SBI'25 20/21-Sep S1.

**Three flavours seen**
1. **Grammatical:** a highlighted phrase plus 4 near-variants (concord, tense, preposition) plus "No correction required" (M5).
2. **Paraphrase:** a highlighted phrasal expression; choose the phrase with the same meaning (M1, all 4 items).
3. **Connector/adverb:** a contextually wrong conjunction or adverb (e.g. a cause/contrast connector, a purpose connector) plus "No improvement required" (M4). This is how "connectors" are tested now.

"No replacement" was correct in **0 of 11** items.

### E4. Filler — P1

**Frequency:** 3–6 single-blank items in most shifts (SBI'25 20-Sep 5, 27-Sep S2 5; IBPS'24 4–5; IBPS'25 3–5). Double blanks are rare (SBI'26bk S2 "single/double"). "Word that fits both sentences" was not seen in 2024–26.

**Blank types:** verb form (past tense), a question word at the start, a preposition or phrasal particle, a collocating noun, an adverb.

**Options:** 5 single words, mostly the same part of speech plus one wrong-part-of-speech distractor.

### E5. Sentence Connectors / Conjunction — P2

No standalone set in 2019–26 prelims. Tested through E3 flavour 3. The SPEC format ("Only A / Both…") is mains-style.

### E6. Spellings (misspelt) — P1

**Frequency:** SBI 3–5 (SBI'26bk S1 4, S2 5; SBI'24 S1 4–5); IBPS'25 3–5 in 4 of 8 shifts.

**Format (2024–26):** a sentence with **4 highlighted words** (options a–d) plus (e) "All are correct". The wrong word can be **misspelt or a wrong real word** ("inappropriate usage", e.g. a noun confused with a near-homograph).

**Corruptions seen:** vowel substitution, an inserted letter, a dropped letter, a real-word substitution.

The older format (pick the misspelt word from 5 words) is not seen recently.

### E7. Word Swap / Word Rearrangement — P1/P2

**Frequency:** swap 0–5; 3-word rearrangement 3–6 (IBPS'25; SBI'25 21-Sep 3).

**Formats**
- **Swap:** 4–5 bold words labelled (A)–(E). Options are single pairs ("A-E"), double pairs ("A-E & B-C") or "No interchange required" (M2, M5).
- **3-word rearrangement (new):** 3 highlighted words must be permuted. Options are ACB, BAC, CAB, CBA and "No rearrangement required" (M1, M3).

### E8. Word Usage — P2

**Frequency:** 1 per shift (0–5; IBPS'24 31-Aug had 4–5).

**Format:** one word plus 3 sentences (I–III). Options are combinations such as Only I / Only II / Both I & III / Both II & III / All of these; the set of combinations varies.

**Word types:** homophone traps (sow/sew, knee/knead); polysemous verbs (wade, ascend); an abstract noun in a figurative misuse (discord).

**Other reported words:** effect (SBI'26bk S3), bold/reserve/impose (IBPS'24 31-Aug), price (IBPS'23).

### E9. Cloze Test — P2 (P1 for IBPS)

**Frequency:**
- SBI'20: 5–6. SBI'21: 5–8. SBI'22: 0–7 (S2: 7). SBI'23: 3–5. SBI'24: 5–6. SBI'25: 0–6. SBI'26bk: 0.
- IBPS'19–'23: 4–7. IBPS'25: 5–6 in 4 of 8 shifts.

**Format:** a 250–350-word passage, often narrative or science-history (archaeology, ocean, Neanderthal). **5–6 blanks labelled (A)–(F)**, one question per blank, 5 one-word options from near-synonyms or the same part of speech.

### E10. Reading Comprehension — P1

See §5.

### E11. Para Jumbles — P1

**Frequency:** one 5-Q set in most shifts (0–5).

**Format**
- 5 sentences (A)–(E), no fixed sentence in 2024–26.
- 5 questions: 1st, 2nd, 3rd, 4th and 5th/"LAST". **The question order can be shuffled** (IBPS'24: 1st, 4th, 2nd, 3rd, 5th). The A–E option order is sometimes shuffled too.
- Cohesion cues: a date/chronology chain; "a recent survey…" opener; "Consequently" at the close.

**Separate 1–2-Q format — fragment rearrangement:** 5 fragments of **one** sentence, options are 4 sequences plus "No rearrangement required" (SBI'25 21-Sep, SBI'26bk: 2 each; SBI'24: 2–5).

### E12. Match the Column — P2

**Frequency:** SBI 1–2 (2023–26), IBPS 1–3 (2023–25).

**Format:** Column I (A–C starters) × Column II (D–F endings). Options list partial or full mappings; "None of these" appears. **The correct answer may be a subset** (only 2 valid pairs), or all 3.

### E13. Para Filler / E14. Para Summary — P3

0 in clerk prelims 2019–26. The nearest prelims item is the single in-passage RC blank (§5).

Sources for §3: M1–M5 PDFs; Guidely and Oliveboard weightage tables; the shift analyses listed in §1 and §0.

---

## 4. Puzzle & seating catalogue (2022–26 clerk prelims)

**How often each set appeared** (counted across 24 shift tables from 2024–26: SBI'23 ×4, SBI'24 ×4, SBI'25 ×3, SBI'26bk ×3, IBPS'24 ×2, IBPS'25 ×8)

| Type | Persons/items | Attributes and orientation | Shifts seen (of 24) |
|---|---|---|---|
| Box / stack | 8 boxes; sometimes numbered 1 (bottom)–8 (top) | Single attribute (position) | 13 |
| Linear, **uncertain count** | Total 10–23 (seen 11, 12–14, 13+, 16, 17, 18–21); 3–5 Qs | Single row facing north | 11 |
| Square | 8 persons | 4 corners facing in, 4 middles facing out (mixed facing is the norm) | 10 |
| Month-based | 8 persons, same date in 8 of 12 non-consecutive months; **or 4 months × 2 dates** (e.g. 7/20, 8/27, 8/19, 7/18) | 30/31-day logic ("month with an even number of days" = 30-day month) | 10 |
| Comparison | 5–6 persons, height/weight, 2–4 Qs | Numeric values in newer items | 9 |
| Linear, certain count | 7–8 persons | Facing north (some mixed) | 6 |
| Floor × flat | 4 floors × 2 flats, or 4 × 3 (IBPS'24) | Flat position (west/east) | 6 |
| Circular | 8 persons | Facing the centre (mixed facing is rare in clerk) | 6 |
| Parallel rows | 10 persons (5 + 5) | Row 1 faces south, row 2 faces north, facing each other, equal spacing | 6 (+ IBPS'23) |
| Day-based | 7 persons, Mon–Sun (leave, class, meeting) | Single attribute | 6 (+ 2 in IBPS'23) |
| Sequence / order | 8 persons buying or purchasing one after another | Single attribute | 5 |
| Floor | 8 floors, 1 = bottom | Single attribute | 4–5 |
| Designation / post | 8 persons ↔ 8 ranked posts | Hierarchy | 2 |
| Colour-order & ranking | — | — | 1 |
| Number-based puzzle | 3 Qs | — | 1 |
| Year/age-based | Not seen in clerk prelims 2024–26 | PO style | 0 |

Note: analysts label the uncertain-count row as "certain number of persons" (the puzzle opens with "a certain number of persons sit in a row"). Don't confuse it with "certain linear" (fixed count).

**Size and difficulty**
- Typical prelims set: 7–8 entities and a single attribute, with 1–2 case splits that close by the last clue.
- Hard elements seen: uncertain count; month+date grids; a numeric attribute on a position.
- Two independent attributes (person × city × colour) do not appear in clerk 2024–26. Keep those for the H/X ladder only.

**Clue grammar (constraint templates to implement, from 16 sets in M1–M5)**

| Template | Example (paraphrased) | Frequency |
|---|---|---|
| gap(X,Y) = n | "n persons/boxes/floors/months between X and Y" | every set |
| offset(X,Y) = ±k | "X is k-th to the left/right/above/below/before/after Y" | every set |
| adjacency | "just above/below", "immediately right of", "not adjacent", "not immediate neighbours" | ~80% |
| absolute anchor | position/floor/day number; "at the extreme left"; "second from an extreme end"; "after June"; a fixed day | ~75% |
| **count equality** | #before(X) = #after(Y); #left(X) = #right(Y); gap(W,X) = gap(Y,Z); #above(X) = #below(Y) − 1 | 12 of 16 sets (key clue style) |
| negative | not in a named month; not the tallest; not in the same month; not immediately above; **"neither X nor Y is first"** | ~60% |
| quantified gap | "more than three between", "at least one between" | 4 of 16 |
| numeric property | prime-numbered floor/position; even floor above the 5th; month with an even number of days; question stems about "a prime number of persons after X" | 5 of 16 |
| exactly between | X is exactly midway between Y and Z | uncertain-count sets |
| parallel rows | references to "the person facing X"; a gap between a person and "the one facing Y"; plain "left of" (not necessarily immediate) | row sets |

**The 5-question pattern per set** (counts from 12 five-Q sets in M1–M5)

| # | Question style | Frequency | Answer/option notes |
|---|---|---|---|
| 1 | Identity/position (who is on floor k / born in month m / k-th to the right of X) | ~20 items | "None of these"; parallel rows: "Either (a) or (b)", "the one facing X"; uncertain rows: "Unknown person" |
| 2 | Count between/above/before | ~12 | Options in words: None / One / … / More than four |
| 3 | Position of X w.r.t. Y | ~6 | "Third to the left", "Immediate right", … |
| 4 | Odd one out: 4 of 5 alike (single persons or pairs) | 11 of 12 sets | Nearly universal |
| 5 | Which statement(s) are true/false | 10 of 12 sets | (I, II, III) combinations ("Only I and III"…), or 5 standalone statements with "None is true" / "All are true" |
| extra | Reorder alphabetically (top→bottom, bottom→top, anticlockwise from A) → how many keep their place | 3 | — |
| extra | #before(X) = #after(___) fill-in | 3 | — |
| extra | Analogy by relative position (W:X :: Y:?) | 1 | — |
| extra | Ratio of two position numbers | 1 | — |
| extra | Total number of persons (uncertain row) | 3 | Options span ±5 of the true total |

Sources for §4: M1–M5 PDFs; the §0 and §1 shift tables (Guidely, PracticeMock, Adda247, Careerpower, Oliveboard, PW); https://www.practicemock.com/blog/most-asked-puzzle-seating-arrangement-questions-for-ibps-clerk-2025-exam/

---

## 5. English RC themes and question mix, 2023–2026

**Themes by shift**

| Cycle / shift | RC theme (Qs) | Vocab asked |
|---|---|---|
| SBI'26bk S1 | Biotech firm growing leather-like material from agricultural waste (reported as "tomato-waste leather"; fashion shoes/bags) (9, incl. 1 in-passage blank). Careerpower reports 3 short passages; M4 shows one. | Synonyms: formed, chose |
| SBI'26bk S2 | Ships (Guidely) / environmentalist & elephant conservation (PracticeMock, Adda) (7–10) | — |
| SBI'26bk S3 | Nutrition (10) | Synonym/antonym: prompted, contain |
| SBI'25 20-Sep S1 | International ocean-pollution convention (10); PW lists "harms of polythene" (7–8) | Synonyms: deep, approach |
| SBI'25 21-Sep S1 | Family heritage printing and book-binding press (10) | Synonyms: look, took; antonym: begin |
| SBI'24 22-Feb S1/S2 | Road rage (7–9) | Antonyms: shooting, resort |
| SBI'24 22-Feb S3/S4 | Non-economic, story-type (7–9) | — |
| SBI'23 5-Jan S1–S4 | Books; fisherman; yawning; shortest day/year (8–10) | — |
| IBPS'25 4-Oct S1–S4 | Military dog (narrative); guitar/mould; ships; pandemic & community recovery (8–9) | Synonyms: trained, just, sentinel (S1) |
| IBPS'25 5-Oct S1–S4 | Solo travel; animal sanctuary; forest fire (North America); mushroom story (9–10) | — |
| IBPS'24 24-Aug S1 | Woman farmer reviving indigenous crops (story) (9–10) | Synonyms: events, stored |
| IBPS'24 31-Aug S1 | Bank-related (10) | 2–3 vocab items |
| IBPS'23 26/27-Aug | Salt (story); non-fiction (9) | 2 vocab items |
| (M) SBI'22 / SBI'21 | Renewable energy (9); lake (7–8) | — |

**Theme mix**
- Roughly 40–50% narrative/biographical passages (dog, press, farmer, mushroom, salt).
- The rest is environment, health, business/brand case studies, travel or science history.
- Banking/RBI/fintech topics are rare in clerk prelims (1 in about 25). SPEC's banking-heavy theme list should be rebalanced toward stories, environment and business cases.

**Passage and question shape**
- Passage length is ~350–500 words; SPEC's 350–550 is fine.
- One passage per shift (7–10 Qs) is the norm since 2023. SBI'26bk S1 was reported as having 2–3 short passages.

**Question-type mix** (47 RC items in M1–M5)

| Type | Share | Notes |
|---|---|---|
| Fact/detail ("according to the passage…") | 32% | Options are long, full-sentence paraphrases |
| Vocabulary: synonym of a highlighted word | 26% (2–3 per set) | 1 antonym in 5 sets; words are common verbs/nouns used in a context-specific sense |
| Statement combinations ((A)(B)(C) or I/II/III; "Only A", "Both A and C", "All") | 13% (1–2 per set) | — |
| In-passage blank (word or phrasal verb) | 9% (4 of 5 sets) | **New since 2025** |
| Single-option NOT true / incorrect / correct statement | 9% | — |
| Inference / why / significance | 9% | — |
| Main idea / core concept | 4% | — |
| Title, tone | 0% | — |

Sources for §5: M1–M5 PDFs; Guidely, PracticeMock, Adda247, Testbook and Careerpower SBI'26bk pages; https://www.careerpower.in/blog/sbi-clerk-today-exam-analysis-21-september-2025; https://www.practicemock.com/blog/sbi-clerk-exam-analysis-2025/; https://www.oliveboard.in/blog/sbi-clerk-prelims-exam-analysis-2024-5th-january/; https://guidely.in/exams/bank-insurance/ibps-clerk-exam-analysis; https://www.careerpower.in/blog/ibps-clerk-prelims-exam-analysis-31st-august-2024; https://www.bankersadda.com/sbi-clerk-exam-analysis-2022-shift-2-12th-november/; https://testbook.com/blog/sbi-clerk-prelims-exam-analysis-shift-1-12-july-2021/

---

## 6. Recent new-pattern questions, 2024–2026 (what generators and authors must support beyond SPEC)

**Reasoning**
1. **Numeric attributes inside puzzles:**
   - Prime-numbered floor or box position; an even floor above the 5th.
   - "Month with an even number of days".
   - Question stems about "a prime number of persons after X" and the ratio of two boxes' position numbers.
   - Comparison sets with actual heights, and sum/difference questions.
2. **Puzzle question stems:**
   - Alphabetical re-ordering → count unchanged.
   - "#before(X) = #after(___)".
   - An analogy inside a set.
   - "Either (a) or (b)" and "the one facing X" options for parallel rows.
   - An "Unknown person" option for uncertain rows.
   - "None is true" and "All statements true" options.
3. **Month + date grids** (4 months × 2 dates) and **sequence puzzles** (one after another) with "neither…nor" on the first slot.
4. **Series variety:**
   - Digit-only and digit+symbol strings.
   - Word series of five 3-letter words (meaningful-word counts, dictionary order, vowel counts after a letter shift).
   - 3-digit number sets.
   - Operations before positional questions: reverse part of the string, delete a class of elements, then query a position.
5. **Single-item miscellany** (one to three per shift): meaningful word with configurable none/multiple code letters (X, Y, Z); letter and digit pairs; alphabetical sort → count unchanged; digit transforms → count repeated digits; sum of even − sum of odd digits.
6. **Blood-relation mini-puzzles** with "no single parent" and "three generations" constraints, a count-of-females question and a conditional marriage.
7. **Direction point sets:**
   - 7–9 points.
   - The "four of the five pairs are alike" question.
   - Surd distances with adjacent surd distractors.
   - A composite distance after adding a point.
8. **Chinese coding "double words"** (IBPS'25) and **inequality "non-common / comma / word-based"** labels. The generators should cover two-chain inequalities and complementary either-or conclusions.

**Quant**
9. **DI derived-entity questions** in every set:
   - A new entity defined by % or ratio from a cell.
   - Sub-splits (male:female, veg share, defective returns).
   - Next-year % change.
   - Profit/cost computed from DI values.
   - The DI generator needs a "derived entity" and a "sub-split" question family.
10. **Caselets** with two totals plus cross-links (2 companies × 3 cities), male/female caselets with a total given, and SI/CI caselets.
11. **Q18 problems on numbers / linear equations** (see §1).
12. **Simplification details:**
    - Exponent unknown (base^? = value).
    - Fractional answers with 5 fraction options.
    - A negative answer.
    - "None of these" as option (e).
    - Mixed-fraction chains that resolve to integers.
13. **Recurring templates within a cycle:** two-scheme SI (ratio / difference / equal interest), participation-% split, boat with a speed ratio. Build them as parametrised templates, with different numbers each time.

**English**
14. New or under-specified formats:
    - **3-word rearrangement** (ACB/BAC/CAB/CBA + none).
    - **Fragment rearrangement** (5 parts of one sentence).
    - **Incorrect-sentence identification** (4 sentences + "All are correct").
    - **Misspelt-in-sentence with a usage error** (+ "All are correct").
    - **Phrase replacement by synonymous phrase** and **by connector**.
    - **Homophone word usage** (sow/sew-type).
    - **In-passage RC blank**.
    - **RC statement combinations (A/B/C)**.
    - **Cloze with 6 labelled blanks (A)–(F)**.
    - **Column matching whose answer is a subset**.

**Engineering rules implied by the evidence**
- Enforce 5 distinct options (reconstructions show duplicates).
- Always include the reversed ratio as a ratio distractor.
- Keep the "No error / No replacement / No interchange / All correct" answer rate at 5–10%. The observed rate is 2 of 54.
- Allow either order for the both/neither options (fixed within one set).
- Don't sort numeric options by default: shuffle them, or sort ascending for SBI-2026-style mocks.

Sources for §6: as for §1–§5 (M1–M5 PDFs and the 2024–26 shift analyses).
