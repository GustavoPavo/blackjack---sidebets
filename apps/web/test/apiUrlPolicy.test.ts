import { describe, it, expect } from 'vitest';
import { validateApiUrl } from '../scripts/apiUrlPolicy.mjs';

const ok = (mode: string, url: string) => expect(validateApiUrl(mode, url)).toEqual({ ok: true, problems: [] });
const bad = (mode: string, url: string | undefined, re: RegExp) => {
  const r = validateApiUrl(mode, url);
  expect(r.ok).toBe(false);
  expect(r.problems.join(' | ')).toMatch(re);
};

describe('URL do backend por ambiente', () => {
  it('desenvolvimento aceita localhost, emulador Android e rede local (http ou https)', () => {
    ok('native-development', 'http://10.0.2.2:3001');
    ok('native-development', 'http://localhost:3001');
    ok('native-development', 'http://192.168.0.10:3001');
    ok('native-development', 'https://dev.meudominio.com');
  });
  it('produção só aceita https com domínio real', () => {
    ok('native-production', 'https://api.meudominio.com');
    ok('native-production', 'https://blackjack.meudominio.com.br:8443');
  });
  it('produção NUNCA aceita localhost, loopback, emulador, rede privada ou IP', () => {
    for (const h of ['http://localhost:3001', 'https://localhost', 'https://127.0.0.1', 'https://10.0.2.2', 'https://192.168.1.5', 'https://10.1.2.3', 'https://172.20.0.1', 'https://servidor.local', 'https://[::1]'])
      bad('native-production', h, /local|privada|IP/);
    bad('native-production', 'https://203.0.113.10', /endereço IP|domínio/);
  });
  it('produção e teste exigem https', () => {
    bad('native-production', 'http://api.meudominio.com', /https/);
    bad('native-test', 'http://api-teste.meudominio.com', /https/);
  });
  it('teste recusa localhost e placeholders', () => {
    bad('native-test', 'https://localhost', /local/);
    bad('native-test', 'https://blackjack-test.example.invalid', /placeholder/);
    ok('native-test', 'https://api-teste.meudominio.com');
  });
  it('recusa os placeholders versionados em produção e teste', () => {
    bad('native-production', 'https://blackjack.example.invalid', /placeholder/);
    bad('native-production', 'https://exemplo.example.com', /placeholder/);
  });
  it('vazio, inválido, credenciais, caminho e modo desconhecido', () => {
    bad('native-production', '', /vazio/);
    bad('native-production', undefined, /vazio/);
    bad('native-production', 'api.meudominio.com', /inválida/);
    bad('native-production', 'https://user:senha@api.meudominio.com', /usuário/);
    bad('native-production', 'https://api.meudominio.com/v1?x=1', /origem/);
    bad('web', 'https://api.meudominio.com', /desconhecido/);
  });
});
