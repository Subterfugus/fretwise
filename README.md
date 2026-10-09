<div align="center">

<img src="build/icon.png" width="96" alt="Fretwise icon">

# Fretwise

**Music theory for guitarists, taught on the fretboard.**

102 lessons, ear training, a tuner and ten practice tools.<br>
Every idea is shown on the neck and played with real recorded guitar samples.

[![Try it in your browser](https://img.shields.io/badge/Try_it-in_your_browser-f0a63c?style=for-the-badge)](https://fretwise.eidsonbrady.com)
[![Download for Windows](https://img.shields.io/badge/Download-for_Windows-3aa9b8?style=for-the-badge)](https://github.com/Subterfugus/fretwise/releases/latest/download/Fretwise-Setup.exe)

[![Latest release](https://img.shields.io/github/v/release/Subterfugus/fretwise?label=release)](https://github.com/Subterfugus/fretwise/releases/latest)
[![Licence: MIT](https://img.shields.io/github/license/Subterfugus/fretwise?label=licence)](LICENSE)

<br>

<a href="https://fretwise.eidsonbrady.com"><img src="docs/screenshots/explorer.png" alt="The fretboard explorer showing C major across the neck"></a>

</div>

## Get it

- **In a browser:** open <https://fretwise.eidsonbrady.com>. There is nothing to install, it works on phones, and your progress is saved in that browser.
- **On Windows:** download [Fretwise-Setup.exe](https://github.com/Subterfugus/fretwise/releases/latest/download/Fretwise-Setup.exe). It works offline. The installer is not code-signed, so Windows SmartScreen may warn before it runs.

Progress can be exported to a file and imported again, so you can move between the two.

## A look around

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/dashboard.png" alt="Dashboard with lesson, unit and ear-training progress"><br><b>A path, not a pile.</b> 18 units in five stages. Pass a unit's quiz to unlock the next.</td>
    <td width="50%"><img src="docs/screenshots/lesson.png" alt="A lesson on octave shapes with fretboard diagrams"><br><b>Lessons on the neck.</b> Each idea comes with a fretboard diagram you can hear.</td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/ear-training.png" alt="Ear training drills with accuracy rings"><br><b>Ear training.</b> Seven drills that track what you miss and drill it again.</td>
    <td><img src="docs/screenshots/looper.png" alt="Backing-track looper with target tones on the fretboard"><br><b>Backing-track looper.</b> Loop a progression and see the target tones change with each chord.</td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/dictionary.png" alt="Chord and scale dictionary showing Cmaj7"><br><b>Chord and scale dictionary.</b> Search any chord, key or scale and filter its voicings.</td>
    <td><img src="docs/screenshots/theme-sunburst.png" alt="The fretboard explorer in the Sunburst theme"><br><b>Seven themes.</b> This is Sunburst. There are light and high-contrast themes too.</td>
  </tr>
</table>

<details>
<summary>Light theme and phone layout</summary>
<br>
<table>
  <tr>
    <td width="75%"><img src="docs/screenshots/theme-light.png" alt="The fretboard explorer in the light theme"></td>
    <td width="25%"><img src="docs/screenshots/phone.png" alt="The fretboard explorer on a phone"></td>
  </tr>
</table>
</details>

## What's in it

- **Curriculum:** 102 lessons in 18 units (13 core, 5 electives), grouped into five stages from first steps to jazz harmony. You play first and get the explanation later: open chords, power chords, the minor pentatonic and the 12-bar blues all come in stage 1.
- **Quizzes:** one per unit, mixing fixed questions with randomly generated ones. Pass with 80% to unlock the next unit.
- **Ear training:** seven drills (intervals, chord quality, scales and modes, progressions, scale degrees, melodic dictation, note finder) with per-item stats.
- **Tuner and play-along:** the app listens to your guitar through the microphone and checks single notes.
- **Tools:**
  - chord and scale dictionary
  - chord identifier
  - fretboard explorer
  - backing-track looper with live target tones
  - voice leading explorer
  - reharmonisation
  - triads
  - note finder
  - scale comparison
  - metronome
- **Settings:** seven themes (including light and high contrast), a left-handed fretboard, a choice of sharps or flats for note names, and progress export and import (a JSON file that works in both the desktop app and the web version).

## Build from source

Needs Node.js 22 or later.

```bash
npm install
npm run dev
```

The instrument samples are included in the repository, so the app works offline.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Launches the Electron app with hot reload |
| `npm test` | Runs the test suite (Vitest) |
| `npm run typecheck` | TypeScript check |
| `npm run build:win` | Builds a Windows installer into `dist/` |
| `npm run build:web` | Builds the browser version into `dist-web/` |
| `npm run deploy:web` | Builds the browser version and deploys it to Cloudflare (<https://fretwise.eidsonbrady.com>) |
| `npx vite --config vite.preview.config.ts` | Runs the interface alone in a browser at `http://localhost:5199` |
| `npm run fetch-samples` | Re-downloads the instrument samples (only needed if they are missing) |
| `npm run render-icon` | Regenerates the app icon from `build/icon.svg` |

## Layout

- `src/main`: Electron main process. It serves the app and saves progress to `progress.json` in the app's user-data folder.
- `src/preload`: the bridge between the main process and the interface (`window.fretwise`).
- `src/renderer/src/theory`: pure TypeScript music theory: notes, intervals, scales, chords, keys, tunings and fretboard maths.
- `src/renderer/src/audio`: the Tone.js sampler engine.
- `src/renderer/src/content`: lessons and quizzes. `curriculum.ts` sets the teaching order; `units/` holds the lessons.
- `src/renderer/src/features`: lessons, quiz, ear training, mic, tools, dashboard and settings.
- `src/renderer/src/state`: saved progress, unlocking and presets.

For architecture, design decisions and project status, see [info.md](info.md).

## Licence

The code and lesson content are released under the [MIT licence](LICENSE). The instrument samples are third-party recordings under CC-BY 3.0 (see Credits) and keep that licence.

## Credits

- Instrument samples: [tonejs-instruments](https://github.com/nbrosowsky/tonejs-instruments) by Nicholaus P. Brosowsky, CC-BY 3.0
- [Tone.js](https://tonejs.github.io/) for audio
- [VexFlow](https://www.vexflow.com/) for notation
