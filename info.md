# Fretwise: project state and handoff notes

**Living document.** Any agent or developer (Claude, Codex, a human) must be able to continue from this file alone. Update **Status**, **Next up** and the **Changelog** whenever you change something. Last full rewrite: 2026-10-02.

---

## 1. What this is and who it's for
Fretwise is a **desktop app** (Electron, not browser-based) that teaches music theory **from a guitarist's point of view**. The owner explicitly asked for guitar-first teaching: fretboard diagrams, chord shapes, tab and **real recorded sound** everywhere.

It has:
- an 18-unit curriculum (13 core units and 5 electives), organised into five stages, with 102 lessons and quizzes
- ear training
- a microphone tuner and play-along that listen to the user's real guitar
- a large Tools section
- themes

### Owner preferences and working rules (important)
1. **Environment:** Windows 11, PowerShell 5.1. Run commands from the project root.
2. **Never touch the owner's real progress file** at `%APPDATA%\Fretwise\progress.json`. The owner uses the app. For automated checks, use one of:
   - the browser preview (progress goes to localStorage), or
   - an isolated Electron profile: set the env var `FRETWISE_USER_DATA=<temp dir>` (supported in `src/main/index.ts`).
3. **Desktop shortcut:** the owner's `Fretwise` desktop shortcut points at `dist\win-unpacked\Fretwise.exe`, so every `npm run build:win` updates what the shortcut opens.
   - Close the app before rebuilding, because `win-unpacked` is locked while it runs.
   - The installer `dist\Fretwise Setup 0.1.0.exe` is unsigned, so SmartScreen shows a warning.
4. **Sub-agents:** for Codex, the owner authorizes GPT-6.1 Sol agents at **High reasoning or lower**, as needed. Claude's earlier preference was Sonnet at medium effort; its suggested project agent file was not created.
5. **Downloads:** the owner authorized needed downloads for the chord identifier, target-tone mode and SOL_TASKS review batch. No new app dependencies or instrument samples were added; installer tooling obtains the Electron distribution as needed.
6. **The owner hands work to Codex when Claude usage runs out.** Keep this file accurate and complete.
7. **Git:** the project is a git repository (branch `main`) with a **private** GitHub remote, `https://github.com/Subterfugus/fretwise`. `node_modules/`, `out/` and `dist/` are ignored; the instrument samples are committed. Commit or push only when the owner asks.
8. **No personal information in this file** (or anywhere in the repository) unless it is absolutely necessary. That means no real names, usernames, email addresses, or machine-specific paths such as a user folder. Write "the owner", "the project root", `%APPDATA%` or `<temp dir>` instead. The GitHub URL above is the one necessary exception.

---

## 2. Stack and commands
| Part | Tool |
| --- | --- |
| App shell | Electron 44 + electron-vite 5 (Vite 7). electron-builder (NSIS) for the installer. |
| UI | React 19 + TypeScript 7 (`tsc` is the native TS7 compiler) + Lucide icons |
| Audio | Tone.js 15 `Sampler` with real samples from tonejs-instruments (CC-BY 3.0): acoustic, nylon and electric guitar, plus piano. Samples live in `src/renderer/public/samples/` with a `manifest.json` and are bundled. Works offline. |
| Notation | VexFlow 5 (`vexflow/bravura` entry); fonts embedded |
| Tests | Vitest: **1,083 tests, 54 files**, all passing (2026-10-02, after the visual polish) |

Run everything from the project root:
```
npm run dev            # Electron app with hot reload
npm run typecheck      # tsc --noEmit -p tsconfig.json
npm test               # vitest run
npm run build:win      # electron-vite build + installer -> dist/ (also refreshes dist/win-unpacked)
npm run fetch-samples  # one-time sample download (already done; asks the network)
npm run render-icon    # build/icon.svg -> build/icon.png + src/renderer/public/icon.png
npx vite --config vite.preview.config.ts   # renderer only, in a browser at http://localhost:5199
```

### How to verify changes (the established practice)
1. Run `npm run typecheck` and `npm test`.
2. **Browser preview** (port 5199) for UI. Progress uses localStorage key `fretwise-progress`; set `settings.unlockAll: true` there to open every unit. A useful pattern is sweeping every lesson and quiz with injected JS and collecting `console.error` output.
3. **Real Electron with an isolated profile:**
   1. `npx electron-vite build`.
   2. Set `FRETWISE_USER_DATA=%TEMP%\fretwise-selftest`.
   3. Run `npx electron-vite preview --skipBuild`.

   For scripted checks, a temporary `FRETWISE_SELFTEST` hook in `createWindow()` (`webContents.executeJavaScript` after load, log, `win.close()`) has worked well. **Remove the hook afterwards**; it is not in the code now.
4. Rebuild the installer: `npm run build:win`.

### Environment pitfalls
- **BOM:** PowerShell 5 `Set-Content -Encoding utf8` / `Out-File` write a **BOM**, which breaks `package.json` parsing. Write files with `[IO.File]::WriteAllText(path, text, (New-Object Text.UTF8Encoding $false))` or the editor tools.
- **Mojibake:** reading a UTF-8 file as cp1252 and saving garbles ♯ ♭ × – (it happened to this file once). Keep files UTF-8.
- **Backticks:** in PowerShell double-quoted strings, a backtick is an escape character (e.g. `` `r `` becomes a carriage return). Don't put Markdown code spans in double-quoted PowerShell strings.
- **Case-insensitive filenames:** Windows treats `exercises.ts` and `Exercises.tsx` as the same file. That is why `features/mic/exerciseLogic.ts` has that name.
- **npm install scripts:** npm 11 `allow-scripts` blocks them. The Electron binary downloads on first run via `node node_modules/electron/install.js`.
- **Vite version:** must stay on 7 (electron-vite 5's peer range), with `@vitejs/plugin-react` 5.

---

## 3. Architecture map
```
src/main/index.ts       Electron main process.
                        - Serves the built renderer at app://fretwise/ (protocol.handle + net.fetch; file:// breaks fetch()).
                        - Path-traversal-safe resolver: rendererPath.ts (+ tests).
                        - Progress: atomic, queued saves; sync save on quit via IPC progress:saveSync;
                          a corrupt file is kept as .corrupt.
                        - Single-instance lock.
                        - Blocks will-navigate and only opens http(s) externally.
                        - Grants the media permission only to app URLs (isAppUrl) for the mic.
                        - FRETWISE_USER_DATA override.
                        - Window icon from out/renderer/icon.png.
src/preload/index.ts    window.fretwise = { loadProgress, saveProgress, saveProgressSync }
src/renderer/index.html CSP: self + blob: scripts/workers, data: fonts, inline styles.
src/renderer/src/
  public/theme-boot.js  Classic parser-blocking head script applies the cached theme before React/first paint.
  main.tsx              Imports styles.css, themes.css;
                        loads progress; sets engine instrument/volume; renders App.
  App.tsx               Sidebar + routes (Route union: home, unit, lesson, quiz, ear, mic, tools(+tab/launch/origin), settings,
                        library ...). Pages remount on each navigation (key=nav). ErrorBoundary. Ctrl+K opens lesson search.
                        Lesson tool returns restore the source block after notation/font layout.
                        Sidebar groups units under stage headings; electives sit inline (italic, "E" badge).
  theory/               Pure TS, heavily tested:
    notes.ts            Spelled notes, parseNote, midi, pretty() (ASCII # / b -> ♯ ♭ for display, word-safe)
    intervals.ts        Intervals, transpose with correct spelling, intervalBetween (handles descending/compound)
    scales.ts           SCALES (modes, minors, pentatonics, blues, exotic, chromatic), buildScale, degree labels
    chords.ts           CHORDS (29 types incl. augMaj7, 7♭9, 7♯9, 11, 13, maj7♯11), buildChord, diatonicChords, romanFor
    keys.ts             Key signatures (counts double sharps), circle of fifths, relative keys
    guitar.ts           Strings numbered 1 = high E … 6 = low E; FretPos {string, fret}. midiAt/nameAt/positionsOf
                        (optional tuning), shape(), OPEN_CHORDS, movableChord, cagedShape (real-barre rule),
                        scaleBox/pentatonicBoxes, shapeMidis(s) [single arg, used in .map] and shapeMidisIn(s, tuning?, capo?)
    tunings.ts          STANDARD, DROP_D, DADGAD, OPEN_G/D/E, DOUBLE_DROP_D, HALF/FULL_STEP_DOWN, TUNINGS + helpers
    spelling.ts         spellPc / spellMidi for the note-name setting
  audio/engine.ts       `engine` singleton:
                        - Playback: playNote, playNotes (block|strum|arpeggio), playInterval, playSequence, playRhythm.
                        - stop() really silences scheduled notes: an epoch counter plus per-session samplers that are
                          disposed. wait() is cancellable.
                        - For long-running players: registerStopHandler, unlock, createBus, createSampler.
  audio/play.ts         runPlay(PlaySpec)
  components/           Fretboard (SVG; keyboard navigable; left-handed; tuning/capo; mark colours),
                        ChordDiagram (tuning/capo), Notation (Staff/Tab via VexFlow; triplets; tab timeSig; tuning),
                        noteValues.ts, tuning.ts (pure tuning helpers), PlayButton, Markdown (### headings, lists,
                        **bold**, *italic*, `code`, [[lesson]] links), CircleOfFifths, ErrorBoundary
  content/types.ts      Content model:
                        - Block: text, tip, fretboard, chords, tab, staff, audio, audioRow, table, circleOfFifths,
                          tryIt, playIt.
                        - QuizQuestion: mc, fretboard, spell, text.
                        - Unit { id, number, title, summary, lessons, quiz {count, fixed, generators},
                          elective?, requires?, stage?, legacyPass? }.
                        - QBase.lesson? / QuestionGenerator.lesson?: the lesson that teaches a question (routing + links).
                        - MarkColor: root, tone, accent, blue, muted (= red "wrong"), ghost, mute (neutral ×).
  content/helpers.ts    mc(), m(), scaleMarks(), shapeMarks(), chordToneMarks(), noteMarks(), playScale(),
                        playChord(), playInterval(), playMarks(), strum()
  content/toolExamples.ts Explicit scale/chord/progression launch metadata, attached to blocks, plays and marks.
                        Scale/chord helpers carry context; authored progressions keep root, Romans and scale.
  content/grading.ts    grade() (interval abbreviations such as M6/m6 are case-sensitive), buildQuiz() (dedupe by
                        questionKey, top-up from fixed questions)
  content/curriculum.ts THE TEACHING ORDER. STAGES + PATH (unit id, stage, lesson ids, optional title/summary,
                        elective/requires, legacyPass). buildCurriculum(BANKS) builds UNITS: numbers core units 1..13 in
                        path order and electives 14+, gathers lessons by id, routes quiz questions (tagged -> unit
                        holding that lesson; untagged -> unit with the bank's id). taught()/forLesson() tag questions.
                        unitLabel(u) = "Unit N" | "Elective". Throws on unplaced/duplicate lessons or untagged orphans.
  content/units/        Lesson BANKS u01..u17 (files keep their original ids/numbers; tests import them directly).
                        index.ts exports BANKS, UNITS (path order), findLesson, LESSON_ORDER.
  features/lessons      UnitView, LessonView (+ "Builds on" line from its backward links), BlockView, BookmarkButton,
                        lessonLinks.tsx ([[u4l6]] / [[u4l6|text]] / [[preview:u10l1]] tokens, LessonNavContext,
                        resolveLessonTokens for search), lesson library/search (lessonSearch.ts),
                        LessonToolActions / lessonTools (validated one-shot launches, no prose guessing).
  features/quiz         QuizView (records the attempt on the last answer), QuestionView
  features/ear          7 drills (intervals, chord quality, scales/modes, progressions, scale degrees,
                        melodic dictation, note finder), stats, "practise weakest" weighting
  features/mic          Tuner + play-along (see section 6)
  features/tools        Explorer, Dictionary (chord library + key pages), Looper, Metronome, Triads, Note Finder,
                        Scale Comparison, Chord Identifier, Voice Leading, Reharmonisation, presets (see section 6)
  features/dashboard, features/settings (incl. ThemePicker)
  state/progress.ts     Progress store (useSyncExternalStore). mergeProgress validates every field, so old or corrupt
                        saves still load. Debounced save, plus a flush on beforeunload/pagehide.
  state/unlock.ts       prerequisites(u) (previous CORE unit, or requires), isPassed(u) (incl. legacyPass),
                        isUnlocked(u) (also open if any of its lessons is done: reordering never re-locks work)
  state/bookmarks.ts, practiceTypes.ts, toolPresets.ts, useSpelling.ts
  themes.css / themes.ts / public/theme-boot.js   Theme system (section 6)
```

### Progress file schema (`progress.json`, all fields validated in `mergeProgress`)
```
version: 1
lessonsDone: { lessonId: timestamp }
quizzes: { unitId: { best, last, attempts, passed } }
ear: { drillId: { itemKey: { right, total } } }
earHistory: { drillId: [...last 30 sessions] }
mic: { stats: { key: MicStat }, memoHistory: [...] }
practice: { triads, noteFinder }
toolPresets: [...]
bookmarks: [lessonId...]
settings: { instrument, unlockAll, volume, leftHanded, noteNames ('auto'|'sharps'|'flats'|{key}), theme }
lastLesson?
```
**Rule:** any new field must be added to the type, to `DEFAULT` and to `mergeProgress` validation, so old files still load. "Reset progress" clears learning data but keeps settings, presets and bookmarks.

Practice records without `assisted` or session `durationMs` retain their counts and receive zero defaults. Prototype-style dictionary keys are rejected; quiz and ear numbers are finite and clamped. Looper presets optionally include `targetOn`, `targetMode`, `targetPreview`, `fretLo` and `fretHi`; legacy presets load with the ordinary all-chord-tone view and frets 0–15.
Looper presets also accept optional `keyMinor` for explicit lesson key context. Explorer presets accept optional `boxWindow` to intersect a scale box with their existing `lo`/`hi` bounds; old presets keep unrestricted boxes. Selected Looper scales validate against the full scale catalog, preserving exact lesson modes rather than silently replacing them with the first fitting suggestion.
Looper presets now optionally include `durations` (one quarter-beat-aligned value per original chord, 0.25-32 beats), `loopSection` (inclusive original `start`/`end` indices or null), and `countInBeats` (0/2/3/4/6/8). Legacy presets and lesson seeds explicitly clear absent fields to uniform timing, whole progression and no count-in. Loading a preset stops sound and applies all configuration without autoplay.

---

## 4. Key decisions and constraints (keep these)
- **Bass:** always from the **lowest sounding MIDI pitch**, never from string order or the lowest fret. This applies to the chord library, triads, slash names and `voicings.ts`.
- **Spelling:**
  - Data uses ASCII (`F#`, `Bb`); the display converts it with `pretty()`.
  - Deliberately spelled theory (scale and chord spellings, lesson prose, quiz answers) **never** follows the note-name setting.
  - Only computed labels follow it: fretboard/hover names, ear reveals, mic readouts, root pickers.
- **Audio exclusivity:**
  - `engine.stop()` stops everything, including the looper and metronome through stop handlers.
  - Starting the looper or metronome stops other playback.
  - Leaving a page stops sound.
  - Fretboard clicks don't stop the looper, so you can play over it.
- **Curriculum order (2026-10-02 restructure):** teaching order lives ONLY in `content/curriculum.ts`. Lesson ids never change (progress, bookmarks and search depend on them), so reorder by editing `PATH`, never by renaming. Bank unit files keep their old `id`/`number` fields; the displayed number comes from the path.
  - Lesson prose must not hard-code "Unit N": use `[[lessonId]]` tokens (text/tip md only, not inside bold/italic/code). Plain links must point backwards along the path, `[[preview:...]]` forwards. `curriculum.test.ts` enforces this, plus every lesson placed once and every question routed once.
  - Moving a lesson into a different unit means tagging its quiz questions/generators with `taught()`/`forLesson()`.
- **Unlocking:**
  - Core unit N needs core unit N−1's quiz passed (pass mark 80%); electives in between are skipped.
  - Electives use `requires` (u14←blues1, u15←u5, u16←u5, u17←u7, u13←u9).
  - A unit with any finished lesson stays open. An old pass of retired `u8` counts for `blues1` and `pent2` (`legacyPass`).
  - "Unlock all" in Settings bypasses this.
  - Search never bypasses locks.
- **Content rules** (enforced by `content/content.test.ts`):
  - Every lesson has sound and at least one `tryIt`.
  - Every quiz mixes fixed questions with generators.
  - Every generator is run 40 times and its answers must grade correct.
  - There are 18 path units (13 core, 5 electives), each with at least 3 lessons, and each elective's `requires` points at an earlier core unit.
- **Colours:**
  - Colours are defined **only in `themes.css`**.
  - `themes.test.ts` fails if any colour literal appears elsewhere in CSS or TSX. It also checks that every theme defines every variable and passes WCAG contrast and colour-distinctness checks.
  - A new theme needs a full `[data-theme]` block plus an entry in `themes.ts`.
- **Notation:** VexFlow always draws in black, so `--notation-bg` stays light in every theme.
- **Tuning convention:** `tuning` is the MIDI of the open strings, index 0 = string 1.
  - On fretboard blocks, capo frets are **absolute** (counted from the nut).
  - On chords and tab blocks, capo frets are **relative to the capo**.
- **"CAGED":** the owner said CAGED was only a layout example. Don't build features named after or organised around a CAGED system. (Unit 6 teaches the five shapes as content.)
- **Mic:** single notes only. Targets are sounding pitches (`'A2'` is exact; `'G'` matches any octave).

---

## 5. Curriculum
102 lessons in 18 path units (13 core, 5 electives), grouped into 5 stages. Foundations to mastery: play first, explain later, revisit with depth. The order is defined in `content/curriculum.ts`; the original audit is in `CURRICULUM_PLAN.md`.

| # | Path unit (id) | Lessons | Notes |
| --- | --- | --- | --- |
| **Stage 1: First steps** | | | |
| 1 | The guitar and its notes (u1) | u1l1–5 | |
| 2 | Rhythm, reading and first chords (u2) | u2l1–4, **u2l7**, u2l6, u2l5 | u2l7 "Your first open chords" (E A D G C Am Em Dm A7 D7 E7), added in the restructure |
| 3 | Power chords and the blues (`blues1`) | u3l6, u8l1, u8l4, u8l5 | Beginner bridging openings; the 12-bar ties power chords and the pentatonic together |
| E | Rhythm II (u14) | | requires blues1 |
| **Stage 2: How music is built** | | | |
| 4 | Intervals on the fretboard (u3) | u3l1–5 | u3l5 now ends with inverted power chords and double stops |
| 5 | The major scale and keys (u4) | u4l1–6 | |
| 6 | Triads and open chords (u5) | u5l1–6 | u5l3 recaps power chords; u5l4 "what's inside the chords you've been playing" |
| 7 | Pentatonics across the neck (`pent2`) | u8l2, u8l3, u8l6 | u8l3 now includes the major blues scale |
| E | Alternate tunings and the capo (u15) | | requires u5 |
| E | Harmonised 3rds, 6ths and double stops (u16) | | requires u5 |
| **Stage 3: Harmony** | | | |
| 8 | Barre chords and the five shapes (u6) | u6l1–6 | |
| 9 | Diatonic harmony (u7) | u7l1–6 | u7l2 links back to the 12-bar |
| 10 | Seventh chords and extensions (u9) | u9l1–6 | u9l4 now holds the movable barre 7ths (moved from u8l5) |
| E | Song form and songwriting (u17) | | requires u7 |
| E | Arpeggios across the neck (u13) | | requires u9 |
| **Stage 4: Colour** | | | |
| 11 | Modes (u10) | u10l1–6 | |
| 12 | Minor keys and modulation (u11) | u11l1–6 | |
| **Stage 5: Mastery** | | | |
| 13 | Jazz and advanced harmony (u12) | u12l1–6 | |

Bank file `u08-pentatonic-blues.ts` has no path unit of its own any more; every u8 question is tagged. Its spell/hear generators are split: minor pentatonic + blues only in blues1, all three scale types in pent2. Each elective has 6 lessons, 19–26 fixed questions and 6 generators. `playIt` blocks appear across the units (the mic play-along).
**Content limitations:**
- The staff block can't draw triplets, ties across a bar line, slides or bends (tab or prose is used instead).
- Rhythm audio has no volume accents (pitch stands in for accent).
- Dotted notes in tab are timed correctly but the dot isn't drawn.

---

## 6. Feature notes

### Ear training (`features/ear`)
- **Drills:** 7, each with presets, custom item sets, keyboard shortcuts (Space replays, 1–9/0 answers, R reference, Enter next), "hear what you picked", per-item stats and "practise weakest" weighting.
- **Stats keys:** intervals use short names (`P5`); chords use types; scales use ids; progressions use ids or numerals; scale degrees use `1`/`b3`; dictation uses steps (`2up`); note finder uses frets (`f0`–`f12`).

### Mic tuner and play-along (`features/mic`)
- `pitch.ts`: McLeod pitch method with parabolic interpolation, RMS gate 0.008, clarity 0.8, range 70–1400 Hz. Octave-error protection works both ways (energy checks at f/2 and f/3).
- `onset.ts`: a note counts once stable for at least 90 ms over 3 frames. A repeated note needs a re-pluck (RMS rising 1.5×) or 150 ms of silence.
- `micInput.ts`: getUserMedia with all processing off, its own AudioContext and an analyser that is never connected to the output. `muteFor()` ignores input while the app plays reference tones. The mic is released on unmount.
- **UI:** Tuner (guitar or chromatic mode, A4 from 415 to 466, in tune within ±5 cents), exercises (note, interval, scale, arpeggio, timed memory drill), `PlayItBlock` for lessons.
- **Settings:** stored in localStorage `fretwise-mic-settings`.
- **Verified:** synthetic-signal tests only, plus mic permission in Electron. **Not verified with a real guitar.**
- **Limitations:** about 150–200 ms latency; "on string N" is checked by pitch only; reference tones play at A440; tuned-down E♭2 is near the 70 Hz floor.

### Tools (`features/tools`)
- **Explorer:** any root plus scale/mode/chord on the neck, labelled by note, interval or degree, with position filters and diatonic chord chips.
- **Chord & scale dictionary:**
  - **Library** (`chordLibrary.ts`): `chordLibrary(root, type)` is memoized; don't mutate the result.
    - It covers all 29 types and merges 567 curated templates (`chordShapesData.ts`, hand-checked, `shape()` syntax) with open shapes, barre shapes and generated shapes. When shapes duplicate, priority is curated, then open, then barre, then generated.
    - Generated shapes span at most 3 frets (4 for 3-string shapes) and use at most 4 fingers. They are labelled "generated" and not promised to be comfortable.
    - `omitted` uses the degree labels from `chordDegreeLabels` (an m7♭5 shell omits "♭5").
    - Rootless shapes are allowed for 9/11/13/altered types.
    - Regions: 0–4, 5–8, 9–12, 13–17, 18–22.
    - Sizes: Bm 95, G7 166, C11/C13 about 350.
  - **UI:**
    - `DictionaryTab`: search (e.g. "Bm", "D major", "key of Bb", "E dorian") and a history trail with "Back to …" and breadcrumbs.
    - `ChordEntry`: neck map grouped by region, 6 per region with "Show more"; filters; a large selected view; chord and arpeggio playback; compare 2–4 shapes.
    - `KeyEntry`: scale, degrees, diatonic triads and sevenths with Roman numerals and function, each linked to its chord entry.
- **Backing-track looper:** preset or custom Roman-numeral progressions, five feels, drums and bass, scales that fit. A single `Transport.scheduleRepeat` on a tick grid; changes apply at the next tick.
  - **Timing and sections:** Uniform or Per chord timing; each chord accepts 0.25-32 beats in quarter-beat steps. Default beats sets newly added chords without overwriting existing durations. Selected section repeats an inclusive range of original progression indices; excluded chords are dimmed, and the next-target preview wraps to the section start. Append/delete keeps timing and section indices aligned. Editing section bounds previews the new starting chord.
  - **Count-in:** Off by default, or 2/3/4/6/8 beats, using audible clicks even with drums Off. It runs once per explicit Play, not every loop. The requested count is captured at Play, including while samples load; later count edits affect the next start. Current/next targets are hidden while counting, and Stop cancels loading/counting immediately.
  - Timing, section, uniform beat-grid and chord-count edits stop/reset active playback; tempo, key, feel, accompaniment and instrument remain live. Drums keep a continuous bar phase across unequal chord boundaries and section wraps. Original audio-clock target synchronization and stale-load/callback protection remain intact.
  - **Target tones:** select all tones, root, 3rd, 5th, 7th, or guide tones (3rd/7th), plus a fret window. The current chord stays synchronized through `Tone.Draw` on Transport's audio clock. Optional upcoming-chord targets appear in the final beat (final half beat for one-beat chords), clear at the boundary and on stop, and ignore stale callbacks after changes. Missing thirds/sevenths are stated rather than invented; this is unscored exploration, with no perfect-pitch requirement.
  - Target settings round-trip in named presets. Loading stops playback and never autostarts or changes global settings. Fret clicks still let the user play over the running loop.
- **Chord Identifier:** tuning/capo-aware editable six-string shape, absolute-fret keyboard board and relative-fret inputs, per-string open/mute controls, strum/arpeggio, bass from actual minimum MIDI, ranked chord/slash names, tones/degrees/omissions, and a direct dictionary link. Two pitch classes yield an interval or power chord; unknown sets still show notes and bass-relative intervals. Rootless/omitted readings are explicitly labeled, not claimed as unique. Practical resolved chord spelling keeps matched tone/slash names coherent; raw input names obey global preferences.
  - Pure matching in `chordIdentifier.ts`; validated physical preferences in `identifierInput.ts`. All 1,046 reference-root expansions of the 567 curated templates return their declared type/root in the first six names (worst rank 5). Fully specified chords are also checked in all 12 roots.
- **Voice Leading:** a Tools tab beside the Identifier and Dictionary. Six major/minor progression presets or strictly validated custom Roman numerals (up to 64 chords), all 12 key centres, adjacent three/four-string sets, and inclusive fret windows 0-22. All 29 dictionary chord qualities are supported. Chords with at most four distinct tones require complete dictionary voicings; triads on four strings may double a tone. Larger extensions use dictionary-validated omissions, which are displayed on each step and in the detail view. Seventh chords need four strings; impossible ranges show the missing chord steps and offer full-neck/four-string recovery.
  - `voiceLeading.ts` uses dynamic programming to minimize summed absolute semitone movement across the entire progression, then summed shape difficulty and deterministic shape order. Every voice stays on its original string. This is the best path among the existing library's filtered candidates, not a claim about every possible fingering. An optional starting-shape ID pins the first step and recomputes the remainder; stale IDs fall back to automatic.
  - Selected/current chord tones, exact held notes and ghost next-chord positions share a keyboard-playable neck. The movement table lists per-string MIDI-spelled notes, chord degrees, frets and signed up/down/hold movement. Bass/slash names use actual MIDI bass. Notes update with global spelling; the board mirrors cleanly and centers selected/upcoming shapes after resize, including at 760px. Each chord links directly to its Dictionary entry.
  - `voiceLeadingPlayer.ts` owns a cancellable finite sequence using the existing sampled instruments. Block, strum and arpeggio playback, 40-220 BPM and 1/2/3/4/6/8 beats per chord; audible chord changes update selection through the audio clock's Draw callbacks. Individual chords can be auditioned. Stop, configuration edits, navigation and stale asynchronous loads cannot leave future chords running. Global instrument/volume preferences are not changed.
  - Complete validated preferences persist in `fretwise.tools.voiceLeading.config`; no autoplay, learning scores or microphone use. `voiceLeadingConfig.ts` holds presets/string sets/validation. Perfect pitch is never required. Scope is standard tuning, fixed string assignments and a single playback pass, without loop-boundary optimization or named practice-set storage. The Roman parser covers all dictionary qualities, including altered dominants, minor-major and augmented-major sevenths, sus, power chords and extensions.
- **Reharmonisation:** a Tools playground for entering Roman numerals or chord symbols, choosing any key centre and major/minor context, and comparing an untouched original against editable substitutions. Six starting progressions; strict atomic input supports all 29 dictionary qualities and local `V/x` / `V7/x` applied dominants, materialized into ordinary Looper-compatible Romans. Degrees remain major-scale-relative in minor (e.g. `bIII`). Named notes/chords are visible throughout; no perfect pitch or microphone is required.
  - `reharmonisation.ts` generates contextual **tritone substitutions**, **secondary dominants**, **parallel-mode borrowed chords**, and **related ii before V**. Explanations identify actual roots, guide tones, leading tones, target resolutions and melody compatibility. Dominant extensions/altered fifths are explicitly not retained by a plain dominant-seventh tritone substitution. Borrowed chords must belong to the parallel scale and introduce a non-home pitch. Minor ii-V targets receive half-diminished ii. Existing incoming dominants/related ii chords are not duplicated.
  - Apply changes individually or stack them, filter by technique/chord, undo/redo up to 30 changes, and reset to the original. Insertions split the original slot equally, preserving total duration and comparison tempo. Quarter-beat durations stay within 0.25-32 beats; impossible splits and insertions beyond 64 chords are suppressed. Clean submissions cannot flatten unequal lesson timing. New input replaces both original and working progressions; the new-chord-beats control affects this replacement only.
  - `reharmonisationPlayer.ts` owns finite sampled block/strum/arpeggio playback at 40-220 BPM. Before, After, one continuous Before then after (one-beat gap), and individual-chord auditions use the same voicings/timing. Audio-clock Draw callbacks highlight the sounding chord. Stop, edits, instrument changes, chord inspection and navigation cancel playback, including stale sample loads and future callbacks. Inspector includes intentional chord tones, a diagram, keyboard-playable/mirrored fretboard and direct Dictionary link; selected shapes center after resize.
  - **Send to Looper** stops audio and atomically transfers exact working Romans, durations, key/minor context, tempo, current global instrument and a complete target-tone-enabled configuration. Full progression section, count-in Off and no autoplay. Arpeggio stays arpeggio; block/strum use Looper's straight strum feel. Lesson return origin survives this handoff and Dictionary navigation. Tonal major/minor lesson progressions offer **Reharmonise this**, including all Unit 11/12 examples; modal examples keep their existing actions.
  - Complete validated original/working preferences persist at `fretwise.tools.reharmonisation.config`; malformed records fall back safely. Undo/redo, filters, input drafts and lesson origin are transient. Unscored, no unlock/quiz/global preference changes. Scope is standard-tuning chordal exploration of a finite progression, without slash-bass input, melody analysis, loop-boundary inference or named Reharmonisation presets. Suggestions are auditionable options, not claims that every substitution fits an existing melody.
- **Metronome:** 30–300 BPM, tap tempo, 7 time signatures, subdivisions, tempo trainer.
- **Triads:** Explore and Build modes with diagnostics, the closest correction and unscored repair.
- **Note Finder:** visual and graduated.
- **Scale Comparison:** overlays two scales on the fretboard with independent Root A/Root B, an optional Same root link, and complete root/scale swapping. Existing parallel comparisons remain, with new major/relative-minor and major/relative-Dorian presets. Membership compares absolute sounding pitch classes, while each side retains its own intentional note spelling and degree labels. Solid/dashed outer tonic rings distinguish A/B without replacing membership colours; relative scales explicitly show that identical pitches can have different tonics and degrees.
  - Separate Tonic A/B buttons and optional tonic references before each scale establish context without requiring perfect pitch. References use the scale's spelled major/minor/diminished/augmented/suspended tonic harmony when unambiguous, otherwise tonic octaves. A then B uses each side's own tonic. Playback, references and gaps are cancellable on Stop, edits, instrument changes or navigation.
  - Complete validated configuration persists under `fretwise.tools.comparison.config`. New defaults enable pre-scale references; legacy records without the new fields retain a shared root and references Off. No autoplay, microphone scoring or global preference changes. Octave 2 lifts roots below E2 into guitar range.
- **Presets:** Explorer, Looper and Metronome have named presets (stored in progress). Other tool preferences are in localStorage under `fretwise.tools.*`.
- **Controls:** `Seg` requires a named group and exposes `aria-pressed`. `NumberInput` holds partial typing locally and commits validated/clamped values on blur or Enter; Escape/invalid drafts revert. Scale Comparison octave 2 lifts roots below E2 into the guitar range for scales and references.

### Lesson library
Ctrl+K opens full-text lesson search, with All/Bookmarks views and filters. Bookmarks are stored in `progress.bookmarks`.

### Open lesson examples in tools (2026-10-02)
- Instructional examples now have compact, keyboard-accessible launch rows. Progressions offer **Loop this**, **See the voice leading**, and **Explore this scale**, plus **Reharmonise this** for tonal major/minor contexts; chords offer **Identify chord** and **See all shapes**; scale examples open Explorer. A labeled Example selector handles multi-example blocks and separately keyed modulation sections.
- Coverage spans the core and elective curriculum: chromatic/major/minor/modal/pentatonic scales and boxes, chord diagrams and arpeggios, cadences, pop progressions, full blues forms, secondary dominants/borrowing, jazz resolutions/turnarounds, and song sections. Explicit authored metadata and known helper context are used; prose and arbitrary note collections are not guessed. Quiz/try-it answers and microphone targets do not receive launch buttons. Unlock rules and locked-search snippets are unchanged.
- `lessonTools.ts` derives actual sounding chord tones from diagrams/shape audio, including capo and alternate tuning. Identifier preserves the physical shape; Dictionary opens its sounding root/quality. A named chord without a physical shape receives a standard-tuning library shape, not frets retuned accidentally.
- Progression launches atomically seed the Looper's full configuration with target tones enabled, exact Roman qualities, explicit major/minor context and source scale. Voice Leading uses three or four strings as appropriate. Explorer preserves scale type, box and fret window, including their intersection. Chromatic was added to the scale catalog for Unit 1 launches.
- Routing stops current audio. Loading never autoplays, completes a lesson, changes scores/unlocks or overwrites global volume/instrument/handedness/note-name preferences. Seeds apply before initial render and only once; subsequent tool edits survive tab changes. Tool preferences persist normally. **Back to [lesson]** restores the source block and library origin, including after a chained Dictionary link; the origin itself is transient.
- These launches are editable harmonic practice views, not literal audio/tab transcriptions. Looper carries source durations when the sequence/tab has one matching sounding chord event per authored Roman numeral, including Unit 7's diatonic run and the Drop D power-chord riff. Nonmatching riffs, arpeggios and shuffle figures retain the authored harmonic practice grid; no arbitrary note/prose inference is used. Voice Leading still uses a uniform beats-per-chord setting. Looper and Voice Leading revoice in standard tuning; Identifier preserves alternate-tuning/capo diagrams. Original lesson audio, notation, prose and quiz answers are unchanged.

### Note names
The Settings "Note names" option offers Auto (by key), Sharps, Flats, or By key. It is applied via `theory/spelling.ts` and `state/useSpelling.ts`. Computed fretboard marks use `FretMark.computedNote`.

### Themes (2026-10-02)
- **Themes:** Dark (default), Light, High contrast, Stage, Sunburst, Maple, Surf Green.
- **Setting:** `settings.theme` (unknown values fall back to dark), applied as `<html data-theme>`. `public/theme-boot.js` runs in the head before React and applies the cached copy from localStorage (`fretwise-theme`); CSP remains self-only. `applyTheme` writes the cache only when it differs.
- **Picker:** in Settings, a radio-card grid with live mini previews.
- **Variables:** about 70 semantic variables (surfaces, text, accents, on-colours, tints, fretboard `--fb-*`, diagram `--diagram-*`, capo, `--notation-bg`).
- **Verified:** in Electron (isolated profile), all 7 themes switch and persist. Maple and Sunburst lessons were checked visually.
- **Not themed:** the Electron window background, which is neutral; the window is shown only after first paint.
- **Focus/widths:** `--fb-focus` is legible against every neck; open-string focus uses the panel accent. CSS borders/outlines use `--bw`/`--focus-w`, including number fields. Ear accent text uses `--on-accent`. Maple inlays remain unchanged.

### App icon
Source `build/icon.svg` (an amber pick with a fretboard grid). `npm run render-icon` regenerates the PNGs.

---

## 7. Status
**Done:** everything in sections 5–6, all review groups 1–11 in `SOL_TASKS.md`, new-feature debugging, the curriculum restructure, and substantial visual polish retaining all seven themes. Typecheck is clean; **1,083 tests in 54 files pass**. Lesson-launch audits validate more than 500 contexts, actual chord pitches, authored Explorer bounds and a playable initial Voice Leading path for every progression. Isolated Electron QA verifies both ten-question drills and repair feedback, preset CRUD/loading during playback, keyboard navigation, one-shot seeds, source/tool playback stops, full 12-bar forms, major/minor jazz/altered contexts, modulation, capo/Drop D diagrams and durations, chained Dictionary returns, source-block scrolling, library state, unequal timing, section wrap/count-in, relative scales, tonic markers/reference cancellation, all Reharmonisation techniques and timing-matched comparison, legacy/corrupt preferences and reopening. Visual checks cover all seven themes, 760/1150 windows and every one of the 102 lessons; no renderer errors or horizontal page overflow. Learning/global settings and unlock rules are unchanged by the polish. Windows delivery verification is recorded in the changelog.

**Not verified by a human (needs the owner):**
1. Listening to any audio by ear: samples, strums, looper feel, metronome, rhythm demos.
2. The mic features with a real guitar:
   - tuner on all six open strings (low E/A octave errors)
   - scale exercise (missed or double-counted notes)
   - the reference tone isn't heard back
   - the Windows mic indicator turns off after leaving the page

   If tuning is needed, adjust the constants in `features/mic/pitch.ts` and `onset.ts`.
3. Personal preference for the polished layouts. Automated screenshots cover all seven themes, smaller/standard windows, learning screens and tools; representative captures were inspected by eye. This is not a claim to have checked every possible interaction/state combination.

**Known limitations:**
- The installer is unsigned.
- Exotic 7-note scales (Lydian dominant, altered, Phrygian dominant) open as scale entries, not keys.
- Full-neck dictionary rows deliberately remain about 107 px tall for readable string labels; compact row density is still a possible future option.
- The looper uses a 12-key picker and a quarter-beat timing grid; these upgrades do not add arbitrary subdivisions or literal riff transcription.
- Voice Leading keeps voices on fixed standard-tuning strings and optimizes the finite path, not a repeated loop boundary. Its generated dictionary candidates remain estimates of playability rather than guarantees of comfort.
- Lesson launches are harmonic practice contexts, not exact rhythm/fingering transcriptions (see section 6).
- Reharmonisation cannot infer melody compatibility or original slash bass; compare suggestions by ear. Undo/redo is session-local, while original/working chords and timing persist.

---

## 8. Next up (prioritised backlog; nothing in progress)
1. **Owner verification** (section 7): real guitar plus listening. Fix whatever it finds.
2. **Review system:** mixed review quizzes across finished units, a final exam, quiz misses linked to the lesson that teaches them, spaced repetition for Note Finder, a daily streak on the dashboard.
3. **Ear drills:** rhythm dictation (hear a rhythm, then tap or choose it) and sight-reading (a staff note, find it on the fretboard).
4. **Independent review and new-feature debugging:** done on 2026-10-02. All 11 review groups in `SOL_TASKS.md` are fixed and tested; the identifier and target-tone mode received a second runtime/UI pass. Its remaining feature list is a backlog, not authorization to implement all of it.
5. **Polish:**
   - a glossary with search
   - an optional compact dictionary-row density setting (the broad visual polish is complete)
6. **Further electives (ideas):** fingerstyle and Travis picking, slide guitar, chord melody, counterpoint basics.
7. **Tooling:** create `.claude/agents/sonnet-medium.md` (Sonnet, medium effort) for sub-agents, per the owner's preference.

### Curriculum restructure: DONE (2026-10-02)
The owner approved it and gave creative freedom. See section 5 for the result and `CURRICULUM_PLAN.md` for the rationale. Follow-ups (optional):
- Tag the remaining quiz questions with their lessons (`taught()`), u1–u7 and u9–u17. Only u3l6 and u8 are tagged so far. This also unblocks Sol task 3 (link quiz misses to lessons).
- Add more spiral recap paragraphs where a later lesson revisits an earlier idea.
- `pent2` has 3 lessons and no u8l2 generator.

### Committed features (specifications retained; added 2026-10-02)
1. **Chord identifier: DONE (2026-10-02).**
   - **What it does:** the user clicks frets on a fretboard, marking each string as fretted, open or muted, and the app names the chord.
   - **Show:**
     - the primary name, including slash chords (bass = lowest sounding MIDI pitch)
     - alternative names (e.g. Am7 = C6/A), ranked by simplicity
     - chord tones with their degrees
     - any omitted degrees
     - a link to that chord's Dictionary page
   - **Also:** play buttons (strum and arpeggio), tuning and capo aware.
   - **Where:** a new Tools tab. Reuse `theory/chords.ts` (CHORDS, buildChord), `chordLibrary`'s naming and omitted-degree logic, and the Dictionary's `names.ts`.
   - **Edge cases:**
     - 2-note input gives an interval or power chord
     - unrecognised sets say "no standard name", but still list the notes and intervals
     - enharmonic spelling follows the likely key and root
   - **Tests:** every curated shape in `chordShapesData.ts`, run through the identifier, must return its own chord among the top names.
2. **Target-tone improv trainer: DONE (2026-10-02).**
   - **What it does:** the Looper plays a progression while the fretboard highlights the **current chord's tones** live, changing on each chord change, over a faint scale.
   - **Options:**
     - which tones to show (root, 3rd, 5th, 7th, or guide tones only, i.e. 3rds and 7ths)
     - a "next chord" preview just before each change
     - a position filter
   - **Where:** reuse `LooperTab`'s Transport scheduling and the Fretboard marks. It can be a mode of the Looper or its own Tools tab. Highlight changes must sync to the Transport, not wall-clock timers.
3. **Call and response (mic): NOT STARTED; waiting for owner mic verification.**
   - **What it does:** the app plays a short phrase (2–6 notes, real samples), then the user plays it back on the guitar, and the mic checks the pitches in order.
   - **Levels:** by range and step size (stepwise, then skips, then pentatonic licks, then chord-tone licks), plus an optional key or scale.
   - **Results:** show which notes were right or wrong, and offer replay. Save stats like the other mic exercises.
   - **Where:** reuse `features/mic` (micInput, pitch, onset, exercise logic). Mute the mic while the phrase plays (`muteFor`).
   - **Caveat:** this depends on the mic working well with a real guitar, which the owner hasn't verified yet (section 7). Build it after or alongside that check.
4. **Reharmonisation playground: DONE (2026-10-02).** Enter a progression, audition tritone substitutions, secondary dominants, parallel borrowing and added ii-V motion, compare before/after and send the result to the Looper. Practical Unit 11/12 launch buttons and preserved lesson return. Full implementation, verification and limitations are recorded in sections 6, 7 and 9.

### Bug list (parked: don't fix until the owner asks)
- **Maple theme:** the black fretboard inlay dots may be confused with unlabelled note dots. The owner wants to look at it later before anything changes.

### Owner decisions
- **Lesson search keeps showing snippets from locked lessons.** Opening a locked lesson stays blocked. Decided 2026-10-02; don't change it.

---

## 9. Changelog
- **2026-10-02, visual polish (Codex):**
  - **Scope:** retained Fretwise's identity, all seven theme palettes and the restructured curriculum. Three GPT-6.1 Sol agents at High refined tools, Dictionary/Identifier, and learning/practice/settings; shared shell, Dashboard, fretboard sizing and integration were handled centrally. No theory, grading, progress format, curriculum unlocking or microphone algorithms changed.
  - **Shell and Dashboard:** consistent type/spacing and native control sizes, Lucide navigation, existing bitmap app icon, readable two-line unit titles with complete tooltips, quiet lesson-resume/stat bands and stage-grouped unit cards.
  - **Tools:** ten tools grouped under a keyboard-accessible native disclosure switcher; selected tool announced, Escape/outside-close/focus-return, scrolling reset on selection. Looper brings transport and neck forward; advanced accompaniment/display controls and custom harmony input use disclosures. Reharmonisation inspects the selected neck before suggestions. Consistent root/segment/control sizes and unframed workspace bands replace nested panels.
  - **Learning and practice:** refined library rows, lesson reading rhythm/captions, launch actions, quiz choices/feedback, ear drill controls/icons, centered tuner and grouped settings/theme previews. Short fretboards cap at 240 px high; full-neck boards retain at least 1040 px width inside bounded horizontal scrollers. Mirrored text and fret keyboard navigation are preserved. Dictionary sticky shape labels, bass badges and Identifier string headers were aligned.
  - **Verification:** typecheck, production build and all **1,083 tests / 54 files** pass. Electron screenshots cover each top-level screen and all ten tools at 760/1150 widths. Learning QA captures 84 views across seven themes and sweeps all 102 lessons at both widths: no renderer errors, horizontal page overflow, overflowing controls or unresolved lesson tokens. Eight interactive regression harnesses pass for both ten-question drills, repair feedback, preset CRUD/loading during audio, navigation/audio cancellation, lesson origins/seed consumption, tuning/capo, harmony tools, persistence and reopening. Owner progress was never read or written. Visual review and regressions caught/fixed an icon-and-text button sizing selector and restored the existing full-neck readability floor. Real listening and guitar/microphone readings still need owner verification.
  - **Theme and keyboard audit:** all seven themes across all ten tools at 760/1150, including selected Dictionary voicings, complete Identifier shapes and bounded board views: 280 checks. Eighteen further checks cover 1600-pixel windows and 125% zoom. All 298 passed with no page/control overflow or renderer errors; representative screenshots were inspected by eye. Native tool-switcher Enter/Space/Tab/Escape, outside-close, focus return and scroll reset passed.
  - **Windows delivery:** `npm run build:win` succeeded. The refreshed `dist/win-unpacked/Fretwise.exe` passed all eight interactive harnesses plus the 41-view top-level visual audit and seven-theme learning/102-lesson sweep. The desktop shortcut target was checked and points to this executable. Installer `dist/Fretwise Setup 0.1.0.exe` and the copy in the Codex task's `outputs` folder both have SHA-256 `71535199177667A038A5135F22B12FDBF8B8B917644C942628DEEC2C8D18736B`. Renderer assets: `index-BACUqpPb.js`, `index-DrLXCfbM.css`. All QA apps were closed; all profiles isolated. One concurrent packaged practice check timed out awaiting a preset save, with its data present in a pending rename temp file; two independent fresh-profile reruns, including a final serial run, passed all persistence checks. Storage code was unchanged, and no reproducible preset regression was found.
- **2026-10-01:**
  - **Initial build:** shell, theory engine, Unit 1, then agents wrote Units 2–12 and ear training. Samples were downloaded with the owner's approval.
  - **Scan and debug pass (about 70 fixes):**
    - audio stop and race conditions
    - progress flush on quit
    - interval, key-signature and CAGED-barre fixes
    - grading fixes
    - notation triplets and barlines
    - content fact-check fixes
  - **App icon** (`build/icon.svg`).
  - **New features:**
    - mic tuner and play-along
    - Tools tab (explorer, dictionary, looper, metronome)
  - **Built by Codex:**
    - note-name setting
    - Triads trainer and Note Finder
    - tool presets
    - keyboard fretboards
    - lesson search and bookmarks
    - Scale Comparison
- **2026-10-02:**
  - **Triads repair feedback** (Codex).
  - **Comprehensive chord/key dictionary:**
    - chord library with 567 curated templates
    - neck-map UI
    - key pages linking to chords, with a back trail
    - `voicings.ts` bass now taken from the lowest MIDI pitch
  - **Five electives** (u13–u17):
    - `requires`-based unlocking and an Electives sidebar heading
    - tuning and capo support across fretboard, chord and tab blocks
    - neutral `mute` mark colour
  - **Theme system:**
    - 7 themes, all colours moved to `themes.css`, picker in Settings
    - tests: contrast checks and a no-stray-colour scan
  - **`FRETWISE_USER_DATA`:** isolated-profile hook added. The 60 s timeout on the exhaustive chord-library test stops parallel-run flakiness.
  - **Docs:** `info.md` fully rewritten.
  - **Codex review batch:** GPT-6.1 Sol agents at High completed dictionary/spelling, electives and UI/theme fixes; shared progress/navigation integration was handled centrally. All review groups 1–11 in `SOL_TASKS.md` were covered, with independent regression tests.
  - **Chord Identifier:** ranked complete/shell/rootless matches, actual bass, slash alternatives, omissions, tuning/capo, open/muted input, playback and dictionary deep link. Exhaustive curated ranking checks pass.
  - **Target-tone Looper mode:** selectable degrees/guide tones, fret window, audio-clock current/next targets, coherent live spelling and full named-preset persistence.
  - **Verification:** 640 tests / 32 files, typecheck, production renderer and Windows installer builds pass. Both feature QA scripts also passed against `dist/win-unpacked/Fretwise.exe`, including reopen persistence. All automated app checks used isolated profiles and produced no renderer errors; real user progress untouched. Actual listening and mic/guitar verification remain the owner's tasks.
  - **Final accessibility integration:** grouped/static `Field` children use a neutral wrapper, while native/numeric fields keep associated labels. Exact first-button names and selected states were checked in Electron; four new regression tests cover the wrappers.
  - **New-feature debugging:** three GPT-6.1 Sol agents at High checked identifier input, Looper UI and audio runtime; shared navigation and packaged verification were handled centrally.
    - Identifier no-op edits preserve a selected alternative and playback. Compound intervals use correct ordinals (E2 to E5 is a perfect 22nd).
    - Identifier-to-Dictionary links apply once; returning after manually browsing no longer resets the dictionary entry.
    - Looper validates persisted controls, preserves major context for the built-in ii-V-I, and auditions with its selected instrument while restoring the global instrument on exit.
    - Clearing the final chord cancels startup/stops playback. Instrument loading follows the latest request, discards obsolete completions, ignores stale errors and supports retry without losing the active voice. Tempo, volume and accompaniment edits no longer invalidate queued target previews.
  - **Debug verification:** 677 tests / 34 files, typecheck and Windows installer build pass. Five isolated packaged Electron scripts pass, including corrupt preferences, no-op alternatives, compound interval labels, one-shot links, rapid instrument changes, clear/restart, preset loading during playback, navigation stop, reopen persistence and 1000/760 layouts. No renderer errors; real progress untouched. Listening and real-guitar/microphone checks remain unverified by a human.
  - **Voice Leading Explorer:** added beside the Dictionary/Identifier in Tools. Whole-progression minimum movement across complete library shapes, six presets and custom Roman input, key/string/fret controls, starting-shape overrides, held/next-tone neck overlay, movement table, direct Dictionary links and block/strum/arpeggio playback. Preferences persist without changing scores or global audio settings. GPT-6.1 Sol agents at High handled pure solver/tests, player/tests and config/tests; shared UI/navigation, resizing, Electron QA and docs were integrated centrally. A second independent integration review found no confirmed blockers.
  - **Voice Leading verification:** 805 tests / 38 files and typecheck pass. Solver coverage spans all supported qualities, 17 enharmonic root spellings, 35 three/four-string sets and six ranges, plus brute-force optimality, a greedy-vs-global regression, pinned starts, boundaries and impossible inputs. Player tests cover timing, modes, stop/loading races, stale callbacks and retry. Isolated production Electron checks pass for controls, playback modes/highlights, navigation stops, persistence, malformed preferences and mirrored 1000/760 layouts; selected marks stay visible after resizing. Human listening is still outstanding; real user progress remains untouched.
  - **Voice Leading delivery:** `npm run build:win` succeeded. The rebuilt `dist/win-unpacked/Fretwise.exe` passed the full Voice Leading Electron script plus existing Dictionary navigation and target-tone Looper integration scripts, with no renderer errors. The desktop shortcut points to this refreshed executable. `dist/Fretwise Setup 0.1.0.exe` was copied to the Codex task's `outputs` folder; source and copy hashes match. All checks used isolated profiles, and all QA processes were closed.
  - **Lesson tool launchpads:** explicit example metadata throughout the curriculum; seeded Looper/Voice Leading/Explorer/Identifier/Dictionary routes; target tones enabled; a source-block return link retained through chained Dictionary navigation. Three GPT-6.1 Sol agents at High handled core/elective annotations and tool consumers; shared contracts/routing/integration and runtime QA were handled centrally. Independent review caught and fixed scale boxes escaping source fret windows; runtime QA fixed return scrolling after notation layout. Abstract chords no longer retune standard library shapes. No progress/global settings or quiz/unlock changes.
  - **Lesson launch verification:** full **910 tests / 47 files**, typecheck and production build pass. Pure audits cover every curriculum launch and every progression's playable initial path; source-context tests preserve chord qualities/order and original playback pitches/durations. Isolated Electron launch QA passes, including source playback stops, twelve-bar forms, exact major/minor/modal context, altered chords, capo/tuning, keyboard controls, small mirrored layouts, transient origin, unchanged progress/settings and persisted tool edits. Human listening remains outstanding.
  - **Lesson launch delivery:** `npm run build:win` passed. Four isolated packaged Electron scripts passed: lesson launches, full Voice Leading regression, Dictionary navigation, and target-tone Looper integration (including preset loading during playback and legacy/reset behavior). No renderer errors. The desktop shortcut's `dist/win-unpacked/Fretwise.exe` is refreshed, and `dist/Fretwise Setup 0.1.0.exe` was copied to this Codex task's `outputs` folder with matching SHA-256 `0F50F23846440B93676081F1743B48B1C6977325E98A3C1062C6F7EEBFADC455`. QA processes were closed; the owner's real progress file was never accessed.
  - **Practical tool upgrades:** Looper per-chord quarter-beat durations, inclusive selected-section repeat and one-shot count-in; complete preset/preferences integration and matched lesson source timing. Scale Comparison independent roots, relative minor/Dorian presets, side-specific degrees, tonic rings and cancellable tonic-reference playback. Three GPT-6.1 Sol agents at High handled runtime, Looper UI and Scale Comparison; shared storage, fretboard and lesson integration were handled centrally. Independent review caught a loading/count-in snapshot mismatch; it was fixed and regression-tested. Section-bound edits now preview the starting chord.
  - **Tool upgrade verification:** **968 tests / 50 files**, typecheck and production build pass. Isolated Electron checks verify timing input rounding, append/delete mapping, count-in Stop/restart and no repeated count, section-only playback/preview wrap, structural-edit stopping, complete preset loading during playback, legacy resets, independent/linked roots and swaps, relative membership/degrees/markers, tonic-reference A/B playback/cancellation, small mirrored layouts, persistence and corrupt preferences. Existing lesson-launch and target-tone regression scripts also pass, including actual Drop D source durations. No renderer errors; real progress untouched. Human listening remains outstanding.
  - **Tool upgrade delivery:** `npm run build:win` passed. Five isolated packaged Electron scripts passed against the refreshed `dist/win-unpacked/Fretwise.exe`: practical tool upgrades, lesson launches (including source timing), Voice Leading, Dictionary navigation and target-tone Looper integration. The installer was copied to the Codex task's `outputs` folder with matching SHA-256 `9EB4BC31F40C514B8E23DE070F4D41A50DD432DB5A69083B645C852437C99690`. Production renderer assets are `index-HjmWoZRG.js` and `index-Ch3iS8JE.css`. All QA processes were closed. The desktop shortcut opens the refreshed executable; the owner's real progress was never accessed. Listening and microphone/guitar checks remain with the owner.
  - **Reharmonisation playground:** added under Tools with named/chord-symbol and Roman input, all keys, major/minor context, six source progressions, all four substitution techniques, contextual explanations, stacked changes and undo/redo/reset. Timing-preserving before/after/combined and individual sampled auditions; complete stopped Looper handoff; Dictionary links and one-shot tonal lesson launches throughout Units 11/12. Three GPT-6.1 Sol agents at High handled pure rules/tests, sampled player/tests and independent integration audit; shared UI/navigation, QA, docs and installer were handled centrally. Review fixed unequal clean-submission timing, ii-V explanation and quality preservation; visual QA added mirrored shape centering.
  - **Reharmonisation verification:** **1,059 tests / 53 files**, typecheck, production build and Windows installer build pass. Pure tests cover all dictionary qualities/roots/keys, guide-tone tritones, actual secondary/ii-V resolutions, borrowed-scale membership, impossible insertions, immutable timing, stale loads/callbacks and complete Looper contracts; independent audits cover every Unit 11/12 progression and all four stacked transformations in every key. Isolated production Electron checks pass for four techniques, atomic invalid/symbol/applied input, histories/filters, three modes, audio-clock before/gap/after, edits/stop/navigation, exact Looper transfer/no autoplay, lesson/Dictionary origins, clean unequal seeds, keyboard fret playback, small mirrored layouts, persistence and corrupt defaults. Existing lesson-launch and practical-tool regression scripts pass. No renderer errors; real progress untouched. Human listening remains outstanding.
  - **Reharmonisation delivery:** `npm run build:win` succeeded. Six isolated packaged Electron scripts passed against the refreshed `dist/win-unpacked/Fretwise.exe`: Reharmonisation, lesson launches, Voice Leading, practical tool upgrades, Dictionary navigation and target-tone Looper integration. The desktop shortcut opens the refreshed executable. `dist/Fretwise Setup 0.1.0.exe` was copied to this Codex task's `outputs` folder; both SHA-256 hashes are `9BBB8B588046E1B8FE00A425DF34F73D2F9FCD9773B933057D6F940517D4A717`. Renderer assets are `index-RoLvzupc.js` and `index-CUH79I_e.css`. All QA processes were closed; the owner's real progress file was never accessed. Human listening remains outstanding.
- **2026-10-02, curriculum restructure (Claude):**
  - **Audit:** four Sonnet agents audited all 101 lessons for forward dependencies (notes in `%TEMP%\claude\curriculum-audit\`).
  - **Path layer:** `content/curriculum.ts` (stages, PATH, buildCurriculum, quiz routing by lesson tag), unit files became banks, `UNITS` in path order. Unlock rules: previous core unit, legacyPass, never re-lock started units.
  - **Lesson links:** `[[lessonId]]` tokens with live unit numbers, preview links, a "Builds on" line, and search resolves tokens. All 31 hard-coded "Unit N" references converted.
  - **UI:** stage headings in the sidebar, stage-grouped dashboard, "Elective" labels instead of numbers 13–17. Unit 6 was renamed "Barre chords and the five shapes".
  - **Content:**
    - New lesson u2l7 "Your first open chords".
    - Beginner openings for u3l6, u8l1, u8l4 and u8l5.
    - Moves: inverted power chords to u3l5, major blues to u8l3, barre 7ths to u9l4.
    - Recaps in u5l3, u5l4, u6l6, u7l2 and u12l2. One new u8l2 quiz question.
  - **Verification:**
    - 1,077 tests / 54 files and typecheck pass, including the new `curriculum.test.ts`.
    - Browser-preview sweep of all 102 lessons: no errors, no raw tokens, 107 links rendered.
    - Installer rebuilt; real progress file hash unchanged.
