import { BufferJSON, initAuthCreds, proto, type AuthenticationState, type SignalDataSet, type SignalDataTypeMap } from '@whiskeysockets/baileys';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

import { prisma } from '@ravoxzap/database';

function keyFromSecret(secret: string) {
  return createHash('sha256').update(secret).digest();
}

function encryptJson(value: unknown, secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyFromSecret(secret), iv);
  const plaintext = JSON.stringify(value, BufferJSON.replacer);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

function decryptJson<T>(value: string, secret: string): T {
  const [version, ivBase64, tagBase64, encryptedBase64] = value.split(':');
  if (version !== 'v1' || !ivBase64 || !tagBase64 || !encryptedBase64) {
    throw new Error('Invalid encrypted Baileys auth payload.');
  }

  const decipher = createDecipheriv('aes-256-gcm', keyFromSecret(secret), Buffer.from(ivBase64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagBase64, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedBase64, 'base64')),
    decipher.final(),
  ]).toString('utf8');

  return JSON.parse(decrypted, BufferJSON.reviver) as T;
}

export async function clearPrismaBaileysAuthState(instanceId: string) {
  await prisma.$transaction([
    prisma.baileysAuthKey.deleteMany({ where: { instanceId } }),
    prisma.baileysAuthSession.deleteMany({ where: { instanceId } }),
  ]);
}

export async function usePrismaBaileysAuthState(instanceId: string, encryptionKey: string): Promise<{
  state: AuthenticationState;
  saveCreds: () => Promise<void>;
}> {
  const session = await prisma.baileysAuthSession.findUnique({
    where: { instanceId },
  });
  const creds = session?.creds
    ? decryptJson<AuthenticationState['creds']>(session.creds, encryptionKey)
    : initAuthCreds();

  const state: AuthenticationState = {
    creds,
    keys: {
      get: async <T extends keyof SignalDataTypeMap>(type: T, ids: string[]) => {
        const rows = await prisma.baileysAuthKey.findMany({
          where: {
            instanceId,
            type,
            keyId: { in: ids },
          },
        });
        const byId = new Map(rows.map(row => [row.keyId, row.value]));
        const data: { [id: string]: SignalDataTypeMap[T] } = {};

        for (const id of ids) {
          const encrypted = byId.get(id);
          if (!encrypted) continue;

          let value = decryptJson<SignalDataTypeMap[T]>(encrypted, encryptionKey);
          if (type === 'app-state-sync-key' && value) {
            value = proto.Message.AppStateSyncKeyData.fromObject(value as any) as unknown as SignalDataTypeMap[T];
          }
          data[id] = value;
        }

        return data;
      },
      set: async (data: SignalDataSet) => {
        const operations = [];

        for (const category of Object.keys(data) as Array<keyof SignalDataSet>) {
          const entries = data[category];
          if (!entries) continue;

          for (const keyId of Object.keys(entries)) {
            const value = entries[keyId];
            if (value === null) {
              operations.push(prisma.baileysAuthKey.deleteMany({
                where: { instanceId, type: category, keyId },
              }));
              continue;
            }

            operations.push(prisma.baileysAuthKey.upsert({
              where: {
                instanceId_type_keyId: {
                  instanceId,
                  type: category,
                  keyId,
                },
              },
              create: {
                instanceId,
                type: category,
                keyId,
                value: encryptJson(value, encryptionKey),
              },
              update: {
                value: encryptJson(value, encryptionKey),
              },
            }));
          }
        }

        await prisma.$transaction(operations);
      },
      clear: async () => {
        await clearPrismaBaileysAuthState(instanceId);
      },
    },
  };

  return {
    state,
    saveCreds: async () => {
      await prisma.baileysAuthSession.upsert({
        where: { instanceId },
        create: {
          instanceId,
          creds: encryptJson(state.creds, encryptionKey),
        },
        update: {
          creds: encryptJson(state.creds, encryptionKey),
        },
      });
    },
  };
}
