// Thin typed wrappers around the FastAPI backend (proxied under /api by Vite).

export type Role = 'user' | 'assistant' | 'system-notification'

export interface ConversationSummary {
  id: number
  created_at: string
  preview: string | null
}

export interface Message {
  seq: number
  role: Role
  content: string
  created_at: string
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`/api${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    })
  } catch {
    throw new Error('Impossible de joindre le serveur.')
  }
  if (!response.ok) {
    // FastAPI errors look like {"detail": "..."}.
    const body = await response.json().catch(() => null)
    const detail = typeof body?.detail === 'string' ? body.detail : null
    throw new Error(detail ?? `Erreur ${response.status}`)
  }
  return response.json() as Promise<T>
}

export function listConversations(): Promise<ConversationSummary[]> {
  return request('/conversations')
}

export async function createConversation(): Promise<number> {
  const { conversation_id } = await request<{ conversation_id: number }>('/conversations', {
    method: 'POST',
  })
  return conversation_id
}

export function getMessages(conversationId: number): Promise<Message[]> {
  return request(`/conversations/${conversationId}/messages`)
}

export interface ChatResult {
  reply: string
  notification: string | null // set when the backend also stored a system-notification
}

export async function sendMessage(
  conversationId: number, 
  text: string, 
  model?: string
): Promise<Response> { 
  const response = await fetch('/api/chat', { 
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      conversation_id: conversationId, 
      message: text,
      model: model 
    }),
  })
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(errorData.detail || 'Une erreur est survenue.')
  }
  
  return response; 
}


export interface ModelOption {
  id: string
  name: string
}

export async function fetchModels(): Promise<ModelOption[]> {
  const response = await fetch('/api/models') 
  if (!response.ok) throw new Error('Impossible de charger les modèles.')
  return response.json()
}


export async function sendNote(conversationId: number, content: string): Promise<void> {
  const response = await fetch(`/api/conversations/${conversationId}/notes`, { 
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  })
  if (!response.ok) throw new Error('Impossible d\'enregistrer la note.')
}

