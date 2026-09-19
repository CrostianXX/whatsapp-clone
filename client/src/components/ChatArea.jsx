import { useState, useRef, useEffect } from 'react';
import { Search, MoreVertical, Smile, Paperclip, Mic, Send, Lock, X, Check, CheckCheck, Image as ImageIcon, Trash2, Reply, ChevronLeft } from 'lucide-react';
import EmojiPicker from 'emoji-picker-react';
import PinterestSearch from './PinterestSearch';

function ChatArea({ messages, currentUser, recipient, onSendMessage, onDeleteMessage, onTyping, isTyping, typers = [], onProfileClick, t, users = [], onBack }) {
  const [inputText, setInputText] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [fullscreenImage, setFullscreenImage] = useState(null);
  const [hoveredMessageId, setHoveredMessageId] = useState(null);
  const [showPinterestSearch, setShowPinterestSearch] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);
  
  // Voice Note State
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingTimerRef = useRef(null);
  
  const messagesEndRef = useRef(null);
  const chatMessagesRef = useRef(null);
  const fileInputRef = useRef(null);
  const emojiPickerRef = useRef(null);
  const isAtBottomRef = useRef(true);

  const handleScroll = () => {
    if (!chatMessagesRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = chatMessagesRef.current;
    const distance = scrollHeight - scrollTop - clientHeight;
    isAtBottomRef.current = distance < 120;
  };

  const scrollToBottom = (instant = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: instant ? 'auto' : 'smooth' });
  };

  const handleImageLoad = () => {
    if (isAtBottomRef.current) {
      scrollToBottom(true);
    }
  };

  // Scroll instantly when changing rooms
  useEffect(() => {
    isAtBottomRef.current = true;
    scrollToBottom(true);
    const timer = setTimeout(() => scrollToBottom(true), 50);
    return () => clearTimeout(timer);
  }, [recipient.username]);

  // Scroll when new messages arrive, ONLY if user is currently at bottom
  useEffect(() => {
    if (isAtBottomRef.current) {
      scrollToBottom(true);
      const timer = setTimeout(() => scrollToBottom(true), 50);
      return () => clearTimeout(timer);
    }
  }, [messages.length]);

  // Close emoji picker if clicked outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target) && !event.target.closest('.smile-btn')) {
        setShowEmojiPicker(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [emojiPickerRef]);

  const startRecording = async () => {
    audioChunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onload = (event) => {
          const arrayBuffer = event.target.result;
          onSendMessage({
            type: 'media',
            fileBuffer: arrayBuffer,
            fileName: `voice_note_${Date.now()}.webm`,
            mimeType: 'audio/webm',
            replyTo: replyingTo
          });
          setReplyingTo(null);
        };
        reader.readAsArrayBuffer(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingDuration(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Error accessing microphone:', err);
      alert('Could not access microphone.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(recordingTimerRef.current);
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(recordingTimerRef.current);
      audioChunksRef.current = [];
      if (mediaRecorderRef.current.stream) {
        mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      }
    }
  };

  const handleReact = (messageId, emoji) => {
    onSendMessage({ type: 'reaction', emoji, messageId });
  };

  const formatRecordingTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const handleSend = (e) => {
    e.preventDefault();
    if (inputText.trim()) {
      onSendMessage({ type: 'text', text: inputText.trim(), replyTo: replyingTo });
      setInputText('');
      onTyping(false);
      setShowEmojiPicker(false);
      setReplyingTo(null);
    }
  };

  const handleChange = (e) => {
    setInputText(e.target.value);
    onTyping(e.target.value.length > 0);
  };

  const onEmojiClick = (emojiObject) => {
    setInputText(prevInput => prevInput + emojiObject.emoji);
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 25 * 1024 * 1024) {
      alert("File size exceeds 25MB limit.");
      return;
    }

    if (file.type.startsWith('image/') && !file.type.includes('gif')) {
      const img = new Image();
      const reader = new FileReader();
      reader.onload = function(evt) {
        img.onload = function() {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          const maxDim = 1280;
          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.85);

          onSendMessage({
            type: 'media',
            fileBuffer: dataUrl,
            fileName: file.name.replace(/\.[^/.]+$/, "") + ".jpg",
            mimeType: 'image/jpeg',
            replyTo: replyingTo
          });
          setReplyingTo(null);
        };
        img.src = evt.target.result;
      };
      reader.readAsDataURL(file);
      e.target.value = null;
      return;
    }

    const reader = new FileReader();
    reader.onload = function(event) {
      const dataUrl = event.target.result;
      
      onSendMessage({
        type: 'media',
        fileBuffer: dataUrl,
        fileName: file.name,
        mimeType: file.type || (file.name.endsWith('.mp4') ? 'video/mp4' : 'image/jpeg'),
        replyTo: replyingTo
      });
      setReplyingTo(null);
    };
    reader.readAsDataURL(file);
    
    // Reset file input
    e.target.value = null;
  };

  const handleSendPinterestImage = async (imageUrl) => {
    try {
      let blob = null;
      let contentType = 'image/jpeg';
      try {
        const response = await fetch(`/api/images/download?url=${encodeURIComponent(imageUrl)}`);
        if (response.ok) {
          blob = await response.blob();
          contentType = response.headers.get('content-type') || 'image/jpeg';
        }
      } catch (e) {}

      if (!blob) {
        const directRes = await fetch(imageUrl, { mode: 'cors' }).catch(() => null);
        if (directRes && directRes.ok) {
          blob = await directRes.blob();
          contentType = directRes.headers.get('content-type') || 'image/jpeg';
        }
      }

      if (!blob) {
        blob = await new Promise((resolve) => {
          const img = new Image();
          img.crossOrigin = 'Anonymous';
          img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth || 800;
            canvas.height = img.naturalHeight || 600;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.85);
          };
          img.onerror = () => resolve(null);
          img.src = imageUrl;
        });
      }

      if (blob) {
        const reader = new FileReader();
        reader.onload = (event) => {
          onSendMessage({
            type: 'media',
            fileBuffer: event.target.result,
            fileName: `pinterest_${Date.now()}.jpg`,
            mimeType: contentType,
            replyTo: replyingTo
          });
          setReplyingTo(null);
        };
        reader.readAsDataURL(blob);
      } else {
        // Fallback: send as direct URL if binary conversion fails
        onSendMessage({
          type: 'media',
          fileBuffer: imageUrl,
          mediaUrl: imageUrl,
          fileName: `pinterest_${Date.now()}.jpg`,
          mimeType: 'image/jpeg',
          replyTo: replyingTo
        });
        setReplyingTo(null);
      }
    } catch (err) {
      console.error('[PINTEREST SEND ERROR]', err);
      onSendMessage({
        type: 'media',
        fileBuffer: imageUrl,
        mediaUrl: imageUrl,
        fileName: `pinterest_${Date.now()}.jpg`,
        mimeType: 'image/jpeg',
        replyTo: replyingTo
      });
      setReplyingTo(null);
    }
  };

  const formatTime = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const resolveMimeType = (fileName, explicitMime) => {
    if (explicitMime && explicitMime.includes('/')) return explicitMime;
    if (!fileName) return 'image/jpeg';
    const ext = fileName.toLowerCase().split('.').pop();
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) return `image/${ext === 'jpg' ? 'jpeg' : ext}`;
    if (['mp4', 'webm', 'ogg', 'mov', 'mkv', 'avi'].includes(ext)) return `video/${ext === 'mov' ? 'mp4' : ext}`;
    if (['mp3', 'wav', 'm4a', 'aac'].includes(ext)) return `audio/${ext === 'mp3' ? 'mpeg' : ext}`;
    return 'application/octet-stream';
  };

  const resolveMediaUrl = (msg) => {
    if (msg.blob) {
      return URL.createObjectURL(msg.blob);
    }
    if (msg.mediaUrl && (msg.mediaUrl.startsWith('data:') || msg.mediaUrl.startsWith('http:') || msg.mediaUrl.startsWith('https:') || msg.mediaUrl.startsWith('blob:'))) {
      return msg.mediaUrl;
    }
    if (!msg.fileBuffer) return msg.mediaUrl || null;
    if (typeof msg.fileBuffer === 'string') {
      if (msg.fileBuffer.startsWith('data:') || msg.fileBuffer.startsWith('http:') || msg.fileBuffer.startsWith('https:') || msg.fileBuffer.startsWith('blob:')) {
        return msg.fileBuffer;
      }
      const mime = resolveMimeType(msg.fileName, msg.mimeType);
      return `data:${mime};base64,${msg.fileBuffer}`;
    }
    if (typeof msg.fileBuffer === 'object' && msg.fileBuffer.type === 'Buffer' && Array.isArray(msg.fileBuffer.data)) {
      const uint8 = new Uint8Array(msg.fileBuffer.data);
      const mime = resolveMimeType(msg.fileName, msg.mimeType);
      const blob = new Blob([uint8], { type: mime });
      return URL.createObjectURL(blob);
    }
    return msg.mediaUrl || null;
  };

  const renderMessageContent = (msg, isSent, isVip) => {
    if (msg.type === 'media') {
      const mime = resolveMimeType(msg.fileName, msg.mimeType);
      const src = resolveMediaUrl(msg);

      if (!src) return <span style={{fontSize: '13px', fontStyle: 'italic'}}>📷 {msg.fileName || 'Media'}</span>;

      let content;
      if (mime.startsWith('image/')) {
        content = (
          <img 
            src={src} 
            alt={msg.fileName || 'Image'} 
            onLoad={handleImageLoad}
            style={{maxWidth: '100%', maxHeight: '320px', minHeight: '120px', borderRadius: '8px', cursor: 'pointer', display: 'block', objectFit: 'contain'}} 
            onClick={() => setFullscreenImage(src)}
          />
        );
      } else if (mime.startsWith('video/')) {
        content = (
          <video 
            src={src} 
            controls 
            preload="metadata"
            onLoadedData={handleImageLoad}
            style={{maxWidth: '100%', maxHeight: '320px', minHeight: '120px', borderRadius: '8px', display: 'block', backgroundColor: '#000'}} 
          />
        );
      } else if (mime.startsWith('audio/')) {
        content = <audio src={src} controls style={{width: '250px', maxWidth: '100%'}} />;
      } else {
        content = (
          <a href={src} download={msg.fileName || 'file'} style={{color: 'var(--primary-color)', textDecoration: 'underline'}}>
            {t('download')} {msg.fileName}
          </a>
        );
      }

      return (
        <div style={{position: 'relative'}}>
          {content}
          {msg.isUploading && (
            <div style={{
              position: 'absolute', 
              top: '50%', left: '50%', 
              transform: 'translate(-50%, -50%)', 
              backgroundColor: 'rgba(0,0,0,0.6)', 
              color: 'white', padding: '5px 10px', 
              borderRadius: '15px', fontSize: '12px',
              whiteSpace: 'nowrap'
            }}>
              {t('encrypting')}
            </div>
          )}
        </div>
      );
    }
    
    // Dynamic color for reply bubble
    let replyBg = 'rgba(0,0,0,0.05)';
    let replyBorder = 'var(--primary-color)';
    let replySenderColor = 'var(--primary-color)';
    let replyTextColor = 'var(--text-primary)';
    
    if (isVip) {
      replyBg = 'rgba(0,0,0,0.1)';
      replyBorder = '#D97706';
      replySenderColor = '#B45309';
      replyTextColor = '#451A03';
    } else if (isSent) {
      replyBg = 'rgba(255,255,255,0.2)';
      replyBorder = '#ffffff';
      replySenderColor = '#ffffff';
      replyTextColor = 'rgba(255,255,255,0.9)';
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {msg.replyTo && (
          <div className="replied-message-snippet" style={{
            background: replyBg, borderLeft: `4px solid ${replyBorder}`,
            padding: '6px 8px', borderRadius: '6px', marginBottom: '6px', fontSize: '13px',
          }}>
            <strong style={{ color: replySenderColor, display: 'block', marginBottom: '2px' }}>{msg.replyTo.sender}</strong>
            <div style={{ color: replyTextColor }}>{msg.replyTo.type === 'media' ? '📷 Photo/Media' : msg.replyTo.text}</div>
          </div>
        )}
        <span className="message-text">{msg.text}</span>
      </div>
    );
  };

  return (
    <div className="chat-area">
      <div className="chat-header">
        {onBack && (
          <button className="mobile-back-btn" onClick={onBack}>
            <ChevronLeft size={24} />
          </button>
        )}
        <div className="avatar" style={{
          border: recipient.status === 'online' ? '2px solid #10b981' : '2px solid transparent', 
          overflow: 'hidden',
          boxShadow: '0 4px 10px rgba(0,0,0,0.1)'
        }}>
          {recipient.avatar ? (
            <img src={recipient.avatar} alt={recipient.username} style={{width: '100%', height: '100%', objectFit: 'cover'}} />
          ) : (
            recipient.username.charAt(0).toUpperCase()
          )}
        </div>
        <div className="user-info" onClick={() => onProfileClick && onProfileClick(recipient)} style={{ cursor: 'pointer', flex: 1 }}>
          <div className="chat-title" style={recipient.isGroup ? { fontFamily: 'monospace, "Courier New", Courier', color: 'var(--primary-color)', fontWeight: 800, letterSpacing: '0.5px' } : {}}>{recipient.displayName || recipient.username}</div>
          <div className="chat-subtitle">
            {isTyping || typers.includes(recipient.username) ? (
              <span className="typing-indicator">
                {t('typing')}<span className="typing-dot"></span><span className="typing-dot"></span><span className="typing-dot"></span>
              </span>
            ) : (
              recipient.isGroup ? t('publicRoom') : (
                recipient.status === 'online' ? t('online') : (
                  recipient.lastSeen ? `${t('lastSeen')} ${new Date(recipient.lastSeen).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}` : t('offline')
                )
              )
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '20px', color: '#54656f', paddingRight: '10px' }}>
          <Search size={20} className="icon-btn" />
          <MoreVertical size={20} className="icon-btn" />
        </div>
      </div>
      
      <div className="chat-messages" ref={chatMessagesRef} onScroll={handleScroll}>
        <div style={{
           alignSelf: 'center', 
           backgroundColor: 'rgba(255, 255, 255, 0.05)', 
           padding: '8px 16px', 
           borderRadius: '20px',
           fontSize: '12px',
           color: 'var(--text-secondary)',
           marginBottom: '16px',
           display: 'flex',
           alignItems: 'center',
           gap: '8px',
           border: '1px solid rgba(255,255,255,0.05)',
           backdropFilter: 'blur(5px)'
        }}>
          <Lock size={14} color="#10b981" /> 
          {t('encryptionNotice')}
        </div>
      
        {messages.map((msg) => {
          const senderUser = users.find(u => u.username === msg.sender) || { username: msg.sender };
          const isVip = msg.sender === 'anonim';
          const isSent = msg.sender === currentUser;
          
          return (
          <div 
            key={msg.id} 
            className={`message-wrapper ${isSent ? 'sent' : 'received'}`}
            onMouseEnter={() => setHoveredMessageId(msg.id)}
            onMouseLeave={() => setHoveredMessageId(null)}
            style={{ 
              display: 'flex', flexDirection: 'row', alignItems: 'flex-start', gap: '8px', marginBottom: '8px',
              transform: 'translateZ(0)', // Force GPU layer for scroll performance
              position: 'relative'
            }}
          >
            {recipient.isGroup && msg.sender !== currentUser && (
              <div 
                style={{
                  width: '28px', height: '28px', borderRadius: '50%', overflow: 'hidden',
                  background: isVip ? 'linear-gradient(135deg, #ffd700, #ff8c00)' : 'var(--primary-color)', color: 'white',
                  display: 'flex', justifyContent: 'center', alignItems: 'center',
                  fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', flexShrink: 0,
                  boxShadow: isVip ? '0 0 10px rgba(255, 215, 0, 0.6)' : 'none'
                }}
                onClick={() => onProfileClick(senderUser)}
                title={msg.sender}
              >
                {senderUser.avatar ? (
                  <img src={senderUser.avatar} alt={msg.sender} style={{width: '100%', height: '100%', objectFit: 'cover'}} />
                ) : (
                  msg.sender.charAt(0).toUpperCase()
                )}
              </div>
            )}
            <div 
              className={`message-bubble ${isVip ? 'vip-bubble' : ''}`}
              onDoubleClick={() => setReplyingTo(msg)}
              style={{
                padding: msg.type === 'media' ? '4px' : '8px 12px', 
                position: 'relative',
                ...(isVip ? {
                  background: 'linear-gradient(135deg, #FFD700 0%, #F59E0B 100%)',
                  border: '1px solid #D97706',
                  boxShadow: '0 2px 8px rgba(245, 158, 11, 0.3)', // Simplified shadow for performance
                  color: '#451A03',
                  fontFamily: '"Georgia", serif',
                  letterSpacing: '0.3px',
                  fontWeight: '600'
                } : {})
              }}
            >
              {hoveredMessageId === msg.id && (
                <div style={{
                  position: 'absolute',
                  top: '-32px',
                  right: isSent ? '0' : 'auto',
                  left: isSent ? 'auto' : '0',
                  display: 'flex',
                  gap: '4px',
                  background: 'var(--bg-secondary)',
                  padding: '2px 6px',
                  borderRadius: '12px',
                  boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
                  zIndex: 10
                }}>
                  {['👍', '❤️', '😂', '😮', '😢', '🙏'].map(emoji => (
                    <span 
                      key={emoji} 
                      style={{ cursor: 'pointer', fontSize: '14px', transition: 'transform 0.1s' }}
                      onClick={(e) => { e.stopPropagation(); handleReact(msg.id, emoji); }}
                      onMouseOver={(e) => e.target.style.transform = 'scale(1.3)'}
                      onMouseOut={(e) => e.target.style.transform = 'scale(1)'}
                    >
                      {emoji}
                    </span>
                  ))}
                </div>
              )}

              {recipient.isGroup && msg.sender !== currentUser && (
                <div style={{
                  fontSize: '12px', 
                  fontWeight: '900', 
                  color: isVip ? '#78350F' : 'var(--primary-color)', 
                  marginBottom: '4px',
                  textShadow: isVip ? '0 1px 1px rgba(255,255,255,0.5)' : 'none'
                }}>
                  ~{msg.sender} {isVip && '👑'}
                </div>
              )}
              {renderMessageContent(msg, isSent, isVip)}
              <div className="message-time" style={{
                margin: msg.type === 'media' ? '4px' : '4px 0 0 10px', 
                display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end',
                color: isVip ? 'rgba(69, 26, 3, 0.7)' : 'inherit',
                fontWeight: isVip ? 'bold' : 'normal'
              }}>
                {currentUser === 'anonim' && (
                  <button
                    onClick={() => {
                      if (window.confirm('Yakin ingin menghapus pesan ini?')) {
                        onDeleteMessage(msg.id, msg.sender, recipient.username);
                      }
                    }}
                    style={{
                      background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', color: '#ef4444', marginRight: '4px',
                      opacity: 0.8
                    }}
                    title="Hapus Pesan"
                    onMouseOver={(e) => e.currentTarget.style.opacity = 1}
                    onMouseOut={(e) => e.currentTarget.style.opacity = 0.8}
                  >
                    <Trash2 size={13} />
                  </button>
                )}
                <button
                  onClick={() => setReplyingTo(msg)}
                  style={{
                    background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', color: 'inherit', marginRight: '4px',
                    opacity: 0.6
                  }}
                  title="Balas Pesan"
                  onMouseOver={(e) => e.currentTarget.style.opacity = 1}
                  onMouseOut={(e) => e.currentTarget.style.opacity = 0.6}
                >
                  <Reply size={13} />
                </button>
                {formatTime(msg.timestamp)}
                {msg.sender === currentUser && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                    {recipient.isGroup ? (
                      // Global chat: show read count like WA group receipts
                      (() => {
                        const readCount = msg.readCount || 0;
                        const totalUsers = msg.totalUsers || 0;
                        const everyoneRead = totalUsers > 1 && readCount >= totalUsers;
                        if (everyoneRead) {
                          // All users read it — blue double tick
                          return <CheckCheck size={14} color={isVip ? '#2563EB' : '#53bdeb'} />;
                        } else if (readCount > 0) {
                          // Some read — grey double tick + count
                          return (
                            <span style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                              <CheckCheck size={14} color={isVip ? '#78350F' : '#8696a0'} />
                              <span style={{ fontSize: '10px', color: isVip ? '#78350F' : '#8696a0' }}>{readCount}</span>
                            </span>
                          );
                        } else {
                          // Noone read yet — single grey tick
                          return <Check size={14} color={isVip ? '#78350F' : '#8696a0'} />;
                        }
                      })()
                    ) : (
                      // Private chat: standard WA ticks
                      (() => {
                        const isRead = msg.status === 'read';
                        const isDelivered = msg.status === 'delivered' || recipient.status === 'online';

                        if (isRead) {
                          return (
                            <span style={{ display: 'flex', alignItems: 'center' }} title="Sudah Dibaca (Read)">
                              <CheckCheck size={16} color={isVip ? '#2563EB' : '#00F0FF'} style={{ filter: isVip ? 'none' : 'drop-shadow(0 0 3px #00F0FF)' }} />
                            </span>
                          );
                        }
                        if (isDelivered) {
                          return (
                            <span style={{ display: 'flex', alignItems: 'center' }} title="Terkirim (Delivered)">
                              <CheckCheck size={16} color={isVip ? '#78350F' : 'rgba(255,255,255,0.65)'} />
                            </span>
                          );
                        }
                        return (
                          <span style={{ display: 'flex', alignItems: 'center' }} title="Terkirim ke Server (Sent)">
                            <Check size={16} color={isVip ? '#78350F' : 'rgba(255,255,255,0.65)'} />
                          </span>
                        );
                      })()
                    )}
                  </span>
                )}
              </div>
              
              {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                <div style={{
                  position: 'absolute',
                  bottom: '-10px',
                  right: isSent ? '0' : 'auto',
                  left: isSent ? 'auto' : '0',
                  display: 'flex',
                  gap: '2px',
                  background: 'var(--bg-secondary)',
                  padding: '2px 4px',
                  borderRadius: '10px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                  fontSize: '12px',
                  zIndex: 2
                }}>
                  {Object.entries(
                    Object.values(msg.reactions).reduce((acc, emoji) => {
                      acc[emoji] = (acc[emoji] || 0) + 1;
                      return acc;
                    }, {})
                  ).map(([emoji, count]) => (
                    <span key={emoji} style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                      {emoji} <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>{count > 1 ? count : ''}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )})}
        <div ref={messagesEndRef} />
      </div>
      
      <div className="chat-input-container" style={{position: 'relative'}}>
        {replyingTo && (
          <div className="reply-preview-box" style={{
            background: 'var(--bg-glass)', borderLeft: '4px solid var(--primary-color)',
            padding: '8px 12px', borderRadius: '8px', display: 'flex',
            justifyContent: 'space-between', alignItems: 'center',
            boxShadow: '0 2px 10px rgba(0,0,0,0.05)', alignSelf: 'stretch'
          }}>
            <div>
              <div style={{color: 'var(--primary-color)', fontWeight: 'bold', fontSize: '13px'}}>{replyingTo.sender}</div>
              <div style={{color: 'var(--text-secondary)', fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '300px'}}>
                {replyingTo.type === 'media' ? 'Media' : replyingTo.text}
              </div>
            </div>
            <button onClick={() => setReplyingTo(null)} style={{background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)'}}>
              <X size={16} />
            </button>
          </div>
        )}
      
        {showEmojiPicker && (
          <div ref={emojiPickerRef} style={{position: 'absolute', bottom: '100%', left: '20px', zIndex: 100}}>
            <EmojiPicker onEmojiClick={onEmojiClick} theme="light" />
          </div>
        )}
      
        {/* Left Action Buttons */}
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          {/* Emoji Button */}
          <button 
            className="action-pill-btn smile-btn"
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            style={{
              display: 'flex', alignItems: 'center', gap: '4px',
              padding: '6px 8px', borderRadius: '16px',
              backgroundColor: showEmojiPicker ? 'var(--bg-secondary)' : 'transparent',
              border: 'none',
              color: showEmojiPicker ? 'var(--primary-color)' : 'var(--text-secondary)',
              cursor: 'pointer', fontWeight: '600', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px',
              transition: 'all 0.2s'
            }}
            onMouseOver={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'; e.currentTarget.style.color = 'var(--primary-color)'; }}
            onMouseOut={(e) => { 
              if (!showEmojiPicker) {
                e.currentTarget.style.backgroundColor = 'transparent'; 
                e.currentTarget.style.color = 'var(--text-secondary)'; 
              }
            }}
          >
            <Smile size={18} />
            <span>Emoji</span>
          </button>
          
          {/* Pinterest Button */}
          <button 
            className="action-pill-btn"
            onClick={() => setShowPinterestSearch(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: '4px',
              padding: '6px 8px', borderRadius: '16px',
              backgroundColor: 'transparent',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer', fontWeight: '600', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px',
              transition: 'all 0.2s'
            }}
            onMouseOver={(e) => { e.currentTarget.style.backgroundColor = '#ffeef0'; e.currentTarget.style.color = '#e60023'; }}
            onMouseOut={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
            title="Cari gambar estetik di Pinterest"
          >
            <ImageIcon size={18} />
            <span>Pinterest</span>
          </button>
          
          {/* File Upload Button */}
          <input 
            type="file" 
            ref={fileInputRef} 
            style={{display: 'none'}} 
            onChange={handleFileUpload} 
          />
          <button 
            className="action-pill-btn"
            onClick={() => fileInputRef.current.click()}
            style={{
              display: 'flex', alignItems: 'center', gap: '4px',
              padding: '6px 8px', borderRadius: '16px',
              backgroundColor: 'transparent',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer', fontWeight: '600', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px',
              transition: 'all 0.2s'
            }}
            onMouseOver={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'; e.currentTarget.style.color = 'var(--primary-color)'; }}
            onMouseOut={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
            title="Upload Gambar/Video"
          >
            <Paperclip size={18} />
            <span>Kirim</span>
          </button>
        </div>
        
        <form onSubmit={handleSend} className="chat-input-wrapper">
          {isRecording ? (
             <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '12px', color: '#ff4444', fontWeight: 'bold' }}>
               <div className="recording-dot" style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#ff4444', animation: 'pulse 1s infinite' }}></div>
               Recording Voice Note... {formatDuration(recordingDuration)}
             </div>
          ) : (
            <input
              type="text"
              className="chat-input"
              placeholder={t('typeMessage')}
              value={inputText}
              onChange={handleChange}
            />
          )}
        </form>
        
        {inputText.trim() ? (
          <Send size={24} className="icon-btn primary send-button" onClick={handleSend} style={{ backgroundColor: 'var(--primary-color)', color: 'white', padding: '10px', width: '44px', height: '44px', borderRadius: '50%', cursor: 'pointer', flexShrink: 0 }} />
        ) : (
          <div 
            style={{ position: 'relative' }}
            onMouseDown={startRecording}
            onMouseUp={stopRecording}
            onMouseLeave={stopRecording}
            onTouchStart={startRecording}
            onTouchEnd={stopRecording}
          >
            <Mic 
              size={24} 
              className="icon-btn" 
              style={{ backgroundColor: isRecording ? '#ff4444' : 'transparent', color: isRecording ? 'white' : 'var(--text-secondary)', padding: '10px', width: '44px', height: '44px', borderRadius: '50%', transition: 'all 0.2s', cursor: 'pointer' }}
            />
          </div>
        )}
      </div>

      {/* Voice Note Coming Soon Toast */}
      {showToast && (
        <div className="toast-container">
          <div className="toast">
            <Mic size={18} />
            {t('voiceNoteComingSoon')}
          </div>
        </div>
      )}

      {/* Pinterest Search Modal */}
      {showPinterestSearch && (
        <PinterestSearch 
          onClose={() => setShowPinterestSearch(false)}
          onSelectImage={handleSendPinterestImage}
        />
      )}

      {/* Fullscreen Image Viewer Modal */}
      {fullscreenImage && (
        <div 
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 9999,
            display: 'flex', justifyContent: 'center', alignItems: 'center',
            backdropFilter: 'blur(10px)', cursor: 'zoom-out'
          }}
          onClick={() => setFullscreenImage(null)}
        >
          <button 
            style={{
              position: 'absolute', top: '20px', right: '20px',
              background: 'rgba(255,255,255,0.2)', border: 'none',
              color: 'white', cursor: 'pointer', padding: '10px',
              borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}
            onClick={(e) => { e.stopPropagation(); setFullscreenImage(null); }}
          >
            <X size={24} />
          </button>
          <img 
            src={fullscreenImage} 
            alt="Fullscreen View" 
            style={{
              maxWidth: '90%', maxHeight: '90%', 
              objectFit: 'contain', borderRadius: '8px',
              boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
              animation: 'popIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
            }} 
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

export default ChatArea;
