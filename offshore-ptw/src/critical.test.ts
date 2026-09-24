import { describe, expect, it, vi } from 'vitest';
import { checkPermission } from './engine/rbacMatrix';
import { buildApprovalChain } from './engine/approvalRuleEngine';
import { computeOverallResult, hasAllRequiredParameters, hasValidGasTest } from './engine/gasTestEngine';
import { detectSimopsConflicts } from './engine/simopsEngine';
import { approveAtCurrentLevel } from './engine/workflowStateMachine';
import { hashPin } from './data/catalog';
import type { Permit, UserAccount } from './types/domain';

const permit=(o:Partial<Permit>={}):Permit=>({
 id:'P1',permitNumber:'MT1-PTW-2026-000001',revisionNo:0,platformCode:'MT1',
 areaId:'MT1-WHP',areaCode:'WHP',areaName:'Wellhead Area',permitType:'COLD_WORK',
 riskLevel:'LOW',workClassifications:['ROUTINE'],criticalWork:false,equipmentTag:'N/A',
 workDescription:'Valid test permit',contractorCompany:'Test',companyDepartment:'Ops',
 applicantUserId:'U1',applicantName:'A',supervisorUserId:'U2',supervisorName:'S',
 workOrderNo:'',priority:'MEDIUM',plannedStart:'2026-09-24T10:00:00.000Z',
 plannedEnd:'2026-09-24T18:00:00.000Z',status:'DRAFT',currentApprovalLevel:null,
 approvalChain:buildApprovalChain({permitType:'COLD_WORK',riskLevel:'LOW',areaHazardous:true,criticalWork:false,workClassifications:['ROUTINE']}).chain,
 requiresGasTest:false,gasTests:[],riskAssessments:[],lotoRecords:[],simopsAssessments:[],
 acknowledgedConflictIds:[],statusHistory:[],revisions:[],createdAt:'2026-09-24T09:00:00.000Z',
 updatedAt:'2026-09-24T09:00:00.000Z',createdById:'U1',...o
});
const oim: UserAccount = {
  id: 'OIM-1', username: 'oim', fullName: 'OIM', role: 'OIM', platformCode: 'MT1',
  pinHash: hashPin('1234'), active: true, mustChangePin: false,
  createdAt: '2026-09-24T09:00:00.000Z', createdByUserId: 'SYSTEM',
};
describe('RBAC',()=>it('denies administrator approval',()=>expect(checkPermission('ADMINISTRATOR','APPROVE').allowed).toBe(false)));
describe('Approval',()=>it('requires four levels for critical work',()=>expect(buildApprovalChain({permitType:'COLD_WORK',riskLevel:'LOW',areaHazardous:false,criticalWork:true,workClassifications:['ROUTINE','CRITICAL']}).chain.filter(s=>s.required).map(s=>s.level)).toEqual(['LINE_SUPERVISOR','FPS','DEPUTY_OIM','OIM'])));
describe('Gas',()=>{
 const r=[{parameter:'O2' as const,value:20.9},{parameter:'LEL' as const,value:0},{parameter:'H2S' as const,value:0},{parameter:'CO' as const,value:0}];
 it('requires four parameters',()=>expect(hasAllRequiredParameters(r)).toBe(true));
 it('fails unsafe readings',()=>expect(computeOverallResult({readings:[...r.slice(0,3),{parameter:'CO',value:100}],calibrationDueDate:'2026-09-25T00:00:00Z',testedAt:'2026-09-24T10:00:00Z'})).toBe('FAIL'));
 it('rejects stale tests',()=>expect(hasValidGasTest({requiresGasTest:true,gasTests:[{id:'GT',sequenceNo:1,readings:r.map(x=>({...x,unit:'u',result:'PASS' as const})),overallResult:'PASS',gasDetectorId:'D',calibrationDueDate:'2026-09-25T00:00:00Z',testedByUserId:'U',testedByName:'T',testedAt:'2026-09-24T10:00:00Z',location:'WHP'}]},new Date('2026-09-24T11:01:00Z'))).toBe(false));
});
describe('SIMOPS',()=>{
 it('blocks incompatible work in the same area',()=>{
   const a=permit({permitType:'HOT_WORK',workClassifications:['HOT_WORK','NON_ROUTINE']});
   const b=permit({id:'P2',permitType:'CONFINED_SPACE',status:'APPROVED'});
   expect(detectSimopsConflicts(a,[a,b])[0]?.level).toBe('BLOCK');
 });
 it('ignores superseded revisions',()=>{
   const a=permit({permitType:'HOT_WORK'}); const b=permit({id:'P2',permitType:'CONFINED_SPACE',status:'APPROVED',supersededByPermitId:'P3'});
   expect(detectSimopsConflicts(a,[a,b])).toHaveLength(0);
 });
});


describe('Permit validity', () => {
  it('caps issued validity by the permit type validityHours', () => {
    const p = permit({
      permitType: 'COLD_WORK',
      status: 'OIM_REVIEW',
      currentApprovalLevel: 'OIM',
      plannedStart: '2026-09-24T10:00:00.000Z',
      plannedEnd: '2026-09-25T10:00:00.000Z',
      approvalChain: buildApprovalChain({
        permitType: 'COLD_WORK',
        riskLevel: 'HIGH',
        areaHazardous: false,
        criticalWork: false,
        workClassifications: ['ROUTINE'],
      }).chain.map((s) => s.level === 'OIM' ? s : { ...s, status: 'DONE' as const }),
    });
    const result = approveAtCurrentLevel(p, {
      role: 'OIM',
      userId: 'OIM-1',
      userName: 'OIM',
      deviceIp: 'UNKNOWN',
      now: new Date('2026-09-24T10:00:00.000Z'),
    });
    expect(result.ok).toBe(true);
    expect(result.permit?.validUntil).toBe('2026-09-24T22:00:00.000Z');
  });
});

describe('Revision lifecycle', () => {
  it('keeps the issued permit active until the revision receives final approval', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-24T10:00:00.000Z'));
    try {
      const issued = permit({
        status: 'APPROVED', riskLevel: 'HIGH', validUntil: '2026-09-24T22:00:00.000Z',
        plannedEnd: '2026-09-25T10:00:00.000Z',
      });
      usePtwStore.setState({ permits: [issued], currentUser: oim });

      const request = usePtwStore.getState().requestRevision(issued.id, 'Change scope', '1234');
      expect(request.ok).toBe(true);
      const original = usePtwStore.getState().permits.find((p) => p.id === issued.id)!;
      expect(original.status).toBe('APPROVED');
      expect(original.currentApprovalLevel).toBe(issued.currentApprovalLevel);
      expect(original.supersededByPermitId).toBeUndefined();
      expect(original.updatedAt).toBe(issued.updatedAt);
      expect(original.revisions).toHaveLength(1);
      expect(original.statusHistory.at(-1)).toMatchObject({
        eventType: 'REVISION_REQUESTED', fromStatus: 'APPROVED', toStatus: 'APPROVED',
      });
      expect(usePtwStore.getState().requestRevision(issued.id, 'Another change', '1234').ok).toBe(false);

      const revision = usePtwStore.getState().permits.find((p) => p.id === request.newPermitId)!;
      usePtwStore.setState({ permits: [original, {
        ...revision, status: 'OIM_REVIEW', currentApprovalLevel: 'OIM',
        approvalChain: revision.approvalChain.map((step) => step.required && step.level !== 'OIM'
          ? { ...step, status: 'DONE' as const }
          : step),
      }] });
      expect(usePtwStore.getState().runTransition(revision.id, 'APPROVE', '1234').ok).toBe(true);
      const retired = usePtwStore.getState().permits.find((p) => p.id === issued.id)!;
      expect(retired).toMatchObject({
        status: 'CANCELLED', currentApprovalLevel: null, supersededByPermitId: revision.id,
      });
      expect(retired.statusHistory.at(-1)).toMatchObject({
        fromStatus: 'APPROVED', toStatus: 'CANCELLED',
        userId: oim.id, userName: oim.fullName, userRole: oim.role,
      });
      expect(usePtwStore.getState().permits.find((p) => p.id === revision.id)?.status).toBe('APPROVED');
    } finally {
      vi.useRealTimers();
      usePtwStore.setState({ permits: [], currentUser: null });
    }
  });

  it.each(['CLOSED', 'EXPIRED'] as const)('links an approved revision without cancelling a %s parent', (terminalStatus) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-24T10:00:00.000Z'));
    try {
      const issued = permit({ status: 'APPROVED', riskLevel: 'HIGH' });
      usePtwStore.setState({ permits: [issued], currentUser: oim });
      const request = usePtwStore.getState().requestRevision(issued.id, 'Change scope', '1234');
      expect(request.ok).toBe(true);
      const parent = usePtwStore.getState().permits.find((p) => p.id === issued.id)!;
      const revision = usePtwStore.getState().permits.find((p) => p.id === request.newPermitId)!;
      const terminalParent = { ...parent, status: terminalStatus };
      usePtwStore.setState({ permits: [terminalParent, {
        ...revision, status: 'OIM_REVIEW', currentApprovalLevel: 'OIM',
        approvalChain: revision.approvalChain.map((step) => step.required && step.level !== 'OIM'
          ? { ...step, status: 'DONE' as const }
          : step),
      }] });

      expect(usePtwStore.getState().runTransition(revision.id, 'APPROVE', '1234').ok).toBe(true);
      const linked = usePtwStore.getState().permits.find((p) => p.id === issued.id)!;
      expect(linked.status).toBe(terminalStatus);
      expect(linked.supersededByPermitId).toBe(revision.id);
      expect(linked.statusHistory).toEqual(terminalParent.statusHistory);
    } finally {
      vi.useRealTimers();
      usePtwStore.setState({ permits: [], currentUser: null });
    }
  });

  it('numbers a new revision after previously rejected children', () => {
    const issued = permit({ status: 'APPROVED' });
    usePtwStore.setState({ permits: [issued], currentUser: oim });
    try {
      const first = usePtwStore.getState().requestRevision(issued.id, 'First change', '1234');
      expect(first.ok).toBe(true);
      usePtwStore.setState({ permits: usePtwStore.getState().permits.map((p) =>
        p.id === first.newPermitId ? { ...p, status: 'REJECTED' } : p
      ) });

      const second = usePtwStore.getState().requestRevision(issued.id, 'Second change', '1234');
      expect(second.ok).toBe(true);
      const children = usePtwStore.getState().permits.filter((p) => p.parentPermitId === issued.id);
      expect(children.map((p) => p.revisionNo)).toEqual([1, 2]);
      expect(children[1].statusHistory[0].newValues).toEqual({ revision: 'Rev 2' });
    } finally {
      usePtwStore.setState({ permits: [], currentUser: null });
    }
  });
});
