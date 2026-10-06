# Tasks for Sol

Read `info.md` first. It has the conventions, constraints and verification steps. Do the tasks roughly in order, and log your changes in `info.md` as you go.

## Review fixes (all completed and verified 2026-10-02)
All eleven groups below, including every subitem, are implemented. Typecheck and the full 1,083-test suite (54 files) pass after the new-feature debugging pass, tool additions, curriculum restructure and visual polish. Isolated Electron QA verified the interactive fixes, lesson launches and polished layouts across seven themes. See `info.md` sections 6–9 for current implementation and delivery verification details. Keep this list as the review record, not outstanding work.

The second pass fixed identifier alternative resets on unchanged input, compound interval ordinals, repeated dictionary deep links, Looper persisted-control validation and major ii-V-I context, local instrument audition, empty-progression stopping, stale instrument-load races and unnecessary target-preview invalidation. Human listening and real-guitar/microphone verification remain outstanding; this does not authorize starting call and response.

1. **Ear drills:** Space/Enter on a focused button or fret gets swallowed by the drill shortcuts (`DrillSession.tsx` key handler).
2. **Number inputs:** the Scale Comparison tempo box clamps on every keystroke, so you can't type into it. Check the other tool number inputs too.
3. **Ctrl+K** doesn't recover from the ErrorBoundary, because it doesn't bump `nav`.
4. **Progress loading:**
   - `practiceTypes.counts()` drops stats that are missing `assisted`/`durationMs`.
   - `mergeProgress` doesn't skip `__proto__`-style keys, or clamp ear and quiz numbers.
5. **Triads tool:** E♭dim and B♭dim are spelled with double flats.
6. **Accessibility:** `Seg` in `tools/ui.tsx` needs an aria-label.
7. **Scale Comparison:** octave 2 plays below low E for roots C–E♭.
8. **Dictionary Browse panel:**
   - The chips skip `resolveKeyRoot`/`resolveChordRoot`, so D♭ minor shows B𝄫.
   - The root picker ignores the note-name setting.
9. **Dictionary, other:**
   - dim/dim7 should suggest whole-half diminished (add the scale).
   - Navigating to the current view pushes duplicate history.
   - Melodic minor vi° is labelled "Tonic (substitute)".
   - Add the aliases "diminished", "diminished 7" and "major 7th".
   - Validate the `dict.query`/`dict.root` prefs.
10. **Elective text:**
    - Remove colour words from u13–u17 prose; several are wrong, and colours vary by theme.
    - u16 C-major 10ths diagram: the frets need to go to 16.
    - u13: the economy-picking claim is false (no seventh shape has 3 notes per string), and "up to fret 10" should be 13.
    - u13 "click the 3rd/♭7" prompts: say which shape or string.
    - u16 `fretboardPairQ`: fret 0 vs 12.
    - u16: B is degree 7, not degree 6.
    - u17 prose slips: strum count, borrowed-chord wording, ASCII `Eb` label, the bar-3 difference.
    - u14: `AM_ARP` has no C but is called Am; "top two strings" should be strings 3–2; the "second upstroke" question is ambiguous.
    - u15: `openStringNote` gives away the answer.
    - The correct answer is usually the longest choice in u14, u16 and u17.
11. **Themes:**
    - The fretboard focus ring is barely visible in Light and Surf Green.
    - Possible Dark flash on startup: move the theme boot into a tiny classic head script.
    - `ear.css` uses `--bg` where it should use `--on-accent`.
    - Use `--bw`/`--focus-w` instead of hard-coded border widths.
    - `applyTheme` writes localStorage on every progress update.

## Features
0. **Committed features in `info.md` §8.**
   - **Chord identifier:** completed and verified 2026-10-02.
   - **Target-tone improv trainer:** completed and verified 2026-10-02.
   - **Voice Leading Explorer:** implemented and verified 2026-10-02; controls, solver, sampled playback and persistence are documented in `info.md` section 6.
   - **Lesson tool launchpads:** implemented and verified 2026-10-02. Progressions load Looper with target tones, Voice Leading and Explorer; chords load Identifier/Dictionary; scales load Explorer. Explicit context across core/elective lessons, one-shot seeds and a source-block return link. Full-curriculum audits plus isolated Electron QA; original audio/progress/unlocks/global preferences unchanged. Harmonic practice grids are not exact rhythm transcriptions. See `info.md` section 6.
   - **Looper practice upgrades:** implemented and verified 2026-10-02. Per-chord durations, selected-section repeat, one-shot count-in, full preset persistence and matched source timing for lesson launches. Timing/section edits stop playback; ordinary live controls remain live. Legacy settings preserved.
   - **Scale Comparison upgrades:** implemented and verified 2026-10-02. Independent roots, optional linking, relative minor/Dorian presets, side-specific degrees/tonic markers and contextual reference playback. No perfect pitch required; legacy comparison records retain shared roots and reference playback Off.
   - **Reharmonisation playground:** implemented and verified 2026-10-02. Roman/chord-symbol input, major/minor/all keys, contextual tritone/secondary/borrowed/ii-V suggestions, timing-preserving stacked changes, undo/redo/reset, sampled before/after comparison, complete stopped Looper handoff and tonal lesson launches (Units 11/12 included). Preferences persist, no scoring/unlock/global changes or perfect-pitch requirement. Scope and independent theory/player/integration audits are in `info.md` section 6; human listening remains outstanding.
   - **Call and response:** only after the owner has tested the mic.
1. Daily practice streak on the dashboard.
2. Mixed review quiz across passed units. It must not affect unit scores or unlocks.
3. Link missed quiz questions to the lesson that teaches them.
4. Final exam (after all 12 core units) with a certificate card.
5. Rhythm dictation ear drill.
6. Sight-reading drill: see a staff note, find it on the fretboard.
7. Searchable glossary.
8. **Completed:** instructional chord examples in lessons open Identifier or their sounding chord's Dictionary page (part of lesson launchpads). Prose is not auto-parsed; quiz answers are excluded.
9. Optional compact dictionary-row density. Broad visual polish is completed; full-neck rows retain readable diagrams and sticky shape labels.
10. New electives:
    - fingerstyle/Travis picking
    - slide
    - chord melody
    - counterpoint basics

## Don't do
- **Search snippets from locked lessons:** the owner decided to keep them as they are.
- **Anything on the bug list in `info.md` §8:** parked until the owner asks.
- **Anything that needs real listening or a real guitar:** the owner will test these.
