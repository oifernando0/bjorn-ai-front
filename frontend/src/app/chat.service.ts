import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { environment } from '../environments/environment';

interface ChatResponse {
  reply?: string;
}

@Injectable({ providedIn: 'root' })
export class ChatService {
  private readonly endpoint = `${environment.backendUrl}/chat`;

  constructor(private readonly http: HttpClient) {}

  sendMessage(message: string) {
    return this.http.post<ChatResponse>(this.endpoint, { message });
  }
}
