import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import localforage from 'localforage';
import Login from './components/Login';
import Sidebar from './components/Sidebar';
import ChatArea from './components/ChatArea';
import UserProfileModal from './components/UserProfileModal';
import AdminDashboard from './components/AdminDashboard';
import { 
  importPrivateKey, 
  importPublicKey, 
  encryptMessage, 
  decryptMessage,
  generateAESKey,
  encryptMedia,
  decryptMedia,
  encryptAESKeyWithRSA,
  decryptAESKeyWithRSA
} from './utils/crypto';

const translations = {
  en: {
    heroTitle1: "Secure.",
    heroTitle2: "Private.",
    heroTitle3: "Fast.",
    heroDesc: "Messages are encrypted just for you. Built with End-to-End encryption for unparalleled security and privacy. Enjoy instant global communication.",
    feat1: "End-to-End Encryption",
    feat2: "Privacy First",
    feat3: "Blazing Fast Speed",
    createAcc: "Create Account",
    welcomeBack: "Welcome Back!",
    signupDesc: "Sign up for a secure account.",
    loginDesc: "Login to your account.",
    username: "Username",
    enterUser: "Enter username",
    password: "Password",
    processing: "Processing...",
    signupBtn: "Sign Up",
    loginBtn: "Log In",
    alreadyAcc: "Already have an account?",
    noAcc: "Don't have an account?",
    localKeyNotice: "Private keys are generated and stored locally.",
    
    // Sidebar
    searchPlaceholder: "Search or start new chat",
    noUsers: "No other users online.",
    viewProfile: "View Profile",
    online: "Online",
    offline: "Offline",
    lastSeen: "Last seen at",
    
    // ChatArea
    publicRoom: "Public Chat Room",
    typing: "typing",
    encryptionNotice: "Messages and media are end-to-end encrypted.",
    typeMessage: "Type a message",
    voiceNoteComingSoon: "Voice Notes feature is coming soon! 🎤",
    loadingMedia: "Loading media...",
    encrypting: "Encrypting...",
    download: "Download",
    
    // Empty State
    appTitle: "WhatsApp Clone (E2EE)",
    selectChat: "Select a chat from the sidebar to start messaging securely."
  },
  id: {
    heroTitle1: "Aman.",
    heroTitle2: "Privat.",
    heroTitle3: "Cepat.",
    heroDesc: "Pesan disandikan hanya untukmu. Dibangun dengan enkripsi End-to-End untuk keamanan dan privasi tak tertandingi. Nikmati komunikasi instan ke seluruh dunia.",
    feat1: "Enkripsi End-to-End",
    feat2: "Utamakan Privasi",
    feat3: "Kecepatan Super Cepat",
    createAcc: "Buat Akun",
    welcomeBack: "Selamat Datang!",
    signupDesc: "Daftar untuk akun yang aman.",
    loginDesc: "Masuk ke akunmu.",
    username: "Nama Pengguna",
    enterUser: "Masukkan nama pengguna",
    password: "Kata Sandi",
    processing: "Memproses...",
    signupBtn: "Daftar",
    loginBtn: "Masuk",
    alreadyAcc: "Sudah punya akun?",
    noAcc: "Belum punya akun?",
    localKeyNotice: "Kunci privat dibuat dan disimpan secara lokal.",
    
    // Sidebar
    searchPlaceholder: "Cari atau mulai chat baru",
    noUsers: "Tidak ada pengguna lain yang online.",
    viewProfile: "Lihat Profil",
    online: "Online",
    offline: "Offline",
    lastSeen: "Terakhir dilihat jam",
    
    // ChatArea
    publicRoom: "Ruang Obrolan Publik",
    typing: "mengetik",
    encryptionNotice: "Pesan dan media dienkripsi secara end-to-end.",
    typeMessage: "Ketik pesan",
    voiceNoteComingSoon: "Fitur Pesan Suara akan segera hadir! 🎤",
    loadingMedia: "Memuat media...",
    encrypting: "Mengenkripsi...",
    download: "Unduh",
    
    // Empty State
    appTitle: "Klon WhatsApp (E2EE)",
    selectChat: "Pilih obrolan dari bilah samping untuk memulai pesan dengan aman."
  }
};

const SOCKET_SERVER_URL = import.meta.env.VITE_BACKEND_URL || (import.meta.env.DEV ? 'http://localhost:3001' : '');

function App() {
  const [socket, setSocket] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [token, setToken] = useState(null);
  
  // Theme and Language state
  const [theme, setTheme] = useState(() => localStorage.getItem('wa_theme') || 'dark');
  const [language, setLanguage] = useState(() => localStorage.getItem('wa_language') || 'en');
  
const GLOBAL_ROOM = {
  username: 'global',
  displayName: 'Global Server',
  isGroup: true,
  status: 'online',
  avatar: '/logo.png'
};

  const [users, setUsers] = useState([GLOBAL_ROOM]);
  const [selectedUser, setSelectedUser] = useState(null);
  const selectedUserRef = useRef(null);
  const [chats, setChats] = useState({});
  const [chatsLoaded, setChatsLoaded] = useState(false);
  const [typers, setTypers] = useState([]);
  const [unreadCounts, setUnreadCounts] = useState({});
  const [myAvatar, setMyAvatar] = useState(null);
  
  // Profile Viewer State
  const [profileModalUser, setProfileModalUser] = useState(null);
  
  const [showAdminDashboard, setShowAdminDashboard] = useState(false);

  // Mobile state: detect mobile and control panel switching
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 900);
  const [mobileShowChat, setMobileShowChat] = useState(false);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 900);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const privateKeyRef = useRef(null);
  const [keyError, setKeyError] = useState(false);

  useEffect(() => {
    selectedUserRef.current = selectedUser;
    if (selectedUser && selectedUser.username) {
      setUnreadCounts(prev => {
        if (!prev[selectedUser.username]) return prev;
        return { ...prev, [selectedUser.username]: 0 };
      });
    }
  }, [selectedUser]);

  useEffect(() => {
    const savedUser = localStorage.getItem('wa_username');
    const savedToken = localStorage.getItem('wa_token');
    if (savedUser && savedToken) {
      setCurrentUser(savedUser);
      setToken(savedToken);
    }
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('wa_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  const toggleLanguage = () => {
    const newLang = language === 'en' ? 'id' : 'en';
    setLanguage(newLang);
    localStorage.setItem('wa_language', newLang);
  };

  const t = (key) => {
    return translations[language][key] || key;
  };

  const processMediaObj = (fileBuffer, fileName, explicitMime) => {
    let resolvedMime = explicitMime;
    if (!resolvedMime || !resolvedMime.includes('/')) {
      if (fileName) {
        const ext = fileName.toLowerCase().split('.').pop();
        if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) resolvedMime = `image/${ext === 'jpg' ? 'jpeg' : ext}`;
        else if (['mp4', 'webm', 'ogg', 'mov', 'mkv', 'avi'].includes(ext)) resolvedMime = `video/${ext === 'mov' ? 'mp4' : ext}`;
        else if (['mp3', 'wav', 'm4a', 'aac'].includes(ext)) resolvedMime = `audio/${ext === 'mp3' ? 'mpeg' : ext}`;
        else resolvedMime = 'image/jpeg';
      } else {
        resolvedMime = 'image/jpeg';
      }
    }

    if (!fileBuffer) {
      return { mediaUrl: null, mimeType: resolvedMime };
    }

    if (typeof fileBuffer === 'string') {
      if (fileBuffer.startsWith('data:') || fileBuffer.startsWith('http:') || fileBuffer.startsWith('https:') || fileBuffer.startsWith('blob:')) {
        return { mediaUrl: fileBuffer, mimeType: resolvedMime };
      }
      return { mediaUrl: `data:${resolvedMime};base64,${fileBuffer}`, mimeType: resolvedMime };
    }

    if (typeof fileBuffer === 'object' && fileBuffer !== null) {
      if (fileBuffer.type === 'Buffer' && Array.isArray(fileBuffer.data)) {
        const uint8 = new Uint8Array(fileBuffer.data);
        const blob = new Blob([uint8], { type: resolvedMime });
        return { mediaUrl: URL.createObjectURL(blob), mimeType: resolvedMime, blob };
      }
      if (fileBuffer instanceof ArrayBuffer || fileBuffer instanceof Uint8Array) {
        const blob = new Blob([fileBuffer], { type: resolvedMime });
        return { mediaUrl: URL.createObjectURL(blob), mimeType: resolvedMime, blob };
      }
    }

    return { mediaUrl: null, mimeType: resolvedMime };
  };

  useEffect(() => {
    if (currentUser) {
      setChatsLoaded(false);
      localforage.getItem(`chats_${currentUser}`).then((savedChats) => {
        if (savedChats) {
          const hydratedChats = {};
          for (const user in savedChats) {
             hydratedChats[user] = savedChats[user].map(msg => {
                if (msg.type === 'media') {
                   if (msg.mediaUrl && (msg.mediaUrl.startsWith('data:') || msg.mediaUrl.startsWith('http:') || msg.mediaUrl.startsWith('https:'))) {
                     return msg;
                   }
                   if (msg.blob) {
                     return { ...msg, mediaUrl: URL.createObjectURL(msg.blob) };
                   }
                   const { mediaUrl, mimeType: resMime } = processMediaObj(msg.fileBuffer, msg.fileName, msg.mimeType);
                   return { ...msg, mediaUrl: mediaUrl || msg.mediaUrl, mimeType: resMime };
                }
                return msg;
             });
          }
          setChats(hydratedChats);
        }
        setChatsLoaded(true);
      }).catch(() => setChatsLoaded(true));
    }
  }, [currentUser]);


  useEffect(() => {
    if (currentUser && chatsLoaded) {
      localforage.setItem(`chats_${currentUser}`, chats);
    }
  }, [chats, currentUser, chatsLoaded]);

  useEffect(() => {
    if (!currentUser) return;
    
    let isCancelled = false;

    const decryptPrivateMessageObj = async (pm, userCurrent) => {
      let finalMsgObj = {
        id: pm.messageId || pm.id,
        sender: pm.fromUser || pm.sender,
        timestamp: pm.timestamp,
        status: pm.status || 'sent'
      };

      try {
        if (!privateKeyRef.current) {
          const privKeyStr = localStorage.getItem(`privateKey_${userCurrent}`);
          if (privKeyStr) privateKeyRef.current = await importPrivateKey(privKeyStr);
        }
        if (!privateKeyRef.current) throw new Error("No private key available");

        let parsedPayload = null;
        const rawEnc = pm.encryptedMessage || pm.encryptedmessage;
        try { parsedPayload = JSON.parse(rawEnc); } catch (e) {}

        if (parsedPayload && parsedPayload.type === 'media') {
          const encAesKey = (pm.fromUser === userCurrent || pm.sender === userCurrent)
            ? (parsedPayload.encryptedAesKeyS || parsedPayload.encryptedAesKey)
            : (parsedPayload.encryptedAesKeyR || parsedPayload.encryptedAesKey);

          if (!encAesKey) throw new Error("No AES key for user");

          const aesKey = await decryptAESKeyWithRSA(privateKeyRef.current, encAesKey);
          const decryptedBuffer = await decryptMedia(aesKey, parsedPayload.encryptedContent);
          const blob = new Blob([decryptedBuffer], { type: parsedPayload.mimeType });

          return {
            ...finalMsgObj,
            type: 'media',
            fileName: parsedPayload.fileName,
            mimeType: parsedPayload.mimeType,
            blob: blob,
            mediaUrl: URL.createObjectURL(blob),
            replyTo: parsedPayload.replyTo
          };
        } else {
          let ciphertextToDecrypt = null;
          if (parsedPayload && (parsedPayload.r || parsedPayload.s)) {
            ciphertextToDecrypt = (pm.fromUser === userCurrent || pm.sender === userCurrent)
              ? (parsedPayload.s || rawEnc)
              : (parsedPayload.r || rawEnc);
          } else {
            ciphertextToDecrypt = rawEnc;
          }

          if (!ciphertextToDecrypt) throw new Error("Empty ciphertext");

          const decryptedText = await decryptMessage(privateKeyRef.current, ciphertextToDecrypt);
          let parsedTextObj = null;
          try { parsedTextObj = JSON.parse(decryptedText); } catch(e) {}

          if (parsedTextObj && parsedTextObj.text !== undefined) {
            return { ...finalMsgObj, type: 'text', text: parsedTextObj.text, replyTo: parsedTextObj.replyTo };
          } else {
            return { ...finalMsgObj, type: 'text', text: decryptedText };
          }
        }
      } catch (decErr) {
        console.warn("[DECRYPT WARN]", pm.messageId || pm.id, decErr.message);
        if (pm.fromUser === userCurrent || pm.sender === userCurrent) {
          return { ...finalMsgObj, type: 'text', text: '[Sent Message]' };
        }
        return { ...finalMsgObj, type: 'text', text: '[Encrypted Message]' };
      }
    };

    const refreshUserList = async () => {
      try {
        const res = await fetch('/api/users');
        if (res.ok) {
          const userList = await res.json();
          const me = userList.find(u => u.username === currentUser);
          if (me && me.avatar) setMyAvatar(me.avatar);
          setUsers([GLOBAL_ROOM, ...userList.filter(u => u.username !== currentUser)]);
          if (selectedUserRef.current && selectedUserRef.current.username !== 'global') {
            const fresh = userList.find(u => u.username === selectedUserRef.current.username);
            if (fresh && (fresh.publicKey !== selectedUserRef.current.publicKey || fresh.avatar !== selectedUserRef.current.avatar)) {
              setSelectedUser(fresh);
              selectedUserRef.current = fresh;
            }
          }
        }
      } catch (err) {
        console.error("Failed to fetch user list via REST:", err);
      }
    };

    // Immediately fetch user list on mount / current user change
    refreshUserList();

    const initApp = async () => {
      try {
        let privKeyStr = localStorage.getItem(`privateKey_${currentUser}`);
        let pubKeyStr = localStorage.getItem(`publicKey_${currentUser}`);

        let validKeyLoaded = false;
        if (privKeyStr && pubKeyStr && privKeyStr !== 'undefined' && pubKeyStr !== 'null') {
          try {
            const imported = await importPrivateKey(privKeyStr);
            if (imported) {
              privateKeyRef.current = imported;
              validKeyLoaded = true;
            }
          } catch (err) {
            console.warn("Corrupted private key in localStorage, regenerating fresh keys...", err);
          }
        }

        if (!validKeyLoaded) {
          try {
            const keyPair = await generateKeyPair();
            pubKeyStr = await exportPublicKey(keyPair.publicKey);
            privKeyStr = await exportPrivateKey(keyPair.privateKey);
            localStorage.setItem(`publicKey_${currentUser}`, pubKeyStr);
            localStorage.setItem(`privateKey_${currentUser}`, privKeyStr);
            privateKeyRef.current = keyPair.privateKey;
            validKeyLoaded = true;
          } catch (genErr) {
            console.error("Key generation failed:", genErr);
          }
        }

        if (privateKeyRef.current) {
          setKeyError(false);
        } else {
          setKeyError(true);
        }

        if (pubKeyStr && token) {
          fetch('/api/user/profile', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ publicKey: pubKeyStr })
          }).catch(() => {});
        }
      } catch (e) {
        console.error("Error in initApp:", e);
        if (privateKeyRef.current) setKeyError(false);
        else setKeyError(true);
      }

      if (isCancelled) return;

      let lastSyncTime = 0;
      const syncAllMessages = async () => {
        if (!currentUser || !token) return;
        const now = Date.now();
        if (now - lastSyncTime < 2000) return;
        lastSyncTime = now;

        try {
          // 1. Fetch server unread counts
          const unreadRes = await fetch('/api/messages/unread-counts', {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (unreadRes.ok) {
            const counts = (await unreadRes.json()) || {};
            if (selectedUserRef.current && selectedUserRef.current.username) {
              counts[selectedUserRef.current.username] = 0;
            }
            setUnreadCounts(counts);
          }

          // 2. Fetch private message sync
          const pSyncRes = await fetch('/api/messages/private/sync', {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (pSyncRes.ok) {
            const privateRows = await pSyncRes.json();
            if (privateRows && privateRows.length > 0) {
              const decryptedPrivateMsgs = {};
              for (const pm of privateRows) {
                const peer = pm.fromUser === currentUser ? pm.toUser : pm.fromUser;
                if (!decryptedPrivateMsgs[peer]) decryptedPrivateMsgs[peer] = [];

                const decryptedObj = await decryptPrivateMessageObj(pm, currentUser);
                decryptedPrivateMsgs[peer].push(decryptedObj);
              }

              setChats(prev => {
                const updated = { ...prev };
                for (const peer in decryptedPrivateMsgs) {
                  const existingPeerChats = updated[peer] || [];
                  const map = new Map();
                  existingPeerChats.forEach(m => map.set(m.id, m));
                  decryptedPrivateMsgs[peer].forEach(m => {
                    const existing = map.get(m.id);
                    if (existing) {
                      map.set(m.id, {
                        ...m,
                        ...existing,
                        text: (m.text && m.text !== '[Sent Message]' && m.text !== '[Encrypted Message]') ? m.text : (existing.text || m.text),
                        blob: existing.blob || m.blob,
                        mediaUrl: existing.mediaUrl || m.mediaUrl,
                        status: m.status || existing.status
                      });
                    } else {
                      map.set(m.id, m);
                    }
                  });
                  const sorted = Array.from(map.values()).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
                  updated[peer] = sorted;
                }
                return updated;
              });
            }
          }


          // 3. Fetch global message sync
          const gSyncRes = await fetch('/api/messages/global/sync', {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (gSyncRes.ok) {
            const globalRows = await gSyncRes.json();
            if (globalRows && globalRows.length > 0) {
              setChats(prev => {
                const globalChat = prev['global'] || [];
                const map = new Map();
                globalChat.forEach(m => map.set(m.id, m));

                globalRows.forEach(data => {
                  const { from, message, type, mimeType, fileName, fileBuffer, timestamp, messageId, replyTo, reactions } = data;
                  const existing = map.get(messageId);
                  let finalMsgObj = {
                    id: messageId,
                    sender: from,
                    timestamp: timestamp,
                    type: type,
                    replyTo: replyTo,
                    reactions: reactions || {}
                  };

                  if (type === 'text') {
                    finalMsgObj.text = message;
                  } else if (type === 'media' && fileBuffer) {
                    const { mediaUrl, mimeType: resMime, blob } = processMediaObj(fileBuffer, fileName, mimeType);
                    finalMsgObj.fileName = fileName;
                    finalMsgObj.mimeType = resMime;
                    finalMsgObj.mediaUrl = mediaUrl;
                    if (blob) finalMsgObj.blob = blob;
                  }

                  if (existing) {
                    map.set(messageId, { ...existing, ...finalMsgObj });
                  } else {
                    map.set(messageId, finalMsgObj);
                  }
                });

                const sorted = Array.from(map.values()).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
                return { ...prev, 'global': sorted };
              });
            }
          }
        } catch (err) {
          console.error("[SYNC ERROR]", err);
        }
      };

      // Perform immediate REST sync
      syncAllMessages();

      // Key is now ready (or failed). Now connect socket.
      const newSocket = io(SOCKET_SERVER_URL, {
        auth: { token },
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 20000
      });

      if (isCancelled) {
        newSocket.close();
        return;
      }
      
      const updateSelectedUserIfChanged = (userList) => {
        if (selectedUserRef.current && selectedUserRef.current.username !== 'global') {
          const fresh = userList.find(u => u.username === selectedUserRef.current.username);
          if (fresh && (fresh.publicKey !== selectedUserRef.current.publicKey || fresh.avatar !== selectedUserRef.current.avatar)) {
            setSelectedUser(fresh);
            selectedUserRef.current = fresh;
          }
        }
      };

      // Fetch user list via REST API periodically so user list is always updated
      const refreshUserList = async () => {
        try {
          const res = await fetch('/api/users');
          if (res.ok) {
            const userList = await res.json();
            const me = userList.find(u => u.username === currentUser);
            if (me && me.avatar) setMyAvatar(me.avatar);
            setUsers([GLOBAL_ROOM, ...userList.filter(u => u.username !== currentUser)]);
            updateSelectedUserIfChanged(userList);
          }
        } catch (err) {
          console.error("Failed to fetch user list via REST:", err);
        }
      };

      refreshUserList();
      const userListInterval = setInterval(refreshUserList, 4000);
      const messageSyncInterval = setInterval(syncAllMessages, 2500);

      newSocket.on('connect', () => {
        console.log("Socket connected with ID:", newSocket.id);
        newSocket.emit('join', currentUser);
        syncAllMessages();
      });

      if (newSocket.connected) {
        newSocket.emit('join', currentUser);
        syncAllMessages();
      }

      newSocket.on('reconnect', (attemptNumber) => {
        console.log(`Socket reconnected after ${attemptNumber} attempts`);
        newSocket.emit('join', currentUser);
        syncAllMessages();
      });


      newSocket.on('force_disconnect', (data) => {
        alert(data.message || 'You have been disconnected.');
        localStorage.removeItem('wa_username');
        localStorage.removeItem('wa_token');
        window.location.reload();
      });

      newSocket.on('users_list', (userList) => {
        const me = userList.find(u => u.username === currentUser);
        if (me && me.avatar) setMyAvatar(me.avatar);
        
        setUsers([GLOBAL_ROOM, ...userList.filter(u => u.username !== currentUser)]);
        updateSelectedUserIfChanged(userList);
      });

      newSocket.on('private_message', async (data) => {
        const t4 = Date.now();
        const { from, encryptedMessage, timestamp, messageId, t0, t1, t3 } = data;
        
        const finalMsgObj = await decryptPrivateMessageObj({
          id: messageId || (Date.now().toString() + Math.random()),
          messageId: messageId,
          fromUser: from,
          sender: from,
          encryptedMessage: encryptedMessage,
          timestamp: timestamp
        }, currentUser);
        
        setChats(prev => {
          const userChat = prev[from] || [];
          if (userChat.find(m => m.id === finalMsgObj.id)) return prev;
          return { ...prev, [from]: [...userChat, finalMsgObj] };
        });


        if (t0 && t1 && t3) {
          setTimeout(() => {
            const t5 = Date.now();
            console.log(`[TIMING RECIPIENT] Private Msg ${messageId} | send_to_backend(T1-T0): ${t1-t0}ms | broadcast_delay(T3-T1): ${t3-t1}ms | network_delivery(T4-T3): ${t4-t3}ms | client_render(T5-T4): ${t5-t4}ms | TOTAL(T5-T0): ${t5-t0}ms`);
          }, 0);
        }

        let statusToEmit = 'delivered';
        if (selectedUserRef.current && selectedUserRef.current.username === from) {
           statusToEmit = 'read';
        }

        if (messageId) {
          newSocket.emit('message_received_ack', {
            messageId: messageId,
            from: from
          });

          newSocket.emit('message_status_update', {
            to: from,
            from: currentUser,
            messageId: messageId,
            status: statusToEmit
          });
        }

        // Update Unread Count if not currently in this chat
        if (!selectedUserRef.current || selectedUserRef.current.username !== from) {
          setUnreadCounts(prev => ({
            ...prev,
            [from]: (prev[from] || 0) + 1
          }));
        } else {
          setUnreadCounts(prev => ({
            ...prev,
            [from]: 0
          }));
        }
      });

      newSocket.on('message_status_update', ({ from, messageId, status }) => {
        setChats(prev => {
           const userChat = [...(prev[from] || [])];
           const updatedChat = userChat.map(msg => {
              if (msg.id === messageId) {
                 if (msg.status === 'read') return msg; // never downgrade
                 return { ...msg, status: status };
              }
              return msg;
           });
           return { ...prev, [from]: updatedChat };
        });
      });

      newSocket.on('user_typing', ({ username, isTyping }) => {
        setTypers((prevTypers) => {
          if (isTyping) {
            if (!prevTypers.includes(username)) return [...prevTypers, username];
            return prevTypers;
          } else {
            return prevTypers.filter(u => u !== username);
          }
        });
      });

      newSocket.on('public_message', (data) => {
        const t4 = Date.now();
        const { from, message, type, mimeType, fileName, fileBuffer, timestamp, messageId, replyTo, t0, t1, t3 } = data;
        
        let finalMsgObj = {
          id: messageId || (Date.now().toString() + Math.random()),
          sender: from,
          timestamp: timestamp,
          type: type,
          replyTo: replyTo,
          readCount: data.readCount || 0,
          totalUsers: data.totalUsers || 0
        };

        if (type === 'text') {
          finalMsgObj.text = message;
        } else if (type === 'media') {
          const { mediaUrl, mimeType: resMime, blob } = processMediaObj(fileBuffer, fileName, mimeType);
          finalMsgObj.fileName = fileName;
          finalMsgObj.mimeType = resMime;
          finalMsgObj.mediaUrl = mediaUrl;
          if (blob) finalMsgObj.blob = blob;
        }

        setChats(prev => {
          const globalChat = prev['global'] || [];
          if (globalChat.find(m => m.id === finalMsgObj.id)) return prev;
          return { ...prev, 'global': [...globalChat, finalMsgObj] };
        });

        if (t0 && t1 && t3) {
          setTimeout(() => {
            const t5 = Date.now();
            console.log(`[TIMING RECIPIENT] Public Msg ${messageId} | send_to_backend(T1-T0): ${t1-t0}ms | broadcast_delay(T3-T1): ${t3-t1}ms | network_delivery(T4-T3): ${t4-t3}ms | client_render(T5-T4): ${t5-t4}ms | TOTAL(T5-T0): ${t5-t0}ms`);
          }, 0);
        }

        // Mark this message as read if we're currently in global chat
        if (selectedUserRef.current && selectedUserRef.current.username === 'global') {
          newSocket.emit('global_message_read', { messageId: finalMsgObj.id, username: currentUser });
        }

        if (!selectedUserRef.current || selectedUserRef.current.username !== 'global') {
          setUnreadCounts(prev => ({
            ...prev,
            'global': (prev['global'] || 0) + 1
          }));
        } else {
          setUnreadCounts(prev => ({
            ...prev,
            'global': 0
          }));
        }
      });

      newSocket.on('global_history', (history) => {
        setChats(prev => {
          const globalChat = prev['global'] || [];
          
          // Deduplicate messages by id
          const existingMessages = new Map();
          globalChat.forEach(msg => existingMessages.set(msg.id, msg));

          history.forEach(data => {
            const { from, message, type, mimeType, fileName, fileBuffer, timestamp, messageId, replyTo } = data;
            
            if (!existingMessages.has(messageId)) {
              let finalMsgObj = {
                id: messageId || (Date.now().toString() + Math.random()),
                sender: from,
                timestamp: timestamp,
                type: type,
                replyTo: replyTo
              };

              if (type === 'text') {
                finalMsgObj.text = message;
              } else if (type === 'media') {
                const { mediaUrl, mimeType: resMime, blob } = processMediaObj(fileBuffer, fileName, mimeType);
                finalMsgObj.fileName = fileName;
                finalMsgObj.mimeType = resMime;
                finalMsgObj.mediaUrl = mediaUrl;
                if (blob) finalMsgObj.blob = blob;
              }
              existingMessages.set(finalMsgObj.id, finalMsgObj);
            }
          });
          
          // Sort by timestamp
          const mergedChats = Array.from(existingMessages.values()).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
          return { ...prev, 'global': mergedChats };
        });
      });

      newSocket.on('clear_global_history', () => {
        setChats(prev => ({ ...prev, 'global': [] }));
      });

      newSocket.on('message_deleted', ({ to: chatRoom, messageId }) => {
        setChats(prev => {
          const roomChats = prev[chatRoom] || [];
          return { ...prev, [chatRoom]: roomChats.filter(m => m.id !== messageId) };
        });
      });

      newSocket.on('global_message_read_update', ({ messageId, readCount, totalUsers }) => {
        setChats(prev => {
          const globalChat = prev['global'] || [];
          const updatedChat = globalChat.map(msg => {
            if (msg.id === messageId) {
              return { ...msg, readCount, totalUsers };
            }
            return msg;
          });
          return { ...prev, 'global': updatedChat };
        });
      });

      newSocket.on('message_reaction', ({ to: room, messageId, emoji, from, reactions: serverReactions }) => {
        setChats(prev => {
          const roomChats = prev[room] || [];
          const updatedChat = roomChats.map(msg => {
            if (msg.id === messageId) {
              let newReactions = { ...(msg.reactions || {}) };
              if (serverReactions) {
                newReactions = serverReactions;
              } else {
                 if (newReactions[from] === emoji) delete newReactions[from];
                 else newReactions[from] = emoji;
              }
              return { ...msg, reactions: newReactions };
            }
            return msg;
          });
          return { ...prev, [room]: updatedChat };
        });
      });

      setSocket(newSocket);
    };

    initApp();

    return () => {
      isCancelled = true;
      setSocket(prevSocket => {
        if (prevSocket) {
          prevSocket.close();
        }
        return null;
      });
    };
  }, [currentUser]);

  const handleLogin = (username, jwtToken) => {
    setCurrentUser(username);
    setToken(jwtToken);
    localStorage.setItem('wa_username', username);
    localStorage.setItem('wa_token', jwtToken);
  };

  const handleSelectUser = (user) => {
    setShowAdminDashboard(false);
    setSelectedUser(user);
    selectedUserRef.current = user;
    setUnreadCounts(prev => ({ ...prev, [user.username]: 0 }));
    if (isMobile) setMobileShowChat(true);

    // Call REST endpoint to mark messages as read on backend DB
    if (token) {
      fetch('/api/messages/read', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ room: user.username })
      }).catch(err => console.error("Error marking read:", err));
    }

    // For global chat: emit read for all messages
    if (user.username === 'global' && socket) {
      setChats(prev => {
        const globalChat = prev['global'] || [];
        globalChat.forEach(msg => {
          socket.emit('global_message_read', { messageId: msg.id, username: currentUser });
        });
        return prev;
      });
    }

    // Send read receipts for unread private messages
    setChats(prev => {
      const userChat = [...(prev[user.username] || [])];
      let updated = false;
      const newChat = userChat.map(msg => {
        if (msg.sender === user.username && msg.status !== 'read') {
          if (socket) {
             socket.emit('message_status_update', {
               to: user.username,
               from: currentUser,
               messageId: msg.id,
               status: 'read'
             });
          }
          updated = true;
          return { ...msg, status: 'read' };
        }
        return msg;
      });
      if (updated) {
        return { ...prev, [user.username]: newChat };
      }
      return prev;
    });
  };

  const handleDeleteMessage = (messageId, originalSender, chatRoom) => {
    if (currentUser !== 'anonim') return;
    
    // Optimistically delete local
    setChats(prev => {
       const roomChats = prev[chatRoom] || [];
       return { ...prev, [chatRoom]: roomChats.filter(m => m.id !== messageId) };
    });

    if (socket) {
       socket.emit('delete_message', {
          to: chatRoom,
          messageId,
          from: currentUser,
          originalSender
       });
    }
  };

  const handleSendMessage = async (payload) => {
    if (!socket || !selectedUser) return;
    const t0 = Date.now();
    
    try {
      if (selectedUser.username === 'global') {
        const globalMsgId = Date.now().toString() + Math.random();
        const publicPayload = {
          from: currentUser,
          message: payload.text,
          type: payload.type,
          mimeType: payload.mimeType,
          fileName: payload.fileName,
          replyTo: payload.replyTo,
          messageId: globalMsgId,
          t0
        };
        if (payload.type === 'media') {
           publicPayload.fileBuffer = payload.fileBuffer;
        }

        // Optimistic local insert - show message immediately on sender's screen
        const localGlobalMsg = {
          id: globalMsgId,
          sender: currentUser,
          timestamp: new Date().toISOString(),
          type: payload.type,
          replyTo: payload.replyTo,
          readCount: 0,
          totalUsers: 0
        };
        if (payload.type === 'text') {
          localGlobalMsg.text = payload.text;
        } else if (payload.type === 'media') {
          const { mediaUrl, mimeType: resMime, blob } = processMediaObj(payload.fileBuffer, payload.fileName, payload.mimeType);
          localGlobalMsg.fileName = payload.fileName;
          localGlobalMsg.mimeType = resMime;
          localGlobalMsg.mediaUrl = mediaUrl;
          if (blob) localGlobalMsg.blob = blob;
        }
        setChats(prev => {
          const globalChat = prev['global'] || [];
          if (globalChat.find(m => m.id === globalMsgId)) return prev;
          return { ...prev, 'global': [...globalChat, localGlobalMsg] };
        });

        socket.emit('public_message', publicPayload);

        if (token) {
          fetch('/api/messages/global/send', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(publicPayload)
          }).catch(err => console.error("REST global send error:", err));
        }
        return;
      }

      let targetPubKeyStr = selectedUser.publicKey;

      if (!targetPubKeyStr || targetPubKeyStr === 'ADMIN_PUBLIC_KEY') {
        const found = users.find(u => u.username === selectedUser.username);
        if (found && found.publicKey && found.publicKey !== 'ADMIN_PUBLIC_KEY') {
          targetPubKeyStr = found.publicKey;
        } else {
          try {
            const res = await fetch('/api/users');
            if (res.ok) {
              const freshUsers = await res.json();
              const freshRecipient = freshUsers.find(u => u.username === selectedUser.username);
              if (freshRecipient && freshRecipient.publicKey && freshRecipient.publicKey !== 'ADMIN_PUBLIC_KEY') {
                targetPubKeyStr = freshRecipient.publicKey;
              }
            }
          } catch (e) {}
        }
      }

      if (!targetPubKeyStr || targetPubKeyStr === 'ADMIN_PUBLIC_KEY') {
        alert(`Gagal mengirim pesan: Kunci publik ${selectedUser.username} belum terdaftar. Minta pengguna tersebut untuk login kembali.`);
        return;
      }

      let recipientPubKey;
      try {
        recipientPubKey = await importPublicKey(targetPubKeyStr);
      } catch (e) {
        alert(`Gagal mengirim pesan: Kunci publik ${selectedUser.username} tidak valid.`);
        return;
      }

      const senderPubKeyStr = localStorage.getItem(`publicKey_${currentUser}`);
      let senderPubKey = null;
      if (senderPubKeyStr) {
        try { senderPubKey = await importPublicKey(senderPubKeyStr); } catch (e) {}
      }

      const messageId = Date.now().toString() + Math.random();
      
      // Dual-Encryption: Encrypt for both recipient and sender so both can decrypt from DB
      let encryptedPayload;

      if (payload.type === 'text') {
        const textPayloadObj = { text: payload.text, replyTo: payload.replyTo };
        const textPayloadStr = JSON.stringify(textPayloadObj);

        const encRecipient = await encryptMessage(recipientPubKey, textPayloadStr);
        let encSender = null;
        if (senderPubKey) {
          try { encSender = await encryptMessage(senderPubKey, textPayloadStr); } catch (e) {}
        }

        encryptedPayload = JSON.stringify({ r: encRecipient, s: encSender });
      } else if (payload.type === 'media') {
        const aesKey = await generateAESKey();
        const encryptedMediaBase64 = await encryptMedia(aesKey, payload.fileBuffer);

        const encAesRecipient = await encryptAESKeyWithRSA(recipientPubKey, aesKey);
        let encAesSender = null;
        if (senderPubKey) {
          try { encAesSender = await encryptAESKeyWithRSA(senderPubKey, aesKey); } catch (e) {}
        }

        encryptedPayload = JSON.stringify({
          type: 'media',
          fileName: payload.fileName,
          mimeType: payload.mimeType,
          encryptedContent: encryptedMediaBase64,
          encryptedAesKeyR: encAesRecipient,
          encryptedAesKeyS: encAesSender,
          replyTo: payload.replyTo
        });
      }


      socket.emit('private_message', {
        messageId: messageId,
        to: selectedUser.username,
        from: currentUser,
        encryptedMessage: encryptedPayload,
        t0
      });

      if (token) {
        fetch('/api/messages/private/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            to: selectedUser.username,
            encryptedMessage: encryptedPayload,
            messageId: messageId
          })
        }).catch(err => console.error("REST private send error:", err));
      }

      const localMsgObj = {
        id: messageId,
        sender: currentUser,
        timestamp: new Date(),
        type: payload.type,
        status: 'sent',
        replyTo: payload.replyTo
      };

      if (payload.type === 'text') {
        localMsgObj.text = payload.text;
      } else if (payload.type === 'media') {
        const blob = new Blob([payload.fileBuffer], { type: payload.mimeType });
        localMsgObj.fileName = payload.fileName;
        localMsgObj.mimeType = payload.mimeType;
        localMsgObj.blob = blob;
        localMsgObj.mediaUrl = URL.createObjectURL(blob);
      }

      setChats(prev => {
        const userChat = prev[selectedUser.username] || [];
        return { ...prev, [selectedUser.username]: [...userChat, localMsgObj] };
      });
    } catch (e) {
      console.error("Encryption failed", e);
      alert("Failed to encrypt message. The recipient's public key might be invalid.");
    }
  };

  const handleTyping = (isTyping) => {
    if (socket && selectedUser) {
      socket.emit('typing', { to: selectedUser.username, from: currentUser, isTyping });
    }
  };

  if (!currentUser || !token) {
    return (
      <div className="login-container">
        <Login 
          onLoginSuccess={handleLogin} 
          onLogin={handleLogin}
          theme={theme} 
          toggleTheme={toggleTheme} 
          language={language}
          toggleLanguage={toggleLanguage}
          t={t}
        />
      </div>
    );
  }

  const currentMessages = selectedUser ? (chats[selectedUser.username] || []) : [];
  const isSelectedUserTyping = selectedUser ? typers.some(t => t.username === selectedUser.username) : false;

  // Mobile back handler
  const handleMobileBack = () => {
    setMobileShowChat(false);
    setSelectedUser(null);
    setShowAdminDashboard(false);
  };

  const handleAvatarUpdate = (newAvatar) => {
    setMyAvatar(newAvatar);
    setUsers(prev => prev.map(u => u.username === currentUser ? { ...u, avatar: newAvatar } : u));
  };

  return (
    <div className="app-container">

      {/* SIDEBAR: always shown on desktop; on mobile only when not in chat */}
      {(!isMobile || !mobileShowChat) && (
        <Sidebar 
          users={users} 
          currentUser={currentUser}
          myAvatar={myAvatar}
          onAvatarUpdate={handleAvatarUpdate}
          token={token}
          onSelectUser={handleSelectUser}
          selectedUser={selectedUser}
          unreadCounts={unreadCounts}
          onProfileClick={(user) => setProfileModalUser(user)}
          theme={theme}
          toggleTheme={toggleTheme}
          language={language}
          toggleLanguage={toggleLanguage}
          t={t}
          onAdminClick={() => { setShowAdminDashboard(true); setSelectedUser(null); if (isMobile) setMobileShowChat(true); }}
          isMobile={isMobile}
        />
      )}

      {/* CHAT/ADMIN PANEL: always shown on desktop; on mobile only when in chat */}
      {(!isMobile || mobileShowChat) && (
        <>
          {showAdminDashboard ? (
            <AdminDashboard token={token} onBack={isMobile ? handleMobileBack : () => setShowAdminDashboard(false)} />
          ) : selectedUser ? (
            <ChatArea 
              messages={currentMessages} 
              currentUser={currentUser} 
              recipient={selectedUser}
              onSendMessage={handleSendMessage}
              onDeleteMessage={handleDeleteMessage}
              onTyping={handleTyping}
              isTyping={isSelectedUserTyping}
              typers={typers}
              onProfileClick={(user) => setProfileModalUser(user)}
              t={t}
              users={users}
              onBack={isMobile ? handleMobileBack : null}
            />
          ) : (
            <div className="chat-area" style={{display: 'flex', justifyContent: 'center', alignItems: 'center', backgroundColor: 'var(--bg-chat)'}}>
              <div style={{textAlign: 'center', color: 'var(--text-secondary)'}}>
                <h2 style={{color: 'var(--text-primary)'}}>{t('appTitle')}</h2>
                <p>{t('selectChat')}</p>
              </div>
            </div>
          )}
        </>
      )}

      {/* Profile Modal */}
      {profileModalUser && (
        <div className="modal-overlay" onClick={() => setProfileModalUser(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setProfileModalUser(null)}>✕</button>
            
            <img 
              src={profileModalUser.avatar || 'https://api.dicebear.com/7.x/identicon/svg?seed=' + profileModalUser.username} 
              alt="Avatar" 
              className="modal-avatar" 
            />
            
            <h2 className="modal-title">{profileModalUser.displayName || profileModalUser.username}</h2>
            <div className="modal-subtitle">
              {profileModalUser.status === 'online' ? '● Online' : '○ Offline'}
            </div>
            
            {!profileModalUser.isGroup && (
              <div style={{
                display: 'flex', 
                alignItems: 'center', 
                gap: '6px', 
                color: '#10b981', 
                fontSize: '13px', 
                marginTop: '10px',
                padding: '8px 16px',
                background: 'rgba(16, 185, 129, 0.1)',
                borderRadius: '20px',
                border: '1px solid rgba(16, 185, 129, 0.2)'
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                </svg>
                <span>End-to-End Encrypted</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
