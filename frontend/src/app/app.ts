import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { ChatService } from './chat.service';

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
export class App {
  readonly messageControl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.maxLength(500)]
  });

  readonly history = signal<ChatEntry[]>([]);
  readonly isSending = signal(false);
  readonly error = signal<string | null>(null);

  constructor(private readonly chatService: ChatService) {}

  get canSubmit(): boolean {
    return this.messageControl.valid && !this.isSending();
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

    this.error.set(null);
    this.isSending.set(true);
    this.appendToHistory({ role: 'user', text: message });

    this.chatService.sendMessage(message).subscribe({
      next: (response) => {
        const reply = response.reply ?? 'Nenhuma resposta recebida do servidor.';
        this.appendToHistory({ role: 'assistant', text: reply });
        this.messageControl.reset('');
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

  private appendToHistory(entry: ChatEntry): void {
    this.history.update((current) => [...current, entry]);
  }
}
