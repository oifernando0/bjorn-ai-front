import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { ChatService, ConversationMessage } from './chat.service';

interface ChatEntry {
  role: 'user' | 'assistant';
  text: string;
}

@Component({
  selector: 'app-root',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App implements OnInit {
  readonly messageControl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.maxLength(500)]
  });

  readonly history = signal<ChatEntry[]>([]);
  readonly isSending = signal(false);
  readonly error = signal<string | null>(null);
  readonly conversationId = signal<string | number | null>(null);
  readonly isInitializing = signal(false);

  constructor(private readonly chatService: ChatService) {}

  ngOnInit(): void {
    this.ensureConversation();
  }

  get canSubmit(): boolean {
    return (
      this.messageControl.valid &&
      !this.isSending() &&
      !this.isInitializing() &&
      Boolean(this.conversationId())
    );
  }

  onSubmit(): void {
    if (!this.messageControl.valid || this.isSending()) {
      this.messageControl.markAsTouched();
      return;
    }

    const message = this.messageControl.value.trim();
    if (!message) {
      this.messageControl.setErrors({ required: true });
      return;
    }

    if (!this.conversationId()) {
      this.ensureConversation(() => this.dispatchMessage(message));
      return;
    }

    this.dispatchMessage(message);
  }

  private dispatchMessage(message: string): void {
    const conversationId = this.conversationId();
    if (!conversationId) {
      return;
    }

    this.error.set(null);
    this.isSending.set(true);
    this.appendToHistory({ role: 'user', text: message });

    this.chatService
      .sendMessage(conversationId, { content: message })
      .subscribe({
        next: () => {
          this.messageControl.reset('');
          this.loadMessages();
        },
        error: (err: HttpErrorResponse) => {
          const fallback =
            'Não foi possível enviar a mensagem. Verifique se o backend está em execução e tente novamente.';
          this.error.set(err.error?.message ?? err.message ?? fallback);
          this.isSending.set(false);
        },
        complete: () => this.isSending.set(false)
      });
  }

  private ensureConversation(onReady?: () => void): void {
    if (this.conversationId() || this.isInitializing()) {
      return;
    }

    this.isInitializing.set(true);
    this.error.set(null);

    this.chatService
      .createConversation({ title: 'Conversa Bjorn AI' })
      .subscribe({
        next: (conversation) => {
          const id = conversation?.id ?? conversation?.conversationId;
          if (!id) {
            this.error.set('Resposta do backend não possui identificador da conversa.');
            this.isInitializing.set(false);
            return;
          }
          this.conversationId.set(id);
          this.loadMessages();
          onReady?.();
        },
        error: (err: HttpErrorResponse) => {
          const fallback =
            'Não foi possível iniciar uma conversa. Confirme se o backend está em execução em http://localhost:8080.';
          this.error.set(err.error?.message ?? err.message ?? fallback);
          this.isInitializing.set(false);
        },
        complete: () => this.isInitializing.set(false)
      });
  }

  private loadMessages(): void {
    const conversationId = this.conversationId();
    if (!conversationId) {
      return;
    }

    this.chatService.listMessages(conversationId).subscribe({
      next: (messages) => this.history.set(this.mapMessages(messages)),
      error: (err: HttpErrorResponse) => {
        const fallback = 'Não foi possível carregar as mensagens desta conversa.';
        this.error.set(err.error?.message ?? err.message ?? fallback);
      }
    });
  }

  private mapMessages(messages: ConversationMessage[]): ChatEntry[] {
    return messages.map((message) => ({
      role: message.role === 'assistant' ? 'assistant' : 'user',
      text: message.content ?? message.message ?? ''
    }));
  }

  private appendToHistory(entry: ChatEntry): void {
    this.history.update((current) => [...current, entry]);
  }
}
