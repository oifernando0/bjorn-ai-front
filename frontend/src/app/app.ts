import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { ChatService, ConversationMessage } from './chat.service';

const ACTIVE_CONVERSATION_STORAGE_KEY = 'bjorn-active-conversation-id';

interface ChatEntry {
  role: 'user' | 'assistant';
  text: string;
  createdAt?: Date;
  id?: string | number;
}

@Component({
  selector: 'app-root',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App implements OnInit, OnDestroy {
  readonly messageControl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.maxLength(500)]
  });

  readonly history = signal<ChatEntry[]>([]);
  readonly isSending = signal(false);
  readonly error = signal<string | null>(null);
  readonly conversationId = signal<string | number | null>(null);
  readonly isInitializing = signal(false);
  readonly isAwaitingResponse = signal(false);
  private readonly pendingAssistantId = 'pending-assistant';
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private pollAttempts = 0;
  private readonly maxPollAttempts = 30;
  private readonly pollIntervalMs = 1000;
  private lastAssistantMessageId: string | number | null = null;
  private pendingUserMessage: string | null = null;

  constructor(private readonly chatService: ChatService) {}

  ngOnInit(): void {
    this.ensureConversation();
  }

  ngOnDestroy(): void {
    this.stopPolling();
  }

  get canSubmit(): boolean {
    return (
      this.messageControl.valid &&
      !this.isSending() &&
      !this.isInitializing() &&
      Boolean(this.conversationId())
    );
  }

  onSubmit(event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();

    if (!this.messageControl.valid || this.isSending()) {
      this.messageControl.markAsTouched();
      return;
    }

    const message = this.messageControl.value.trim();
    if (!message) {
      this.messageControl.setErrors({ required: true });
      return;
    }

    this.pendingUserMessage = message;

    if (!this.conversationId()) {
      this.ensureConversation(() => this.dispatchMessage());
      return;
    }

    this.dispatchMessage();
  }

  private dispatchMessage(): void {
    const message = this.pendingUserMessage;
    if (!message) {
      return;
    }

    const conversationId = this.conversationId();
    if (!conversationId) {
      return;
    }

    this.messageControl.reset('');
    this.pendingUserMessage = null;
    this.error.set(null);
    this.isSending.set(true);
    this.lastAssistantMessageId = this.latestAssistantId();
    this.appendToHistory({ role: 'user', text: message, createdAt: new Date() });
    this.startAwaitingResponse();

    this.chatService
      .sendMessage(conversationId, { content: message })
      .subscribe({
        next: (response) => {
          this.messageControl.reset('');
          this.isAwaitingResponse.set(false);
          this.removePendingAssistantPlaceholder();

          if (response) {
            const assistantEntry: ChatEntry = {
              role: this.normalizeRole(response.role),
              text: response.content ?? '',
              createdAt: response.createdAt ? new Date(response.createdAt) : new Date(),
              id: response.id
            };

            this.lastAssistantMessageId = assistantEntry.id ?? this.lastAssistantMessageId;
            this.appendToHistory(assistantEntry);
          }
        },
        error: (err: HttpErrorResponse) => {
          const fallback =
            'Não foi possível enviar a mensagem. Verifique se o backend está em execução e tente novamente.';
          this.error.set(err.error?.message ?? err.message ?? fallback);
          this.isAwaitingResponse.set(false);
          this.removePendingAssistantPlaceholder();
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

    const storedConversationId = localStorage.getItem(ACTIVE_CONVERSATION_STORAGE_KEY);
    if (storedConversationId) {
      this.conversationId.set(storedConversationId);
      this.loadMessages(
        () => {
          this.isInitializing.set(false);
          onReady?.();
        },
        () => {
          localStorage.removeItem(ACTIVE_CONVERSATION_STORAGE_KEY);
          this.conversationId.set(null);
          this.isInitializing.set(false);
          this.createConversation(onReady);
        }
      );
      return;
    }

    this.createConversation(onReady);
  }

  private createConversation(onReady?: () => void): void {
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
          localStorage.setItem(ACTIVE_CONVERSATION_STORAGE_KEY, String(id));
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

  startNewConversation(): void {
    if (this.isInitializing()) {
      return;
    }

    this.stopPolling();
    this.isAwaitingResponse.set(false);
    this.isSending.set(false);
    this.error.set(null);
    this.pendingUserMessage = null;
    this.lastAssistantMessageId = null;
    this.messageControl.reset('');
    this.history.set([]);
    this.conversationId.set(null);
    localStorage.removeItem(ACTIVE_CONVERSATION_STORAGE_KEY);
    this.createConversation();
  }

  private loadMessages(onComplete?: () => void, onError?: () => void): void {
    const conversationId = this.conversationId();
    if (!conversationId) {
      return;
    }

    this.chatService.listMessages(conversationId).subscribe({
      next: (messages) => this.processLoadedMessages(messages),
      error: (err: HttpErrorResponse) => {
        const fallback = 'Não foi possível carregar as mensagens desta conversa.';
        this.error.set(err.error?.message ?? err.message ?? fallback);
        onError?.();
      },
      complete: () => onComplete?.()
    });
  }

  private mapMessages(messages: ConversationMessage[]): ChatEntry[] {
    const sortedMessages = [...messages].sort((a, b) => {
      const aDate = a.createdAt ? new Date(a.createdAt).getTime() : undefined;
      const bDate = b.createdAt ? new Date(b.createdAt).getTime() : undefined;

      if (typeof aDate === 'number' && typeof bDate === 'number') {
        return aDate - bDate;
      }

      const aId = typeof a.id === 'number' ? a.id : Number(a.id);
      const bId = typeof b.id === 'number' ? b.id : Number(b.id);

      if (!Number.isNaN(aId) && !Number.isNaN(bId)) {
        return aId - bId;
      }

      return 0;
    });

    return sortedMessages.map((message) => ({
      role: this.normalizeRole(message.role),
      text: message.content ?? '',
      createdAt: message.createdAt ? new Date(message.createdAt) : undefined,
      id: message.id
    }));
  }

  private processLoadedMessages(messages: ConversationMessage[]): void {
    const entries = this.mapMessages(messages);
    const withAwaitingPlaceholder = this.applyAwaitingPlaceholder(entries);

    this.history.set(withAwaitingPlaceholder);

    if (!this.isAwaitingResponse()) {
      this.stopPolling();
    }
  }

  private appendToHistory(entry: ChatEntry): void {
    this.history.update((current) => [...current, entry]);
  }

  private applyAwaitingPlaceholder(entries: ChatEntry[]): ChatEntry[] {
    const latestAssistantId = this.latestAssistantId(entries);
    const entriesWithoutPlaceholder = entries.filter(
      (entry) => entry.id !== this.pendingAssistantId
    );

    if (!this.isAwaitingResponse()) {
      this.lastAssistantMessageId = latestAssistantId ?? this.lastAssistantMessageId;
      return entriesWithoutPlaceholder;
    }

    const hasNewAssistant =
      latestAssistantId !== null && latestAssistantId !== this.lastAssistantMessageId;

    if (hasNewAssistant) {
      this.isAwaitingResponse.set(false);
      this.lastAssistantMessageId = latestAssistantId;
      return entriesWithoutPlaceholder;
    }

    this.lastAssistantMessageId = latestAssistantId ?? this.lastAssistantMessageId;

    return [
      ...entriesWithoutPlaceholder,
      { role: 'assistant', text: 'Verificando documentação', id: this.pendingAssistantId }
    ];
  }

  private latestAssistantId(entries: ChatEntry[] = this.history()): string | number | null {
    const assistantEntries = entries.filter(
      (entry) => entry.role === 'assistant' && entry.id !== this.pendingAssistantId
    );
    const latestAssistant = assistantEntries[assistantEntries.length - 1];

    return latestAssistant?.id ?? null;
  }

  private startAwaitingResponse(): void {
    this.isAwaitingResponse.set(true);
    this.pollAttempts = 0;
    this.stopPolling();
    this.history.set(this.applyAwaitingPlaceholder(this.history()));
  }

  private scheduleResponsePolling(): void {
    if (!this.isAwaitingResponse()) {
      return;
    }

    this.pollAttempts = 0;
    this.queueNextPoll();
  }

  private queueNextPoll(): void {
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
    }

    if (!this.isAwaitingResponse()) {
      return;
    }

    this.pollTimer = setTimeout(() => this.pollForAssistantResponse(), this.pollIntervalMs);
  }

  private pollForAssistantResponse(): void {
    if (!this.isAwaitingResponse()) {
      return;
    }

    if (this.pollAttempts >= this.maxPollAttempts) {
      this.isAwaitingResponse.set(false);
      this.removePendingAssistantPlaceholder();
      this.stopPolling();
      return;
    }

    this.pollAttempts += 1;
    this.loadMessages(() => this.queueNextPoll());
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }

    this.pollAttempts = 0;
  }

  private removePendingAssistantPlaceholder(): void {
    this.history.update((entries) =>
      entries.filter((entry) => entry.id !== this.pendingAssistantId)
    );
  }

  private normalizeRole(role?: string): ChatEntry['role'] {
    if (typeof role !== 'string') {
      return 'user';
    }

    return role.toLowerCase() === 'assistant' ? 'assistant' : 'user';
  }
}
