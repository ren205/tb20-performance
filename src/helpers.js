const MTOW_KG = 1400, XW_DEMO = 25;
const W_KEYS = [2370, 3086];     // POH table keys, lb
const W_KG   = [1075, 1400];     // the same two weights as the POH quotes them, kg

function interp(x, xs, ys){
  const n = xs.length;
  if (x <= xs[0])   return ys[0] + (x-xs[0])*(ys[1]-ys[0])/(xs[1]-xs[0]);
  if (x >= xs[n-1]) return ys[n-2] + (x-xs[n-2])*(ys[n-1]-ys[n-2])/(xs[n-1]-xs[n-2]);
  for (let i=0;i<n-1;i++) if (x <= xs[i+1]){
    const f = (x-xs[i])/(xs[i+1]-xs[i]);
    return ys[i] + f*(ys[i+1]-ys[i]);
  }
  return ys[n-1];
}
// Interpolate over PA, then ISA-deviation, then weight. `wkg` is in kilograms.
function lookup3(tbl, wkg, pa, di, paAxis, pick){
  const perW = W_KEYS.map(wk => {
    const perD = DISA.map(d => interp(pa, paAxis, pick(tbl[wk][String(d)])));
    return interp(di, DISA, perD);
  });
  return interp(wkg, W_KG, perW);
}
const clamp = (v,a,b) => Math.min(b, Math.max(a,v));
const isaTemp = pa => 15 - 1.98*pa/1000;
const fmt = (v,d=0) => Number.isFinite(v) ? v.toLocaleString("en-GB",{minimumFractionDigits:d,maximumFractionDigits:d}) : "—";
const M_PER_FT = 0.3048, FT_PER_M = 1/M_PER_FT, LB_PER_KG = 2.2046226218;
const toM = ft => ft*M_PER_FT;
const dist = ft => `${fmt(toM(ft))} <small>m / ${fmt(ft)} ft</small>`;
const deg3 = d => String(Math.round(d) % 360).padStart(3, "0");

/* ICAO standard atmosphere: pressure ratio, and TAS from CAS at a pressure
   altitude and an actual temperature. Checked against the POH cruise tables —
   CAS 134 kt at 6500 ft in ISA returns 148 kt, the manual's tabulated TAS. */
const deltaP = paFt => Math.pow(1 - 6.87535e-6 * paFt, 5.25588);
const tasFrom = (cas, paFt, oatC) =>
  cas / Math.sqrt(deltaP(paFt) / ((oatC + 273.15) / 288.15));
const KT_FPM = 101.269;      // ft/min per knot
const FT_NM  = 6076.115;
