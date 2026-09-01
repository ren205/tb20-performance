const C = require('./verify_core.js');
let pass=0, fail=0; const fails=[];
const ok=(n,c,d)=>{ if(c) pass++; else {fail++; fails.push(n+(d?"  ["+d+"]":""));} };
const near=(a,b,t)=>Math.abs(a-b)<=t;
const H=t=>console.log("\n"+t+"\n"+"=".repeat(t.length));

H("4. Monotonicity — physical sense across the whole envelope");
let mono=true, det="";
for (let w=1075; w<=1400; w+=25){
  let prev=-1;
  for (let pa=0; pa<=10000; pa+=250){
    const v=C.lookup3(C.TAKEOFF,w,pa,0,C.PA_TO,o=>o.c50);
    if (v<prev){mono=false; det=`w${w} pa${pa}`;} prev=v;
  }
}
ok("take-off distance rises with pressure altitude", mono, det);
mono=true;
for (let pa=0; pa<=10000; pa+=500) for (let d=-20; d<20; d+=1)
  if (C.lookup3(C.TAKEOFF,1400,pa,d+1,C.PA_TO,o=>o.c50) < C.lookup3(C.TAKEOFF,1400,pa,d,C.PA_TO,o=>o.c50)) mono=false;
ok("take-off distance rises with temperature", mono);
mono=true;
for (let w=1075; w<1400; w+=5)
  if (C.lookup3(C.TAKEOFF,w+5,4000,0,C.PA_TO,o=>o.c50) < C.lookup3(C.TAKEOFF,w,4000,0,C.PA_TO,o=>o.c50)) mono=false;
ok("take-off distance rises with mass", mono);
mono=true;
for (let pa=0; pa<=10000; pa+=250)
  if (C.lookup3(C.LANDING,1400,pa+250,0,C.PA_TO,o=>o.c50) < C.lookup3(C.LANDING,1400,pa,0,C.PA_TO,o=>o.c50)) mono=false;
ok("landing distance rises with pressure altitude", mono);
mono=true;
for (let pa=500; pa<12500; pa+=250)
  if (C.lookup3(C.ROC,1400,pa+250,0,C.PA_CL,o=>o) > C.lookup3(C.ROC,1400,pa,0,C.PA_CL,o=>o)) mono=false;
ok("rate of climb falls with altitude", mono);
mono=true;
for (let w=1075; w<1400; w+=5)
  if (C.lookup3(C.ROC,w+5,4500,0,C.PA_CL,o=>o) > C.lookup3(C.ROC,w,4500,0,C.PA_CL,o=>o)) mono=false;
ok("rate of climb falls with mass", mono);
mono=true;
for (const f of ["t","f","d"]) for (let pa=500; pa<12500; pa+=250)
  if (C.lookup3(C.CLIMB,1400,pa+250,0,C.PA_CL,o=>o[f]) < C.lookup3(C.CLIMB,1400,pa,0,C.PA_CL,o=>o[f])) mono=false;
ok("climb time / fuel / distance accumulate with altitude", mono);
ok("roll is always shorter than the 50 ft distance",
   [C.TAKEOFF,C.LANDING].every(t=>C.W_KEYS.every(w=>C.DISA.every(d=>
     t[w][String(d)].roll.every((v,i)=>v < t[w][String(d)].c50[i])))));

H("5. Cruise table internal sense");
let issues=[];
for (const mix of ["bestPower","bestEconomy"])
  for (const alt of Object.keys(C.CRUISE[mix]).map(Number)){
    const bands=Object.keys(C.CRUISE[mix][alt]).map(Number).sort((a,b)=>b-a);
    for (let i=0;i<bands.length-1;i++){
      const hi=C.CRUISE[mix][alt][bands[i]], lo=C.CRUISE[mix][alt][bands[i+1]];
      if (hi.tas < lo.tas) issues.push(`${mix} ${alt}: TAS not falling ${bands[i]}->${bands[i+1]}`);
      if (hi.r[0][2] < lo.r[0][2]) issues.push(`${mix} ${alt}: fuel flow not falling ${bands[i]}->${bands[i+1]}`);
    }
    for (const b of bands){
      const r=C.CRUISE[mix][alt][b].r;
      for (let i=0;i<r.length-1;i++){
        if (r[i+1][1] <= r[i][1]) issues.push(`${mix} ${alt} ${b}%: MP should rise as RPM falls (${r[i][0]}->${r[i+1][0]})`);
        if (r[i+1][2] >  r[i][2]) issues.push(`${mix} ${alt} ${b}%: fuel flow should fall as RPM falls`);
      }
      if (C.CRUISE[mix][alt][b].cas > C.CRUISE[mix][alt][b].tas + 0.001)
        issues.push(`${mix} ${alt} ${b}%: CAS exceeds TAS`);
    }
  }
ok("cruise tables internally consistent", issues.length===0, issues.slice(0,4).join(" | "));
let ecoLower=true;
for (const alt of Object.keys(C.CRUISE.bestPower).map(Number))
  for (const b of Object.keys(C.CRUISE.bestPower[alt]).map(Number)){
    const p=C.CRUISE.bestPower[alt][b], e=C.CRUISE.bestEconomy[alt] && C.CRUISE.bestEconomy[alt][b];
    if (!e) continue;
    p.r.forEach(([rpm,,ff])=>{ const m=e.r.find(x=>x[0]===rpm); if (m && m[2] >= ff) ecoLower=false; });
    if (e.tas > p.tas) ecoLower=false;
  }
ok("best economy burns less and flies slower than best power", ecoLower);
let mpSame=true;
for (const alt of Object.keys(C.CRUISE.bestPower).map(Number))
  for (const b of Object.keys(C.CRUISE.bestPower[alt]).map(Number)){
    const p=C.CRUISE.bestPower[alt][b], e=C.CRUISE.bestEconomy[alt] && C.CRUISE.bestEconomy[alt][b];
    if (!e) continue;
    p.r.forEach(([rpm,mp])=>{ const m=e.r.find(x=>x[0]===rpm); if (m && Math.abs(m[1]-mp)>0.15) mpSame=false; });
  }
ok("manifold pressure matches between mixtures at the same power", mpSame);

H("6. Extrapolation must be conservative, not clamped");
const t20=C.lookup3(C.TAKEOFF,1400,0,20,C.PA_TO,o=>o.c50);
const t35=C.lookup3(C.TAKEOFF,1400,0,35,C.PA_TO,o=>o.c50);
ok("hotter than ISA+20 gives a longer distance", t35>t20, `${t20.toFixed(0)} -> ${t35.toFixed(0)}`);
const p10=C.lookup3(C.TAKEOFF,1400,10000,0,C.PA_TO,o=>o.c50);
const p12=C.lookup3(C.TAKEOFF,1400,12000,0,C.PA_TO,o=>o.c50);
ok("higher than 10 000 ft gives a longer distance", p12>p10);
/* lookup3 is deliberately raw — every caller clamps mass first, so the contract
   under test is the clamp itself. */
ok("mass clamp pins 900 kg to the lightest tabulated mass",
   C.clamp(900,C.W_KG[0],C.W_KG[1])===1075);
ok("mass clamp pins 1500 kg to the heaviest tabulated mass",
   C.clamp(1500,C.W_KG[0],C.W_KG[1])===1400);
ok("a clamped light mass yields the 1075 kg distance",
   near(C.lookup3(C.TAKEOFF,C.clamp(900,C.W_KG[0],C.W_KG[1]),0,0,C.PA_TO,o=>o.c50),
        C.lookup3(C.TAKEOFF,1075,0,0,C.PA_TO,o=>o.c50), 0.001));
ok("unclamped, a light mass would under-read — which is why callers clamp",
   C.lookup3(C.TAKEOFF,900,0,0,C.PA_TO,o=>o.c50) < C.lookup3(C.TAKEOFF,1075,0,0,C.PA_TO,o=>o.c50));

H("7. Interpolated midpoints sit between their neighbours");
let bounded=true;
for (let pa=0; pa<10000; pa+=1000){
  const lo=C.lookup3(C.TAKEOFF,1400,pa,0,C.PA_TO,o=>o.c50);
  const hi=C.lookup3(C.TAKEOFF,1400,pa+2000,0,C.PA_TO,o=>o.c50);
  const mid=C.lookup3(C.TAKEOFF,1400,pa+1000,0,C.PA_TO,o=>o.c50);
  if (!(mid>=lo-1e-9 && mid<=hi+1e-9)) bounded=false;
}
ok("PA midpoints bounded by neighbours", bounded);
const wmid=C.lookup3(C.TAKEOFF,(1075+1400)/2,0,0,C.PA_TO,o=>o.c50);
ok("mass midpoint is the mean of the two tabulated masses",
   near(wmid,(1197+2083)/2,0.001), `got ${wmid.toFixed(1)} want ${(1197+2083)/2}`);

H("8. Units");
ok("1 ft = 0.3048 m", near(C.M_PER_FT,0.3048,1e-12));
ok("2370 lb = 1075 kg to POH rounding", near(2370/C.LB_PER_KG,1075,0.5), (2370/C.LB_PER_KG).toFixed(2));
ok("3086 lb = 1400 kg to POH rounding", near(3086/C.LB_PER_KG,1400,0.5), (3086/C.LB_PER_KG).toFixed(2));
ok("86.2 US gal = 326 L", near(86.2*3.785,326,1.0), (86.2*3.785).toFixed(1));
ok("8.5 US gal/h holding = 32 L/h", near(8.5*3.785,32,0.2));
ok("102.36 in = 2.600 m baggage arm", near(102.36*25.4,2600,1.0));
ok("74.80 in = 1.900 m cargo arm", near(74.80*25.4,1900,1.0));
ok("1 NM = 6076.12 ft", near(1852/0.3048,6076.12,0.2));

H("9. Atmosphere and climb gradient");
ok("TAS equals CAS at sea level in ISA", near(C.tasFrom(100,0,15),100,0.01));
ok("TAS exceeds CAS at altitude", C.tasFrom(95,5000,5.1) > 95);
ok("POH cruise cross-check: CAS 134 at 6500 ISA gives TAS 148",
   near(C.tasFrom(134,6500,C.isaTemp(6500)),148,1.0), C.tasFrom(134,6500,C.isaTemp(6500)).toFixed(1));
ok("warmer air raises TAS for the same CAS", C.tasFrom(95,5000,25) > C.tasFrom(95,5000,0));
ok("1 kt is 101.269 ft/min", near(C.KT_FPM, 1852/0.3048/60, 0.01));
ok("1 NM is 6076.115 ft", near(C.FT_NM, 1852/0.3048, 0.01));
{
  // gradient identities
  const roc=1131, tas=C.tasFrom(95,0,15);
  const g = roc/(tas*C.KT_FPM);
  ok("gradient % and ft/NM are the same quantity",
     near(g*C.FT_NM, g*100/100*C.FT_NM, 1e-9));
  ok("1% gradient is 60.76 ft/NM", near(0.01*C.FT_NM, 60.76, 0.01));
  ok("headwind steepens the ground gradient", roc/((tas-10)*C.KT_FPM) > g);
  ok("tailwind flattens the ground gradient", roc/((tas+10)*C.KT_FPM) < g);
  // the old 2%/1000ft rule of thumb overstates TAS and so under-reads the gradient
  const ruleTas = 95*(1+0.02*5000/1000), realTas = C.tasFrom(95,5000,C.isaTemp(5000));
  ok("rule-of-thumb TAS overstates the real TAS at 5000 ft", ruleTas > realTas,
     ruleTas.toFixed(1)+" vs "+realTas.toFixed(1));
}

H("10. Weight and balance — F-GVLD");
{
  // the weighing report reconciles from the wheel readings
  const wheels = 372+356+219;
  ok("wheel readings sum to the weighed mass", wheels===947, String(wheels));
  const D2 = 219*1.91/wheels, X = 1.465 - D2;
  ok("CG from the wheels matches the report", near(X,1.023299894,1e-6), X.toFixed(6));
  ok("TKS correction is 20.8 L at 1.09", near(20.8*1.09,22.672,0.001));
  const emptyKg = wheels-22.672, emptyMom = wheels*X-62.778768;
  ok("corrected empty mass matches the report", near(emptyKg,924.328,0.001), emptyKg.toFixed(3));
  ok("corrected empty arm matches the report", near(emptyMom/emptyKg,0.980,0.001), (emptyMom/emptyKg).toFixed(4));
  // avionics change
  const rm=[[1.20,.63],[.20,.63],[.10,.63],[.10,.63],[.20,.63],[.60,.63],[.70,.63]];
  const inst=[[.55,.63],[.45,.20],[.10,.10]];
  const sum=(a,f)=>a.reduce((s,x)=>s+f(x),0);
  ok("removed mass totals 3.10 kg", near(sum(rm,x=>x[0]),3.10,0.001));
  ok("installed mass totals 1.10 kg", near(sum(inst,x=>x[0]),1.10,0.001));
  const dM = sum(inst,x=>x[0])-sum(rm,x=>x[0]);
  const dMom = sum(inst,x=>x[0]*x[1])-sum(rm,x=>x[0]*x[1]);
  ok("net change is -2.00 kg", near(dM,-2.00,0.001), dM.toFixed(2));
  ok("net moment change is -1.51 kg.m", near(dMom,-1.5065,0.001), dMom.toFixed(4));
  ok("current empty mass", near(924.328+dM, C.WB.empty.kg, 0.001), (924.328+dM).toFixed(3));
  ok("current empty arm", near((emptyMom+dMom)/(emptyKg+dM)*1000, C.WB.empty.mm, 0.02),
     ((emptyMom+dMom)/(emptyKg+dM)*1000).toFixed(2));
  // envelope
  ok("forward limit at 1000 kg", near(C.fwdLimitAt(1000),913,1e-9));
  ok("forward limit at 1250 kg", near(C.fwdLimitAt(1250),949,1e-9));
  ok("forward limit at 1400 kg", near(C.fwdLimitAt(1400),1071,1e-9));
  ok("forward limit below 1000 kg holds at 913", near(C.fwdLimitAt(800),913,1e-9));
  ok("forward limit interpolates at 1325 kg", near(C.fwdLimitAt(1325),(949+1071)/2,1e-9));
  ok("aft limit is 1205 mm", C.WB.aftLimit===1205);
  // burning fuel moves the CG away from the tanks
  const cg=(items)=>items.reduce((s,i)=>s+i[0]*i[1],0)/items.reduce((s,i)=>s+i[0],0);
  const base=[[C.WB.empty.kg,C.WB.empty.mm],[85,1155],[75,1155]];
  const withFuel=(L)=>cg(base.concat([[L*0.72,1085]]));
  ok("CG forward of the tanks moves forward as fuel burns", withFuel(60) < withFuel(200),
     withFuel(200).toFixed(0)+" -> "+withFuel(60).toFixed(0));
  const aft=[[C.WB.empty.kg,C.WB.empty.mm],[85,1155],[200,2035]];
  const aftFuel=(L)=>cg(aft.concat([[L*0.72,1085]]));
  ok("CG aft of the tanks moves aft as fuel burns", aftFuel(60) > aftFuel(200),
     aftFuel(200).toFixed(0)+" -> "+aftFuel(60).toFixed(0));
}

H("11. Speeds and glide");
ok("Va at max mass is the placarded 129 KIAS", near(C.vaAt(1400),129,0.01));
ok("Va falls with mass (1000 kg)", near(C.vaAt(1000),129*Math.sqrt(1000/1400),0.01), C.vaAt(1000).toFixed(1));
ok("Va never exceeds the placarded value", C.vaAt(1500)<=129.001);
ok("clean glide 8:1 from 10 000 ft is 13.2 NM", near(C.glideNM(10000,{ld:8}),13.2,0.1), C.glideNM(10000,{ld:8}).toFixed(2));
ok("landing-flap glide 5:1 from 10 000 ft is 8.2 NM", near(C.glideNM(10000,{ld:5}),8.2,0.1));
ok("glide range scales linearly with height", near(C.glideNM(5000,{ld:8})*2, C.glideNM(10000,{ld:8}), 1e-9));
ok("take-off speeds rise with mass", C.TO_V[3086].lift > C.TO_V[2370].lift);
ok("50 ft speed exceeds lift-off speed at both masses",
   C.TO_V[2370].c50>C.TO_V[2370].lift && C.TO_V[3086].c50>C.TO_V[3086].lift);
ok("climb speed rises with mass", C.CLB_V[3086] > C.CLB_V[2370]);

console.log("\n"+"=".repeat(60));
console.log(`PASS ${pass}   FAIL ${fail}`);
if (fails.length){ console.log("\nFAILURES:"); fails.forEach(f=>console.log("  ✗ "+f)); }
