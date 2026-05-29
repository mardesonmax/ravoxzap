import { describe, expect, it } from 'vitest';

import { isInternalJid, jidToPhone, parseJsonInput, participantCanUsePhone, phoneAliases, phonesMayBeSame } from '../lib/utils';

describe('RavoxChat utils', () => {
  it('normaliza telefone apenas para JIDs telefonicos', () => {
    expect(jidToPhone('5585999999999@s.whatsapp.net')).toBe('5585999999999');
    expect(jidToPhone('120363000000000000@g.us')).toBe('');
    expect(jidToPhone('123456789@lid')).toBe('');
  });

  it('bloqueia ID privado em acoes que exigem telefone', () => {
    expect(isInternalJid('123456789@lid')).toBe(true);
    expect(participantCanUsePhone('123456789@lid')).toBe(false);
    expect(participantCanUsePhone('5585999999999@s.whatsapp.net')).toBe(true);
  });

  it('gera aliases BR com e sem nono digito', () => {
    expect(phoneAliases('5585988532761')).toContain('558588532761');
    expect(phoneAliases('558588532761')).toContain('5585988532761');
    expect(phonesMayBeSame('5585988532761', '558588532761')).toBe(true);
  });

  it('valida JSON tecnico', () => {
    expect(parseJsonInput('{"updates":{"description":"ok"}}')).toEqual({ updates: { description: 'ok' } });
    expect(() => parseJsonInput('{')).toThrow('JSON invalido.');
  });
});
