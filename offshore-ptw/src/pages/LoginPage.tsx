import React, { useState } from 'react';
import { usePermitStore } from '../store/permitStore';
import { User } from '../types';

interface LoginProps {
  onLoginSuccess: () => void;
}

const DEMO_USERS: User[] = [
  { id: '1', username: 'oim', fullName: 'Giàn Trưởng (OIM)', role: 'OIM', pinCode: '0001' },
  { id: '2', username: 'deputy', fullName: 'Giàn Phó', role: 'DEPUTY_OIM', pinCode: '0002' },
  { id: '3', username: 'fps', fullName: 'GS Sản Xuất (FPS)', role: 'FPS', pinCode: '0003' },
  { id: '4', username: 'supervisor', fullName: 'GS Trực Tiếp', role: 'LINE_SUP', pinCode: '0004' },
  { id: '5', username: 'worker', fullName: 'Nhân Viên', role: 'WORKER', pinCode: '0005' }
];

export const LoginPage: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  const login = usePermitStore(state => state.login);
  const [username, setUsername] = useState('');
  const [pinCode, setPinCode] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    const success = login(username, pinCode);
    if (success) {
      onLoginSuccess();
    } else {
      setError('Tên đăng nhập hoặc PIN không đúng');
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #1a237e 0%, #0d47a1 100%)',
      padding: '20px'
    }}>
      <div style={{
        background: 'white',
        borderRadius: '8px',
        padding: '40px',
        maxWidth: '400px',
        width: '100%',
        boxShadow: '0 10px 40px rgba(0,0,0,0.3)'
      }}>
        <h1 style={{ 
          margin: '0 0 10px 0', 
          color: '#1a237e',
          textAlign: 'center',
          fontSize: '24px'
        }}>
          🛢️ OFFSHORE PTW
        </h1>
        <p style={{ 
          margin: '0 0 30px 0', 
          color: '#666',
          textAlign: 'center',
          fontSize: '14px'
        }}>
          Hệ thống quản lý giấy phép làm việc
        </p>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '20px' }}>
            <label style={{ 
              display: 'block', 
              marginBottom: '8px',
              fontWeight: 'bold',
              color: '#333'
            }}>
              Tên đăng nhập
            </label>
            <select
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              style={{
                width: '100%',
                padding: '12px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '14px',
                boxSizing: 'border-box'
              }}
              required
            >
              <option value="">-- Chọn tài khoản demo --</option>
              {DEMO_USERS.map(user => (
                <option key={user.id} value={user.username}>
                  {user.fullName} ({user.username})
                </option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ 
              display: 'block', 
              marginBottom: '8px',
              fontWeight: 'bold',
              color: '#333'
            }}>
              Mã PIN
            </label>
            <input
              type="password"
              value={pinCode}
              onChange={(e) => setPinCode(e.target.value)}
              placeholder="Nhập mã PIN (ví dụ: 0001)"
              maxLength={4}
              style={{
                width: '100%',
                padding: '12px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '14px',
                boxSizing: 'border-box'
              }}
              required
            />
          </div>

          {error && (
            <div style={{
              background: '#ffebee',
              color: '#c62828',
              padding: '10px',
              borderRadius: '4px',
              marginBottom: '20px',
              fontSize: '14px'
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            style={{
              width: '100%',
              padding: '14px',
              background: '#1a237e',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              fontSize: '16px',
              fontWeight: 'bold',
              cursor: 'pointer',
              transition: 'background 0.3s'
            }}
            onMouseOver={(e) => e.currentTarget.style.background = '#0d47a1'}
            onMouseOut={(e) => e.currentTarget.style.background = '#1a237e'}
          >
            Đăng nhập
          </button>
        </form>

        <div style={{
          marginTop: '30px',
          padding: '15px',
          background: '#f5f5f5',
          borderRadius: '4px',
          fontSize: '12px'
        }}>
          <strong>Tài khoản demo:</strong>
          <ul style={{ margin: '10px 0 0 0', paddingLeft: '20px' }}>
            {DEMO_USERS.map(user => (
              <li key={user.id}>
                {user.username} / PIN: {user.pinCode} - {user.role}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};
