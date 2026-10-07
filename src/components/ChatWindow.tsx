import { useEffect, useRef, type FormEvent, type KeyboardEvent } from 'react'
import Markdown from 'react-markdown'
import type { Role } from '../api'

export interface ChatMessage {
  // On autorise le rôle 'note' au niveau de l'affichage
  role: Role | 'note'
  content: string
}

interface ChatWindowProps {
  messages: ChatMessage[]
  loading: boolean
  draft: string
  onDraftChange: (value: string) => void
  onSend: () => void
}

export default function ChatWindow({ messages, loading, draft, onDraftChange, onSend }: ChatWindowProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  // Keep the latest message in view.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!loading && draft.trim()) onSend()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends, Shift+Enter inserts a new line.
    if (event.key === 'Enter' && !event.shiftKey) handleSubmit(event)
  }

  return (
    <section className="chat">
      <div className="messages">
        {messages.length === 0 && !loading && (
          <p className="muted center">Pose ta première question à Study Buddy.</p>
        )}
        {messages.map((m, i) => {
          // Gestion du rôle existant : system-notification
          if (m.role === 'system-notification') {
            return (
              <div key={i} className="notification">
                {m.content}
              </div>
            )
          }
          
          // AJOUT : Gestion du rôle custom 'note' (Style Post-it)
          if (m.role === 'note') {
            return (
              <div 
                key={i} 
                className="bubble note"
                style={{
                  background: '#fff9c4', // Fond jaune Post-it
                  color: '#333',
                  borderLeft: '5px solid #fbc02d', // Bordure jaune foncée
                  padding: '10px 15px',
                  margin: '10px auto 10px 0', // Aligné à gauche mais distinct
                  borderRadius: '4px',
                  maxWidth: '80%',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                  fontStyle: 'italic'
                }}
              >
                <span style={{ marginRight: '5px' }}>📌</span> 
                <strong>Note personnelle :</strong> {m.content}
              </div>
            )
          }

          // Gestion des rôles standards (user et assistant)
          return (
            <div key={i} className={`bubble ${m.role}`}>
              {/* The LLM answers in Markdown; user messages are shown as typed. */}
              {m.role === 'assistant' ? <Markdown>{m.content}</Markdown> : m.content}
            </div>
          )
        })}
        {loading && <div className="bubble assistant typing">…</div>}
        <div ref={bottomRef} />
      </div>
      <form className="composer" onSubmit={handleSubmit}>
        <textarea
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Écris ton message…"
          rows={2}
          disabled={loading}
          autoFocus
        />
        <button type="submit" disabled={loading || !draft.trim()}>
          Envoyer
        </button>
      </form>
    </section>
  )
}
