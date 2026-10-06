// Downloads open-license instrument samples (tonejs-instruments, CC-BY 3.0,
// https://github.com/nbrosowsky/tonejs-instruments) into the renderer's public
// folder so the app works fully offline. Writes a manifest the SampleEngine reads.
import { mkdir, writeFile, access } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'src', 'renderer', 'public', 'samples')
const INSTRUMENTS = ['guitar-acoustic', 'guitar-nylon', 'guitar-electric', 'piano']
const API = 'https://api.github.com/repos/nbrosowsky/tonejs-instruments/contents/samples'
const RAW = 'https://raw.githubusercontent.com/nbrosowsky/tonejs-instruments/master/samples'

const exists = (p) => access(p).then(() => true, () => false)
// "As2" -> "A#2"
const toNote = (file) => file.replace('.mp3', '').replace('s', '#')

const manifest = {}
for (const inst of INSTRUMENTS) {
  const res = await fetch(`${API}/${inst}`, { headers: { 'User-Agent': 'fretwise' } })
  if (!res.ok) throw new Error(`listing ${inst}: ${res.status}`)
  const files = (await res.json()).map((f) => f.name).filter((n) => n.endsWith('.mp3'))
  await mkdir(join(OUT, inst), { recursive: true })
  manifest[inst] = {}
  for (const file of files) {
    const dest = join(OUT, inst, file)
    if (!(await exists(dest))) {
      const r = await fetch(`${RAW}/${inst}/${file}`)
      if (!r.ok) throw new Error(`${inst}/${file}: ${r.status}`)
      await writeFile(dest, Buffer.from(await r.arrayBuffer()))
    }
    manifest[inst][toNote(file)] = file
  }
  console.log(`${inst}: ${files.length} samples`)
}
await writeFile(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2))
await writeFile(
  join(OUT, 'LICENSE.txt'),
  'Samples from tonejs-instruments by Nicholaus P. Brosowsky, CC-BY 3.0.\nhttps://github.com/nbrosowsky/tonejs-instruments\n'
)
console.log('done ->', OUT)
