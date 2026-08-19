import { environment } from '../../environments/environment';

/** Modo demo: simula SocialCrawl y otras APIs externas sin gastar créditos. */
export function isExternalApisMock() {
  return environment.externalApisMock !== false;
}
