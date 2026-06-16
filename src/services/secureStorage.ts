import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import aesjs from 'aes-js';

/**
 * LargeSecureStore — storage de sessão para o Supabase em React Native.
 *
 * O Android Keystore (usado pelo expo-secure-store) tem limite prático (~2KB) por
 * valor. Tokens JWT do Supabase costumam ficar perto/acima disso. Estratégia híbrida:
 *
 *  - Valores pequenos (≤ THRESHOLD): vão direto e cifrados no SecureStore.
 *  - Valores grandes: geramos uma chave AES-256 (expo-crypto), guardamos a CHAVE no
 *    SecureStore (pequena, segura) e o VALOR cifrado vai para o AsyncStorage com
 *    prefixo "ls.". Assim nada sensível trafega em texto puro pelo AsyncStorage.
 *
 * Implementa a interface { getItem, setItem, removeItem } esperada pelo client.
 */

const THRESHOLD_BYTES = 2000; // margem segura abaixo do limite do Keystore
const LARGE_PREFIX = 'ls.';

function encrypt(value: string): { keyHex: string; cipherHex: string } {
  const keyBytes = Crypto.getRandomBytes(32); // AES-256
  const valueBytes = aesjs.utils.utf8.toBytes(value);
  const aesCtr = new aesjs.ModeOfOperation.ctr(keyBytes, new aesjs.Counter(1));
  const encryptedBytes = aesCtr.encrypt(valueBytes);
  return {
    keyHex: aesjs.utils.hex.fromBytes(keyBytes),
    cipherHex: aesjs.utils.hex.fromBytes(encryptedBytes),
  };
}

function decrypt(keyHex: string, cipherHex: string): string {
  const keyBytes = aesjs.utils.hex.toBytes(keyHex);
  const cipherBytes = aesjs.utils.hex.toBytes(cipherHex);
  const aesCtr = new aesjs.ModeOfOperation.ctr(keyBytes, new aesjs.Counter(1));
  const decryptedBytes = aesCtr.decrypt(cipherBytes);
  return aesjs.utils.utf8.fromBytes(decryptedBytes);
}

export class LargeSecureStore {
  async getItem(key: string): Promise<string | null> {
    // Valor grande? O ciphertext fica no AsyncStorage e a chave no SecureStore.
    const cipherHex = await AsyncStorage.getItem(LARGE_PREFIX + key);
    if (cipherHex) {
      const keyHex = await SecureStore.getItemAsync(key);
      if (!keyHex) return null; // chave perdida -> trata como ausência
      try {
        return decrypt(keyHex, cipherHex);
      } catch {
        return null;
      }
    }
    // Caso contrário, valor pequeno guardado direto no SecureStore.
    return SecureStore.getItemAsync(key);
  }

  async setItem(key: string, value: string): Promise<void> {
    const byteLength = aesjs.utils.utf8.toBytes(value).length;

    if (byteLength <= THRESHOLD_BYTES) {
      // Limpa qualquer resíduo de um valor grande anterior na mesma chave.
      await AsyncStorage.removeItem(LARGE_PREFIX + key);
      await SecureStore.setItemAsync(key, value);
      return;
    }

    const { keyHex, cipherHex } = encrypt(value);
    await SecureStore.setItemAsync(key, keyHex);
    await AsyncStorage.setItem(LARGE_PREFIX + key, cipherHex);
  }

  async removeItem(key: string): Promise<void> {
    await AsyncStorage.removeItem(LARGE_PREFIX + key);
    await SecureStore.deleteItemAsync(key);
  }
}
