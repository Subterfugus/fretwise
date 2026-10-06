// Tiny markdown subset renderer: headings (###), paragraphs, - / 1. lists, **bold**, *italic*, `code`,
// and lesson links ([[u4l6]], see features/lessons/lessonLinks).
import { Fragment, type ReactNode } from 'react'
import { pretty } from '@/theory/notes'
import { LessonLink, lessonTokens } from '@/features/lessons/lessonLinks'

function inline(text: string, key = 0): ReactNode[] {
  const out: ReactNode[] = []
  const re = /(\[\[[^\]]+\]\]|\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g
  let last = 0
  let m: RegExpExecArray | null
  let k = key
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(pretty(text.slice(last, m.index)))
    const t = m[0]
    const link = t.startsWith('[[') ? lessonTokens(t)[0] : undefined
    if (link) out.push(<LessonLink key={k++} token={link} />)
    else if (t.startsWith('[[')) out.push(pretty(t))
    else if (t.startsWith('**')) out.push(<strong key={k++}>{pretty(t.slice(2, -2))}</strong>)
    else if (t.startsWith('`')) out.push(<code key={k++}>{pretty(t.slice(1, -1))}</code>)
    else out.push(<em key={k++}>{pretty(t.slice(1, -1))}</em>)
    last = m.index + t.length
  }
  if (last < text.length) out.push(pretty(text.slice(last)))
  return out
}

export function Markdown({ md }: { md: string }) {
  const lines = md.trim().split('\n')
  const blocks: ReactNode[] = []
  let i = 0
  let key = 0
  while (i < lines.length) {
    const line = lines[i].trim()
    if (!line) {
      i++
      continue
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(line)
    if (h) {
      const level = Math.min(Math.max(h[1].length, 2), 4)
      const Tag = `h${level}` as 'h3'
      blocks.push(<Tag key={key++}>{inline(h[2])}</Tag>)
      i++
      continue
    }
    if (/^[-*]\s+/.test(line) || /^\d+\.\s+/.test(line)) {
      const ordered = /^\d+\./.test(line)
      const items: string[] = []
      while (i < lines.length && (ordered ? /^\d+\.\s+/ : /^[-*]\s+/).test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^([-*]|\d+\.)\s+/, ''))
        i++
      }
      const L = ordered ? 'ol' : 'ul'
      blocks.push(
        <L key={key++}>
          {items.map((it, j) => (
            <li key={j}>{inline(it)}</li>
          ))}
        </L>
      )
      continue
    }
    const para: string[] = []
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|[-*]\s|\d+\.\s)/.test(lines[i].trim())) {
      para.push(lines[i].trim())
      i++
    }
    blocks.push(<p key={key++}>{inline(para.join(' '))}</p>)
  }
  return <Fragment>{blocks}</Fragment>
}
