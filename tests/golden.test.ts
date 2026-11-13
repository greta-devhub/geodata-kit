import { describe, expect, it } from 'vitest';

import * as core from 'geodata-kit';
import * as address from 'geodata-kit-address';
import * as airports from 'geodata-kit-airports';
import * as cities from 'geodata-kit-cities';
import * as phone from 'geodata-kit-phone';
import * as postal from 'geodata-kit-postal';
import * as shapes from 'geodata-kit-shapes';
import * as subdivisions from 'geodata-kit-subdivisions';
import * as tz from 'geodata-kit-tz';

import { applyPath, check, readGoldenFiles } from './golden-runner.js';

/** Every public function of every package, by name. */
const registry: Record<string, unknown> = { ...core, ...subdivisions, ...cities, ...airports, ...shapes, ...address, ...phone, ...postal, ...tz };

for (const [file, golden] of readGoldenFiles()) {
  describe(`golden: ${file}`, () => {
    golden.cases.forEach((testCase, index) => {
      const label = `#${index} ${testCase.fn}(${testCase.args.map((arg) => JSON.stringify(arg)).join(', ')})${testCase.path ? ` → ${testCase.path}` : ''}`;
      it(label, async () => {
        const fn = registry[testCase.fn];
        expect(typeof fn, `function ${testCase.fn} is not exported`).toBe('function');
        const result = await (fn as (...args: unknown[]) => unknown)(...testCase.args);
        const failure = check(applyPath(result, testCase.path), testCase);
        expect(failure, testCase.note).toBeNull();
      });
    });
  });
}
