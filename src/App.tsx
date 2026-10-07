import { useEffect, useState } from 'react'
import './App.css'
import {
  createConversation,
  getMessages,
  listConversations,
  sendMessage,
  type ConversationSummary,
} from './api'
import ChatWindow, { type ChatMessage } from './components/ChatWindow'
import Sidebar from './components/Sidebar'
import { fetchModels, type ModelOption, sendNote } from './api'

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Une erreur est survenue.'
}

export default function App() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [activeId, setActiveId] = useState<number | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [models, setModels] = useState<ModelOption[]>([])
  const [selectedModel, setSelectedModel] = useState<string>('openai/gpt-4o-mini')

  // On startup, load the history, the models, and open the most recent conversation.
  useEffect(() => {
    // Charger les conversations existantes
    listConversations()
      .then((list) => {
        setConversations(list)
        if (list.length > 0) setActiveId(list[0].id)
      })
      .catch((err) => setError(errorMessage(err)))

    // Charger les modèles depuis le backend
    fetchModels()
      .then((modelList) => setModels(modelList))
      .catch((err) => setError(errorMessage(err)))
  }, [])


  // Load the messages whenever another conversation is opened.
  useEffect(() => {
    if (activeId === null) return
    let cancelled = false
    getMessages(activeId)
      .then((list) => {
        if (!cancelled) setMessages(list.map(({ role, content }) => ({ role, content })))
      })
      .catch((err) => !cancelled && setError(errorMessage(err)))
    return () => {
      cancelled = true
    }
  }, [activeId])

  function selectConversation(id: number) {
    if (loading || id === activeId) return
    setError(null)
    setDraft('')
    setMessages([])
    setActiveId(id)
  }

  async function handleNew() {
    if (loading) return
    setError(null)
    try {
      const id = await createConversation()
      setConversations((list) => [
        { id, created_at: new Date().toISOString(), preview: null },
        ...list,
      ])
      setDraft('')
      setMessages([])
      setActiveId(id)
    } catch (err) {
      setError(errorMessage(err))
    }
  }

    async function handleSend() {
    if (activeId === null) return
    const text = draft.trim()
    if (!text) return
    const isFirstMessage = messages.length === 0
    setError(null)
    setDraft('')
    
    // Afficher le message de l'utilisateur
    setMessages((list) => [...list, { role: 'user', content: text }])
    setLoading(true)

    try {
      // Appeller la fonction modifiée qui récupère le flux de données.
      const response = await sendMessage(activeId, text, selectedModel)
      
      if (!response.body) {
        throw new Error("Le serveur n'a pas renvoyé de flux de données.")
      }

      // Initialisation du lecteur de flux et du décodeur de texte
      const reader = response.body.getReader()
      const decoder = new TextDecoder('utf-8')
      let assistantReply = ""

      // Ajouter une bulle vide pour l'assistant dans l'interface
      setMessages((list) => [...list, { role: 'assistant', content: '' }])

      // Boucle de lecture en continu du flux SSE
      while (true) {
        const { value, done } = await reader.read()
        if (done) break // Fin du flux réseau

        // Décodage du morceau de texte reçu du serveur
        const chunkStr = decoder.decode(value, { stream: true })
        
        // Séparation des lignes (le format SSE envoie des blocs séparés par \n\n)
        const lines = chunkStr.split('\n')
        
        for (const line of lines) {
          if (!line.trim() || !line.startsWith('data: ')) continue
          
          const dataStr = line.slice(6).trim()
          if (dataStr === '[DONE]') {
            break // Le backend confirme que tout est fini et enregistré
          }

          try {
            const parsed = JSON.parse(dataStr)
            
            // Si le serveur nous envoie une erreur au milieu du stream
            if (parsed.error) {
              throw new Error(parsed.error)
            }
            
            // Si on reçoit un morceau de texte valide
            if (parsed.text) {
              assistantReply += parsed.text
              // On met à jour uniquement le tout dernier message (qui est celui de l'assistant)
              setMessages((list) => {
                const updated = [...list]
                const lastIndex = updated.length - 1
                if (lastIndex >= 0 && updated[lastIndex].role === 'assistant') {
                  updated[lastIndex] = { role: 'assistant', content: assistantReply }
                }
                return updated
              })
            }
          } catch (e) {
            // Ignorer les erreurs de parsing mineures sur les lignes incomplètes
            continue
          }
        }
      }

      // Si c'est la toute première phrase, on rafraîchit la barre latérale pour la prévisualisation
      if (isFirstMessage) setConversations(await listConversations())

    } catch (err) {
      setError(errorMessage(err))
      // En cas d'erreur de connexion ou de coupure, on nettoie l'interface
      setMessages((list) => {
        // Si le dernier message est une bulle assistant incomplète ou vide, on la retire
        const last = list[list.length - 1]
        if (last && last.role === 'assistant' && last.content === '') {
          return list.slice(0, -1)
        }
        return list
      })
      setDraft(text) // On rend son texte à l'utilisateur dans le champ de saisie
    } finally {
      setLoading(false)
    }
  } 

  // Fonction permettant à l'étudiant d'enregistrer une note personnelle
  async function handleSaveNote() {
    if (activeId === null) return
    const text = draft.trim()
    if (!text) return
    setError(null)
    setDraft('')
    // Ajout direct dans l'interface visuelle
setMessages((list) => [...list, { role: 'note', content: text }])
    try {
      await sendNote(activeId, text)
    } catch (err) {
      // En cas d'échec du serveur, on retire la note de l'affichage et on remet le texte dans le brouillon
      setMessages((list) => list.slice(0, -1))
      setDraft(text)
      setError(errorMessage(err))
    }
  }

  return (
    <div className="app">
      <Sidebar
        conversations={conversations}
        activeId={activeId}
        onSelect={selectConversation}
        onNew={handleNew}
      />
      <main className="main">
        {error && (
          <div className="error" role="alert">
            {error}
            <button onClick={() => setError(null)} aria-label="Fermer">
              ×
            </button>
          </div>
        )}
        {activeId === null ? (
          <div className="empty">
            <p>Aucune conversation ouverte.</p>
            <button className="new-button" onClick={handleNew}>
              + Nouvelle conversation
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
            {/* Barre de sélection du modèle */}
            <div className="model-selector-bar" style={{ padding: '10px', borderBottom: '1px solid #ccc', background: '#f9f9f9', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <label htmlFor="model-select" style={{ fontWeight: 'bold' }}>Modèle : </label>
              <select
                id="model-select"
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                style={{ padding: '5px', borderRadius: '4px', border: '1px solid #ccc', background: 'white' }}
              >
                {models.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                  </option>
                ))}
              </select>
              
              {/* Bouton rapide d'enregistrement d'une note personnelle */}
              <button 
                onClick={handleSaveNote}
                disabled={!draft.trim() || loading}
                style={{ marginLeft: 'auto', padding: '5px 10px', background: '#fbc02d', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', color: '#333' }}
                title="Enregistre le brouillon actuel comme un bloc-note Post-it visible uniquement par toi"
              >
                 Épingler comme Note
              </button>
            </div>

            <ChatWindow
              messages={messages}
              loading={loading}
              draft={draft}
              onDraftChange={setDraft}
              onSend={handleSend}
            />
          </div>
        )}
      </main>
    </div>
  )
}
