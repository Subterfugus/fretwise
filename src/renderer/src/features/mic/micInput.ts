// Microphone capture + pitch polling. Uses its OWN AudioContext (separate from Tone's) and
// is never connected to any output, so the mic can never feed back into the speakers.
// stop() stops every track and closes the context; only one MicInput is live at a time.
import { detectPitch } from './pitch'

export type MicStatus = 'idle' | 'starting' | 'on' | 'denied' | 'nodevice' | 'error'

export interface MicFrame {
  /** performance.now() in ms */
  t: number
  /** detected frequency, or null (silence / unclear / muted) */
  freq: number | null
  clarity: number
  /** RMS of the analysed buffer (0..1) */
  rms: number
  /** peak sample magnitude (0..1), for the level meter */
  peak: number
  /** true while detection is suspended (the app itself is playing a sound) */
  muted: boolean
}

export interface MicOptions {
  /** analyser size: 4096 = steadier low notes (tuner), 2048 = lower latency (exercises) */
  fftSize?: 2048 | 4096
  /** RMS noise gate */
  gate?: number
}

const POLL_MS = 25

export class MicInput {
  status: MicStatus = 'idle'
  error: string | null = null
  devices: MediaDeviceInfo[] = []
  deviceId: string | null = null
  /** RMS noise gate; may be changed while running */
  gate: number
  fftSize: number

  private ctx: AudioContext | null = null
  private stream: MediaStream | null = null
  private analyser: AnalyserNode | null = null
  private buf: Float32Array<ArrayBuffer> | null = null
  private raf = 0
  private lastPoll = 0
  private mutedUntil = 0
  private token = 0
  private frameListeners = new Set<(f: MicFrame) => void>()
  private statusListeners = new Set<() => void>()
  private onDeviceChange = () => void this.refreshDevices()

  private static live: MicInput | null = null

  constructor(opts: MicOptions = {}) {
    this.fftSize = opts.fftSize ?? 4096
    this.gate = opts.gate ?? 0.008
  }

  /** Change the analysis window while running (4096 = steadier low notes, 2048 = lower latency). */
  setFftSize(n: 2048 | 4096) {
    this.fftSize = n
    if (this.analyser) {
      this.analyser.fftSize = n
      this.buf = new Float32Array(this.analyser.fftSize)
    }
  }

  get sampleRate(): number {
    return this.ctx?.sampleRate ?? 44100
  }

  onFrame(cb: (f: MicFrame) => void): () => void {
    this.frameListeners.add(cb)
    return () => this.frameListeners.delete(cb)
  }

  onStatus(cb: () => void): () => void {
    this.statusListeners.add(cb)
    return () => this.statusListeners.delete(cb)
  }

  private setStatus(status: MicStatus, error: string | null = null) {
    this.status = status
    this.error = error
    this.statusListeners.forEach((f) => f())
  }

  /** Ignore the mic for `ms` (call when the app plays a sound itself). */
  muteFor(ms: number) {
    this.mutedUntil = Math.max(this.mutedUntil, performance.now() + ms)
  }

  async refreshDevices() {
    try {
      const all = await navigator.mediaDevices.enumerateDevices()
      this.devices = all.filter((d) => d.kind === 'audioinput')
      this.statusListeners.forEach((f) => f())
    } catch {
      /* ignore */
    }
  }

  async start(deviceId?: string | null): Promise<void> {
    if (this.status === 'starting') return
    MicInput.live?.stop()
    MicInput.live = this
    const token = ++this.token
    this.setStatus('starting')
    if (!navigator.mediaDevices?.getUserMedia) {
      this.setStatus('error', 'This environment has no microphone support.')
      return
    }
    const constraints = (id: string | null | undefined): MediaStreamConstraints => ({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        ...(id ? { deviceId: { exact: id } } : {})
      }
    })
    let stream: MediaStream
    try {
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints(deviceId))
      } catch (e) {
        // a remembered device that is no longer plugged in: fall back to the default input
        if (deviceId && e instanceof DOMException && (e.name === 'OverconstrainedError' || e.name === 'NotFoundError')) {
          stream = await navigator.mediaDevices.getUserMedia(constraints(null))
        } else throw e
      }
    } catch (e) {
      if (token !== this.token) return
      const name = e instanceof DOMException || e instanceof Error ? e.name : ''
      if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError')
        this.setStatus('denied', 'Microphone access was blocked. Allow it in Windows Settings > Privacy & security > Microphone (including "Let desktop apps access your microphone"), then press Start again.')
      else if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'DevicesNotFoundError')
        this.setStatus('nodevice', 'No microphone was found. Plug in an audio interface or microphone and press Start again.')
      else if (name === 'NotReadableError')
        this.setStatus('error', 'The microphone is in use by another program. Close it and try again.')
      else this.setStatus('error', 'Could not start the microphone' + (e instanceof Error && e.message ? ': ' + e.message : '.'))
      if (MicInput.live === this) MicInput.live = null
      return
    }
    if (token !== this.token) {
      // stop() was called (e.g. the page was left) while the permission prompt was open
      stream.getTracks().forEach((t) => t.stop())
      return
    }

    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      const ctx = new Ctx({ latencyHint: 'interactive' })
      const source = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = this.fftSize
      analyser.smoothingTimeConstant = 0
      source.connect(analyser) // deliberately NOT connected to ctx.destination
      if (ctx.state === 'suspended') await ctx.resume()
      if (token !== this.token) {
        stream.getTracks().forEach((t) => t.stop())
        void ctx.close()
        return
      }
      this.ctx = ctx
      this.stream = stream
      this.analyser = analyser
      this.buf = new Float32Array(analyser.fftSize)
      stream.getAudioTracks().forEach((t) =>
        t.addEventListener('ended', () => {
          if (token === this.token) {
            this.teardown()
            this.setStatus('nodevice', 'The microphone was disconnected.')
          }
        })
      )
      const active = stream.getAudioTracks()[0]?.getSettings().deviceId
      this.deviceId = active ?? deviceId ?? null
      navigator.mediaDevices.addEventListener?.('devicechange', this.onDeviceChange)
      await this.refreshDevices() // labels are only available once permission is granted
      if (token !== this.token) return
      this.setStatus('on')
      this.lastPoll = 0
      this.raf = requestAnimationFrame(this.tick)
    } catch (e) {
      stream.getTracks().forEach((t) => t.stop())
      if (token === this.token) this.setStatus('error', 'Could not start audio capture' + (e instanceof Error ? ': ' + e.message : '.'))
    }
  }

  private tick = (now: number) => {
    if (!this.analyser || !this.buf || !this.ctx) return
    this.raf = requestAnimationFrame(this.tick)
    if (now - this.lastPoll < POLL_MS) return
    this.lastPoll = now
    this.analyser.getFloatTimeDomainData(this.buf)
    let peak = 0
    let sum = 0
    for (let i = 0; i < this.buf.length; i++) {
      const v = this.buf[i]
      sum += v * v
      const a = v < 0 ? -v : v
      if (a > peak) peak = a
    }
    const rms = Math.sqrt(sum / this.buf.length)
    const t = performance.now()
    const muted = t < this.mutedUntil
    const res = muted ? null : detectPitch(this.buf, this.ctx.sampleRate, { rmsGate: this.gate })
    const frame: MicFrame = { t, freq: res ? res.freq : null, clarity: res ? res.clarity : 0, rms, peak, muted }
    this.frameListeners.forEach((f) => f(frame))
  }

  private teardown() {
    this.token++
    cancelAnimationFrame(this.raf)
    this.raf = 0
    navigator.mediaDevices?.removeEventListener?.('devicechange', this.onDeviceChange)
    this.stream?.getTracks().forEach((t) => t.stop())
    const ctx = this.ctx
    this.stream = null
    this.analyser = null
    this.buf = null
    this.ctx = null
    if (ctx && ctx.state !== 'closed') void ctx.close().catch(() => undefined)
    if (MicInput.live === this) MicInput.live = null
  }

  /** Release the microphone completely. Safe to call at any time. */
  stop() {
    const was = this.status
    this.teardown()
    if (was !== 'idle') this.setStatus('idle')
  }
}
