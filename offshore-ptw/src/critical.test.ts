import { describe, expect, it } from 'vitest';
import { checkPermission } from './engine/rbacMatrix';
import { buildApprovalChain } from './engine/approvalRuleEngine';
import { computeOverallResult, hasAllRequiredParameters, hasValidGasTest } from './engine/gasTestEngine';
import { detectSimopsConflicts } from './engine/simopsEngine';
import { approveAtCurrentLevel } from './engine/workflowStateMachine';
import type { Permit } from './types/domain';

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
