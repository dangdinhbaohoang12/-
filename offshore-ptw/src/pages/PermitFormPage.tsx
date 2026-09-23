import React, { useEffect, useState } from 'react';
import { usePermitStore } from '../store/permitStore';
import { PermitType, JSAItem, Isolation } from '../types';
import { v4 as uuidv4 } from 'uuid';

const PERMIT_TYPES: { value: PermitType; label: string }[] = [
  { value: 'COLD_WORK', label: 'Cold Work (Công việc lạnh)' },
  { value: 'HOT_WORK', label: 'Hot Work (Hàn cắt)' },
  { value: 'CONFINED_SPACE', label: 'Confined Space (Không gian kín)' },
  { value: 'RADIOGRAPHY', label: 'Radiography (Chụp ảnh phóng xạ)' },
  { value: 'ELECTRICAL', label: 'Electrical Work (Điện)' }
];

const DECKS = ['Upper Deck', 'Main Deck', 'Cellar Deck', 'Drill Floor'];

/**
 * Chuyển đổi một thời điểm (ISO hoặc Date) thành chuỗi giờ địa phương
 * phù hợp với input datetime-local (yyyy-MM-ddTHH:mm), tránh lệch giờ UTC.
 */
function toLocalDateTimeInputValue(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const pad = (n: number) => String(n).padStart(2, '0');
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function createDefaultFormData(): FormDataState {
  return {
    type: 'COLD_WORK' as PermitType,
    title: '',
    location: '',
    locationTag: '',
    deck: 'Main Deck',
    startTime: toLocalDateTimeInputValue(new Date()),
    endTime: toLocalDateTimeInputValue(new Date(Date.now() + 8 * 60 * 60 * 1000)),
    workers: [] as string[],
    ppe: [] as string[],
    gasTestPassed: false,
    electricalIsolated: false,
    pressureIsolated: false,
    jsaItems: [] as JSAItem[],
    isolations: [] as Isolation[]
  };
}

interface FormDataState {
  type: PermitType;
  title: string;
  location: string;
  locationTag: string;
  deck: string;
  startTime: string;
  endTime: string;
  workers: string[];
  ppe: string[];
  gasTestPassed: boolean;
  electricalIsolated: boolean;
  pressureIsolated: boolean;
  jsaItems: JSAItem[];
  isolations: Isolation[];
}

export const PermitFormPage: React.FC = () => {
  const createPermit = usePermitStore(state => state.createPermit);
  const updatePermit = usePermitStore(state => state.updatePermit);
  const submitPermit = usePermitStore(state => state.submitPermit);
  const currentUser = usePermitStore(state => state.currentUser);
  const selectedPermit = usePermitStore(state => state.selectedPermit);
  const selectPermit = usePermitStore(state => state.selectPermit);

  const [activeTab, setActiveTab] = useState(0);
  const [formData, setFormData] = useState<FormDataState>(() =>
    selectedPermit
      ? {
          type: selectedPermit.type,
          title: selectedPermit.title,
          location: selectedPermit.location,
          locationTag: selectedPermit.locationTag,
          deck: selectedPermit.deck,
          startTime: toLocalDateTimeInputValue(selectedPermit.startTime),
          endTime: toLocalDateTimeInputValue(selectedPermit.endTime),
          workers: selectedPermit.workers,
          ppe: selectedPermit.ppe,
          gasTestPassed: selectedPermit.gasTestPassed,
          electricalIsolated: selectedPermit.electricalIsolated,
          pressureIsolated: selectedPermit.pressureIsolated,
          jsaItems: selectedPermit.jsaData,
          isolations: selectedPermit.isolations
        }
      : createDefaultFormData()
  );

  // Nạp lại form khi permit đang chọn thay đổi (mở permit khác để sửa
  // hoặc bắt đầu tạo mới sau khi selectedPermit được reset về null).
  useEffect(() => {
    if (selectedPermit) {
      setFormData({
        type: selectedPermit.type,
        title: selectedPermit.title,
        location: selectedPermit.location,
        locationTag: selectedPermit.locationTag,
        deck: selectedPermit.deck,
        startTime: toLocalDateTimeInputValue(selectedPermit.startTime),
        endTime: toLocalDateTimeInputValue(selectedPermit.endTime),
        workers: selectedPermit.workers,
        ppe: selectedPermit.ppe,
        gasTestPassed: selectedPermit.gasTestPassed,
        electricalIsolated: selectedPermit.electricalIsolated,
        pressureIsolated: selectedPermit.pressureIsolated,
        jsaItems: selectedPermit.jsaData,
        isolations: selectedPermit.isolations
      });
    } else {
      setFormData(createDefaultFormData());
    }
    setActiveTab(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPermit?.id]);

  const [newJsaItem, setNewJsaItem] = useState({ hazard: '', riskLevel: 'MEDIUM' as const, controlMeasure: '' });
  const [newIsolation, setNewIsolation] = useState({ equipmentTag: '', isolationType: 'VALVE' as const, lockNumber: '' });
  const [pinCode, setPinCode] = useState('');
  const [showPinModal, setShowPinModal] = useState(false);
  const [submitAction, setSubmitAction] = useState<'SAVE' | 'SUBMIT' | null>(null);

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const addJsaItem = () => {
    if (newJsaItem.hazard && newJsaItem.controlMeasure) {
      const item: JSAItem = {
        id: uuidv4(),
        ...newJsaItem
      };
      setFormData(prev => ({ ...prev, jsaItems: [...prev.jsaItems, item] }));
      setNewJsaItem({ hazard: '', riskLevel: 'MEDIUM', controlMeasure: '' });
    }
  };

  const addIsolation = () => {
    if (newIsolation.equipmentTag && newIsolation.lockNumber) {
      const iso: Isolation = {
        id: uuidv4(),
        ...newIsolation
      };
      setFormData(prev => ({ ...prev, isolations: [...prev.isolations, iso] }));
      setNewIsolation({ equipmentTag: '', isolationType: 'VALVE', lockNumber: '' });
    }
  };

  const validateDates = (): { startDate: Date; endDate: Date } | null => {
    if (!formData.startTime || !formData.endTime) {
      alert('Vui lòng nhập đầy đủ thời gian bắt đầu và kết thúc!');
      return null;
    }

    const startDate = new Date(formData.startTime);
    const endDate = new Date(formData.endTime);

    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      alert('Thời gian bắt đầu hoặc kết thúc không hợp lệ!');
      return null;
    }

    if (endDate <= startDate) {
      alert('Thời gian kết thúc phải sau thời gian bắt đầu!');
      return null;
    }

    return { startDate, endDate };
  };

  const handleSave = (): boolean => {
    if (!formData.title || !formData.location) {
      alert('Vui lòng nhập tên công việc và vị trí!');
      return false;
    }

    const dates = validateDates();
    if (!dates) {
      return false;
    }

    const permitData = {
      type: formData.type,
      title: formData.title,
      location: formData.location,
      locationTag: formData.locationTag,
      deck: formData.deck,
      startTime: dates.startDate.toISOString(),
      endTime: dates.endDate.toISOString(),
      workers: formData.workers,
      ppe: formData.ppe,
      jsaData: formData.jsaItems,
      isolations: formData.isolations,
      gasTestPassed: formData.gasTestPassed,
      electricalIsolated: formData.electricalIsolated,
      pressureIsolated: formData.pressureIsolated
    };

    if (selectedPermit) {
      updatePermit(selectedPermit.id, permitData);
      alert('Đã cập nhật PTW thành công!');
    } else {
      const newPermit = createPermit(permitData);
      selectPermit(newPermit);
      alert('Đã tạo PTW thành công!');
    }
    return true;
  };

  const handleSubmit = (pin: string) => {
    if (formData.jsaItems.length === 0) {
      alert('Bắt buộc phải có ít nhất 1 mục JSA!');
      setActiveTab(2);
      return;
    }

    if (!validateDates()) {
      return;
    }

    const permitId = selectedPermit?.id;
    if (!handleSave()) {
      return;
    }

    const targetId = permitId || usePermitStore.getState().selectedPermit?.id;
    if (targetId) {
      const submitted = submitPermit(targetId, pin);
      if (submitted) {
        alert('Đã gửi PTW để phê duyệt!');
      }
    }
  };

  const tabs = [
    { label: 'Thông tin chung', icon: '📋' },
    { label: 'Nhân sự & PPE', icon: '👷' },
    { label: 'An toàn & JSA', icon: '⚠️' },
    { label: 'Kiểm tra & Cô lập', icon: '🔒' }
  ];

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '20px'
      }}>
        <h1 style={{ margin: 0, color: '#1a237e' }}>
          {selectedPermit ? `Chỉnh sửa PTW: ${selectedPermit.permitNumber}` : 'Tạo mới Permit To Work'}
        </h1>
        <div>
          <button
            onClick={() => { setSubmitAction('SAVE'); setShowPinModal(true); }}
            style={{
              marginRight: '10px',
              padding: '10px 20px',
              background: '#757575',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            💾 Lưu nháp
          </button>
          <button
            onClick={() => { setSubmitAction('SUBMIT'); setShowPinModal(true); }}
            style={{
              padding: '10px 20px',
              background: '#1a237e',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            📤 Gửi duyệt
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ 
        display: 'flex', 
        borderBottom: '2px solid #e0e0e0',
        marginBottom: '20px'
      }}>
        {tabs.map((tab, index) => (
          <button
            key={index}
            onClick={() => setActiveTab(index)}
            style={{
              padding: '12px 24px',
              background: activeTab === index ? '#1a237e' : 'transparent',
              color: activeTab === index ? 'white' : '#666',
              border: 'none',
              borderBottom: activeTab === index ? '3px solid #1a237e' : '3px solid transparent',
              cursor: 'pointer',
              fontWeight: activeTab === index ? 'bold' : 'normal'
            }}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div style={{ 
        background: 'white',
        padding: '24px',
        borderRadius: '8px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
      }}>
        {activeTab === 0 && (
          <div>
            <h3>Thông tin công việc</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>Loại PTW *</label>
                <select
                  value={formData.type}
                  onChange={(e) => handleInputChange('type', e.target.value)}
                  style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #ddd' }}
                >
                  {PERMIT_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>Khu vực (Deck)</label>
                <select
                  value={formData.deck}
                  onChange={(e) => handleInputChange('deck', e.target.value)}
                  style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #ddd' }}
                >
                  {DECKS.map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>Tên công việc *</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => handleInputChange('title', e.target.value)}
                  placeholder="Nhập tên công việc"
                  style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #ddd' }}
                />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>Vị trí chi tiết *</label>
                <input
                  type="text"
                  value={formData.location}
                  onChange={(e) => handleInputChange('location', e.target.value)}
                  placeholder="Ví dụ: Pump A-12, khu vực Process"
                  style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #ddd' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>Tag thiết bị</label>
                <input
                  type="text"
                  value={formData.locationTag}
                  onChange={(e) => handleInputChange('locationTag', e.target.value)}
                  placeholder="Ví dụ: P-101A"
                  style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #ddd' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>Thời gian bắt đầu</label>
                <input
                  type="datetime-local"
                  value={formData.startTime}
                  onChange={(e) => handleInputChange('startTime', e.target.value)}
                  style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #ddd' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>Thời gian kết thúc</label>
                <input
                  type="datetime-local"
                  value={formData.endTime}
                  onChange={(e) => handleInputChange('endTime', e.target.value)}
                  style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #ddd' }}
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === 1 && (
          <div>
            <h3>Nhân sự tham gia</h3>
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>Danh sách nhân viên</label>
              <textarea
                value={formData.workers.join('\n')}
                onChange={(e) => handleInputChange('workers', e.target.value.split('\n').filter(w => w.trim()))}
                placeholder="Nhập tên nhân viên, mỗi người một dòng"
                rows={5}
                style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #ddd' }}
              />
            </div>

            <h3>Thiết bị bảo hộ (PPE)</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
              {['Helmet', 'Safety Glasses', 'Safety Shoes', 'Gloves', 'Ear Protection', 'Harness', 'Face Shield', 'Respirator', 'Coverall'].map(ppe => (
                <label key={ppe} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="checkbox"
                    checked={formData.ppe.includes(ppe)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        handleInputChange('ppe', [...formData.ppe, ppe]);
                      } else {
                        handleInputChange('ppe', formData.ppe.filter(p => p !== ppe));
                      }
                    }}
                  />
                  {ppe}
                </label>
              ))}
            </div>
          </div>
        )}

        {activeTab === 2 && (
          <div>
            <h3>Job Safety Analysis (JSA)</h3>
            <p style={{ color: '#f57c00', fontSize: '14px' }}>⚠️ Bắt buộc phải có ít nhất 1 mục JSA trước khi submit</p>
            
            <div style={{ 
              background: '#f5f5f5', 
              padding: '16px', 
              borderRadius: '4px',
              marginBottom: '20px'
            }}>
              <h4>Thêm mục JSA mới</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 2fr auto', gap: '10px', alignItems: 'end' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px' }}>Mối nguy</label>
                  <input
                    type="text"
                    value={newJsaItem.hazard}
                    onChange={(e) => setNewJsaItem(prev => ({ ...prev, hazard: e.target.value }))}
                    placeholder="Ví dụ: Rơi từ độ cao"
                    style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px' }}>Mức rủi ro</label>
                  <select
                    value={newJsaItem.riskLevel}
                    onChange={(e) => setNewJsaItem(prev => ({ ...prev, riskLevel: e.target.value as any }))}
                    style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }}
                  >
                    <option value="LOW">Thấp</option>
                    <option value="MEDIUM">Trung bình</option>
                    <option value="HIGH">Cao</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px' }}>Biện pháp kiểm soát</label>
                  <input
                    type="text"
                    value={newJsaItem.controlMeasure}
                    onChange={(e) => setNewJsaItem(prev => ({ ...prev, controlMeasure: e.target.value }))}
                    placeholder="Ví dụ: Đeo dây an toàn"
                    style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }}
                  />
                </div>
                <button
                  onClick={addJsaItem}
                  style={{
                    padding: '8px 16px',
                    background: '#1a237e',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  + Thêm
                </button>
              </div>
            </div>

            {formData.jsaItems.length > 0 && (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#1a237e', color: 'white' }}>
                    <th style={{ padding: '12px', textAlign: 'left' }}>Mối nguy</th>
                    <th style={{ padding: '12px', textAlign: 'center' }}>Rủi ro</th>
                    <th style={{ padding: '12px', textAlign: 'left' }}>Biện pháp kiểm soát</th>
                  </tr>
                </thead>
                <tbody>
                  {formData.jsaItems.map((item, idx) => (
                    <tr key={item.id} style={{ background: idx % 2 === 0 ? '#f5f5f5' : 'white' }}>
                      <td style={{ padding: '12px' }}>{item.hazard}</td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        <span style={{
                          padding: '4px 8px',
                          borderRadius: '4px',
                          fontSize: '12px',
                          fontWeight: 'bold',
                          background: item.riskLevel === 'HIGH' ? '#ffebee' : item.riskLevel === 'MEDIUM' ? '#fff3e0' : '#e8f5e9',
                          color: item.riskLevel === 'HIGH' ? '#c62828' : item.riskLevel === 'MEDIUM' ? '#ef6c00' : '#2e7d32'
                        }}>
                          {item.riskLevel}
                        </span>
                      </td>
                      <td style={{ padding: '12px' }}>{item.controlMeasure}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {activeTab === 3 && (
          <div>
            <h3>Kiểm tra an toàn</h3>
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                <input
                  type="checkbox"
                  checked={formData.gasTestPassed}
                  onChange={(e) => handleInputChange('gasTestPassed', e.target.checked)}
                />
                <strong>✓ Đã kiểm tra khí Gas (Gas Testing)</strong>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                <input
                  type="checkbox"
                  checked={formData.electricalIsolated}
                  onChange={(e) => handleInputChange('electricalIsolated', e.target.checked)}
                />
                <strong>✓ Đã cô lập nguồn điện</strong>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                <input
                  type="checkbox"
                  checked={formData.pressureIsolated}
                  onChange={(e) => handleInputChange('pressureIsolated', e.target.checked)}
                />
                <strong>✓ Đã cô lập áp suất</strong>
              </label>
            </div>

            <h3>Biên bản cô lập (LOTO)</h3>
            <div style={{ 
              background: '#f5f5f5', 
              padding: '16px', 
              borderRadius: '4px',
              marginBottom: '20px'
            }}>
              <h4>Thêm cô lập mới</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '10px', alignItems: 'end' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px' }}>Tag thiết bị</label>
                  <input
                    type="text"
                    value={newIsolation.equipmentTag}
                    onChange={(e) => setNewIsolation(prev => ({ ...prev, equipmentTag: e.target.value }))}
                    placeholder="Ví dụ: V-101"
                    style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px' }}>Loại cô lập</label>
                  <select
                    value={newIsolation.isolationType}
                    onChange={(e) => setNewIsolation(prev => ({ ...prev, isolationType: e.target.value as any }))}
                    style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }}
                  >
                    <option value="VALVE">Van</option>
                    <option value="BREAKER">Aptomat</option>
                    <option value="BLIND">Blind Flange</option>
                    <option value="LOCKOUT">Lockout</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px' }}>Số khóa</label>
                  <input
                    type="text"
                    value={newIsolation.lockNumber}
                    onChange={(e) => setNewIsolation(prev => ({ ...prev, lockNumber: e.target.value }))}
                    placeholder="Ví dụ: LOTO-001"
                    style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }}
                  />
                </div>
                <button
                  onClick={addIsolation}
                  style={{
                    padding: '8px 16px',
                    background: '#1a237e',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  + Thêm
                </button>
              </div>
            </div>

            {formData.isolations.length > 0 && (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#1a237e', color: 'white' }}>
                    <th style={{ padding: '12px', textAlign: 'left' }}>Tag TB</th>
                    <th style={{ padding: '12px', textAlign: 'left' }}>Loại</th>
                    <th style={{ padding: '12px', textAlign: 'left' }}>Số khóa</th>
                  </tr>
                </thead>
                <tbody>
                  {formData.isolations.map((iso, idx) => (
                    <tr key={iso.id} style={{ background: idx % 2 === 0 ? '#f5f5f5' : 'white' }}>
                      <td style={{ padding: '12px' }}>{iso.equipmentTag}</td>
                      <td style={{ padding: '12px' }}>{iso.isolationType}</td>
                      <td style={{ padding: '12px' }}>{iso.lockNumber}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* PIN Modal */}
      {showPinModal && (
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
            <h3 style={{ marginTop: 0 }}>Xác nhận chữ ký số</h3>
            <p>Nhập mã PIN của bạn để {submitAction === 'SAVE' ? 'lưu' : 'gửi'} PTW</p>
            <input
              type="password"
              value={pinCode}
              onChange={(e) => setPinCode(e.target.value)}
              maxLength={4}
              placeholder="Nhập PIN"
              style={{
                width: '100%',
                padding: '12px',
                marginBottom: '20px',
                borderRadius: '4px',
                border: '1px solid #ddd',
                fontSize: '18px',
                textAlign: 'center',
                boxSizing: 'border-box'
              }}
              autoFocus
            />
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => {
                  setShowPinModal(false);
                  setPinCode('');
                  setSubmitAction(null);
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
                onClick={() => {
                  if (pinCode === currentUser?.pinCode) {
                    const pinToSubmit = pinCode;
                    setShowPinModal(false);
                    setPinCode('');
                    if (submitAction === 'SAVE') {
                      handleSave();
                    } else if (submitAction === 'SUBMIT') {
                      handleSubmit(pinToSubmit);
                    }
                  } else {
                    alert('PIN không đúng!');
                  }
                  setSubmitAction(null);
                }}
                style={{
                  flex: 1,
                  padding: '12px',
                  background: '#1a237e',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
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
