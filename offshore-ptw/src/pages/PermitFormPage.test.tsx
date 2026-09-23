import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { savePermitOffline } from '../db/offlineDb';
import { DEMO_USERS, usePermitStore } from '../store/permitStore';
import { PermitFormPage } from './PermitFormPage';

vi.mock('../db/offlineDb', () => ({
  db: {},
  savePermitOffline: vi.fn(),
  getAllPermitsOffline: vi.fn(),
  isOnline: vi.fn(() => true)
}));

describe('PermitFormPage offline persistence', () => {
  beforeEach(() => {
    localStorage.clear();
    usePermitStore.setState({
      permits: [],
      currentUser: DEMO_USERS[3],
      selectedPermit: null,
      simopsConflicts: []
    });
    vi.mocked(savePermitOffline).mockReset();
    vi.mocked(savePermitOffline).mockRejectedValue(new Error('IndexedDB unavailable'));
    vi.stubGlobal('alert', vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('reports an offline-save failure instead of success', async () => {
    render(<PermitFormPage />);

    fireEvent.change(screen.getByPlaceholderText('Nhập tên công việc'), {
      target: { value: 'Pump maintenance' }
    });
    fireEvent.change(screen.getByPlaceholderText('Ví dụ: Pump A-12, khu vực Process'), {
      target: { value: 'Pump room' }
    });
    fireEvent.click(screen.getByRole('button', { name: /Lưu nháp/ }));
    fireEvent.change(screen.getByPlaceholderText('Nhập PIN'), { target: { value: '0004' } });
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận' }));

    await waitFor(() => {
      expect(alert).toHaveBeenCalledWith('Không thể lưu PTW ngoại tuyến. Vui lòng thử lại!');
    });
    expect(alert).not.toHaveBeenCalledWith('Đã tạo PTW thành công!');
  });
});
