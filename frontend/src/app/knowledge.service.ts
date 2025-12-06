import { HttpClient, HttpEvent, HttpRequest } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { environment } from '../environments/environment';
import { Observable } from 'rxjs';

export interface KnowledgeDocument {
  name?: string;
  size?: number;
  uploadedAt?: string;
  id?: string | number;
}

@Injectable({ providedIn: 'root' })
export class KnowledgeService {
  constructor(private readonly http: HttpClient) {}

  uploadDocuments(specialist: string, files: File[]): Observable<HttpEvent<unknown>> {
    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));

    const url = `${environment.backendUrl}/api/knowledge/${encodeURIComponent(specialist)}/docs`;
    const request = new HttpRequest('POST', url, formData, {
      reportProgress: true,
      responseType: 'text'
    });

    return this.http.request(request);
  }

  listDocuments(specialist: string): Observable<KnowledgeDocument[]> {
    const url = `${environment.backendUrl}/api/knowledge/${encodeURIComponent(specialist)}/docs`;
    return this.http.get<KnowledgeDocument[]>(url);
  }
}
