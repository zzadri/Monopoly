import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import Keycloak from 'keycloak-js';
import { CreateGame } from './create-game';
import { provideKeycloakTestingStub } from '../../testing/keycloak-test-providers';

describe('CreateGame', () => {
  let component: CreateGame;
  let fixture: ComponentFixture<CreateGame>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CreateGame],
      providers: [
        provideHttpClient(),
        provideRouter([]),
        provideKeycloakTestingStub(),
        // Cette page redirige les invités vers /lobby : simuler un compte connecté.
        { provide: Keycloak, useValue: { authenticated: true, tokenParsed: {}, login: () => Promise.resolve(), logout: () => Promise.resolve() } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CreateGame);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
