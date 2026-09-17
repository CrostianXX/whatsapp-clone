import { useState } from 'react';
import { generateKeyPair, exportPublicKey, exportPrivateKey } from '../utils/crypto';
import { Eye, EyeOff } from 'lucide-react';

const API_URL = "";

function Login({ onLoginSuccess, onLogin, theme, toggleTheme, language, toggleLanguage, t }) {
  const [isRegistering, setIsRegistering] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  // Backward compatibility in case onLoginSuccess is passed instead of onLogin
  const loginCallback = onLogin || onLoginSuccess;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError(t('enterUser'));
      return;
    }
    
    setLoading(true);
    setError('');

    try {
      if (isRegistering) {
        // Generate RSA key pair for E2EE
        const keyPair = await generateKeyPair();
        const exportedPublicKey = await exportPublicKey(keyPair.publicKey);
        const exportedPrivateKey = await exportPrivateKey(keyPair.privateKey);
        
        const response = await fetch(API_URL + '/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username,
            password,
            publicKey: exportedPublicKey
          })
        });

        const data = await response.json();
        
        if (response.ok) {
          // Store the private key securely in localStorage
          localStorage.setItem(`privateKey_${username}`, exportedPrivateKey);
          localStorage.setItem(`wa_token`, data.token);
          localStorage.setItem(`wa_username`, data.username);
          loginCallback(data.username, data.token);
        } else {
          setError(data.error);
        }
      } else {
        const response = await fetch(API_URL + '/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });

        const data = await response.json();
        
        if (response.ok) {
          // Check if private key exists on this device
          const privateKeyStr = localStorage.getItem(`privateKey_${username}`);
          if (!privateKeyStr) {
            setError(language === 'id' ? "Kunci privat (Private Key) tidak ditemukan di browser ini. Anda tidak bisa login ke akun ini dari perangkat/browser baru karena enkripsi E2EE." : "Private key not found in this browser. You cannot login to this E2EE account from a new device/browser.");
            setLoading(false);
            return;
          }
          localStorage.setItem(`wa_token`, data.token);
          localStorage.setItem(`wa_username`, data.username);
          loginCallback(data.username, data.token);
        } else {
          setError(data.message || data.error);
        }
      }
    } catch (err) {
      console.error(err);
      setError('Connection failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Theme Toggle for Login Screen */}
      <button 
        onClick={toggleTheme} 
        style={{
          position: 'absolute', 
          top: '20px', 
          right: '80px', 
          background: 'var(--bg-glass)',
          border: '1px solid var(--border-color)',
          color: 'var(--text-primary)',
          padding: '10px',
          borderRadius: '12px',
          cursor: 'pointer',
          zIndex: 100,
          backdropFilter: 'blur(10px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
        }}
        title="Toggle Theme"
      >
        {theme === 'dark' ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>
        )}
      </button>

      {/* Language Toggle for Login Screen */}
      <button 
        onClick={toggleLanguage} 
        style={{
          position: 'absolute', 
          top: '20px', 
          right: '20px', 
          background: 'var(--bg-glass)',
          border: '1px solid var(--border-color)',
          color: 'var(--text-primary)',
          padding: '10px 15px',
          borderRadius: '12px',
          cursor: 'pointer',
          zIndex: 100,
          backdropFilter: 'blur(10px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          fontWeight: 'bold',
          fontSize: '14px'
        }}
        title="Toggle Language"
      >
        {language === 'en' ? 'EN' : 'ID'}
      </button>

      <div className="split-login-card">
        {/* LEFT PANEL - INFO */}
        <div className="split-left">
          <div className="split-left-content">
            <h1 className="hero-title">
              {t('heroTitle1')}<br/>
              {t('heroTitle2')}<br/>
              <span className="hero-highlight">{t('heroTitle3')}</span>
            </h1>
            <p className="hero-subtitle">
              {t('heroDesc')}
            </p>
            
            <div className="feature-list">
              <div className="feature-item">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
                <span>{t('feat1')}</span>
              </div>
              <div className="feature-item">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle><line x1="1" y1="1" x2="23" y2="23"></line></svg>
                <span>{t('feat2')}</span>
              </div>
              <div className="feature-item">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
                <span>{t('feat3')}</span>
              </div>
            </div>
            
            <div className="typing-cursor">_</div>
          </div>
        </div>

        {/* RIGHT PANEL - FORM */}
        <div className="split-right">
          <div className="split-right-content">
            <div className="brand-header">
              <div className="brand-logo" style={{ overflow: 'hidden', padding: 0, background: 'transparent' }}>
                <img src="/logo.png" alt="Platform Logo" style={{width: '100%', height: '100%', objectFit: 'cover'}} />
              </div>
              <span className="brand-name">SecureChat</span>
            </div>
            
            <div className="form-header">
              <h2>{isRegistering ? t('createAcc') : t('welcomeBack')}</h2>
              <p>{isRegistering ? t('signupDesc') : t('loginDesc')}</p>
            </div>
            
            {error && (
              <div className="form-error">
                {error}
              </div>
            )}
            
            <form onSubmit={handleSubmit} className="split-form">
              <div className="split-input-group">
                <label>{t('username')}</label>
                <div className="input-wrapper">
                  <svg className="input-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                  <input
                    type="text"
                    placeholder={t('enterUser')}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoFocus
                  />
                </div>
              </div>
              
              <div className="split-input-group">
                <label>{t('password')}</label>
                <div className="input-wrapper" style={{ position: 'relative' }}>
                  <svg className="input-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    style={{ width: '100%', paddingRight: '40px' }}
                  />
                  <button 
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{
                      position: 'absolute',
                      right: '10px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--text-secondary)',
                      padding: '4px'
                    }}
                    title={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
              
              <button type="submit" className="split-submit-btn" disabled={loading}>
                {loading ? t('processing') : (isRegistering ? t('signupBtn') : t('loginBtn'))}
              </button>
            </form>
            
            <div className="split-footer">
              {isRegistering ? t('alreadyAcc') : t('noAcc')}{" "}
              <span onClick={() => setIsRegistering(!isRegistering)}>
                {isRegistering ? t('loginBtn') : t('signupBtn')}
              </span>
            </div>
            
            {isRegistering && (
              <div className="local-key-notice">
                {t('localKeyNotice')}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export default Login;
