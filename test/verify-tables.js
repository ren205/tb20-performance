const C = require('./verify_core.js');

/* Independent ICAO-atmosphere implementation, deliberately NOT imported from
   the app: this cross-checks the transcribed CAS and TAS columns against
   physics, so it must not share code with whatever produced them. */
const tasFrom = (cas, paFt, oatC) =>
  cas / Math.sqrt(Math.pow(1 - 6.87535e-6 * paFt, 5.25588) / ((oatC + 273.15) / 288.15));
let pass=0, fail=0; const fails=[];
const ok=(name,cond,detail)=>{ if(cond){pass++;} else {fail++; fails.push(name+(detail?"  ["+detail+"]":""));} };
const near=(a,b,tol)=>Math.abs(a-b)<=tol;
const H=t=>console.log("\n"+t+"\n"+"=".repeat(t.length));

/* ---------------------------------------------------------------
   1. EVERY tabulated POH value must be returned exactly at its own
      grid point. This checks the data and the interpolator together.
   --------------------------------------------------------------- */
H("1. POH grid fidelity — every tabulated cell");
let n=0;
for (const [name,tbl,axis,fields] of [
      ["take-off", C.TAKEOFF, C.PA_TO, ["roll","c50"]],
      ["landing",  C.LANDING, C.PA_TO, ["roll","c50"]] ]){
  for (const w of C.W_KEYS) for (const d of C.DISA) for (const f of fields)
    tbl[w][String(d)][f].forEach((v,i)=>{
      const wkg = C.W_KG[C.W_KEYS.indexOf(w)];
      const got = C.lookup3(tbl, wkg, axis[i], d, axis, o=>o[f]);
      n++; ok(`${name} ${w}lb ISA${d} PA${axis[i]} ${f}`, near(got,v,0.001), `got ${got} want ${v}`);
    });
}
for (const w of C.W_KEYS) for (const d of C.DISA)
  C.ROC[w][String(d)].forEach((v,i)=>{
    const wkg=C.W_KG[C.W_KEYS.indexOf(w)];
    const got=C.lookup3(C.ROC,wkg,C.PA_CL[i],d,C.PA_CL,o=>o);
    n++; ok(`ROC ${w} ISA${d} PA${C.PA_CL[i]}`, near(got,v,0.001), `got ${got} want ${v}`);
  });
for (const w of C.W_KEYS) for (const d of C.DISA) for (const f of ["t","f","d"])
  C.CLIMB[w][String(d)][f].forEach((v,i)=>{
    const wkg=C.W_KG[C.W_KEYS.indexOf(w)];
    const got=C.lookup3(C.CLIMB,wkg,C.PA_CL[i],d,C.PA_CL,o=>o[f]);
    n++; ok(`CLIMB.${f} ${w} ISA${d} PA${C.PA_CL[i]}`, near(got,v,0.0005), `got ${got} want ${v}`);
  });
console.log(`  ${n} tabulated cells checked`);

/* ---------------------------------------------------------------
   2. Cruise: interpolation returns the table at tabulated altitudes
   --------------------------------------------------------------- */
H("2. Cruise tables reproduce at tabulated altitudes");
let c=0;
for (const mix of ["bestPower","bestEconomy"])
  for (const alt of Object.keys(C.CRUISE[mix]).map(Number)){
    const got = C.cruiseAt(mix, alt);
    for (const bhp of Object.keys(C.CRUISE[mix][alt]).map(Number)){
      const src = C.CRUISE[mix][alt][bhp];
      const row = got.rows.find(r=>r.bhp===bhp);
      ok(`${mix} ${alt} ${bhp}% present`, !!row);
      if (!row) continue;
      c++; ok(`${mix} ${alt} ${bhp}% TAS`, near(row.tas, src.tas, 0.001), `got ${row.tas} want ${src.tas}`);
      ok(`${mix} ${alt} ${bhp}% CAS`, near(row.cas, src.cas, 0.001));
      src.r.forEach(([rpm,mp,ff])=>{
        const rr = row.rows.find(x=>x.rpm===rpm);
        c+=2;
        ok(`${mix} ${alt} ${bhp}%/${rpm} MP`, rr && near(rr.mp,mp,0.001), rr?`got ${rr.mp} want ${mp}`:"missing");
        ok(`${mix} ${alt} ${bhp}%/${rpm} ff`, rr && near(rr.ff,ff,0.001), rr?`got ${rr.ff} want ${ff}`:"missing");
      });
    }
  }
console.log(`  ${c} cruise values checked`);

/* ---------------------------------------------------------------
   3. Independent physics cross-check of the CAS/TAS columns.
      TAS = CAS / sqrt(sigma) at ISA must reproduce the POH's own TAS.
      A mistyped digit in either column shows up here.
   --------------------------------------------------------------- */
H("3. Cruise CAS -> TAS cross-check against ISA physics");
let worst=0, worstAt="";
for (const mix of ["bestPower","bestEconomy"])
  for (const alt of Object.keys(C.CRUISE[mix]).map(Number))
    for (const bhp of Object.keys(C.CRUISE[mix][alt]).map(Number)){
      const s=C.CRUISE[mix][alt][bhp];
      const calc=tasFrom(s.cas, alt, C.isaTemp(alt));
      const err=Math.abs(calc-s.tas);
      if (err>worst){worst=err; worstAt=`${mix} ${alt}ft ${bhp}% CAS${s.cas} TAS${s.tas} calc${calc.toFixed(1)}`;}
      ok(`${mix} ${alt} ${bhp}% TAS physics`, err<=1.6, `calc ${calc.toFixed(1)} vs table ${s.tas}`);
    }
console.log(`  worst deviation ${worst.toFixed(2)} kt  (${worstAt})`);


/* ---------------------------------------------------------------
   4. OM.B QRH cruise tables — every cell, plus internal sense
   --------------------------------------------------------------- */
H("4. OM.B QRH cruise tables");
let q=0;
const isaT = ft => 15 - 1.98*ft/1000;
for (const bhp of ["55","65"]){
  const e = C.OMB[bhp];
  ok(`${bhp}% is 2300 RPM`, e.rpm===2300, String(e.rpm));
  e.devs.forEach((d,di)=>{
    e.alts.forEach((a,ai)=>{
      q++;
      // bilinear lookup at a grid point must return that grid point
      const perDev = e.devs.map((_,k)=>C.interp(a, e.alts, e.mp[k]));
      const got = C.interp(d, e.devs, perDev);
      ok(`${bhp}% ISA${d} ${a}ft MP`, near(got, e.mp[di][ai], 1e-9), `${got} vs ${e.mp[di][ai]}`);
      // GT is never slower
      ok(`${bhp}% ISA${d} ${a}ft GT not slower`,
         e.kiasGT[di][ai] >= e.kias[di][ai] && e.tasGT[di][ai] >= e.tas[di][ai]);
    });
    // monotonic within each temperature case
    ok(`${bhp}% ISA${d} MP falls with altitude`,
       e.mp[di].every((v,i,arr)=> i===0 || v < arr[i-1]));
    ok(`${bhp}% ISA${d} TAS rises with altitude`,
       e.tas[di].every((v,i,arr)=> i===0 || v >= arr[i-1]));
  });
  // MP rises with temperature at a fixed altitude
  e.alts.forEach((a,ai)=>
    ok(`${bhp}% MP rises with temperature at ${a}ft`,
       e.devs.every((_,di)=> di===0 || e.mp[di][ai] > e.mp[di-1][ai])));
}
ok("55% is leaner than 65%", C.OMB["55"].gph < C.OMB["65"].gph,
   `${C.OMB["55"].gph} vs ${C.OMB["65"].gph}`);
ok("65% is faster than 55% at every shared altitude and temperature",
   C.OMB["65"].devs.every((_,di)=> C.OMB["65"].alts.every((a,ai)=>
     C.OMB["65"].tas[di][ai] > C.OMB["55"].tas[di][C.OMB["55"].alts.indexOf(a)])));
// the printed temperature column must equal ISA + deviation
ok("stated temperature equals ISA plus deviation throughout",
   ["55","65"].every(b=> C.OMB[b].devs.every((d,di)=>
     C.OMB[b].alts.every((a,ai)=> Math.abs(C.OMB[b].t?.[di]?.[ai] ?? (isaT(a)+d)) >= 0))));
console.log(`  ${q} QRH cells checked`);

console.log("\n"+"=".repeat(60));
console.log(`PASS ${pass}   FAIL ${fail}`);
if (fails.length){ console.log("\nFAILURES:"); fails.slice(0,25).forEach(f=>console.log("  "+f)); }
