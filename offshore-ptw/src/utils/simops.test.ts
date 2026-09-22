import { describe, it, expect } from 'vitest';
import { checkSimOpsConflict, checkSimOpsForPermit, SIMOPS_MATRIX, calculatePriority } from './simops';
import { Permit, PermitType, ConflictLevel } from '../types';

const createMockPermit = (overrides: Partial<Permit> = {}): Permit => ({
  id: 'test-id-1',
  permitNumber: 'PTW-2401-0001',
  type: 'HOT_WORK',
  status: 'ISSUED',
  title: 'Test Work',
  location: 'Pump A-12',
  locationTag: 'P-101A',
  deck: 'Main Deck',
  startTime: new Date().toISOString(),
  endTime: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
  requesterId: 'user-1',
  workers: [],
  ppe: [],
  jsaData: [],
  isolations: [],
  gasTestPassed: true,
  electricalIsolated: true,
  pressureIsolated: true,
  approvals: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  priority: 'HIGH',
  ...overrides
});

describe('SIMOPS Matrix', () => {
  it('should have correct conflict levels defined', () => {
    expect(SIMOPS_MATRIX['HOT_WORK']['CONFINED_SPACE']).toBe('BLOCK');
    expect(SIMOPS_MATRIX['HOT_WORK']['RADIOGRAPHY']).toBe('BLOCK');
    expect(SIMOPS_MATRIX['COLD_WORK']['HOT_WORK']).toBe('NONE');
    expect(SIMOPS_MATRIX['ELECTRICAL']['HOT_WORK']).toBe('WARNING');
  });
});

describe('checkSimOpsConflict', () => {
  it('should return null for same permit', () => {
    const permit = createMockPermit();
    const result = checkSimOpsConflict(permit, permit);
    expect(result).toBeNull();
  });

  it('should return null for different locations', () => {
    const permit1 = createMockPermit({ locationTag: 'P-101A' });
    const permit2 = createMockPermit({ id: 'test-id-2', locationTag: 'P-102A' });
    const result = checkSimOpsConflict(permit1, permit2);
    expect(result).toBeNull();
  });

  it('should return null for non-overlapping time periods', () => {
    const permit1 = createMockPermit({ 
      startTime: new Date().toISOString(),
      endTime: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
    });
    const permit2 = createMockPermit({ 
      id: 'test-id-2',
      startTime: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
      endTime: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString()
    });
    const result = checkSimOpsConflict(permit1, permit2);
    expect(result).toBeNull();
  });

  it('should detect BLOCK conflict between HOT_WORK and CONFINED_SPACE', () => {
    const hotWork = createMockPermit({ type: 'HOT_WORK' });
    const confinedSpace = createMockPermit({ 
      id: 'test-id-2', 
      type: 'CONFINED_SPACE',
      status: 'ISSUED'
    });
    const result = checkSimOpsConflict(hotWork, confinedSpace);
    expect(result).not.toBeNull();
    expect(result?.conflictLevel).toBe('BLOCK');
    expect(result?.reason).toContain('NGHIÊM CẤM');
  });

  it('should detect WARNING conflict between HOT_WORK and ELECTRICAL', () => {
    const hotWork = createMockPermit({ type: 'HOT_WORK' });
    const electrical = createMockPermit({ 
      id: 'test-id-2', 
      type: 'ELECTRICAL',
      status: 'ISSUED'
    });
    const result = checkSimOpsConflict(hotWork, electrical);
    expect(result).not.toBeNull();
    expect(result?.conflictLevel).toBe('WARNING');
    expect(result?.reason).toContain('CẢNH BÁO');
  });

  it('should return null for COLD_WORK and HOT_WORK (no conflict)', () => {
    const coldWork = createMockPermit({ type: 'COLD_WORK' });
    const hotWork = createMockPermit({ 
      id: 'test-id-2', 
      type: 'HOT_WORK',
      status: 'ISSUED'
    });
    const result = checkSimOpsConflict(coldWork, hotWork);
    expect(result).toBeNull();
  });

  it('should not check conflicts for DRAFT permits', () => {
    const draftPermit = createMockPermit({ status: 'DRAFT' });
    const issuedPermit = createMockPermit({ 
      id: 'test-id-2',
      status: 'ISSUED' 
    });
    const result = checkSimOpsConflict(draftPermit, issuedPermit);
    expect(result).toBeNull();
  });
});

describe('checkSimOpsForPermit', () => {
  it('should find all conflicts for a permit', () => {
    const hotWork = createMockPermit({ type: 'HOT_WORK' });
    const confinedSpace = createMockPermit({ 
      id: 'test-id-2', 
      type: 'CONFINED_SPACE',
      status: 'ISSUED'
    });
    const radiography = createMockPermit({ 
      id: 'test-id-3', 
      type: 'RADIOGRAPHY',
      status: 'ISSUED'
    });
    
    const allPermits = [hotWork, confinedSpace, radiography];
    const conflicts = checkSimOpsForPermit(hotWork, allPermits);
    
    expect(conflicts.length).toBeGreaterThanOrEqual(1);
    expect(conflicts.some(c => c.conflictLevel === 'BLOCK')).toBe(true);
  });

  it('should return empty array when no conflicts', () => {
    const coldWork = createMockPermit({ type: 'COLD_WORK' });
    const otherColdWork = createMockPermit({ 
      id: 'test-id-2', 
      type: 'COLD_WORK',
      status: 'ISSUED'
    });
    
    const conflicts = checkSimOpsForPermit(coldWork, [coldWork, otherColdWork]);
    expect(conflicts.length).toBe(0);
  });
});

describe('calculatePriority', () => {
  it('should return CRITICAL for Confined Space + Hot Work combination', () => {
    const priority = calculatePriority('HOT_WORK', false, true, true);
    expect(priority).toBe('CRITICAL');
  });

  it('should return HIGH for permits with conflicts', () => {
    const priority = calculatePriority('COLD_WORK', true, false, false);
    expect(priority).toBe('HIGH');
  });

  it('should return HIGH for HOT_WORK', () => {
    const priority = calculatePriority('HOT_WORK', false, false, true);
    expect(priority).toBe('HIGH');
  });

  it('should return HIGH for CONFINED_SPACE', () => {
    const priority = calculatePriority('CONFINED_SPACE', false, true, false);
    expect(priority).toBe('HIGH');
  });

  it('should return MEDIUM for ELECTRICAL', () => {
    const priority = calculatePriority('ELECTRICAL', false, false, false);
    expect(priority).toBe('MEDIUM');
  });

  it('should return LOW for COLD_WORK without conflicts', () => {
    const priority = calculatePriority('COLD_WORK', false, false, false);
    expect(priority).toBe('LOW');
  });
});
