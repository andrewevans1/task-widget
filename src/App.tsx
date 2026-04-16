import { useState, useRef, useEffect, useCallback } from 'react'
import './App.css'

interface Task {
  id: string
  text: string
  type: 'stack' | 'queue'
  createdAt: number
}

type TaskPhase = 'idle' | 'washing' | 'collapsing'
type Theme = 'dark' | 'light'
type DragTarget = { id: string; half: 'top' | 'bottom' } | null

function loadTasks(): Task[] {
  try {
    const raw = localStorage.getItem('tw-tasks')
    return raw ? (JSON.parse(raw) as Task[]) : []
  } catch {
    return []
  }
}

function loadTheme(): Theme {
  return (localStorage.getItem('tw-theme') as Theme) ?? 'dark'
}

function App() {
  const [tasks, setTasks] = useState<Task[]>(loadTasks)
  const [input, setInput] = useState('')
  const [phases, setPhases] = useState<Record<string, TaskPhase>>({})
  const [pinned, setPinned] = useState(true)
  const [theme, setTheme] = useState<Theme>(loadTheme)

  // Drag state
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dragTarget, setDragTarget] = useState<DragTarget>(null)

  const inputRef = useRef<HTMLInputElement>(null)

  // Persist tasks + theme
  useEffect(() => { localStorage.setItem('tw-tasks', JSON.stringify(tasks)) }, [tasks])
  useEffect(() => { localStorage.setItem('tw-theme', theme) }, [theme])

  // Sync always-on-top with Tauri (no-op in browser)
  useEffect(() => {
    import('@tauri-apps/api/window')
      .then(({ getCurrentWindow }) => getCurrentWindow().setAlwaysOnTop(pinned))
      .catch(() => {})
  }, [pinned])

  // ── Task actions ────────────────────────────────────────────────────────────

  const addTask = useCallback((type: 'stack' | 'queue') => {
    const text = input.trim()
    if (!text) return
    const task: Task = { id: crypto.randomUUID(), text, type, createdAt: Date.now() }
    setTasks(prev => type === 'stack' ? [task, ...prev] : [...prev, task])
    setInput('')
    inputRef.current?.focus()
  }, [input])

  const completeTask = useCallback((id: string) => {
    setPhases(p => ({ ...p, [id]: 'washing' }))
    setTimeout(() => setPhases(p => ({ ...p, [id]: 'collapsing' })), 580)
    setTimeout(() => {
      setTasks(prev => prev.filter(t => t.id !== id))
      setPhases(p => { const n = { ...p }; delete n[id]; return n })
    }, 880)
  }, [])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); addTask('stack') }
    else if (e.key === 'Enter') { e.preventDefault(); addTask('queue') }
  }

  // ── Drag handlers ───────────────────────────────────────────────────────────

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedId(id)
    e.dataTransfer.effectAllowed = 'move'
    // Slight delay so the row opacity change renders before the drag image is captured
    requestAnimationFrame(() => {
      (e.target as HTMLElement).style.opacity = '0.4'
    })
  }

  const handleDragEnd = (e: React.DragEvent) => {
    ;(e.target as HTMLElement).style.opacity = ''
    setDraggedId(null)
    setDragTarget(null)
  }

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (draggedId === id) { setDragTarget(null); return }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const half = e.clientY < rect.top + rect.height / 2 ? 'top' : 'bottom'
    setDragTarget(prev =>
      prev?.id === id && prev?.half === half ? prev : { id, half }
    )
  }

  const handleDragLeave = (e: React.DragEvent) => {
    if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) {
      setDragTarget(null)
    }
  }

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault()
    if (!draggedId || draggedId === targetId) { setDragTarget(null); return }

    setTasks(prev => {
      const next = [...prev]
      const srcIdx = next.findIndex(t => t.id === draggedId)
      if (srcIdx === -1) return prev
      const [moved] = next.splice(srcIdx, 1)
      const tgtIdx = next.findIndex(t => t.id === targetId)
      if (tgtIdx === -1) return prev
      const insertAt = dragTarget?.half === 'bottom' ? tgtIdx + 1 : tgtIdx
      next.splice(insertAt, 0, moved)
      return next
    })

    setDraggedId(null)
    setDragTarget(null)
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className={`app theme-${theme}`}>
      <header className="header" data-tauri-drag-region>
        <span className="title" data-tauri-drag-region>Task Widget</span>
        <div className="header-right">
          <span className="count">
            {tasks.length > 0 ? `${tasks.length} task${tasks.length !== 1 ? 's' : ''}` : 'clear!'}
          </span>
          <button
            className="icon-btn"
            onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? '☀︎' : '☽'}
          </button>
          <button
            className={`icon-btn ${pinned ? 'active' : ''}`}
            onClick={() => setPinned(p => !p)}
            title={pinned ? 'Unpin window' : 'Pin on top'}
          >
            {pinned ? '📌' : '📍'}
          </button>
        </div>
      </header>

      <div className="input-card">
        <input
          ref={inputRef}
          className="task-input"
          type="text"
          placeholder="What needs doing?"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus
        />
        <div className="btn-row">
          <button
            className="btn btn-stack"
            onClick={() => addTask('stack')}
            disabled={!input.trim()}
            title="Urgent — jumps to top  (⇧ Enter)"
          >
            <span className="btn-arrow">↑</span> Stack it
          </button>
          <button
            className="btn btn-queue"
            onClick={() => addTask('queue')}
            disabled={!input.trim()}
            title="Normal priority — goes to bottom  (Enter)"
          >
            <span className="btn-arrow">↓</span> Queue it
          </button>
        </div>
      </div>

      <div className="task-list">
        {tasks.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon">✦</span>
            <span>Nothing in the queue</span>
          </div>
        ) : (
          tasks.map((task, i) => {
            const phase = phases[task.id] ?? 'idle'
            const isDragging = draggedId === task.id
            const dropClass =
              dragTarget?.id === task.id
                ? dragTarget.half === 'top' ? 'drop-above' : 'drop-below'
                : ''

            return (
              <div
                key={task.id}
                className={`task-row phase-${phase} type-${task.type} ${isDragging ? 'dragging' : ''} ${dropClass}`}
                draggable={phase === 'idle'}
                onDragStart={e => handleDragStart(e, task.id)}
                onDragEnd={handleDragEnd}
                onDragOver={e => handleDragOver(e, task.id)}
                onDragLeave={handleDragLeave}
                onDrop={e => handleDrop(e, task.id)}
              >
                <div className="wash" />

                <span className="drag-handle" title="Drag to reorder">⠿</span>
                <span className="task-num">{i + 1}</span>
                <span className={`dot dot-${task.type}`} />
                <span className="task-text">{task.text}</span>
                <button
                  className="done-btn"
                  onClick={() => completeTask(task.id)}
                  disabled={phase !== 'idle'}
                  title="Mark done"
                  aria-label="Complete task"
                >
                  ✓
                </button>
              </div>
            )
          })
        )}
      </div>

      <footer className="footer">
        <kbd>Enter</kbd> queue · <kbd>⇧ Enter</kbd> stack · drag to reorder
      </footer>
    </div>
  )
}

export default App
