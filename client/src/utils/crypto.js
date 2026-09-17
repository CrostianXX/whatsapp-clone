// Web Crypto API Wrapper for End-to-End Encryption

export const generateKeyPair = async () => {
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
};

export const exportPublicKey = async (key) => {
  const exported = await window.crypto.subtle.exportKey("jwk", key);
  return JSON.stringify(exported);
};

export const exportPrivateKey = async (key) => {
  const exported = await window.crypto.subtle.exportKey("jwk", key);
  return JSON.stringify(exported);
};

export const importPublicKey = async (jwkString) => {
  let jwk = jwkString;
  while (typeof jwk === 'string') {
    jwk = JSON.parse(jwk);
  }
  return await window.crypto.subtle.importKey(
    "jwk",
    jwk,
    {
      name: "RSA-OAEP",
      hash: "SHA-256",
    },
    true,
    ["encrypt"]
  );
};

export const importPrivateKey = async (jwkString) => {
  let jwk = jwkString;
  while (typeof jwk === 'string') {
    jwk = JSON.parse(jwk);
  }
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
};

export const encryptMessage = async (publicKey, message) => {
  const enc = new TextEncoder();
  const encodedMessage = enc.encode(message);
  
  const encryptedBuf = await window.crypto.subtle.encrypt(
    {
      name: "RSA-OAEP"
    },
    publicKey,
    encodedMessage
  );
  
  const encryptedArray = Array.from(new Uint8Array(encryptedBuf));
  return btoa(String.fromCharCode.apply(null, encryptedArray));
};

export const decryptMessage = async (privateKey, base64Message) => {
  try {
    const encryptedArray = Uint8Array.from(atob(base64Message), c => c.charCodeAt(0));
    const decryptedBuf = await window.crypto.subtle.decrypt(
      {
        name: "RSA-OAEP"
      },
      privateKey,
      encryptedArray
    );
    
    const dec = new TextDecoder();
    return dec.decode(decryptedBuf);
  } catch (error) {
    console.error("Decryption failed:", error);
    return "[Encrypted Message - Decryption Failed]";
  }
};

// --- HYBRID ENCRYPTION FOR MEDIA ---

export const generateAESKey = async () => {
  return await window.crypto.subtle.generateKey(
    {
      name: "AES-GCM",
      length: 256,
    },
    true,
    ["encrypt", "decrypt"]
  );
};

export const encryptMedia = async (aesKey, fileBuffer) => {
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encryptedBuf = await window.crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: iv
    },
    aesKey,
    fileBuffer
  );

  // We return the IV + Encrypted Data as Base64
  const combined = new Uint8Array(iv.length + encryptedBuf.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encryptedBuf), iv.length);
  
  // Using blob for very large files to avoid max call stack size on btoa
  // But for simple Base64 stringification:
  let binary = '';
  const bytes = new Uint8Array(combined);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

export const decryptMedia = async (aesKey, base64EncryptedMedia) => {
  const binaryString = atob(base64EncryptedMedia);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
  }

  const iv = bytes.slice(0, 12);
  const data = bytes.slice(12);

  const decryptedBuf = await window.crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: iv
    },
    aesKey,
    data
  );
  return decryptedBuf; // Returns ArrayBuffer
};

export const encryptAESKeyWithRSA = async (rsaPublicKey, aesKey) => {
  const rawKey = await window.crypto.subtle.exportKey("raw", aesKey);
  const encryptedBuf = await window.crypto.subtle.encrypt(
    { name: "RSA-OAEP" },
    rsaPublicKey,
    rawKey
  );
  
  let binary = '';
  const bytes = new Uint8Array(encryptedBuf);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

export const decryptAESKeyWithRSA = async (rsaPrivateKey, base64EncryptedAesKey) => {
  const binaryString = atob(base64EncryptedAesKey);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
  }

  const rawKey = await window.crypto.subtle.decrypt(
    { name: "RSA-OAEP" },
    rsaPrivateKey,
    bytes
  );

  return await window.crypto.subtle.importKey(
    "raw",
    rawKey,
    { name: "AES-GCM" },
    true,
    ["encrypt", "decrypt"]
  );
};
