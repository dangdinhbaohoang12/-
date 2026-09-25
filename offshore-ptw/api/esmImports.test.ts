import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const serverFiles = [
  'api/ptw.ts',
  'src/engine/approvalRuleEngine.ts',
  'src/engine/gasTestEngine.ts',
  'src/engine/simopsEngine.ts',
  'src/engine/workflowStateMachine.ts',
  'src/engine/rbacMatrix.ts',
  'src/data/catalog.ts',
];

describe('PTW Node ESM import specifiers', () => {
  it('uses explicit file extensions for relative runtime imports', () => {
    for (const file of serverFiles) {
      const source = readFileSync(new URL('../' + file, import.meta.url), 'utf8');
      const matches = source.match(/(?:from|import)\s*['"](?:\.{1,2}\/)[^'"]+['"]/g) ?? [];
      for (const statement of matches) {
        const specifier = statement.match(/['"]((?:\.{1,2}\/)[^'"]+)['"]/)?.[1] ?? '';
        expect(specifier, statement + ' in ' + file).toMatch(/\.(?:js|json)$/);
      }
    }
  });
});
