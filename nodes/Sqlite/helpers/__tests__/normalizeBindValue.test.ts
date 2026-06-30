import { Buffer } from 'node:buffer';

import { normalizeBindValue } from '../normalize';

/**
 * Frozen property-tests for normalizeBindValue. Independent oracle: the spec
 * mapping (undefined/null -> null, boolean -> 1/0, primitives pass, Buffer
 * passes, everything else throws).
 */
describe('normalizeBindValue', () => {
	it('undefined -> null', () => {
		expect(normalizeBindValue(undefined)).toBeNull();
	});

	it('null -> null', () => {
		expect(normalizeBindValue(null)).toBeNull();
	});

	it('boolean true -> 1, false -> 0', () => {
		expect(normalizeBindValue(true)).toBe(1);
		expect(normalizeBindValue(false)).toBe(0);
	});

	it('string passes through unchanged', () => {
		expect(normalizeBindValue('hello')).toBe('hello');
		expect(normalizeBindValue('')).toBe('');
	});

	it('number passes through unchanged', () => {
		expect(normalizeBindValue(42)).toBe(42);
		expect(normalizeBindValue(0)).toBe(0);
		expect(normalizeBindValue(-1.5)).toBe(-1.5);
	});

	it('bigint passes through unchanged', () => {
		expect(normalizeBindValue(5n)).toBe(5n);
		expect(normalizeBindValue(9007199254740993n)).toBe(9007199254740993n);
	});

	it('Buffer passes through (same bytes)', () => {
		const buf = Buffer.from([1, 2, 3]);
		const out = normalizeBindValue(buf);
		expect(out).toBeInstanceOf(Buffer);
		expect(out as Buffer).toEqual(buf);
	});

	it('Uint8Array passes through (same bytes)', () => {
		const u = new Uint8Array([4, 5, 6]);
		const out = normalizeBindValue(u);
		expect(out).toBeInstanceOf(Uint8Array);
		expect(out as Uint8Array).toEqual(u);
	});

	it('plain object throws', () => {
		expect(() => normalizeBindValue({ a: 1 })).toThrow();
	});

	it('array throws', () => {
		expect(() => normalizeBindValue([1, 2])).toThrow();
	});

	it('Date throws', () => {
		expect(() => normalizeBindValue(new Date())).toThrow();
	});

	it('function throws', () => {
		expect(() => normalizeBindValue(() => 1)).toThrow();
	});
});