import React, { useState } from 'react';
import { usePermitStore } from '../store/permitStore';
import { PermitStatus, Role } from '../types';
import { QRCodeSVG } from 'qrcode.react';

const STATUS_LABELS: Record<PermitStatus, string> = {
  DRAFT: 'Nháp',
  SUBMITTED: 'Đã gửi',
  VERIFIED_ISOLATED: 'Đã xác nhận & Cô lập',
  REVIEWED: 'Đã rà soát',
  ISSUED: 'Đã phê duyệt',
  SUSPENDED: 'Đình chỉ',
  REVALIDATED: 'Gia hạn',
  CLOSED_OUT: 'Đã đóng'
};

const TYPE_COLORS: Record<string, string> = {
  HOT_WORK: '#d32f2f',
  COLD_WORK: '#388e3c',
  CONFINED_SPACE: '#fbc02d',
  RADIOGRAPHY: '#7b1fa2',
  ELECTRICAL: '#1976d2'
};

export const DashboardPage: React.FC = () => {
  const permits = usePermitStore(state => state.permits);
  const currentUser = usePermitStore(state => state.currentUser);
  const selectPermit = usePermitStore(state => state.selectPermit);
  const approvePermit = usePermitStore(state => state.approvePermit);
  const verifyPermit = usePermitStore(state => state.verifyPermit);
  const closePermit = usePermitStore(state => state.closePermit);
  const getPendingApprovals = usePermitStore(state => state.getPendingApprovals);

  const [selectedDeck, setSelectedDeck] = useState<string | null>(null);
  const [selectedPermitForDetail, setSelectedPermitForDetail] = useState<any>(null);
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [approveAction, setApproveAction] = useState<'APPROVE' | 'REJECT'>('APPROVE');
  const [approveComment, setApproveComment] = useState('');
  const [approvePin, setApprovePin] = useState('');
  const [currentApprovePermit, setCurrentApprovePermit] = useState<any>(null);

  const activeStatuses: PermitStatus[] = ['SUBMITTED', 'VERIFIED_ISOLATED', 'REVIEWED', 'ISSUED', 'REVALIDATED'];
  const activePermits = permits.filter(p => activeStatuses.includes(p.status));

  const stats = {
    pending: permits.filter(p => p.status === 'SUBMITTED').length,
    active: activePermits.length,
    closed: permits.filter(p => p.status === 'CLOSED_OUT').length,
    expired: permits.filter(p => new Date(p.endTime) < new Date() && p.status !== 'CLOSED_OUT').length
  };

  const pendingApprovals = currentUser ? getPendingApprovals(currentUser.role) : [];

  const decks = ['Upper Deck', 'Main Deck', 'Cellar Deck', 'Drill Floor'];

  const handleApproveClick = (permit: any, action: 'APPROVE' | 'REJECT') => {
    setCurrentApprovePermit(permit);
    setApproveAction(action);
    setApproveComment('');
    setApprovePin('');
    setShowApproveModal(true);
  };

  const handleApproveConfirm = () => {
    if (!currentApprovePermit || !currentUser) return;
    
    const success = approvePermit(currentApprovePermit.id, approveAction, approveComment, approvePin);
    if (success) {
      alert(`Đã ${approveAction === 'APPROVE' ? 'phê duyệt' : 'từ chối'} thành công!`);
      setShowApproveModal(false);
    }
  };

  const handleVerify = (permit: any) => {
    const pin = prompt('Nhập PIN để xác nhận (FPS only):');
    if (pin && verifyPermit(permit.id, pin)) {
      alert('Đã xác nhận PTW thành công!');
    }
  };

  const handleClose = (permit: any) => {
    const pin = prompt('Nhập PIN để đóng PTW:');
    if (pin && closePermit(permit.id, pin)) {
      alert('Đã đóng PTW thành công!');
    }
  };

  return (
    <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '20px'
      }}>
        <h1 style={{ margin: 0, color: '#1a237e' }}>📊 Dashboard - Command Center</h1>
        <div style={{ fontSize: '14px', color: '#666' }}>
          Xin chào, <strong>{currentUser?.fullName}</strong> ({currentUser?.role})
        </div>
      </div>

      {/* KPI Stats */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(4, 1fr)', 
        gap: '16px',
        marginBottom: '24px'
      }}>
        <div style={{
          background: 'linear-gradient(135deg, #ff9800, #f57c00)',
          color: 'white',
          padding: '20px',
          borderRadius: '8px',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '32px', fontWeight: 'bold' }}>{stats.pending}</div>
          <div style={{ fontSize: '14px', opacity: 0.9 }}>Chờ phê duyệt</div>
        </div>
        <div style={{
          background: 'linear-gradient(135deg, #2196f3, #1976d2)',
          color: 'white',
          padding: '20px',
          borderRadius: '8px',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '32px', fontWeight: 'bold' }}>{stats.active}</div>
          <div style={{ fontSize: '14px', opacity: 0.9 }}>Đang hoạt động</div>
        </div>
        <div style={{
          background: 'linear-gradient(135deg, #4caf50, #388e3c)',
          color: 'white',
          padding: '20px',
          borderRadius: '8px',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '32px', fontWeight: 'bold' }}>{stats.closed}</div>
          <div style={{ fontSize: '14px', opacity: 0.9 }}>Đã đóng</div>
        </div>
        <div style={{
          background: 'linear-gradient(135deg, #f44336, #d32f2f)',
          color: 'white',
          padding: '20px',
          borderRadius: '8px',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '32px', fontWeight: 'bold' }}>{stats.expired}</div>
          <div style={{ fontSize: '14px', opacity: 0.9 }}>Quá hạn</div>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 400px', gap: '20px' }}>
        {/* Left: Deck Map & Permits List */}
        <div>
          {/* Deck Map */}
          <div style={{
            background: 'white',
            padding: '20px',
            borderRadius: '8px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            marginBottom: '20px'
          }}>
            <h3 style={{ marginTop: 0 }}>🗺️ Bản đồ giàn khoan (Live Deck Map)</h3>
            <p style={{ fontSize: '13px', color: '#666', marginBottom: '16px' }}>
              Nhấn vào khu vực để xem PTW đang hoạt động
            </p>
            
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(2, 1fr)', 
              gap: '16px' 
            }}>
              {decks.map(deck => {
                const deckPermits = activePermits.filter(p => p.deck === deck);
                const hotWorkCount = deckPermits.filter(p => p.type === 'HOT_WORK').length;
                const coldWorkCount = deckPermits.filter(p => p.type === 'COLD_WORK').length;
                const confinedCount = deckPermits.filter(p => p.type === 'CONFINED_SPACE').length;
                
                return (
                  <div
                    key={deck}
                    onClick={() => setSelectedDeck(selectedDeck === deck ? null : deck)}
                    style={{
                      padding: '20px',
                      border: `2px solid ${selectedDeck === deck ? '#1a237e' : '#e0e0e0'}`,
                      borderRadius: '8px',
                      cursor: 'pointer',
                      background: selectedDeck === deck ? '#e8eaf6' : 'white',
                      transition: 'all 0.3s'
                    }}
                  >
                    <div style={{ fontWeight: 'bold', marginBottom: '10px' }}>{deck}</div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {hotWorkCount > 0 && (
                        <span style={{
                          padding: '4px 8px',
                          background: '#ffebee',
                          color: '#d32f2f',
                          borderRadius: '4px',
                          fontSize: '12px',
                          fontWeight: 'bold'
                        }}>
                          🔴 {hotWorkCount} Hot Work
                        </span>
                      )}
                      {coldWorkCount > 0 && (
                        <span style={{
                          padding: '4px 8px',
                          background: '#e8f5e9',
                          color: '#388e3c',
                          borderRadius: '4px',
                          fontSize: '12px',
                          fontWeight: 'bold'
                        }}>
                          🟢 {coldWorkCount} Cold Work
                        </span>
                      )}
                      {confinedCount > 0 && (
                        <span style={{
                          padding: '4px 8px',
                          background: '#fff3e0',
                          color: '#fbc02d',
                          borderRadius: '4px',
                          fontSize: '12px',
                          fontWeight: 'bold'
                        }}>
                          🟡 {confinedCount} Confined Space
                        </span>
                      )}
                      {deckPermits.length === 0 && (
                        <span style={{ color: '#999', fontSize: '12px' }}>Không có PTW</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {selectedDeck && (
              <div style={{
                marginTop: '16px',
                padding: '16px',
                background: '#f5f5f5',
                borderRadius: '4px'
              }}>
                <h4 style={{ margin: '0 0 10px 0' }}>PTW đang hoạt động tại {selectedDeck}</h4>
                {activePermits.filter(p => p.deck === selectedDeck).map(permit => (
                  <div
                    key={permit.id}
                    onClick={() => setSelectedPermitForDetail(permit)}
                    style={{
                      padding: '10px',
                      background: 'white',
                      borderRadius: '4px',
                      marginBottom: '8px',
                      cursor: 'pointer',
                      borderLeft: `4px solid ${TYPE_COLORS[permit.type] || '#999'}`
                    }}
                  >
                    <div style={{ fontWeight: 'bold' }}>{permit.permitNumber}</div>
                    <div style={{ fontSize: '13px', color: '#666' }}>{permit.title}</div>
                    <div style={{ fontSize: '12px', color: '#999' }}>
                      Trạng thái: {STATUS_LABELS[permit.status]}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Pending Approvals Queue */}
          {pendingApprovals.length > 0 && (
            <div style={{
              background: 'white',
              padding: '20px',
              borderRadius: '8px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
            }}>
              <h3 style={{ marginTop: 0 }}>⏳ Danh sách chờ duyệt ({pendingApprovals.length})</h3>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#1a237e', color: 'white' }}>
                    <th style={{ padding: '12px', textAlign: 'left' }}>Số PTW</th>
                    <th style={{ padding: '12px', textAlign: 'left' }}>Công việc</th>
                    <th style={{ padding: '12px', textAlign: 'left' }}>Loại</th>
                    <th style={{ padding: '12px', textAlign: 'left' }}>Khu vực</th>
                    <th style={{ padding: '12px', textAlign: 'center' }}>Hành động</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingApprovals.map((permit, idx) => (
                    <tr key={permit.id} style={{ background: idx % 2 === 0 ? '#f5f5f5' : 'white' }}>
                      <td style={{ padding: '12px', fontWeight: 'bold' }}>{permit.permitNumber}</td>
                      <td style={{ padding: '12px' }}>{permit.title}</td>
                      <td style={{ padding: '12px' }}>
                        <span style={{
                          padding: '4px 8px',
                          background: TYPE_COLORS[permit.type],
                          color: 'white',
                          borderRadius: '4px',
                          fontSize: '12px'
                        }}>
                          {permit.type}
                        </span>
                      </td>
                      <td style={{ padding: '12px' }}>{permit.deck}</td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        <button
                          onClick={() => handleApproveClick(permit, 'APPROVE')}
                          style={{
                            marginRight: '8px',
                            padding: '6px 12px',
                            background: '#4caf50',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '12px'
                          }}
                        >
                          ✓ Phê duyệt
                        </button>
                        <button
                          onClick={() => handleApproveClick(permit, 'REJECT')}
                          style={{
                            padding: '6px 12px',
                            background: '#f44336',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '12px'
                          }}
                        >
                          ✗ Từ chối
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* All Permits List */}
          <div style={{
            background: 'white',
            padding: '20px',
            borderRadius: '8px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            marginTop: '20px'
          }}>
            <h3 style={{ marginTop: 0 }}>📋 Tất cả PTW ({permits.length})</h3>
            <div style={{ display: 'grid', gap: '10px' }}>
              {permits.slice().reverse().map((permit, idx) => (
                <div
                  key={permit.id}
                  onClick={() => setSelectedPermitForDetail(permit)}
                  style={{
                    padding: '16px',
                    background: '#f5f5f5',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 'bold', color: '#1a237e' }}>{permit.permitNumber}</div>
                    <div style={{ fontSize: '14px', color: '#666' }}>{permit.title}</div>
                    <div style={{ fontSize: '12px', color: '#999' }}>
                      {permit.location} • {permit.deck}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{
                      padding: '6px 12px',
                      background: permit.status === 'ISSUED' ? '#e8f5e9' : 
                                 permit.status === 'CLOSED_OUT' ? '#e0e0e0' : '#fff3e0',
                      color: permit.status === 'ISSUED' ? '#2e7d32' : 
                             permit.status === 'CLOSED_OUT' ? '#616161' : '#ef6c00',
                      borderRadius: '4px',
                      fontSize: '12px',
                      fontWeight: 'bold'
                    }}>
                      {STATUS_LABELS[permit.status]}
                    </span>
                    <div style={{ fontSize: '11px', color: '#999', marginTop: '4px' }}>
                      {new Date(permit.createdAt).toLocaleDateString('vi-VN')}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Permit Detail Panel */}
        <div>
          {selectedPermitForDetail ? (
            <div style={{
              background: 'white',
              padding: '20px',
              borderRadius: '8px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              position: 'sticky',
              top: '20px'
            }}>
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '16px'
              }}>
                <h3 style={{ margin: 0 }}>{selectedPermitForDetail.permitNumber}</h3>
                <button
                  onClick={() => setSelectedPermitForDetail(null)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    fontSize: '20px',
                    cursor: 'pointer'
                  }}
                >
                  ✕
                </button>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <strong>Trạng thái:</strong>
                <span style={{
                  marginLeft: '8px',
                  padding: '4px 8px',
                  background: selectedPermitForDetail.status === 'ISSUED' ? '#e8f5e9' : 
                             selectedPermitForDetail.status === 'CLOSED_OUT' ? '#e0e0e0' : '#fff3e0',
                  color: selectedPermitForDetail.status === 'ISSUED' ? '#2e7d32' : 
                         selectedPermitForDetail.status === 'CLOSED_OUT' ? '#616161' : '#ef6c00',
                  borderRadius: '4px',
                  fontSize: '12px',
                  fontWeight: 'bold'
                }}>
                  {STATUS_LABELS[selectedPermitForDetail.status as keyof typeof STATUS_LABELS]}
                </span>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <strong>Công việc:</strong> {selectedPermitForDetail.title}
              </div>
              <div style={{ marginBottom: '16px' }}>
                <strong>Loại:</strong> 
                <span style={{
                  marginLeft: '8px',
                  padding: '4px 8px',
                  background: TYPE_COLORS[selectedPermitForDetail.type],
                  color: 'white',
                  borderRadius: '4px',
                  fontSize: '12px'
                }}>
                  {selectedPermitForDetail.type}
                </span>
              </div>
              <div style={{ marginBottom: '16px' }}>
                <strong>Vị trí:</strong> {selectedPermitForDetail.location}
              </div>
              <div style={{ marginBottom: '16px' }}>
                <strong>Khu vực:</strong> {selectedPermitForDetail.deck}
              </div>
              <div style={{ marginBottom: '16px' }}>
                <strong>Thời gian:</strong><br/>
                Bắt đầu: {new Date(selectedPermitForDetail.startTime).toLocaleString('vi-VN')}<br/>
                Kết thúc: {new Date(selectedPermitForDetail.endTime).toLocaleString('vi-VN')}
              </div>

              {selectedPermitForDetail.jsaData?.length > 0 && (
                <div style={{ marginBottom: '16px' }}>
                  <strong>JSA ({selectedPermitForDetail.jsaData.length} mục):</strong>
                  <ul style={{ margin: '8px 0', paddingLeft: '20px' }}>
                    {selectedPermitForDetail.jsaData.map((item: any) => (
                      <li key={item.id} style={{ fontSize: '13px' }}>
                        {item.hazard} - <span style={{
                          color: item.riskLevel === 'HIGH' ? '#d32f2f' : 
                                 item.riskLevel === 'MEDIUM' ? '#f57c00' : '#388e3c'
                        }}>{item.riskLevel}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {selectedPermitForDetail.approvals?.length > 0 && (
                <div style={{ marginBottom: '16px' }}>
                  <strong>Lịch sử phê duyệt:</strong>
                  <div style={{ marginTop: '8px' }}>
                    {selectedPermitForDetail.approvals.map((approval: any, idx: number) => (
                      <div key={approval.id} style={{
                        padding: '8px',
                        background: '#f5f5f5',
                        borderRadius: '4px',
                        marginBottom: '8px',
                        fontSize: '12px'
                      }}>
                        <div><strong>{approval.action}</strong> bởi {approval.approverRole}</div>
                        <div>{new Date(approval.timestamp).toLocaleString('vi-VN')}</div>
                        {approval.comment && <div style={{ color: '#666' }}>"{approval.comment}"</div>}
                        <div style={{ fontFamily: 'monospace', fontSize: '10px', color: '#999', marginTop: '4px' }}>
                          Hash: {approval.signatureHash.substring(0, 32)}...
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* QR Code for Digital Signature */}
              <div style={{
                padding: '16px',
                background: '#f5f5f5',
                borderRadius: '4px',
                textAlign: 'center',
                marginBottom: '16px'
              }}>
                <strong>Chữ ký số (QR Code)</strong>
                <div style={{ marginTop: '10px' }}>
                  <QRCodeSVG
                    value={`${selectedPermitForDetail.permitNumber}|${selectedPermitForDetail.status}|${selectedPermitForDetail.id}`}
                    size={100}
                  />
                </div>
                <div style={{ fontSize: '10px', color: '#999', marginTop: '8px' }}>
                  Quét để xác thực PTW
                </div>
              </div>

              {/* Action Buttons */}
              {selectedPermitForDetail.status === 'SUBMITTED' && currentUser?.role === 'FPS' && (
                <button
                  onClick={() => handleVerify(selectedPermitForDetail)}
                  style={{
                    width: '100%',
                    padding: '12px',
                    background: '#ff9800',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                    marginBottom: '8px'
                  }}
                >
                  🔒 Xác nhận & Cô lập (FPS)
                </button>
              )}

              {selectedPermitForDetail.status === 'ISSUED' && (
                <button
                  onClick={() => handleClose(selectedPermitForDetail)}
                  style={{
                    width: '100%',
                    padding: '12px',
                    background: '#4caf50',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontWeight: 'bold'
                  }}
                >
                  ✓ Đóng/Hoàn thành PTW
                </button>
              )}
            </div>
          ) : (
            <div style={{
              background: '#f5f5f5',
              padding: '40px',
              borderRadius: '8px',
              textAlign: 'center',
              color: '#999'
            }}>
              <div style={{ fontSize: '48px', marginBottom: '10px' }}>📋</div>
              <div>Chọn một PTW để xem chi tiết</div>
            </div>
          )}
        </div>
      </div>

      {/* Approve Modal */}
      {showApproveModal && currentApprovePermit && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: 'white',
            padding: '30px',
            borderRadius: '8px',
            maxWidth: '400px',
            width: '100%'
          }}>
            <h3 style={{ marginTop: 0 }}>
              {approveAction === 'APPROVE' ? '✓ Phê duyệt PTW' : '✗ Từ chối PTW'}
            </h3>
            <p><strong>{currentApprovePermit.permitNumber}</strong></p>
            <p>{currentApprovePermit.title}</p>
            
            {approveAction === 'REJECT' && (
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
                  Lý do từ chối *
                </label>
                <textarea
                  value={approveComment}
                  onChange={(e) => setApproveComment(e.target.value)}
                  placeholder="Nhập lý do từ chối"
                  rows={4}
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '4px',
                    border: '1px solid #ddd',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
            )}

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
                Nhập PIN xác thực *
              </label>
              <input
                type="password"
                value={approvePin}
                onChange={(e) => setApprovePin(e.target.value)}
                maxLength={4}
                placeholder="Nhập PIN"
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: '4px',
                  border: '1px solid #ddd',
                  fontSize: '18px',
                  textAlign: 'center',
                  boxSizing: 'border-box'
                }}
                autoFocus
              />
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => {
                  setShowApproveModal(false);
                  setCurrentApprovePermit(null);
                }}
                style={{
                  flex: 1,
                  padding: '12px',
                  background: '#757575',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                Hủy
              </button>
              <button
                onClick={handleApproveConfirm}
                disabled={!approvePin || (approveAction === 'REJECT' && !approveComment)}
                style={{
                  flex: 1,
                  padding: '12px',
                  background: approveAction === 'APPROVE' ? '#4caf50' : '#f44336',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  opacity: (!approvePin || (approveAction === 'REJECT' && !approveComment)) ? 0.5 : 1
                }}
              >
                Xác nhận
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
