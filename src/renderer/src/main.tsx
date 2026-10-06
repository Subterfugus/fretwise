import { createRoot } from 'react-dom/client'
import './styles.css'
import './themes.css'
import { App } from './App'
import { loadProgress, getProgress } from './state/progress'
import { engine } from './audio/engine'

loadProgress().then(() => {
  const s = getProgress().settings
  engine.instrument = s.instrument
  engine.setVolume(s.volume)
  createRoot(document.getElementById('root')!).render(<App />)
})
