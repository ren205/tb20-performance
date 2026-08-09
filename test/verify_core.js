const PA_TO = [0,2000,4000,6000,8000,10000];
const PA_CL = [500,2500,4500,6500,8500,10500,12500];
const DISA  = [-20,0,20];

const TAKEOFF = {                                    // POH 5.8 / 5.9
  2370:{ "-20":{roll:[647,757,886,1042,1230,1448],  c50:[1008,1170,1365,1605,1906,2282]},
         "0":  {roll:[771,905,1063,1254,1487,1758], c50:[1197,1399,1642,1948,2341,2851]},
         "20": {roll:[909,1070,1261,1492,1775,2106],c50:[1409,1655,1959,2346,2859,3564]} },
  3086:{ "-20":{roll:[1115,1305,1527,1795,2119,2496],c50:[1735,2036,2409,2889,3537,4457]},
         "0":  {roll:[1329,1560,1833,2162,2562,3029],c50:[2083,2469,2959,3618,4578,6190]},
         "20": {roll:[1566,1845,2173,2572,3059,3630],c50:[2483,2976,3626,4562,6116,9854]} }
};
const TO_V = {2370:{lift:63,c50:69}, 3086:{lift:71,c50:78}};

const LANDING = {                                    // POH 5.30 / 5.31
  2370:{ "-20":{roll:[675,710,755,800,855,905],  c50:[1420,1495,1570,1650,1740,1905]},
         "0":  {roll:[720,765,810,865,920,980],  c50:[1515,1590,1675,1760,1855,1975]},
         "20": {roll:[770,820,870,930,985,1055], c50:[1610,1690,1780,1875,1980,2095]} },
  3086:{ "-20":{roll:[770,815,865,915,980,1040], c50:[1713,1800,1895,1995,2110,2235]},
         "0":  {roll:[825,875,930,985,1050,1115],c50:[1820,1920,2015,2120,2245,2380]},
         "20": {roll:[885,940,995,1055,1130,1200],c50:[1945,2045,2145,2255,2390,2535]} }
};
const LD_V = {2370:67.5, 3086:76};

const ROC = {                                        // POH 5.10 / 5.11 — ft/min
  2370:{ "-20":[1760,1601,1443,1287,1129,973,817],
         "0":  [1576,1425,1273,1122,970,818,667],
         "20": [1422,1276,1130,982,836,688,540] },
  3086:{ "-20":[1244,1112,979,848,716,585,455],
         "0":  [1100,972,844,716,588,460,332],
         "20": [977,853,729,604,479,353,228] }
};
const CLB_V = {2370:86, 3086:95};

const CLIMB = {                                      // POH 5.12 / 5.13 — cumulative from SL
  2370:{ "-20":{t:[.283,1.483,2.800,4.283,5.967,7.883,10.150], f:[.1,.6,1.0,1.5,2.0,2.5,3.1],  d:[.4,2.1,4.0,6.3,8.9,11.9,15.7]},
         "0":  {t:[.317,1.650,3.133,4.800,6.717,8.950,11.650], f:[.1,.6,1.1,1.6,2.1,2.7,3.3],  d:[.5,2.4,4.7,7.3,10.4,14.1,18.7]},
         "20": {t:[.350,1.817,3.467,5.333,7.517,10.100,13.300],f:[.1,.6,1.1,1.6,2.2,2.8,3.5],  d:[.5,2.8,5.3,8.4,12.0,16.4,22.1]} },
  3086:{ "-20":{t:[.400,2.100,4.033,6.250,8.850,11.967,15.883],f:[.2,.8,1.5,2.2,3.0,3.8,4.8],  d:[.6,3.3,6.4,10.0,14.5,20.0,27.1]},
         "0":  {t:[.450,2.383,4.583,7.150,10.217,14.033,19.083],f:[.2,.9,1.6,2.3,3.2,4.2,5.3], d:[.7,3.8,7.5,11.9,17.3,24.3,33.8]},
         "20": {t:[.500,2.683,5.167,8.133,11.767,16.467,23.150],f:[.2,.9,1.7,2.5,3.4,4.5,6.0], d:[.8,4.5,8.8,14.0,20.7,29.6,42.7]} }
};

/* Cruise — POH 5.16–5.29 at 2943 lb. rpm entry = [rpm, MP in.Hg, US gal/h] */
const CRUISE = {
 bestPower:{
  500:{75:{cas:150,tas:151,r:[[2500,23.6,16.2],[2400,24.3,15.9],[2300,25.1,15.7],[2200,26.0,15.4]]},
       70:{cas:146,tas:147,r:[[2500,22.4,15.4],[2400,23.1,15.2],[2300,23.8,14.9],[2200,24.7,14.7]]},
       65:{cas:142,tas:143,r:[[2500,21.2,14.7],[2400,21.9,14.4],[2300,22.6,14.2],[2200,23.4,13.9]]},
       60:{cas:137,tas:138,r:[[2500,20.1,13.9],[2400,20.7,13.6],[2300,21.3,13.4],[2200,22.1,13.1]]},
       55:{cas:132,tas:133,r:[[2500,18.9,13.1],[2400,19.5,12.8],[2300,20.1,12.6],[2200,20.8,12.3]]},
       50:{cas:127,tas:128,r:[[2500,17.7,12.3],[2400,18.3,12.1],[2300,18.8,11.8],[2200,19.5,11.6]]}},
  2500:{75:{cas:148,tas:154,r:[[2500,23.0,16.2],[2400,23.8,15.9],[2300,24.5,15.7],[2200,25.4,15.4]]},
        70:{cas:144,tas:150,r:[[2500,21.9,15.4],[2400,22.6,15.2],[2300,23.3,14.9],[2200,24.2,14.7]]},
        65:{cas:140,tas:145,r:[[2500,20.7,14.6],[2400,21.4,14.4],[2300,22.1,14.2],[2200,22.9,13.9]]},
        60:{cas:136,tas:141,r:[[2500,19.6,13.9],[2400,20.2,13.6],[2300,20.9,13.4],[2200,21.6,13.1]]},
        55:{cas:131,tas:136,r:[[2500,18.5,13.1],[2400,19.0,12.8],[2300,19.6,12.6],[2200,20.3,12.4]]},
        50:{cas:125,tas:130,r:[[2500,17.3,12.3],[2400,17.8,12.1],[2300,18.4,11.8],[2200,19.0,11.6]]}},
  4500:{75:{cas:147,tas:157,r:[[2500,22.5,16.2],[2400,23.2,16.0],[2300,24.0,15.7]]},
        70:{cas:143,tas:153,r:[[2500,21.4,15.4],[2400,22.1,15.2],[2300,22.8,14.9],[2200,23.6,14.7]]},
        65:{cas:139,tas:148,r:[[2500,20.3,14.7],[2400,20.9,14.4],[2300,21.6,14.2],[2200,22.4,13.9]]},
        60:{cas:134,tas:143,r:[[2500,19.2,13.9],[2400,19.7,13.6],[2300,20.4,13.4],[2200,21.1,13.1]]},
        55:{cas:129,tas:138,r:[[2500,18.0,13.1],[2400,18.6,12.9],[2300,19.2,12.6],[2200,19.8,12.4]]},
        50:{cas:123,tas:131,r:[[2500,16.9,12.3],[2400,17.4,12.1],[2300,18.0,11.8],[2200,18.6,11.6]]}},
  6500:{75:{cas:145,tas:160,r:[[2500,22.1,16.2]]},
        70:{cas:141,tas:155,r:[[2500,20.9,15.4],[2400,21.6,15.2],[2300,22.3,14.9]]},
        65:{cas:137,tas:151,r:[[2500,19.8,14.6],[2400,20.5,14.4],[2300,21.1,14.1],[2200,21.9,13.9]]},
        60:{cas:132,tas:146,r:[[2500,18.7,13.9],[2400,19.3,13.6],[2300,19.9,13.4],[2200,20.6,13.1]]},
        55:{cas:127,tas:140,r:[[2500,17.6,13.1],[2400,18.2,12.9],[2300,18.8,12.6],[2200,19.4,12.3]]},
        50:{cas:120,tas:132,r:[[2500,16.5,12.3],[2400,17.0,12.1],[2300,17.6,11.8],[2200,18.2,11.6]]}},
  8500:{70:{cas:139,tas:158,r:[[2500,20.5,15.4]]},
        65:{cas:135,tas:154,r:[[2500,19.4,14.7],[2400,20.0,14.4],[2300,20.7,14.2]]},
        60:{cas:130,tas:148,r:[[2500,18.3,13.9],[2400,18.9,13.6],[2300,19.5,13.4],[2200,20.2,13.1]]},
        55:{cas:125,tas:143,r:[[2500,17.2,13.1],[2400,17.8,12.9],[2300,18.3,12.6],[2200,19.0,12.4]]}},
  10500:{65:{cas:133,tas:156,r:[[2500,19.0,14.7]]},
         60:{cas:129,tas:151,r:[[2500,17.9,13.9],[2400,18.5,13.6],[2300,19.1,13.4]]},
         55:{cas:123,tas:144,r:[[2500,16.8,13.1],[2400,17.4,12.8],[2300,17.9,12.6],[2200,18.6,12.3]]}},
  12500:{60:{cas:127,tas:154,r:[[2500,17.5,13.9],[2400,18.1,13.6]]},
         55:{cas:120,tas:146,r:[[2500,16.5,13.1],[2400,17.0,12.9],[2300,17.5,12.6]]}}
 },
 bestEconomy:{
  500:{75:{cas:147,tas:148,r:[[2500,23.6,14.0],[2400,24.3,13.7],[2300,25.1,13.5],[2200,26.0,13.2]]},
       70:{cas:143,tas:144,r:[[2500,22.4,13.3],[2400,23.1,13.1],[2300,23.9,12.8],[2200,24.7,12.6]]},
       65:{cas:139,tas:140,r:[[2500,21.2,12.7],[2400,21.9,12.4],[2300,22.6,12.2],[2200,23.4,11.9]]},
       60:{cas:135,tas:136,r:[[2500,20.1,12.0],[2400,20.7,11.8],[2300,21.3,11.5],[2200,22.1,11.3]]},
       55:{cas:129,tas:130,r:[[2500,18.9,11.4],[2400,19.5,11.1],[2300,20.1,10.8],[2200,20.8,10.6]]},
       50:{cas:123,tas:124,r:[[2500,17.7,10.7],[2400,18.3,10.4],[2300,18.8,10.2],[2200,19.5,9.9]]}},
  2500:{75:{cas:145,tas:151,r:[[2500,23.0,13.9],[2400,23.8,13.7],[2300,24.6,13.5],[2200,25.4,13.2]]},
        70:{cas:142,tas:147,r:[[2500,21.9,13.3],[2400,22.6,13.1],[2300,23.3,12.8],[2200,24.2,12.6]]},
        65:{cas:137,tas:143,r:[[2500,20.8,12.7],[2400,21.4,12.4],[2300,22.1,12.2],[2200,22.9,11.9]]},
        60:{cas:133,tas:138,r:[[2500,19.6,12.0],[2400,20.2,11.8],[2300,20.9,11.5],[2200,21.6,11.2]]},
        55:{cas:128,tas:133,r:[[2500,18.5,11.4],[2400,19.0,11.1],[2300,19.6,10.9],[2200,20.3,10.6]]},
        50:{cas:121,tas:126,r:[[2500,17.3,10.7],[2400,17.8,10.4],[2300,18.4,10.2],[2200,19.0,10.0]]}},
  4500:{75:{cas:144,tas:154,r:[[2500,22.5,13.9],[2400,23.2,13.7],[2300,24.0,13.4]]},
        70:{cas:140,tas:150,r:[[2500,21.4,13.3],[2400,22.1,13.0],[2300,22.8,12.8],[2200,23.6,12.6]]},
        65:{cas:136,tas:145,r:[[2500,20.3,12.7],[2400,20.9,12.4],[2300,21.6,12.2],[2200,22.4,11.9]]},
        60:{cas:131,tas:140,r:[[2500,19.2,12.0],[2400,19.8,11.8],[2300,20.4,11.5],[2200,21.1,11.3]]},
        55:{cas:126,tas:135,r:[[2500,18.0,11.4],[2400,18.6,11.1],[2300,19.2,10.8],[2200,19.9,10.6]]},
        50:{cas:119,tas:127,r:[[2500,16.9,10.7],[2400,17.4,10.5],[2300,18.0,10.2],[2200,18.6,10.0]]}},
  6500:{75:{cas:142,tas:157,r:[[2500,22.1,14.0]]},
        70:{cas:138,tas:152,r:[[2500,21.0,13.3],[2400,21.6,13.1],[2300,22.3,12.8]]},
        65:{cas:134,tas:148,r:[[2500,19.8,12.7],[2400,20.5,12.4],[2300,21.1,12.2],[2200,21.9,11.9]]},
        60:{cas:129,tas:142,r:[[2500,18.7,12.0],[2400,19.3,11.8],[2300,19.9,11.5],[2200,20.6,11.2]]},
        55:{cas:124,tas:136,r:[[2500,17.6,11.4],[2400,18.2,11.1],[2300,18.8,10.8],[2200,19.4,10.6]]},
        50:{cas:116,tas:128,r:[[2500,16.5,10.7],[2400,17.0,10.5],[2300,17.6,10.2],[2200,18.2,10.0]]}},
  8500:{70:{cas:136,tas:155,r:[[2500,20.5,13.3]]},
        65:{cas:132,tas:150,r:[[2500,19.4,12.6],[2400,20.0,12.4],[2300,20.7,12.1]]},
        60:{cas:127,tas:145,r:[[2500,18.3,12.0],[2400,18.9,11.7],[2300,19.5,11.5],[2200,20.2,11.3]]},
        55:{cas:122,tas:138,r:[[2500,17.2,11.4],[2400,17.8,11.1],[2300,18.3,10.9],[2200,19.0,10.6]]}},
  10500:{65:{cas:130,tas:153,r:[[2500,19.0,12.6]]},
         60:{cas:125,tas:147,r:[[2500,17.9,12.0],[2400,18.5,11.7],[2300,19.1,11.5]]},
         55:{cas:119,tas:140,r:[[2500,16.8,11.3],[2400,17.4,11.1],[2300,17.9,10.9],[2200,18.6,10.6]]}},
  12500:{60:{cas:123,tas:149,r:[[2500,17.5,12.0],[2400,18.1,11.7]]},
         55:{cas:116,tas:141,r:[[2500,16.5,11.4],[2400,17.0,11.1],[2300,17.6,10.9]]}}
 }
};

const CAL = {                                        // POH 5.3 normal static source
  "Flaps up, gear up":      [[65,62],[75,74],[85,85],[120,120.5],[150,151]],
  "Flaps T/O":              [[60,56],[70,69.5],[75,75],[85,85.5],[100,101]],
  "Flaps LDG, gear down":   [[55,52],[60,58],[65,64.5],[80,79.5],[100,99.5]]
};
const ANT = [["VHF",-0.48,-0.30],["VOR",-0.59,-0.37],["Glide",-0.32,-0.20],
  ["ADF loop",-0.75,-0.47],["ELT",-0.16,-0.10],["Anticollision",-0.16,-0.10],
  ["Strobes",-0.43,-0.27],["Typical IFR fit",-3.23,-2.00]];
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
const PLEVELS = [1000,975,950,925,900,850,800,700,600,500];
const deltaP  = paFt => Math.pow(1 - 6.87535e-6 * paFt, 5.25588);
const plToAlt = hPa  => (1 - Math.pow(hPa / 1013.25, 1 / 5.25588)) / 6.87535e-6;
const nearestPL = paFt => PLEVELS.reduce((a,b)=>Math.abs(plToAlt(b)-paFt)<Math.abs(plToAlt(a)-paFt)?b:a);
function tasFrom(cas, paFt, oatC){
  const sigma = deltaP(paFt) / ((oatC + 273.15) / 288.15);
  return cas / Math.sqrt(sigma);
}
function windTriangle(tas, trackDeg, windFromDeg, windKt){
  const rad = Math.PI / 180, d = (windFromDeg - trackDeg) * rad;
  const head  = windKt * Math.cos(d);      // +ve slows you down
  const cross = windKt * Math.sin(d);      // +ve from the right
  const wca   = Math.asin(Math.max(-1, Math.min(1, cross / tas)));
  const gs    = tas * Math.cos(wca) - head;
  return { gs: Math.max(1, gs), head, cross, wcaDeg: wca / rad };
}
function sunEvent(lat, lon, dateUTC, zenith, rise){
  const rad = Math.PI / 180;
  const start = Date.UTC(dateUTC.getUTCFullYear(), 0, 0);
  const D = Math.floor((Date.UTC(dateUTC.getUTCFullYear(), dateUTC.getUTCMonth(), dateUTC.getUTCDate()) - start) / 86400000);
  const lngHour = lon / 15;
  const t = D + ((rise ? 6 : 18) - lngHour) / 24;
  const M = 0.9856 * t - 3.289;
  let L = (M + 1.916 * Math.sin(M * rad) + 0.020 * Math.sin(2 * M * rad) + 282.634 + 360) % 360;
  let RA = (Math.atan(0.91764 * Math.tan(L * rad)) / rad + 360) % 360;
  RA += (Math.floor(L / 90) - Math.floor(RA / 90)) * 90;
  RA /= 15;
  const sinDec = 0.39782 * Math.sin(L * rad);
  const cosDec = Math.cos(Math.asin(sinDec));
  const cosH = (Math.cos(zenith * rad) - sinDec * Math.sin(lat * rad)) / (cosDec * Math.cos(lat * rad));
  if (cosH > 1 || cosH < -1) return null;                      // sun never reaches that angle
  let H = (rise ? 360 - Math.acos(cosH) / rad : Math.acos(cosH) / rad) / 15;
  let UT = (H + RA - 0.06571 * t - 6.622 - lngHour) % 24;
  return ((UT + 24) % 24) * 60;
}
function gcNM(a, b){
  const R = 3440.065, rad = Math.PI / 180;
  const p1 = a[2] * rad, p2 = b[2] * rad;
  const dp = p2 - p1, dl = (b[3] - a[3]) * rad;
  const h = Math.sin(dp/2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl/2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
function gcTrack(a, b){                      // initial great-circle track, degrees true
  const rad = Math.PI / 180;
  const p1 = a[2] * rad, p2 = b[2] * rad, dl = (b[3] - a[3]) * rad;
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return (Math.atan2(y, x) / rad + 360) % 360;
}
function midpoint(a, b){
  const rad = Math.PI/180, deg = 180/Math.PI;
  const p1 = a[2]*rad, l1 = a[3]*rad, p2 = b[2]*rad, dl = (b[3]-a[3])*rad;
  const bx = Math.cos(p2)*Math.cos(dl), by = Math.cos(p2)*Math.sin(dl);
  const p3 = Math.atan2(Math.sin(p1)+Math.sin(p2), Math.sqrt((Math.cos(p1)+bx)**2 + by**2));
  return [0,0, p3*deg, (l1 + Math.atan2(by, Math.cos(p1)+bx))*deg];
}
function slopeUp(r, n){
  const near = n === 0 ? r[4] : r[5], far = n === 0 ? r[5] : r[4];
  if (near == null || far == null || !r[2]) return null;
  const s = (far - near) / r[2] * 100;
  return Math.abs(s) > 5 ? null : s;        // implausible, treat as unknown
}
const qfuOf = ident => (parseInt(ident, 10) % 36 || 36) * 10;
const vaAt = kg => 129 * Math.sqrt(clamp(kg, 700, MTOW_KG) / MTOW_KG);
const glideNM = (ft, g) => ft * g.ld / 6076.12;
function cruiseAt(mixKey, pa){
  const alts = Object.keys(CRUISE[mixKey]).map(Number).sort((a,b)=>a-b);
  const lo = alts.filter(a=>a<=pa).pop() ?? alts[0];
  const hi = alts.find(a=>a>=pa) ?? alts[alts.length-1];
  const f  = hi===lo ? 0 : (clamp(pa,alts[0],alts[alts.length-1])-lo)/(hi-lo);
  const A = CRUISE[mixKey][lo], B2 = CRUISE[mixKey][hi], out = [];
  for (const bhp of [75,70,65,60,55,50]){
    if (!A[bhp] || !B2[bhp]) continue;
    const rows = [];
    for (const [rpm, mpA, ffA] of A[bhp].r){
      const m = B2[bhp].r.find(x=>x[0]===rpm);
      if (!m) continue;
      rows.push({ rpm, mp: mpA + f*(m[1]-mpA), ff: ffA + f*(m[2]-ffA) });
    }
    if (rows.length) out.push({ bhp, tas: A[bhp].tas + f*(B2[bhp].tas-A[bhp].tas),
                                cas: A[bhp].cas + f*(B2[bhp].cas-A[bhp].cas), rows });
  }
  return { rows: out, clamped: pa < alts[0] || pa > alts[alts.length-1] };
}
const fwdLimitAt = kg => interp(clamp(kg, WB.fwdLimit[0][0], WB.fwdLimit[2][0]),
                                WB.fwdLimit.map(p=>p[0]), WB.fwdLimit.map(p=>p[1]));
const SUN_Z = 90.8333, CIVIL_Z = 96;
const WB = { fwdLimit:[[1000,913],[1250,949],[1400,1071]], aftLimit:1205,
             arms:{ front:{mm:45.38*25.4}, frontBackoff:{mm:47.44*25.4}, rear:{mm:80*25.4},
                    fuel:{mm:42.70*25.4}, baggage:{mm:2600} },
             maxKg:{tow:1400,baggage:65,rearSeats:231}, fuel:{usableL:326,kgPerL:0.72} };
module.exports = { PA_TO,PA_CL,DISA,TAKEOFF,LANDING,ROC,CLIMB,CRUISE,TO_V,LD_V,CLB_V,CAL,ANT,
  W_KEYS,W_KG,MTOW_KG,XW_DEMO,interp,lookup3,clamp,isaTemp,fmt,M_PER_FT,FT_PER_M,LB_PER_KG,toM,
  deltaP,plToAlt,nearestPL,tasFrom,windTriangle,sunEvent,gcNM,gcTrack,midpoint,vaAt,glideNM,
  cruiseAt,fwdLimitAt,SUN_Z,CIVIL_Z,WB };
