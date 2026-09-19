import React, { useState, useEffect } from 'react';
import { Shield, ShieldOff, Search, Clock, Trash2, Lock, Key, Monitor, LogOut, Eye, EyeOff, RefreshCw, ArrowLeft, CheckCircle } from 'lucide-react';

const API_URL = import.meta.env.VITE_BACKEND_URL || (import.meta.env.DEV ? 'http://localhost:3001' : '');

function AdminDashboard({ token, onBack }) {
  const [adminPin, setAdminPin] = useState(() => sessionStorage.getItem('admin_pin') || '123458');
  const [isPinVerified, setIsPinVerified] = useState(() => {
    const savedPin = sessionStorage.getItem('admin_pin');
    return savedPin === '123458' || Boolean(savedPin);
  });
  
  // PIN & Eye Toggle & Captcha state
  const [pinInput, setPinInput] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [captchaCode, setCaptchaCode] = useState('');
  const [captchaInput, setCaptchaInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinLoading, setPinLoading] = useState(false);

  // Tab & Data state
  const [activeTab, setActiveTab] = useState('users'); // 'users' or 'sessions'
  const [users, setUsers] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Generate random CAPTCHA code
  const generateCaptcha = () => {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    let result = '';
    for (let i = 0; i < 4; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setCaptchaCode(result);
    setCaptchaInput('');
  };

  useEffect(() => {
    generateCaptcha();
    const savedPin = sessionStorage.getItem('admin_pin') || '123458';
    if (savedPin) {
      verifyPin(savedPin);
    }
  }, []);

  useEffect(() => {
    if (isPinVerified) {
      if (activeTab === 'users') fetchUsers();
      else if (activeTab === 'sessions') fetchSessions();
    }
  }, [isPinVerified, activeTab, token]);

  const verifyPin = async (pinToTest) => {
    setPinLoading(true);
    setPinError('');
    try {
      const res = await fetch(`${API_URL}/api/admin/verify-pin`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'x-admin-pin': pinToTest,
          'Content-Type': 'application/json'
        }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'PIN Admin tidak valid.');

      setAdminPin(pinToTest);
      sessionStorage.setItem('admin_pin', pinToTest);
      setIsPinVerified(true);
    } catch (err) {
      setPinError(err.message || 'PIN Admin Salah!');
      setIsPinVerified(false);
      sessionStorage.removeItem('admin_pin');
      generateCaptcha();
    } finally {
      setPinLoading(false);
    }
  };

  const handlePinSubmit = (e) => {
    e.preventDefault();
    if (!pinInput.trim()) {
      return setPinError('Masukkan 6-digit PIN Admin (123458)');
    }
    if (captchaInput.trim().toUpperCase() !== captchaCode.toUpperCase()) {
      generateCaptcha();
      return setPinError('Kode CAPTCHA tidak cocok! Silakan coba lagi.');
    }
    verifyPin(pinInput.trim());
  };

  const fetchUsers = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`${API_URL}/api/admin/users`, {
        headers: { 
          'Authorization': `Bearer ${token}`,
          'x-admin-pin': adminPin
        }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal mengambil daftar pengguna');
      
      const userList = Array.isArray(data) ? data : [];
      setUsers(userList.filter(u => u.username && u.username !== 'global' && u.username !== 'anonim' && !u.username.startsWith('2026-')));
    } catch (err) {
      console.error('[ADMIN FETCH USERS ERROR]', err);
      setError(err.message || 'Gagal memuat data pengguna');
    } finally {
      setLoading(false);
    }
  };

  const fetchSessions = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`${API_URL}/api/admin/sessions`, {
        headers: { 
          'Authorization': `Bearer ${token}`,
          'x-admin-pin': adminPin
        }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal mengambil daftar perangkat aktif');
      
      setSessions(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('[ADMIN FETCH SESSIONS ERROR]', err);
      setError(err.message || 'Gagal memuat daftar perangkat aktif');
    } finally {
      setLoading(false);
    }
  };

  const handleKickSession = async (socketId, targetUsername) => {
    if (!window.confirm(`Yakin ingin MEMUTUSKAN/LOGOUT sesi ${targetUsername || socketId}?`)) return;
    try {
      const res = await fetch(`${API_URL}/api/admin/kick-session`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'x-admin-pin': adminPin,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ socketId, targetUsername })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal memutus sesi');

      alert(data.message || 'Sesi berhasil diputuskan!');
      fetchSessions();
    } catch (err) {
      alert(err.message);
    }
  };

  // Custom UI Ban Modal & Toast state
  const [banModalTarget, setBanModalTarget] = useState(null); // { username: string, type: 'temp' | 'perm' | 'unban' }
  const [banHours, setBanHours] = useState(24);
  const [banSubmitting, setBanSubmitting] = useState(false);
  const [adminToast, setAdminToast] = useState(null);

  // Auto hide toast after 4s
  useEffect(() => {
    if (adminToast) {
      const timer = setTimeout(() => setAdminToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [adminToast]);

  const openBanModal = (u, type) => {
    setBanModalTarget({ username: u.username, type });
    setBanHours(24);
  };

  const executeBanFromModal = async () => {
    if (!banModalTarget) return;
    const { username, type } = banModalTarget;
    setBanSubmitting(true);

    const isUnban = type === 'unban';
    const isTemp = type === 'temp';
    const banTypeStr = isTemp ? 'temporary' : (isUnban ? 'unban' : 'permanent');
    const newStatus = isUnban ? 'active' : (isTemp ? 'temp_banned' : 'permanently_banned');
    const newExpiresAt = isTemp ? new Date(Date.now() + banHours * 3600000).toISOString() : null;

    // Optimistically update UI immediately
    setUsers(prev => prev.map(u => {
      if (u.username.toLowerCase() === username.toLowerCase()) {
        return {
          ...u,
          banStatus: newStatus,
          banstatus: newStatus,
          banExpiresAt: newExpiresAt,
          banexpiresat: newExpiresAt
        };
      }
      return u;
    }));

    try {
      const activePin = adminPin || sessionStorage.getItem('admin_pin') || '123458';
      const endpoint = isUnban ? `${API_URL}/api/admin/unban` : `${API_URL}/api/admin/ban`;
      const payload = isUnban 
        ? { username, adminPin: activePin } 
        : { username, banType: banTypeStr, type: banTypeStr, durationHours: banHours, adminPin: activePin };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'x-admin-pin': activePin,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal memproses aksi admin');

      setAdminToast({ message: data.message || `Aksi ${type.toUpperCase()} pada ${username} berhasil!`, type: 'success' });
      setBanModalTarget(null);
      fetchUsers();
    } catch (err) {
      setAdminToast({ message: err.message || 'Gagal memproses aksi admin', type: 'error' });
      fetchUsers();
    } finally {
      setBanSubmitting(false);
    }
  };

  const handleClearGlobalChat = async () => {
    if (!window.confirm('Yakin ingin MENGHAPUS SEMUA pesan di Global Chat? Tindakan ini tidak bisa dibatalkan!')) return;
    try {
      const res = await fetch(`${API_URL}/api/admin/clear-global`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'x-admin-pin': adminPin || '123458'
        }
      });
      if (!res.ok) throw new Error('Gagal menghapus global chat');
      setAdminToast({ message: 'Global chat berhasil dibersihkan!', type: 'success' });
    } catch (err) {
      setAdminToast({ message: err.message || 'Gagal menghapus global chat', type: 'error' });
    }
  };

  // --- LOCK SCREEN (PIN + EYE ICON + CAPTCHA) ---
  if (!isPinVerified) {
    return (
      <div className="chat-area" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg-primary)', padding: '20px' }}>
        <div style={{
          backgroundColor: 'var(--bg-secondary)',
          padding: '35px 30px',
          borderRadius: '24px',
          border: '1px solid var(--border-color)',
          boxShadow: '0 16px 40px rgba(0,0,0,0.3)',
          maxWidth: '420px',
          width: '100%',
          position: 'relative'
        }}>
          {onBack && (
            <button 
              onClick={onBack}
              style={{
                position: 'absolute', top: '16px', left: '16px',
                background: 'none', border: 'none', color: 'var(--text-secondary)',
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px',
                fontSize: '13px', fontWeight: 'bold'
              }}
            >
              <ArrowLeft size={16} /> Kembali
            </button>
          )}

          <div style={{ textAlign: 'center', marginTop: onBack ? '10px' : '0' }}>
            <div style={{
              width: '64px', height: '64px', borderRadius: '50%',
              backgroundColor: 'rgba(37, 99, 235, 0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 16px auto', color: '#3b82f6'
            }}>
              <Lock size={30} />
            </div>

            <h2 style={{ margin: '0 0 6px 0', color: 'var(--text-primary)', fontSize: '22px' }}>Autentikasi Admin</h2>
            <p style={{ margin: '0 0 20px 0', color: 'var(--text-secondary)', fontSize: '13px' }}>
              Masukkan PIN Admin (123458) dan verifikasi Kode CAPTCHA.
            </p>

            {pinError && (
              <div style={{
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                color: '#ef4444',
                padding: '10px 14px',
                borderRadius: '10px',
                fontSize: '13px',
                marginBottom: '16px',
                fontWeight: 500
              }}>
                {pinError}
              </div>
            )}

            <form onSubmit={handlePinSubmit}>
              {/* PIN Input with Eye Toggle Icon */}
              <div style={{ position: 'relative', marginBottom: '16px' }}>
                <Key size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                <input 
                  type={showPin ? "text" : "password"} 
                  maxLength={6}
                  placeholder="PIN (123458)" 
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '12px 44px 12px 42px',
                    borderRadius: '12px',
                    border: '1px solid var(--border-color)',
                    backgroundColor: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    fontSize: '18px',
                    letterSpacing: showPin ? '2px' : '4px',
                    textAlign: 'center',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPin(!showPin)}
                  style={{
                    position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', color: 'var(--text-secondary)',
                    cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center'
                  }}
                  title={showPin ? "Sembunyikan PIN" : "Tampilkan PIN"}
                >
                  {showPin ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>

              {/* CAPTCHA Visual Box & Input */}
              <div style={{ 
                marginBottom: '20px',
                padding: '14px',
                borderRadius: '14px',
                backgroundColor: 'var(--bg-primary)',
                border: '1px solid var(--border-color)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>KODE CAPTCHA VERIFIKASI:</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{
                      backgroundColor: 'var(--bg-secondary)',
                      padding: '6px 14px',
                      borderRadius: '8px',
                      fontFamily: 'monospace, sans-serif',
                      fontSize: '20px',
                      fontWeight: 'bold',
                      letterSpacing: '5px',
                      color: 'var(--primary-color)',
                      border: '1px stroke var(--primary-color)',
                      userSelect: 'none',
                      background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.15), rgba(16, 185, 129, 0.15))',
                      transform: 'skewX(-10deg)',
                      display: 'inline-block'
                    }}>
                      {captchaCode}
                    </div>
                    <button
                      type="button"
                      onClick={generateCaptcha}
                      style={{
                        background: 'none', border: 'none', color: 'var(--text-secondary)',
                        cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center'
                      }}
                      title="Acak Uang Captcha"
                    >
                      <RefreshCw size={16} />
                    </button>
                  </div>
                </div>

                <input 
                  type="text"
                  maxLength={4}
                  placeholder="Ketik 4 karakter Captcha..."
                  value={captchaInput}
                  onChange={(e) => setCaptchaInput(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: '1px solid var(--border-color)',
                    backgroundColor: 'var(--bg-secondary)',
                    color: 'var(--text-primary)',
                    fontSize: '14px',
                    textAlign: 'center',
                    textTransform: 'uppercase',
                    outline: 'none',
                    letterSpacing: '2px',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <button 
                type="submit" 
                disabled={pinLoading}
                className="login-btn" 
                style={{ width: '100%', margin: 0, padding: '12px', fontWeight: 'bold' }}
              >
                {pinLoading ? 'Memverifikasi...' : 'Buka Panel Admin'}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  const filteredUsers = users.filter(u => (u.username || '').toLowerCase().includes(searchQuery.toLowerCase()));
  const filteredSessions = sessions.filter(s => (s.username || '').toLowerCase().includes(searchQuery.toLowerCase()) || (s.ip || '').includes(searchQuery) || (s.userAgent || '').toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="chat-area" style={{ display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-primary)', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div className="chat-header" style={{ justifyContent: 'space-between', padding: '15px 20px', borderBottom: '1px solid var(--border-color)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {onBack && (
            <button 
              onClick={onBack}
              style={{
                background: 'none', border: 'none', color: 'var(--text-primary)',
                cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '4px'
              }}
              title="Kembali ke Obrolan"
            >
              <ArrowLeft size={20} />
            </button>
          )}
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: 0, color: 'var(--primary-color)', fontSize: '20px' }}>
            <Shield size={24} /> Admin Security Dashboard
          </h2>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button 
            onClick={() => setActiveTab('users')}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '14px',
              backgroundColor: activeTab === 'users' ? 'var(--primary-color)' : 'var(--bg-secondary)',
              color: activeTab === 'users' ? 'white' : 'var(--text-primary)'
            }}
          >
            Pengguna ({users.length})
          </button>
          <button 
            onClick={() => setActiveTab('sessions')}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '14px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: activeTab === 'sessions' ? 'var(--primary-color)' : 'var(--bg-secondary)',
              color: activeTab === 'sessions' ? 'white' : 'var(--text-primary)'
            }}
          >
            <Monitor size={16} /> Sesi Perangkat ({sessions.length})
          </button>
          <button
            onClick={() => {
              sessionStorage.removeItem('admin_pin');
              setIsPinVerified(false);
            }}
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid var(--border-color)',
              backgroundColor: 'transparent',
              color: '#ef4444',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '13px'
            }}
            title="Kunci Kembali Panel Admin"
          >
            <Lock size={14} /> Lock
          </button>
        </div>
      </div>

      {/* Body Content */}
      <div style={{ padding: '20px', flex: 1, overflowY: 'auto' }}>
        {error && (
          <div style={{ color: '#ef4444', marginBottom: '20px', padding: '12px 16px', backgroundColor: 'rgba(239, 68, 68, 0.1)', borderRadius: '10px', fontSize: '14px' }}>
            ⚠️ {error}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px', gap: '15px', flexWrap: 'wrap' }}>
          <div className="search-input-wrapper" style={{ width: '300px', margin: 0 }}>
            <Search size={18} color="var(--text-secondary)" />
            <input 
              type="text" 
              placeholder={activeTab === 'users' ? "Cari username..." : "Cari username / IP..."} 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: '100%', backgroundColor: 'transparent', border: 'none', color: 'var(--text-primary)', outline: 'none' }}
            />
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button 
              className="login-btn" 
              onClick={handleClearGlobalChat} 
              style={{ width: 'auto', margin: 0, padding: '0 20px', backgroundColor: '#ef4444' }}
            >
              Clear Global Chat
            </button>
            <button className="login-btn" onClick={activeTab === 'users' ? fetchUsers : fetchSessions} style={{ width: 'auto', margin: 0, padding: '0 20px' }}>
              Refresh Data
            </button>
          </div>
        </div>

        {/* TAB 1: USERS LIST */}
        {activeTab === 'users' && (
          <div style={{ backgroundColor: 'var(--bg-secondary)', borderRadius: '14px', overflow: 'hidden', border: '1px solid var(--border-color)', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ backgroundColor: 'rgba(255, 255, 255, 0.04)', borderBottom: '1px solid var(--border-color)' }}>
                  <th style={{ padding: '14px 20px', color: 'var(--text-secondary)', fontWeight: 600 }}>ID</th>
                  <th style={{ padding: '14px 20px', color: 'var(--text-secondary)', fontWeight: 600 }}>Username</th>
                  <th style={{ padding: '14px 20px', color: 'var(--text-secondary)', fontWeight: 600 }}>Status Akun</th>
                  <th style={{ padding: '14px 20px', color: 'var(--text-secondary)', fontWeight: 600 }}>Masa Ban</th>
                  <th style={{ padding: '14px 20px', color: 'var(--text-secondary)', fontWeight: 600, textAlign: 'right' }}>Aksi Admin</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="5" style={{ padding: '30px', textAlign: 'center', color: 'var(--text-secondary)' }}>Memuat data pengguna...</td>
                  </tr>
                ) : filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan="5" style={{ padding: '30px', textAlign: 'center', color: 'var(--text-secondary)' }}>Tidak ada pengguna yang ditemukan.</td>
                  </tr>
                ) : (
                  filteredUsers.map(u => {
                    const isBanned = (u.banStatus || u.banstatus) === 'permanently_banned' || (u.banStatus || u.banstatus) === 'temp_banned';
                    const banStatusText = (u.banStatus || u.banstatus || 'active').toUpperCase();

                    return (
                      <tr key={u.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '14px 20px', color: 'var(--text-secondary)' }}>#{u.id}</td>
                        <td style={{ padding: '14px 20px', color: 'var(--text-primary)', fontWeight: 600 }}>
                          {u.username}
                        </td>
                        <td style={{ padding: '14px 20px' }}>
                          <span style={{
                            padding: '4px 10px',
                            borderRadius: '20px',
                            fontSize: '12px',
                            fontWeight: 'bold',
                            backgroundColor: !isBanned ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                            color: !isBanned ? '#10b981' : '#ef4444'
                          }}>
                            {!isBanned ? 'ACTIVE' : banStatusText}
                          </span>
                        </td>
                        <td style={{ padding: '14px 20px', color: 'var(--text-secondary)', fontSize: '13px' }}>
                          {(u.banExpiresAt || u.banexpiresat) ? new Date(u.banExpiresAt || u.banexpiresat).toLocaleString() : '-'}
                        </td>
                        <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            {isBanned ? (
                              <button 
                                onClick={() => openBanModal(u, 'unban')}
                                style={{ padding: '6px 14px', borderRadius: '8px', backgroundColor: '#10b981', color: 'white', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '13px', fontWeight: 'bold' }}
                              >
                                <ShieldOff size={14} /> Unban
                              </button>
                            ) : (
                              <>
                                <button 
                                  onClick={() => openBanModal(u, 'temp')}
                                  style={{ padding: '6px 12px', borderRadius: '8px', backgroundColor: '#f59e0b', color: 'white', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '13px', fontWeight: 'bold' }}
                                >
                                  <Clock size={14} /> Temp Ban
                                </button>
                                <button 
                                  onClick={() => openBanModal(u, 'perm')}
                                  style={{ padding: '6px 12px', borderRadius: '8px', backgroundColor: '#ef4444', color: 'white', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '13px', fontWeight: 'bold' }}
                                >
                                  <Trash2 size={14} /> Perm Ban
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* TAB 2: ACTIVE SESSIONS */}
        {activeTab === 'sessions' && (
          <div>
            <div style={{
              backgroundColor: 'rgba(59, 130, 246, 0.1)',
              border: '1px solid rgba(59, 130, 246, 0.2)',
              color: '#3b82f6',
              padding: '12px 16px',
              borderRadius: '10px',
              marginBottom: '16px',
              fontSize: '13px',
              lineHeight: '1.5'
            }}>
              💡 <strong>Manajemen Perangkat Akun Admin:</strong> Di bawah ini adalah daftar perangkat yang saat ini sedang terhubung ke akun Admin (<code>anonim</code>).
            </div>

            <div style={{ backgroundColor: 'var(--bg-secondary)', borderRadius: '14px', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ backgroundColor: 'rgba(255, 255, 255, 0.04)', borderBottom: '1px solid var(--border-color)' }}>
                    <th style={{ padding: '14px 20px', color: 'var(--text-secondary)', fontWeight: 600 }}>Akun</th>
                    <th style={{ padding: '14px 20px', color: 'var(--text-secondary)', fontWeight: 600 }}>IP Address</th>
                    <th style={{ padding: '14px 20px', color: 'var(--text-secondary)', fontWeight: 600 }}>Perangkat / Browser</th>
                    <th style={{ padding: '14px 20px', color: 'var(--text-secondary)', fontWeight: 600 }}>Waktu Terhubung</th>
                    <th style={{ padding: '14px 20px', color: 'var(--text-secondary)', fontWeight: 600, textAlign: 'right' }}>Aksi Remote</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan="5" style={{ padding: '30px', textAlign: 'center', color: 'var(--text-secondary)' }}>Memuat perangkat...</td>
                    </tr>
                  ) : filteredSessions.length === 0 ? (
                    <tr>
                      <td colSpan="5" style={{ padding: '30px', textAlign: 'center', color: 'var(--text-secondary)' }}>Tidak ada sesi perangkat yang aktif.</td>
                    </tr>
                  ) : (
                    filteredSessions.map((s, idx) => (
                      <tr key={s.socketId || idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '14px 20px', color: 'var(--text-primary)', fontWeight: 600 }}>
                          <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10b981', marginRight: '8px' }}></span>
                          {s.username} (Admin)
                        </td>
                        <td style={{ padding: '14px 20px', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                          {s.ip}
                        </td>
                        <td style={{ padding: '14px 20px', color: 'var(--text-secondary)', fontSize: '13px', maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={s.userAgent}>
                          {s.userAgent}
                        </td>
                        <td style={{ padding: '14px 20px', color: 'var(--text-secondary)', fontSize: '13px' }}>
                          {new Date(s.connectedAt).toLocaleTimeString()}
                        </td>
                        <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                          <button 
                            onClick={() => handleKickSession(s.socketId, s.username)}
                            style={{
                              padding: '6px 12px', borderRadius: '8px',
                              backgroundColor: '#ef4444', color: 'white',
                              border: 'none', cursor: 'pointer',
                              display: 'inline-flex', alignItems: 'center', gap: '5px',
                              fontSize: '13px', fontWeight: 'bold'
                            }}
                          >
                            <LogOut size={14} /> Kick Device
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* --- CUSTOM UI BAN / UNBAN MODAL DIALOG --- */}
      {banModalTarget && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '20px'
        }} onClick={() => !banSubmitting && setBanModalTarget(null)}>
          <div style={{
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: '20px',
            padding: '28px',
            maxWidth: '440px', width: '100%',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
            color: 'var(--text-primary)',
            position: 'relative'
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div style={{
                width: '44px', height: '44px', borderRadius: '12px',
                backgroundColor: banModalTarget.type === 'unban' ? 'rgba(16, 185, 129, 0.15)' : (banModalTarget.type === 'temp' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(239, 68, 68, 0.15)'),
                color: banModalTarget.type === 'unban' ? '#10b981' : (banModalTarget.type === 'temp' ? '#f59e0b' : '#ef4444'),
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                {banModalTarget.type === 'unban' ? <ShieldOff size={24} /> : (banModalTarget.type === 'temp' ? <Clock size={24} /> : <Trash2 size={24} />)}
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold' }}>
                  {banModalTarget.type === 'unban' ? 'Konfirmasi Unban User' : (banModalTarget.type === 'temp' ? 'Blokir Sementara (Temp Ban)' : 'Blokir Permanen (Perm Ban)')}
                </h3>
                <p style={{ margin: '2px 0 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
                  Target: <strong style={{ color: 'var(--primary-color)' }}>{banModalTarget.username}</strong>
                </p>
              </div>
            </div>

            {banModalTarget.type === 'temp' && (
              <div style={{ marginBottom: '20px', backgroundColor: 'var(--bg-primary)', padding: '16px', borderRadius: '14px', border: '1px solid var(--border-color)' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>
                  PILIH DURASI BLOKIR SEMENTARA (JAM):
                </label>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px' }}>
                  {[1, 6, 12, 24, 48, 168].map(hrs => (
                    <button
                      key={hrs}
                      type="button"
                      onClick={() => setBanHours(hrs)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '8px',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontWeight: 'bold',
                        backgroundColor: banHours === hrs ? 'var(--primary-color)' : 'var(--bg-secondary)',
                        color: banHours === hrs ? 'white' : 'var(--text-primary)'
                      }}
                    >
                      {hrs < 24 ? `${hrs} Jam` : `${hrs / 24} Hari`}
                    </button>
                  ))}
                </div>
                <input 
                  type="number"
                  min="1"
                  max="8760"
                  value={banHours}
                  onChange={(e) => setBanHours(Math.max(1, parseInt(e.target.value) || 1))}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: '1px solid var(--border-color)',
                    backgroundColor: 'var(--bg-secondary)',
                    color: 'var(--text-primary)',
                    fontSize: '15px',
                    fontWeight: 'bold',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
            )}

            {banModalTarget.type === 'perm' && (
              <div style={{ padding: '12px 14px', borderRadius: '10px', backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', fontSize: '13px', marginBottom: '20px', lineHeight: '1.5' }}>
                ⚠️ Akun <strong style={{ color: '#ef4444' }}>{banModalTarget.username}</strong> akan diblokir permanen dari sistem dan socket-nya akan langsung terputus seketika!
              </div>
            )}

            {banModalTarget.type === 'unban' && (
              <div style={{ padding: '12px 14px', borderRadius: '10px', backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#10b981', fontSize: '13px', marginBottom: '20px', lineHeight: '1.5' }}>
                Isi status blokir akan dipulihkan dan user <strong style={{ color: '#10b981' }}>{banModalTarget.username}</strong> dapat kembali login ke sistem.
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                disabled={banSubmitting}
                onClick={() => setBanModalTarget(null)}
                style={{
                  padding: '10px 18px',
                  borderRadius: '10px',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'transparent',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: '14px'
                }}
              >
                Batal
              </button>
              <button
                type="button"
                disabled={banSubmitting}
                onClick={executeBanFromModal}
                style={{
                  padding: '10px 20px',
                  borderRadius: '10px',
                  border: 'none',
                  backgroundColor: banModalTarget.type === 'unban' ? '#10b981' : (banModalTarget.type === 'temp' ? '#f59e0b' : '#ef4444'),
                  color: 'white',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  fontSize: '14px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
                }}
              >
                {banSubmitting ? 'Memproses...' : (banModalTarget.type === 'unban' ? 'Ya, Unban User' : 'Ya, Terapkan Ban')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- ADMIN TOAST NOTIFICATION --- */}
      {adminToast && (
        <div style={{
          position: 'fixed', top: '24px', right: '24px', zIndex: 10000,
          backgroundColor: adminToast.type === 'success' ? '#10b981' : '#ef4444',
          color: 'white',
          padding: '14px 20px',
          borderRadius: '12px',
          boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
          display: 'flex', alignItems: 'center', gap: '10px',
          fontSize: '14px', fontWeight: 'bold',
          animation: 'fadeIn 0.3s ease'
        }}>
          <CheckCircle size={18} />
          {adminToast.message}
        </div>
      )}
    </div>
  );
}

export default AdminDashboard;
