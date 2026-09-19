import React, { useState, useEffect, useRef } from 'react';
import { Search, Loader, Image as ImageIcon } from 'lucide-react';

function PinterestSearch({ onClose, onSelectImage }) {
  const [query, setQuery] = useState('');
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  // Optional: columns based on window width for simple responsive masonry
  const [cols, setCols] = useState(3);

  // Track active search to prevent race conditions (initial load overwriting user search)
  const activeSearchId = useRef(0);

  useEffect(() => {
    const handleResize = () => {
      setCols(window.innerWidth < 600 ? 2 : window.innerWidth < 900 ? 3 : 4);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    
    // Initial fetch for trending/random
    handleSearch('aesthetic wallpaper');
    
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleSearch = async (searchQuery) => {
    if (!searchQuery.trim()) return;
    
    const currentSearchId = ++activeSearchId.current;
    
    setLoading(true);
    setError(null);
    setImages([]);

    try {
      const res = await fetch(`/api/images/search?q=${encodeURIComponent(searchQuery)}`);
      if (!res.ok) throw new Error('Gagal memuat gambar.');
      const data = await res.json();
      
      if (activeSearchId.current === currentSearchId) {
        if (data.images && data.images.length > 0) {
          setImages(data.images);
        } else {
          setError('Tidak ada gambar yang ditemukan.');
        }
      }
    } catch (err) {
      if (activeSearchId.current === currentSearchId) {
        console.error('Image search error:', err);
        setError('Gagal memuat gambar.');
      }
    } finally {
      if (activeSearchId.current === currentSearchId) {
        setLoading(false);
      }
    }
  };


  const onSubmit = (e) => {
    e.preventDefault();
    handleSearch(query);
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 200 }}>
      <div 
        className="modal-content" 
        onClick={e => e.stopPropagation()} 
        style={{ 
          width: '90%', 
          maxWidth: '1000px', 
          height: '85vh', 
          display: 'flex', 
          flexDirection: 'column',
          padding: 0,
          overflow: 'hidden',
          backgroundColor: 'var(--bg-primary)'
        }}
      >
        {/* Header */}
        <div style={{ 
          padding: '20px', 
          borderBottom: '1px solid var(--border-color)', 
          display: 'flex', 
          alignItems: 'center', 
          gap: '15px' 
        }}>
          <ImageIcon size={24} color="var(--primary-color)" />
          <h2 style={{ margin: 0, color: 'var(--text-primary)', flex: 1, fontSize: '20px' }}>Cari Gambar (Pinterest)</h2>
          <button className="modal-close" onClick={onClose} style={{ position: 'static' }}>✕</button>
        </div>
        
        {/* Search Bar */}
        <div style={{ padding: '20px', backgroundColor: 'var(--bg-secondary)' }}>
          <form onSubmit={onSubmit} style={{ display: 'flex', gap: '10px' }}>
            <div className="search-input-wrapper" style={{ flex: 1, margin: 0 }}>
              <Search size={18} color="var(--text-secondary)" />
              <input 
                type="text" 
                placeholder="Cari gambar estetika (contoh: sunset, cat, anime)..." 
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={{ width: '100%', backgroundColor: 'transparent', border: 'none', color: 'var(--text-primary)', outline: 'none' }}
              />
            </div>
            <button 
              type="submit" 
              style={{ 
                backgroundColor: '#e60023', // Pinterest Red
                color: 'white',
                border: 'none',
                borderRadius: '24px',
                padding: '0 24px',
                fontWeight: 'bold',
                cursor: 'pointer',
                transition: 'background-color 0.2s'
              }}
              onMouseOver={e => e.currentTarget.style.backgroundColor = '#ad081b'}
              onMouseOut={e => e.currentTarget.style.backgroundColor = '#e60023'}
            >
              Cari
            </button>
          </form>
        </div>

        {/* Results Grid */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px', backgroundColor: 'var(--bg-chat)' }}>
          {error && <div style={{ color: '#ef4444', textAlign: 'center', padding: '10px', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '8px' }}>{error}</div>}
          
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100px', color: 'var(--text-secondary)' }}>
              <Loader className="animate-spin" size={32} style={{ animation: 'spin 1s linear infinite' }} />
              <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
            </div>
          ) : (
            <div style={{ 
              columnCount: cols, 
              columnGap: '16px' 
            }}>
              {images.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-secondary)', marginTop: '40px', width: '100%' }}>
                  Tidak ada gambar yang ditemukan.
                </div>
              ) : (
                images.map(img => (
                  <div 
                    key={img.id} 
                    style={{ 
                      marginBottom: '16px', 
                      breakInside: 'avoid',
                      position: 'relative',
                      borderRadius: '16px',
                      overflow: 'hidden',
                      cursor: 'pointer',
                      boxShadow: '0 4px 10px rgba(0,0,0,0.1)',
                      backgroundColor: 'var(--bg-secondary)'
                    }}
                    onClick={() => {
                      if (window.confirm('Kirim gambar ini ke chat?')) {
                        onSelectImage(img.url);
                        onClose();
                      }
                    }}
                  >
                    <img 
                      src={img.thumb} 
                      alt="Result" 
                      style={{ width: '100%', display: 'block', transition: 'transform 0.3s' }}
                      onMouseOver={e => e.currentTarget.style.transform = 'scale(1.05)'}
                      onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}
                    />
                    <div style={{
                      position: 'absolute',
                      bottom: 0,
                      left: 0,
                      right: 0,
                      padding: '30px 15px 15px',
                      background: 'linear-gradient(transparent, rgba(0,0,0,0.8))',
                      color: 'white',
                      fontSize: '12px',
                      pointerEvents: 'none',
                      display: 'flex',
                      flexDirection: 'column'
                    }}>
                      <span style={{ fontWeight: 'bold' }}>{img.author}</span>
                      <span style={{ opacity: 0.8 }}>Pinterest</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default PinterestSearch;
