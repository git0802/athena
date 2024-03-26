
import { Message } from 'ai'

export interface Session {
    user: {
      id: string
      email: string
    }
  }
  
  export interface AuthResult {
    type: string
    message: string
  }
  

export interface Chat extends Record<string, any> {
  id: string
  title: string
  createdAt: Date
  userId: string
  path: string
  messages: Message[]
  sharePath?: string
}
