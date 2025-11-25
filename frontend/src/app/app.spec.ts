import { provideHttpClient, withFetch } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { App } from './app';

describe('App', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideHttpClient(withFetch()), provideHttpClientTesting()]
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render hero title', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    httpMock.expectOne('http://localhost:8080/api/conversations').flush({ id: 'demo' });
    httpMock.expectOne('http://localhost:8080/api/conversations/demo/messages').flush([]);

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('Converse com o seu assistente');
  });

  it('should map backend message responses into chat history', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    httpMock.expectOne('http://localhost:8080/api/conversations').flush({ id: '42' });

    httpMock
      .expectOne('http://localhost:8080/api/conversations/42/messages')
      .flush([
        {
          id: 2,
          role: 'ASSISTANT',
          content: 'Oi, posso ajudar?',
          createdAt: '2024-01-01T12:01:00Z'
        },
        {
          id: 1,
          role: 'USER',
          content: 'Olá Bjorn!',
          createdAt: '2024-01-01T12:00:00Z'
        }
      ]);

    fixture.detectChanges();

    const entries = fixture.nativeElement.querySelectorAll('.entry');
    expect(entries.length).toBe(2);
    expect(entries[0].textContent).toContain('Olá Bjorn!');
    expect(entries[1].textContent).toContain('Oi, posso ajudar?');
    expect(entries[0].querySelector('.role')?.textContent).toContain('Você');
    expect(entries[1].querySelector('.role')?.textContent).toContain('Bjorn');
    expect(entries[0].querySelector('.meta')?.textContent?.trim()).toBeTruthy();
  });
});
