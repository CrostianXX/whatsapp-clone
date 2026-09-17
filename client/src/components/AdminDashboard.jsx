import React, { useState, useEffect } from 'react';
import { Shield, ShieldOff, Search, Clock, Trash2 } from 'lucide-react';
const API_URL = import.meta.env.VITE_BACKEND_URL || (import.meta.env.DEV ? 'http://localhost:3001' : '');

function AdminDashboard({ token }) {
  const [users, setUsers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchUsers();
  }, [token]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/api/admin/users`, {
        headers: { Authorization: `Bearer ${token}` }
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
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Gagal menghapus global chat');
      alert('Global chat berhasil dihapus! (Pesan di layar user lain akan hilang setelah mereka refresh)');
    } catch (err) {
      alert(err.message);
    }
  };

  const filteredUsers = users.filter(u => u.username.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="chat-area" style={{ display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-primary)' }}>
      <div className="chat-header" style={{ justifyContent: 'center' }}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: 0, color: 'var(--primary-color)' }}>
          <Shield size={24} /> Admin Dashboard
        </h2>
      </div>

      <div style={{ padding: '20px', flex: 1, overflowY: 'auto' }}>
        {error && <div style={{ color: '#ef4444', marginBottom: '20px', padding: '10px', backgroundColor: 'rgba(239, 68, 68, 0.1)', borderRadius: '8px' }}>{error}</div>}

        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div className="search-input-wrapper" style={{ width: '300px', margin: 0 }}>
            <Search size={18} color="var(--text-secondary)" />
            <input 
              type="text" 
              placeholder="Cari user..." 
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
            <button className="login-btn" onClick={fetchUsers} style={{ width: 'auto', margin: 0, padding: '0 20px' }}>
              Refresh Data
            </button>
          </div>
        </div>

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
      </div>
    </div>
  );
}

export default AdminDashboard;
