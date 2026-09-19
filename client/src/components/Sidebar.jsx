import React, { useRef } from 'react';
import { MoreVertical, MessageSquare, CircleDashed, Search, Filter, Lock, LogOut, Camera, Sun, Moon, Shield } from 'lucide-react';

function Sidebar({ users, currentUser, myAvatar, onAvatarUpdate, token, onSelectUser, selectedUser, onLogout, unreadCounts = {}, onProfileClick, theme, toggleTheme, language, toggleLanguage, t, onAdminClick }) {
  const fileInputRef = useRef(null);

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const compressImage = (file, maxWidth = 200, maxHeight = 200, quality = 0.85) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (e) => {
        const img = new Image();
        img.src = e.target.result;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          if (width > height) {
            if (width > maxWidth) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            }
          } else {
            if (height > maxHeight) {
              width = Math.round((width * maxHeight) / height);
              height = maxHeight;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = (err) => reject(err);
      };
      reader.onerror = (err) => reject(err);
    });
  };

  const handleAvatarUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert("Image must be smaller than 5MB");
      return;
    }

    try {
      const compressedBase64 = await compressImage(file, 200, 200, 0.85);

      // Instant local update & localStorage persistence
      if (onAvatarUpdate) {
        onAvatarUpdate(compressedBase64);
      }
      if (currentUser) {
        localStorage.setItem(`wa_avatar_${currentUser}`, compressedBase64);
      }

      const response = await fetch('/api/update-avatar', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token || localStorage.getItem('wa_token')}`
        },
        body: JSON.stringify({ avatar: compressedBase64 })
      });

      if (!response.ok) throw new Error('Failed to update avatar on server');
      const data = await response.json();
      if (data.avatar && currentUser) {
        localStorage.setItem(`wa_avatar_${currentUser}`, data.avatar);
        if (onAvatarUpdate) onAvatarUpdate(data.avatar);
      }
    } catch (err) {
      console.error("[AVATAR UPLOAD ERROR]", err);
      alert('Gagal mengunggah foto profil.');
    }
  };

  const otherUsers = users.filter((u) => u.username !== currentUser);

  const handleLogout = () => {
    if (onLogout) {
      onLogout();
    } else {
      localStorage.removeItem('wa_username');
      localStorage.removeItem('wa_token');
      window.location.reload();
    }
  };

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <div style={{display: 'flex', alignItems: 'center', gap: '12px'}}>
          <div 
            className="avatar" 
            style={{cursor: 'pointer', position: 'relative'}}
            onClick={handleAvatarClick}
            title="Click to change avatar"
          >
            {myAvatar ? (
              <img src={myAvatar} alt="My Avatar" style={{width: '100%', height: '100%', objectFit: 'cover'}} />
            ) : (
              currentUser ? currentUser.charAt(0).toUpperCase() : 'U'
            )}
            <div style={{position: 'absolute', bottom: -2, right: -2, background: 'rgba(0,0,0,0.6)', padding: '4px', borderRadius: '50%', backdropFilter: 'blur(4px)'}}>
              <Camera size={10} color="white" />
            </div>
          </div>
          <input 
            type="file" 
            ref={fileInputRef} 
            style={{ display: 'none' }} 
            accept="image/*"
            onChange={handleAvatarUpload}
          />
          <div style={{fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '4px'}}>
            {currentUser}
            {currentUser === 'anonim' && <span title="VIP Owner">👑</span>}
          </div>
        </div>
        <div style={{ flex: 1 }}></div>
        <div style={{ display: 'flex', gap: '2px', alignItems: 'center' }}>
          <button className="icon-btn" onClick={toggleLanguage} title="Toggle Language" style={{fontSize: '12px', fontWeight: 'bold', padding: '6px'}}>
            {language === 'en' ? 'EN' : 'ID'}
          </button>
          <button className="icon-btn" onClick={toggleTheme} title="Toggle Theme" style={{padding: '6px'}}>
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button className="icon-btn" onClick={handleLogout} title="Logout" style={{padding: '6px'}}><LogOut size={18} /></button>
        </div>
      </div>
      
      {currentUser === 'anonim' && (
        <div style={{ padding: '10px 16px', backgroundColor: 'rgba(239, 68, 68, 0.1)', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'center' }}>
          <button 
            onClick={onAdminClick} 
            style={{ 
              backgroundColor: '#ef4444', 
              color: 'white', 
              border: 'none', 
              borderRadius: '8px', 
              padding: '8px 16px', 
              fontWeight: 'bold', 
              cursor: 'pointer', 
              display: 'flex', 
              alignItems: 'center', 
              gap: '8px',
              width: '100%',
              justifyContent: 'center',
              boxShadow: '0 2px 5px rgba(239, 68, 68, 0.3)'
            }}
          >
            <Shield size={18} />
            Buka Admin Dashboard
          </button>
        </div>
      )}
      
      <div className="sidebar-search">
        <div className="search-input-wrapper">
          <Search size={18} color="var(--text-secondary)" />
          <input type="text" placeholder={t('searchPlaceholder')} />
          <Filter size={18} color="var(--text-secondary)" style={{ cursor: 'pointer' }} />
        </div>
      </div>
      
      <div className="users-list">
        {otherUsers.length === 0 ? (
          <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '14px' }}>
            {t('noUsers')}
          </div>
        ) : (
          otherUsers.map((user) => (
            <div 
              key={user.username} 
              className={`user-item ${selectedUser && selectedUser.username === user.username ? 'active' : ''}`}
              onClick={() => onSelectUser(user)}
              style={{
                 backgroundColor: selectedUser && selectedUser.username === user.username ? 'rgba(255,255,255,0.1)' : 'transparent'
              }}
            >
              <div 
                className="avatar" 
                style={{
                  border: user.status === 'online' ? '2px solid #10b981' : '2px solid transparent',
                  cursor: 'pointer'
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  onProfileClick && onProfileClick(user);
                }}
                title="View Profile"
              >
                {user.avatar ? (
                  <img src={user.avatar} alt={user.username} style={{width: '100%', height: '100%', objectFit: 'cover'}} />
                ) : (
                  user.username.charAt(0).toUpperCase()
                )}
              </div>
              <div className="user-info">
                <div className="user-name" style={{display: 'flex', alignItems: 'center'}}>
                  <span style={{ 
                    flex: 1, 
                    whiteSpace: 'nowrap', 
                    overflow: 'hidden', 
                    textOverflow: 'ellipsis',
                    ...(user.isGroup ? { fontFamily: 'monospace, "Courier New", Courier', fontSize: '15px', color: 'var(--primary-color)', fontWeight: 800, letterSpacing: '0.5px' } : {})
                  }}>
                    {user.displayName || user.username}
                    {user.username === 'anonim' && <span style={{marginLeft: '4px'}} title="VIP Owner">👑</span>}
                  </span>
                  {unreadCounts[user.username] > 0 && selectedUser?.username !== user.username && (
                    <span style={{
                      backgroundColor: 'var(--primary-color)',
                      color: 'white',
                      borderRadius: '10px',
                      padding: '2px 8px',
                      fontSize: '11px',
                      fontWeight: 'bold',
                      boxShadow: '0 0 10px var(--primary-glow)',
                      marginLeft: '8px',
                      flexShrink: 0
                    }}>
                      {unreadCounts[user.username]}
                    </span>
                  )}
                </div>
                <div className="user-status" style={{display: 'flex', justifyContent: 'space-between', fontSize: '12px'}}>
                  <span>
                    {user.status === 'online' && <span className="status-dot"></span>}
                    {user.status === 'online' ? (
                      t('online')
                    ) : (
                      <span style={{color: 'var(--text-secondary)'}}>
                        {user.lastSeen ? `${t('lastSeen')} ${new Date(user.lastSeen).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}` : t('offline')}
                      </span>
                    )}
                  </span>
                  {user.publicKey && <Lock size={12} color="var(--primary-color)" title="E2EE Ready" />}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default Sidebar;
