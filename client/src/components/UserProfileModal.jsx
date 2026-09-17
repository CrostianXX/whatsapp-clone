import React from 'react';
import { X, Lock } from 'lucide-react';

function UserProfileModal({ user, onClose, t }) {
  if (!user) return null;

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 1000,
      display: 'flex', justifyContent: 'center', alignItems: 'center',
      backdropFilter: 'blur(5px)'
    }}>
      <div style={{
        background: 'var(--bg-glass)',
        padding: '30px',
        borderRadius: '24px',
        width: '90%',
        maxWidth: '380px',
        position: 'relative',
        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5), 0 0 0 1px var(--border-color)',
        backdropFilter: 'blur(40px)',
        border: '1px solid var(--border-color)',
        color: 'var(--text-primary)',
        animation: 'slideUp 0.3s ease-out forwards'
      }}>
        <button onClick={onClose} style={{
          position: 'absolute', top: '20px', right: '20px',
          background: 'transparent', border: 'none',
          color: 'var(--text-secondary)', cursor: 'pointer',
          padding: '4px', borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <X size={24} />
        </button>

        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div style={{
            width: '120px', height: '120px', margin: '0 auto 16px',
            borderRadius: '50%', overflow: 'hidden',
            border: '4px solid var(--primary-color)',
            display: 'flex', justifyContent: 'center', alignItems: 'center',
            fontSize: '48px', background: 'var(--bg-default)',
            boxShadow: '0 8px 20px rgba(0,0,0,0.15)'
          }}>
            {user.avatar ? (
              <img src={user.avatar} alt={user.username} style={{width:'100%', height:'100%', objectFit:'cover'}} />
            ) : (
              user.username.charAt(0).toUpperCase()
            )}
          </div>
          <h2 style={{ margin: '0 0 8px 0', fontSize: '24px' }}>{user.displayName || user.username}</h2>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '14px' }}>
            {user.status === 'online' ? t('online') : (user.lastSeen ? `${t('lastSeen')} ${new Date(user.lastSeen).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}` : t('offline'))}
          </p>
        </div>

        <div style={{ background: 'var(--bg-default)', padding: '16px', borderRadius: '16px', fontSize: '14px', border: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
            <Lock size={18} color="var(--primary-color)" />
            <strong style={{color: 'var(--text-primary)'}}>E2E Encryption</strong>
          </div>
          <div style={{ wordBreak: 'break-all', color: 'var(--text-secondary)', fontFamily: 'monospace', fontSize: '11px', background: 'var(--bg-glass)', padding: '12px', borderRadius: '10px' }}>
            {user.publicKey ? (
              JSON.parse(user.publicKey).n.substring(0, 60) + '...'
            ) : (
              'Public key tidak tersedia'
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default UserProfileModal;
