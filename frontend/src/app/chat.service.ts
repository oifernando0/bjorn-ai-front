import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { environment } from '../environments/environment';

interface Conversation {
  id?: string | number;
  conversationId?: string | number;
  title?: string;
  knowledgeBaseId?: number;
}

interface SendMessagePayload {
  content: string;
  metadata?: Record<string, unknown>;
}

export interface ConversationMessage {
  id?: string | number;
  role?: string;
  content?: string;
  metadata?: Record<string, unknown>;
  createdAt?: string;
}

@Injectable({ providedIn: 'root' })
export class ChatService {
  private readonly conversationsEndpoint = `${environment.backendUrl}/api/conversations`;

  constructor(private readonly http: HttpClient) {}

  createConversation(payload: Partial<Conversation> = {}) {
    const body: { title?: string; knowledgeBaseId?: number } = {};

    if (payload.title) {
      body.title = payload.title;
    }

    if (typeof payload.knowledgeBaseId === 'number') {
      body.knowledgeBaseId = payload.knowledgeBaseId;
    }

    return this.http.post<Conversation>(this.conversationsEndpoint, body);
  }

  sendMessage(conversationId: string | number, payload: SendMessagePayload) {
    return this.http.post<ConversationMessage>(
      `${this.conversationsEndpoint}/${conversationId}/messages`,
      payload
    );
  }

  listMessages(conversationId: string | number) {
    return this.http.get<ConversationMessage[]>(
      `${this.conversationsEndpoint}/${conversationId}/messages`
    );
  }
}
