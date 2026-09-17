import React, { useState, useEffect } from 'react';
import { Shield, ShieldOff, Search, Clock, Trash2, Lock, Key, Monitor, LogOut } from 'lucide-react';
const API_URL = import.meta.env.VITE_BACKEND_URL || (import.meta.env.DEV ? 'http://localhost:3001' : '');

function AdminDashboard({ token }) {
  const [adminPin, setAdminPin] = useState(() => sessionStorage.getItem('admin_pin') || '');
  const [isPinVerified, setIsPinVerified] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinLoading, setPinLoading] = useState(false);

  const [activeTab, setActiveTab] = useState('users'); // 'users' or 'sessions'
  const [users, setUsers] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Auto verify PIN if saved in session
  useEffect(() => {
    if (adminPin) {
      verifyPin(adminPin);
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
    } finally {
      setPinLoading(false);
    }
  };

  const handlePinSubmit = (e) => {
    e.preventDefault();
    if (!pinInput.trim()) return setPinError('Masukkan 6-digit PIN Admin');
    verifyPin(pinInput.trim());
  };

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/api/admin/users`, {
        headers: { 
          'Authorization': `Bearer ${token}`,
          'x-admin-pin': adminPin
        }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch users');
      
      setUsers(data.filter(u => u.username !== 'global' && u.username !== 'anonim'));
      setError(null);
    } catch (err) {
      setError(err.message || 'Failed to fetch users');
    } finally {
      setLoading(false);
    }
  };

  const fetchSessions = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/api/admin/sessions`, {
        headers: { 
          'Authorization': `Bearer ${token}`,
          'x-admin-pin': adminPin
        }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch active sessions');
      
      setSessions(data);
      setError(null);
    } catch (err) {
      setError(err.message || 'Failed to fetch sessions');
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

  const handleBan = async (username, type) => {
    let durationHours = 24;
    if (type === 'temp') {
      const hours = prompt(`Berapa jam kamu ingin nge-ban ${username}?`, '24');
      if (hours === null) return;
      durationHours = parseFloat(hours) || 24;
    } else {
      if (!window.confirm(`Yakin ingin memblokir PERMANEN ${username}?`)) return;
    }

    try {
      const res = await fetch(`${API_URL}/api/admin/ban`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'x-admin-pin': adminPin,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, type, durationHours })
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to ban user');
      }
      fetchUsers();
    } catch (err) {
      alert(err.message || 'Failed to ban user');
    }
  };

  const handleUnban = async (username) => {
    if (!window.confirm(`Yakin ingin membuka blokir untuk ${username}?`)) return;
    try {
      const res = await fetch(`${API_URL}/api/admin/unban`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'x-admin-pin': adminPin,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username })
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to unban user');
      }
      fetchUsers();
    } catch (err) {
      alert(err.message || 'Failed to unban user');
    }
  };

  const handleClearGlobalChat = async () => {
    if (!window.confirm('Yakin ingin MENGHAPUS SEMUA pesan di Global Chat? Tindakan ini tidak bisa dibatalkan!')) return;
    try {
      const res = await fetch(`${API_URL}/api/admin/clear-global`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'x-admin-pin': adminPin
        }
      });
      if (!res.ok) throw new Error('Gagal menghapus global chat');
      alert('Global chat berhasil dihapus! (Pesan di layar user lain akan hilang setelah mereka refresh)');
    } catch (err) {
      alert(err.message);
    }
  };

  // If PIN is not verified, show PIN Lock Screen
  if (!isPinVerified) {
    return (
      <div className="chat-area" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg-primary)' }}>
        <div style={{
          backgroundColor: 'var(--bg-secondary)',
          padding: '40px',
          borderRadius: '20px',
          border: '1px solid var(--border-color)',
          boxShadow: '0 12px 32px rgba(0,0,0,0.3)',
          maxWidth: '400px',
          width: '90%',
          textAlign: 'center'
        }}>
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            backgroundColor: 'rgba(37, 99, 235, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 20px auto',
            color: '#3b82f6'
          }}>
            <Lock size={32} />
          </div>

          <h2 style={{ margin: '0 0 8px 0', color: 'var(--text-primary)' }}>Autentikasi Admin</h2>
          <p style={{ margin: '0 0 24px 0', color: 'var(--text-secondary)', fontSize: '14px' }}>
            Masukkan PIN Keamanan Admin 6-digit untuk membuka panel ini.
          </p>

          {pinError && (
            <div style={{
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              color: '#ef4444',
              padding: '10px 14px',
              borderRadius: '10px',
              fontSize: '13px',
              marginBottom: '20px',
              fontWeight: 500
            }}>
              {pinError}
            </div>
          )}

          <form onSubmit={handlePinSubmit}>
            <div style={{ position: 'relative', marginBottom: '20px' }}>
              <Key size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
              <input 
                type="password" 
                maxLength={6}
                placeholder="••••••" 
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px 14px 12px 42px',
                  borderRadius: '12px',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  fontSize: '18px',
                  letterSpacing: '4px',
                  textAlign: 'center',
                  outline: 'none'
                }}
                autoFocus
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
    );
  }

  const filteredUsers = users.filter(u => u.username.toLowerCase().includes(searchQuery.toLowerCase()));
  const filteredSessions = sessions.filter(s => s.username.toLowerCase().includes(searchQuery.toLowerCase()) || s.ip.includes(searchQuery) || s.userAgent.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="chat-area" style={{ display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-primary)' }}>
      <div className="chat-header" style={{ justifyContent: 'space-between', padding: '15px 20px' }}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: 0, color: 'var(--primary-color)', fontSize: '20px' }}>
          <Shield size={24} /> Admin Security Dashboard
        </h2>

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
            <Monitor size={16} /> Perangkat Admin ({sessions.length})
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

      <div style={{ padding: '20px', flex: 1, overflowY: 'auto' }}>
        {error && <div style={{ color: '#ef4444', marginBottom: '20px', padding: '10px', backgroundColor: 'rgba(239, 68, 68, 0.1)', borderRadius: '8px' }}>{error}</div>}

        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
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
          <div style={{ backgroundColor: 'var(--bg-secondary)', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ backgroundColor: 'rgba(255, 255, 255, 0.05)', borderBottom: '1px solid var(--border-color)' }}>
                  <th style={{ padding: '15px 20px', color: 'var(--text-secondary)', fontWeight: 600 }}>ID</th>
                  <th style={{ padding: '15px 20px', color: 'var(--text-secondary)', fontWeight: 600 }}>Username</th>
                  <th style={{ padding: '15px 20px', color: 'var(--text-secondary)', fontWeight: 600 }}>Status</th>
                  <th style={{ padding: '15px 20px', color: 'var(--text-secondary)', fontWeight: 600 }}>Ban Berakhir</th>
                  <th style={{ padding: '15px 20px', color: 'var(--text-secondary)', fontWeight: 600, textAlign: 'right' }}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="5" style={{ padding: '30px', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading users...</td>
                  </tr>
                ) : filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan="5" style={{ padding: '30px', textAlign: 'center', color: 'var(--text-secondary)' }}>Tidak ada user.</td>
                  </tr>
                ) : (
                  filteredUsers.map(u => (
                    <tr key={u.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '15px 20px', color: 'var(--text-secondary)' }}>#{u.id}</td>
                      <td style={{ padding: '15px 20px', color: 'var(--text-primary)', fontWeight: 500 }}>{u.username}</td>
                      <td style={{ padding: '15px 20px' }}>
                        <span style={{
                          padding: '4px 10px',
                          borderRadius: '20px',
                          fontSize: '12px',
                          fontWeight: 'bold',
                          backgroundColor: u.banStatus === 'active' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                          color: u.banStatus === 'active' ? '#10b981' : '#ef4444'
                        }}>
                          {u.banStatus.toUpperCase()}
                        </span>
                      </td>
                      <td style={{ padding: '15px 20px', color: 'var(--text-secondary)', fontSize: '13px' }}>
                        {u.banExpiresAt ? new Date(u.banExpiresAt).toLocaleString() : '-'}
                      </td>
                      <td style={{ padding: '15px 20px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                          {u.banStatus !== 'active' ? (
                            <button 
                              onClick={() => handleUnban(u.username)}
                              style={{ padding: '6px 12px', borderRadius: '6px', backgroundColor: '#10b981', color: 'white', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '13px', fontWeight: 'bold' }}
                            >
                              <ShieldOff size={14} /> Unban
                            </button>
                          ) : (
                            <>
                              <button 
                                onClick={() => handleBan(u.username, 'temp')}
                                style={{ padding: '6px 12px', borderRadius: '6px', backgroundColor: '#f59e0b', color: 'white', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '13px', fontWeight: 'bold' }}
                              >
                                <Clock size={14} /> Temp Ban
                              </button>
                              <button 
                                onClick={() => handleBan(u.username, 'perm')}
                                style={{ padding: '6px 12px', borderRadius: '6px', backgroundColor: '#ef4444', color: 'white', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '13px', fontWeight: 'bold' }}
                              >
                                <Trash2 size={14} /> Perm Ban
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* TAB 2: ACTIVE ONLINE SESSIONS FOR ADMIN */}
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
              💡 <strong>Manajemen Perangkat Akun Admin:</strong> Di bawah ini adalah daftar semua HP/Laptop/Browser yang saat ini sedang terhubung ke akun Admin (<code>anonim</code>). Jika ada perangkat asing yang tidak Anda kenali, klik <strong>Kick Device</strong> untuk memutus aksesnya secara langsung.
            </div>

            <div style={{ backgroundColor: 'var(--bg-secondary)', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ backgroundColor: 'rgba(255, 255, 255, 0.05)', borderBottom: '1px solid var(--border-color)' }}>
                    <th style={{ padding: '15px 20px', color: 'var(--text-secondary)', fontWeight: 600 }}>Akun</th>
                    <th style={{ padding: '15px 20px', color: 'var(--text-secondary)', fontWeight: 600 }}>IP Address</th>
                    <th style={{ padding: '15px 20px', color: 'var(--text-secondary)', fontWeight: 600 }}>Perangkat / Browser</th>
                    <th style={{ padding: '15px 20px', color: 'var(--text-secondary)', fontWeight: 600 }}>Waktu Konek</th>
                    <th style={{ padding: '15px 20px', color: 'var(--text-secondary)', fontWeight: 600, textAlign: 'right' }}>Aksi Remote</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan="5" style={{ padding: '30px', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading perangkat...</td>
                    </tr>
                  ) : filteredSessions.length === 0 ? (
                    <tr>
                      <td colSpan="5" style={{ padding: '30px', textAlign: 'center', color: 'var(--text-secondary)' }}>Tidak ada sesi perangkat Admin yang aktif.</td>
                    </tr>
                  ) : (
                    filteredSessions.map((s, idx) => (
                      <tr key={s.socketId || idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '15px 20px', color: 'var(--text-primary)', fontWeight: 600 }}>
                          <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10b981', marginRight: '8px' }}></span>
                          {s.username} (Admin)
                        </td>
                        <td style={{ padding: '15px 20px', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                          {s.ip}
                        </td>
                        <td style={{ padding: '15px 20px', color: 'var(--text-secondary)', fontSize: '13px', maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={s.userAgent}>
                          {s.userAgent}
                        </td>
                        <td style={{ padding: '15px 20px', color: 'var(--text-secondary)', fontSize: '13px' }}>
                          {new Date(s.connectedAt).toLocaleTimeString()}
                        </td>
                        <td style={{ padding: '15px 20px', textAlign: 'right' }}>
                          <button 
                            onClick={() => handleKickSession(s.socketId, s.username)}
                            style={{
                              padding: '6px 12px',
                              borderRadius: '6px',
                              backgroundColor: '#ef4444',
                              color: 'white',
                              border: 'none',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px',
                              fontSize: '13px',
                              fontWeight: 'bold'
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
    </div>
  );
}

export default AdminDashboard;
