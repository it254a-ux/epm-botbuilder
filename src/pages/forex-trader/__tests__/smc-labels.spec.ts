import { layoutBraces } from '../smc-labels';

describe('Smart money braces layout', () => {
    it('puts each name under its brace and keeps names that would meet apart', () => {
        const items = [100, 104, 300].map((y, i) => ({ y, x0: 50, x1: 400, text: `Name ${i}` }));
        const out = layoutBraces(items, { plotW: 700, plotH: 500 });
        expect(out.length).toBe(3);
        expect(out[0].nameY).toBeGreaterThan(out[0].line);
        expect(out[1].nameY - out[0].nameY >= 15).toBe(true);
        expect(out.every(o => o.nameX >= 4 && o.nameX < 700)).toBe(true);
    });
    it('skips a line that is too short to hold a brace', () => {
        expect(layoutBraces([{ y: 10, x0: 100, x1: 105, text: 'X' }], { plotW: 700, plotH: 500 }).length).toBe(0);
    });
});
