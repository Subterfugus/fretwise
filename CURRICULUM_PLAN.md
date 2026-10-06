# Curriculum restructure plan: foundations to mastery

**Status:** DONE (2026-10-02). The final order differs slightly from the table below, following the step 0 audit (see `info.md` section 5 for the result). Kept as the rationale.

## The problem
The 12 core units are ordered like a theory textbook: each topic is covered in full before the next one starts. A guitarist learns differently. They play first and learn the explanation later, and they come back to the same idea with more depth each time. Symptoms:

- **Minor pentatonic** (`u8l1`) is unit 8, after diatonic harmony and barre shapes. Most players learn it in their first months.
- **12-bar blues** (`u8l5`) is in unit 8 too, though it's a beginner staple.
- **Open chords** are never taught as something to play. `u5l4` explains what's *inside* them in unit 5, but strumming patterns (`u2l6`) come in unit 2.
- **Power chords** are taught twice, in `u3l6` and `u5l3`.
- **Units don't refer to each other.** There are only 31 hard-coded "Unit N" mentions in the prose, and they will go stale as soon as anything moves.

## Principles
1. **Play first, explain later, then revisit with more depth** (a spiral). Early lessons can show a shape and a sound, and promise "you'll see why in Intervals".
2. **Move existing lessons; don't rewrite them.** Write new content only where there's a real gap (one lesson) or where a moved lesson needs a new opening paragraph.
3. **Lesson ids never change.** Ids such as `u8l1` are only keys, so progress, bookmarks and search keep working. Only the displayed unit number and order change.
4. **A test enforces the order.** A lesson may only link to lessons *earlier* in the path, unless the link is marked as a preview. Without this, the order will drift again.

## New order (core path)
Unit ids marked *new* are compositions of existing lessons; nothing is rewritten except as noted.

| # | Unit | Lessons (existing ids) | Change |
| --- | --- | --- | --- |
| **Stage 1: First steps** | | | |
| 1 | The guitar and its notes | u1l1–u1l5 | unchanged |
| 2 | Rhythm, reading and first chords | u2l1, u2l2, **NEW "Your first open chords"**, u2l6, u2l3, u2l4, u2l5 | +1 new lesson so strumming has chords to strum |
| 3 | Power chords and the blues *(new: `blues1`)* | u3l6, u8l5, u8l1, u8l4 | moved from units 3 and 8; new openings for each |
| **Stage 2: How music is built** | | | |
| 4 | Intervals | u3l1–u3l5 | loses power chords |
| 5 | The major scale and keys | u4l1–u4l6 | unchanged |
| 6 | Triads and open chords | u5l1–u5l6 | `u5l3`: trim the power-chord part to a recap link; `u5l4` now explains the chords you've been playing since unit 2 |
| 7 | Pentatonics across the neck *(new: `pent2`)* | u8l2, u8l3, u8l6 | after relative keys (`u4l6`) and triads, which these lessons need |
| **Stage 3: Harmony** | | | |
| 8 | Barre chords and the five shapes | u6 | unchanged |
| 9 | Diatonic harmony | u7 | unchanged; adds a link back to the 12-bar ("now you know why I–IV–V") |
| 10 | Seventh chords and extensions | u9 | unchanged |
| **Stage 4: Colour** | | | |
| 11 | Modes | u10 | unchanged |
| 12 | Minor keys and modulation | u11 | unchanged |
| **Stage 5: Mastery** | | | |
| 13 | Jazz and advanced harmony | u12 | unchanged |

**Electives:** these stay as they are, but show **inline** in the sidebar under the stage where they unlock, labelled *optional*:
- u14 Rhythm II after unit 2
- u15 Tunings and capo after unit 6
- u16 3rds and 6ths after unit 5
- u13 Arpeggios after unit 10
- u17 Song form after unit 9

Unit 8 (`u8`) is split up and removed. Unit 3 keeps its id `u3` but loses one lesson.

> **Do step 0 before treating this table as final.** I built it from lesson titles and a check of `u8`, not from a full read of every lesson.

## Steps

### 0. Dependency audit (analysis only, no code changes)
For each of the 101 lessons, list:
- the concepts it **assumes**: terms, symbols (♭3, Roman numerals), shapes and tools it uses without explaining
- the concepts it **teaches**

Then flag every place where a lesson assumes something taught *later* in the new order. Output: `curriculum-audit.md` with a short list of forward dependencies, plus adjustments to the table above if any are needed. **Get the owner to approve the final order here.**

### 1. Curriculum path layer (about 150 lines of code)
- **Data:** create `content/curriculum.ts`, the single source of order. It lists stages, which contain units, which contain lesson ids, plus the elective placement.
  - Unchanged units are referenced whole.
  - Composed units (`blues1`, `pent2`) list lesson ids and get a title and summary.
- **Wiring:** `content/units/index.ts` builds `UNITS` from the path: it assigns `number` from position and gathers lesson objects by id from the existing unit files. Nothing else needs to change: the sidebar, unlocking, the dashboard and search already read `UNITS` and `number`.
- **Sidebar:** group units by stage heading; electives appear inline under their stage. `App.tsx` already renders section headings.
- **Tests:** update the unit-count tests and `u15.test.ts`'s `number` check.

### 2. Quizzes follow their lessons
- Add `lesson?: string` to quiz questions. This is the same field as Sol task 3, "link quiz misses to lessons", so do that task as part of this step.
- Generators become `{ lesson, gen }`, or carry a tag.
- A composed unit's quiz is assembled from the questions tagged with its lessons. Unchanged units keep their quiz as-is, so **only u3 and u8 questions must be tagged now**. Tag the rest later for the miss-to-lesson links.
- Every unit's quiz must still have at least one generator and enough questions (`content.test.ts` checks this).

### 3. Links instead of "Unit N"
- **Tokens:** replace the 31 hard-coded "Unit N" mentions with a lesson-link token such as `[[u4l6]]` in the Markdown renderer. It renders as a clickable "Relative minor keys (Unit 5)" with the *current* number, so it never goes stale. Use `[[preview:u10l1]]` for deliberate forward references ("you'll meet modes later").
- **Test:** every token resolves, and non-preview links only point backwards in the path.
- **Builds on:** each lesson header shows a small "Builds on" line, taken from the backward links its text contains. This needs no extra data.

### 4. Bridging text (small content edits)
- **New openings for moved lessons:** `u3l6`, `u8l1`, `u8l4` and `u8l5` each get a new first paragraph written for a beginner, e.g. "learn the shape and sound now; the ♭3 and ♭7 labels will make sense in Intervals".
  - `u8l5` describes I–IV–V as "the chords built on notes 1, 4 and 5 of the key", with a preview link to diatonic harmony.
  - Keep the rest of each lesson.
- **Recap paragraphs:** `u5l3` (power chords), `u5l4` (open chords) and `u7` (the 12-bar) get a one-paragraph "you already play this; here's why it works" recap that links back.
- **New lesson:** write one, "Your first open chords": E, A, D, G, C, Am, Em, Dm, plus switching between two chords in time. Use `OPEN_CHORDS` and the existing helpers, and follow the content rules (sound in every lesson, at least one `tryIt`).

### 5. Progress safety
- **Never re-lock earlier work:** a unit is unlocked if its prerequisite is passed **or** any of its lessons is already done. This is one line in `isUnlocked`.
- **Legacy quiz passes:** an old pass of `u8` counts as passed for both `blues1` and `pent2`. Handle this in the unlock and pass check, not by rewriting the saved file.
- Bookmarks, `lessonsDone` and `lastLesson` need nothing, because lesson ids don't change.

### 6. Verify
- Typecheck and tests pass, including the new "links only point backwards" test.
- In the browser preview, walk the path with `unlockAll` off. Check that the sidebar order, unlocks, quizzes and links behave, and that the old progress shape loads and nothing previously opened is locked.

## Cost estimate
- **Code:** about 200–300 lines (path layer, quiz assembly, link tokens, unlock rule, tests).
- **Content:** 1 new lesson, about 8 new opening or recap paragraphs, 31 reference conversions, and question tags for u3 and u8.
- **Existing lessons:** none are rewritten.

## Later (only if wanted)
Once the path layer exists, more reordering is just editing `curriculum.ts`, for example moving `u1l5` ("The whole neck") next to the pentatonics. More spiral revisits can be added as recap paragraphs, without moving lessons.
