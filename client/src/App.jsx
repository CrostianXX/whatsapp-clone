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
  
  const [users, setUsers] = useState([]);
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

  useEffect(() => {
    if (currentUser) {
      localforage.getItem(`chats_${currentUser}`).then((savedChats) => {
        if (savedChats) {
          // Re-generate object URLs for Blobs since old ones die on page refresh
          const hydratedChats = {};
          for (const user in savedChats) {
             hydratedChats[user] = savedChats[user].map(msg => {
                if (msg.type === 'media' && msg.blob) {
                   return { ...msg, mediaUrl: URL.createObjectURL(msg.blob) };
                }
                return msg;
             });
          }
          setChats(hydratedChats);
        }
        setChatsLoaded(true);
      });
    }
  }, [currentUser]);

  useEffect(() => {
    if (currentUser && chatsLoaded) {
      localforage.setItem(`chats_${currentUser}`, chats);
    }
  }, [chats, currentUser, chatsLoaded]);

  useEffect(() => {
    if (!currentUser) return;
    
    // IMPORTANT: Load the private key FIRST, then connect the socket.
    // This prevents the race condition where offline messages arrive
    // before privateKeyRef is set, causing silent decryption failures.
    const initApp = async () => {
      try {
        const privKeyStr = localStorage.getItem(`privateKey_${currentUser}`);
        if (privKeyStr) {
          privateKeyRef.current = await importPrivateKey(privKeyStr);
          setKeyError(false);
        } else {
          setKeyError(true);
        }
      } catch (e) {
        console.error("Error loading private key", e);
        setKeyError(true);
      }

      // Key is now ready (or failed). Now connect socket.
      const newSocket = io(SOCKET_SERVER_URL, {
        auth: { token }
      });
      setSocket(newSocket);
      
      newSocket.on('connect', () => {
        newSocket.emit('join', currentUser);
      });

      newSocket.on('force_disconnect', (data) => {
        alert(data.message || 'You have been disconnected.');
        localStorage.removeItem('wa_username');
        localStorage.removeItem('wa_token');
        window.location.reload();
      });

      newSocket.on('users_list', (userList) => {
        const globalRoom = {
           username: 'global',
           displayName: 'Global Server',
           isGroup: true,
           status: 'online',
           avatar: '/logo.png'
        };
        const me = userList.find(u => u.username === currentUser);
        if (me && me.avatar) setMyAvatar(me.avatar);
        
        setUsers([globalRoom, ...userList.filter(u => u.username !== currentUser)]);
      });

      newSocket.on('private_message', async (data) => {
        const { from, encryptedMessage, timestamp, messageId } = data;
        
        let finalMsgObj = {
          id: messageId || (Date.now().toString() + Math.random()),
          sender: from,
          timestamp: timestamp
        };
        
        try {
          if (!privateKeyRef.current) {
            const privKeyStr = localStorage.getItem(`privateKey_${currentUser}`);
            if (privKeyStr) {
              privateKeyRef.current = await importPrivateKey(privKeyStr);
            }
          }
          if (!privateKeyRef.current) throw new Error("No private key");
          
          // Try parsing as JSON first (Media Hybrid Encryption)
          let parsedPayload;
          try {
            parsedPayload = JSON.parse(encryptedMessage);
          } catch (e) {
            // If it fails to parse, it's a plain encrypted string
          }

          if (parsedPayload && parsedPayload.type === 'media') {
            // 1. Decrypt AES Key using our RSA Private Key
            const aesKey = await decryptAESKeyWithRSA(privateKeyRef.current, parsedPayload.encryptedAesKey);
            
            // 2. Decrypt Media using the AES Key
            const decryptedBuffer = await decryptMedia(aesKey, parsedPayload.encryptedContent);
            
            // 3. Convert ArrayBuffer to Blob
            const blob = new Blob([decryptedBuffer], { type: parsedPayload.mimeType });
            
            finalMsgObj = {
               ...finalMsgObj,
               type: 'media',
               fileName: parsedPayload.fileName,
               mimeType: parsedPayload.mimeType,
               blob: blob,
               mediaUrl: URL.createObjectURL(blob),
               replyTo: parsedPayload.replyTo
            };
          } else {
            // Normal Text Decryption
            const decryptedText = await decryptMessage(privateKeyRef.current, encryptedMessage);
            
            let parsedTextObj = null;
            try { parsedTextObj = JSON.parse(decryptedText); } catch(e) {}
            
            if (parsedTextObj && parsedTextObj.text) {
               finalMsgObj = { ...finalMsgObj, type: 'text', text: parsedTextObj.text, replyTo: parsedTextObj.replyTo };
            } else {
               finalMsgObj = { ...finalMsgObj, type: 'text', text: decryptedText };
            }
          }
        } catch (err) {
          console.error("Decryption failed:", err);
          finalMsgObj = { ...finalMsgObj, type: 'text', text: "[Encrypted Message - Could not decrypt]" };
        }
        
        setChats(prev => {
          const userChat = prev[from] || [];
          // Deduplicate by message id
          if (userChat.find(m => m.id === finalMsgObj.id)) return prev;
          return { ...prev, [from]: [...userChat, finalMsgObj] };
        });

        let statusToEmit = 'delivered';
        if (selectedUserRef.current && selectedUserRef.current.username === from) {
           statusToEmit = 'read';
        }

        if (messageId) {
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
        const { from, message, type, mimeType, fileName, fileBuffer, timestamp, messageId, replyTo } = data;
        
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
          const blob = new Blob([fileBuffer], { type: mimeType });
          finalMsgObj.fileName = fileName;
          finalMsgObj.mimeType = mimeType;
          finalMsgObj.blob = blob;
          finalMsgObj.mediaUrl = URL.createObjectURL(blob);
        }

        setChats(prev => {
          const globalChat = prev['global'] || [];
          return { ...prev, 'global': [...globalChat, finalMsgObj] };
        });

        // Mark this message as read if we're currently in global chat
        if (selectedUserRef.current && selectedUserRef.current.username === 'global') {
          newSocket.emit('global_message_read', { messageId: finalMsgObj.id, username: currentUser });
        }

        if (!selectedUserRef.current || selectedUserRef.current.username !== 'global') {
          setUnreadCounts(prev => ({
            ...prev,
            'global': (prev['global'] || 0) + 1
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
                const blob = new Blob([fileBuffer], { type: mimeType });
                finalMsgObj.fileName = fileName;
                finalMsgObj.mimeType = mimeType;
                finalMsgObj.blob = blob;
                finalMsgObj.mediaUrl = URL.createObjectURL(blob);
              }
              existingMessages.set(finalMsgObj.id, finalMsgObj);
            }
          });
          
          // Sort by timestamp
          const mergedChats = Array.from(existingMessages.values()).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
          return { ...prev, 'global': mergedChats };
        });
      });

      // update per-message read count for global
      newSocket.on('global_message_read_update', ({ messageId, readCount, totalUsers }) => {
        setChats(prev => {
          const globalChat = [...(prev['global'] || [])];
          const updated = globalChat.map(msg =>
            msg.id === messageId ? { ...msg, readCount, totalUsers } : msg
          );
          return { ...prev, 'global': updated };
        });
      });

      newSocket.on('message_deleted', ({ to, messageId }) => {
        setChats(prev => {
          const room = to;
          const roomChats = prev[room] || [];
          return { ...prev, [room]: roomChats.filter(m => m.id !== messageId) };
        });
      });

      newSocket.on('clear_global_history', () => {
        setChats(prev => ({
          ...prev,
          'global': []
        }));
      });

      newSocket.on('message_reaction', ({ to, messageId, emoji, from, reactions }) => {
        setChats(prev => {
          const room = to === 'global' ? 'global' : (from === currentUser ? to : from);
          const roomChats = [...(prev[room] || [])];
          const updatedChat = roomChats.map(msg => {
            if (msg.id === messageId) {
              let newReactions = { ...(msg.reactions || {}) };
              if (to === 'global' && reactions) {
                 newReactions = reactions;
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
      return newSocket;
    };

    let socketRef = null;
    initApp().then(sock => { socketRef = sock; });

    return () => {
      if (socketRef) socketRef.close();
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
    setUnreadCounts(prev => ({ ...prev, [user.username]: 0 }));
    if (isMobile) setMobileShowChat(true);

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
    
    try {
      if (selectedUser.username === 'global') {
        const publicPayload = {
          from: currentUser,
          message: payload.text,
          type: payload.type,
          mimeType: payload.mimeType,
          fileName: payload.fileName,
          replyTo: payload.replyTo
        };
        if (payload.type === 'media') {
           publicPayload.fileBuffer = payload.fileBuffer;
        }
        socket.emit('public_message', publicPayload);
        return;
      }

      const recipientPubKey = await importPublicKey(selectedUser.publicKey);
      const messageId = Date.now().toString() + Math.random();
      
      // Encrypt and Send
      let encryptedPayload;

      if (payload.type === 'text') {
        const textPayloadObj = { text: payload.text, replyTo: payload.replyTo };
        encryptedPayload = await encryptMessage(recipientPubKey, JSON.stringify(textPayloadObj));
      } else if (payload.type === 'media') {
        // HYBRID ENCRYPTION
        // 1. Generate AES Key
        const aesKey = await generateAESKey();
        
        // 2. Encrypt Media with AES Key
        const encryptedMediaBase64 = await encryptMedia(aesKey, payload.fileBuffer);
        
        // 3. Encrypt AES Key with RSA Public Key
        const encryptedAesKey = await encryptAESKeyWithRSA(recipientPubKey, aesKey);
        
        // 4. Combine into JSON string
        encryptedPayload = JSON.stringify({
          type: 'media',
          fileName: payload.fileName,
          mimeType: payload.mimeType,
          encryptedContent: encryptedMediaBase64,
          encryptedAesKey: encryptedAesKey,
          replyTo: payload.replyTo
        });
      }

      socket.emit('private_message', {
        messageId: messageId,
        to: selectedUser.username,
        from: currentUser,
        encryptedMessage: encryptedPayload
      });

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

  return (
    <div className="app-container">
      {keyError && (
        <div style={{position: 'absolute', top: 0, left: 0, right: 0, background: 'red', color: 'white', padding: '10px', textAlign: 'center', zIndex: 100}}>
          CRITICAL ERROR: Private Key not found on this device. E2EE decryption will fail.
        </div>
      )}

      {/* SIDEBAR: always shown on desktop; on mobile only when not in chat */}
      {(!isMobile || !mobileShowChat) && (
        <Sidebar 
          users={users} 
          currentUser={currentUser}
          myAvatar={myAvatar}
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
