import { Bookmark, BookmarkCheck } from 'lucide-react'
import { toggleLessonBookmark, useProgress } from '@/state/progress'
import type { Lesson } from '@/content/types'
import './library.css'

export function BookmarkButton({ lesson }: { lesson: Pick<Lesson, 'id' | 'title'> }) {
  const saved = useProgress().bookmarks.includes(lesson.id)
  const label = `${saved ? 'Remove bookmark for' : 'Bookmark'} ${lesson.title}`
  const Icon = saved ? BookmarkCheck : Bookmark
  return <button className={'bookmark-toggle' + (saved ? ' saved' : '')} aria-label={label} title={label}
    aria-pressed={saved} onClick={() => toggleLessonBookmark(lesson.id)}><Icon size={19} aria-hidden /></button>
}
