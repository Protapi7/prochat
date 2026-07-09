// Web Crypto API Helpers for E2EE

export async function generateKeyPair() {
  const keyPair = await window.crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["encrypt", "decrypt"]
  );
  return keyPair;
}

export async function exportPublicKey(key) {
  const exported = await window.crypto.subtle.exportKey("spki", key);
  const exportedAsString = String.fromCharCode.apply(null, new Uint8Array(exported));
  return btoa(exportedAsString);
}

export async function importPublicKey(pem) {
  const binaryDerString = atob(pem);
  const binaryDer = new Uint8Array(binaryDerString.length);
  for (let i = 0; i < binaryDerString.length; i++) {
    binaryDer[i] = binaryDerString.charCodeAt(i);
  }

  return await window.crypto.subtle.importKey(
    "spki",
    binaryDer.buffer,
    {
      name: "RSA-OAEP",
      hash: "SHA-256",
    },
    true,
    ["encrypt"]
  );
}

export async function exportPrivateKey(key) {
  const jwk = await window.crypto.subtle.exportKey("jwk", key);
  return JSON.stringify(jwk);
}

export async function importPrivateKey(jwkString) {
  const jwk = JSON.parse(jwkString);
  return await window.crypto.subtle.importKey(
    "jwk",
    jwk,
    {
      name: "RSA-OAEP",
      hash: "SHA-256",
    },
    true,
    ["decrypt"]
  );
}

export async function generateSessionKey() {
  return await window.crypto.subtle.generateKey(
    {
      name: "AES-GCM",
      length: 256,
    },
    true,
    ["encrypt", "decrypt"]
  );
}

export async function encryptMessage(sessionKey, message) {
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encodedMessage = new TextEncoder().encode(message);
  
  const encryptedContent = await window.crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: iv,
    },
    sessionKey,
    encodedMessage
  );

  return {
    iv: Array.from(iv),
    ciphertext: Array.from(new Uint8Array(encryptedContent))
  };
}

export async function encryptSessionKey(recipientPublicKey, sessionKey) {
  const rawSessionKey = await window.crypto.subtle.exportKey("raw", sessionKey);
  const encryptedKey = await window.crypto.subtle.encrypt(
    {
      name: "RSA-OAEP",
    },
    recipientPublicKey,
    rawSessionKey
  );
  return Array.from(new Uint8Array(encryptedKey));
}

export async function decryptSessionKey(privateKey, encryptedSessionKeyArray) {
  const encryptedKeyBuffer = new Uint8Array(encryptedSessionKeyArray).buffer;
  const rawSessionKey = await window.crypto.subtle.decrypt(
    {
      name: "RSA-OAEP",
    },
    privateKey,
    encryptedKeyBuffer
  );

  return await window.crypto.subtle.importKey(
    "raw",
    rawSessionKey,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}

export async function decryptMessage(sessionKey, ivArray, ciphertextArray) {
  const iv = new Uint8Array(ivArray);
  const ciphertext = new Uint8Array(ciphertextArray);

  const decryptedContent = await window.crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: iv,
    },
    sessionKey,
    ciphertext
  );

  return new TextDecoder().decode(decryptedContent);
}
