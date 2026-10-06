// Tiny synthesized drum/click kit (Tone membrane + noise synths) for the looper and the metronome.
import * as Tone from 'tone'
import { engine } from '@/audio/engine'

export type KitSound = 'kick' | 'snare' | 'hat' | 'hatOpen' | 'click' | 'clickAccent' | 'clickMid' | 'sub'

export interface Kit {
  hit(sound: KitSound, time: number, vel?: number): void
  setVolume(v: number): void
  /** Fade out quickly and dispose everything shortly after. */
  release(): void
}

export function createKit(volume = 0.8): Kit {
  const bus = engine.createBus()
  bus.gain.value = volume
  const kick = new Tone.MembraneSynth({ pitchDecay: 0.04, octaves: 5, envelope: { attack: 0.001, decay: 0.3, sustain: 0, release: 0.1 } }).connect(bus)
  kick.volume.value = -2
  const snareFilter = new Tone.Filter(1400, 'highpass').connect(bus)
  const snare = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.16, sustain: 0, release: 0.05 } }).connect(snareFilter)
  snare.volume.value = -8
  const hatFilter = new Tone.Filter(7500, 'highpass').connect(bus)
  const hat = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.045, sustain: 0, release: 0.01 } }).connect(hatFilter)
  hat.volume.value = -16
  const hatOpen = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.22, sustain: 0, release: 0.05 } }).connect(hatFilter)
  hatOpen.volume.value = -17
  const tick = new Tone.MembraneSynth({ pitchDecay: 0.006, octaves: 2, envelope: { attack: 0.001, decay: 0.06, sustain: 0, release: 0.02 } }).connect(bus)
  tick.volume.value = -4
  let released = false
  const nodes: { dispose(): unknown }[] = [kick, snare, snareFilter, hat, hatOpen, hatFilter, tick, bus]
  return {
    hit(sound, time, vel = 1) {
      if (released) return
      switch (sound) {
        case 'kick':
          kick.triggerAttackRelease('C1', 0.25, time, vel)
          break
        case 'snare':
          snare.triggerAttackRelease(0.14, time, vel)
          break
        case 'hat':
          hat.triggerAttackRelease(0.04, time, vel)
          break
        case 'hatOpen':
          hatOpen.triggerAttackRelease(0.2, time, vel)
          break
        case 'clickAccent':
          tick.triggerAttackRelease('C6', 0.05, time, Math.min(1, vel))
          break
        case 'clickMid':
          tick.triggerAttackRelease('A5', 0.05, time, Math.min(1, vel * 0.9))
          break
        case 'click':
          tick.triggerAttackRelease('F5', 0.05, time, Math.min(1, vel * 0.8))
          break
        case 'sub':
          tick.triggerAttackRelease('C5', 0.03, time, Math.min(1, vel * 0.5))
          break
      }
    },
    setVolume(v) {
      if (!released) bus.gain.rampTo(Math.min(1.5, Math.max(0, v)), 0.05)
    },
    release() {
      if (released) return
      released = true
      try {
        bus.gain.cancelScheduledValues(Tone.now())
        bus.gain.rampTo(0, 0.03)
      } catch {
        /* context not running */
      }
      setTimeout(() => {
        for (const n of nodes) {
          try {
            n.dispose()
          } catch {
            /* already disposed */
          }
        }
      }, 1200)
    }
  }
}
