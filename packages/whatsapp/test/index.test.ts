import { describe, expect, it } from 'vitest';

import { chooseIncomingChatRemoteJid, extractGroupInviteCode } from '../src/index.js';

describe('extractGroupInviteCode', () => {
  it('keeps a raw invite code', () => {
    expect(extractGroupInviteCode('ABC123')).toBe('ABC123');
  });

  it('extracts the code from a WhatsApp invite URL', () => {
    expect(extractGroupInviteCode('https://chat.whatsapp.com/ABC123?utm=test')).toBe('ABC123');
  });

  it('returns undefined for empty input', () => {
    expect(extractGroupInviteCode('   ')).toBeUndefined();
  });
});

describe('chooseIncomingChatRemoteJid', () => {
  it('keeps the group JID as the chat when a group message has a participant phone JID', () => {
    expect(
      chooseIncomingChatRemoteJid(
        ['120363424804348891@g.us', '5585988532761@s.whatsapp.net'],
        '120363424804348891@g.us',
      ),
    ).toBe('120363424804348891@g.us');
  });

  it('keeps the group JID when Baileys puts the participant in remoteJid and the group in aliases', () => {
    expect(
      chooseIncomingChatRemoteJid(
        ['5585988532761@s.whatsapp.net', '120363424804348891@g.us'],
        '5585988532761@s.whatsapp.net',
      ),
    ).toBe('120363424804348891@g.us');
  });

  it('uses the phone JID for a direct message when available', () => {
    expect(
      chooseIncomingChatRemoteJid(
        ['123456789@lid', '5585988532761@s.whatsapp.net'],
        '123456789@lid',
      ),
    ).toBe('5585988532761@s.whatsapp.net');
  });
});
