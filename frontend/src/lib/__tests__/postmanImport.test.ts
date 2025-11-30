// @ts-nocheck
// Manual regression checks for the Postman importer. Run with a TS-aware test runner or
// transpile before executing (e.g., node --test dist/... after tsc).
import { importPostmanCollection } from '../postmanImport';
import { samplePostmanCollection } from '../__fixtures__/postman-sample';

const expect = (condition: unknown, message: string) => {
  if (!condition) {
    throw new Error(message);
  }
};

const col = importPostmanCollection(samplePostmanCollection as any);
const [first, second, third] = col.items as any[];

expect(first.extract_rules.length === 2, 'Primary request should map two extraction rules');
expect(first.extract_rules[0].source_path === 'alpha.beta', 'alpha_value path should be alpha.beta');
expect(first.extract_rules[1].source_path === 'cached', 'cached_flag should map to cached');

expect(second.extract_rules[0].target_variable === 'links_next', 'links_next target mismatch');
expect(second.extract_rules[0].source_path === 'links.next', 'links_next path should strip optional chaining');
expect(second.body_mode === 'form-urlencoded', 'Second request body mode should be form-urlencoded');
expect(second.form_body?.[0]?.value === 'bar', 'Form body row should preserve value');

expect(third.body_mode === 'form-data', 'Form data request should map mode');
expect(third.form_body?.find((r: any) => r.key === 'file')?.value === '/tmp/photo.png', 'File src should map to value');
expect(third.form_body?.find((r: any) => r.key === 'file')?.type === 'file', 'File row should carry type=file');
expect(third.extract_rules[0].target_variable === 'upload_photo_id', 'Upload rule target mismatch');
expect(third.extract_rules[0].source_path === 'photo_id', 'Upload rule path mismatch');
