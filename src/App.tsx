import { useState, useEffect, useRef, useCallback } from 'react'
import './App.css'

interface Task {
  id: string
  text: string
  type: 'stack' | 'queue'
  createdAt: number
}

type TaskPhase = 'idle' | 'washing' | 'collapsing'

function loadTasks(): Task[] {
  try {
    const raw = localStorage.getItem('tw-tasks')
    return raw ? (JSON.parse(raw) as Task[]) : []
  } catch {
    return []
  }
}

function App() {
  const [tasks, setTasks] = useState<Task[]>(loadTasks)
  const [input, setInput] = useState('')
  const [phases, setPhases] = useState<Record<string, TaskPhase>>({})
  const [pinned, setPinned] = useState(true)
  const inputRef = useRef<HTMLInputElement>(null)

  // Persist tasks
  useEffect(() => {
    localStorage.setItem('tw-tasks', JSON.stringify(tasks))
  }, [tasks])

  // Sync always-on-top with Tauri (no-op in browser)
  useEffect(() => {
    import('@tauri-apps/api/window')
      .then(({ getCurrentWindow }) => getCurrentWindow().setAlwaysOnTop(pinned))
      .catch(() => {/* running in browser, fine */})
  }, [pinned])

  const addTask = useCallback((type: 'stack' | 'queue') => {
    const text = input.trim()
    if (!text) return

    const task: Task = {
      id: crypto.randomUUID(),
      text,
      type,
      createdAt: Date.now(),
    }

    setTasks(prev => type === 'stack' ? [task, ...prev] : [...prev, task])
    setInput('')
    inputRef.current?.focus()
  }, [input])

  const completeTask = useCallback((id: string) => {
    // Phase 1: wash sweeps across
    setPhases(p => ({ ...p, [id]: 'washing' }))

    // Phase 2: collapse the row
    setTimeout(() => {
      setPhases(p => ({ ...p, [id]: 'collapsing' }))
    }, 580)

    // Phase 3: remove from state
    setTimeout(() => {
      setTasks(prev => prev.filter(t => t.id !== id))
      setPhases(p => {
        const next = { ...p }
        delete next[id]
        return next
      })
    }, 880)
  }, [])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault()
      addTask('stack')
    } else if (e.key === 'Enter') {
      e.preventDefault()
      addTask('queue')
    }
  }

  return (
    <div className="app">
      <header className="header" data-tauri-drag-region>
        <span className="title" data-tauri-drag-region>Task Widget</span>
        <div className="header-right">
          <span className="count">{tasks.length > 0 ? `${tasks.length} task${tasks.length !== 1 ? 's' : ''}` : 'clear!'}</span>
          <button
            className={`pin-btn ${pinned ? 'pinned' : ''}`}
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
            return (
              <div
                key={task.id}
                className={`task-row phase-${phase} type-${task.type}`}
              >
                {/* The wash overlay */}
                <div className="wash" />

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
        <kbd>Enter</kbd> queue · <kbd>⇧ Enter</kbd> stack
      </footer>
    </div>
  )
}

export default App
