import React, { useState } from 'react';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { PermitFormPage } from './pages/PermitFormPage';
import { usePermitStore } from './store/permitStore';

function App() {
  const currentUser = usePermitStore(state => state.currentUser);
  const logout = usePermitStore(state => state.logout);
  const [currentPage, setCurrentPage] = useState<'dashboard' | 'create' | 'list'>('dashboard');

  if (!currentUser) {
    return <LoginPage onLoginSuccess={() => {}} />;
  }

  const canCreatePermit = ['LINE_SUP', 'FPS', 'DEPUTY_OIM', 'OIM'].includes(currentUser.role);

  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f5' }}>
      {/* Navigation Bar */}
      <nav style={{
        background: '#1a237e',
        color: 'white',
        padding: '0 20px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        height: '60px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div style={{ fontWeight: 'bold', fontSize: '20px' }}>🛢️ OFFSHORE PTW</div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={() => setCurrentPage('dashboard')}
              style={{
                padding: '8px 16px',
                background: currentPage === 'dashboard' ? 'rgba(255,255,255,0.2)' : 'transparent',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              📊 Dashboard
            </button>
            {canCreatePermit && (
              <button
                onClick={() => setCurrentPage('create')}
                style={{
                  padding: '8px 16px',
                  background: currentPage === 'create' ? 'rgba(255,255,255,0.2)' : 'transparent',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                ➕ Tạo PTW
              </button>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <span style={{ fontSize: '14px' }}>
            {currentUser.fullName} ({currentUser.role})
          </span>
          <button
            onClick={logout}
            style={{
              padding: '8px 16px',
              background: 'rgba(255,255,255,0.2)',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Đăng xuất
          </button>
        </div>
      </nav>

      {/* Main Content */}
      <main>
        {currentPage === 'dashboard' && <DashboardPage />}
        {currentPage === 'create' && <PermitFormPage />}
      </main>
    </div>
  );
}

export default App;
