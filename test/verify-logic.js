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

H("9. Atmosphere and true airspeed");
ok("ISA at sea level is 15 C", near(C.isaTemp(0),15,1e-9));
ok("ISA lapse gives 5.1 C at 5000 ft", near(C.isaTemp(5000),5.1,0.05), C.isaTemp(5000).toFixed(2));
ok("700 hPa is about 9880 ft", near(C.plToAlt(700),9880,15), C.plToAlt(700).toFixed(0));
ok("800 hPa is about 6390 ft", near(C.plToAlt(800),6390,15), C.plToAlt(800).toFixed(0));
ok("6500 ft selects the 800 hPa level", C.nearestPL(6500)===800, String(C.nearestPL(6500)));
ok("10000 ft selects the 700 hPa level", C.nearestPL(10000)===700, String(C.nearestPL(10000)));
ok("TAS equals CAS at sea level in ISA", near(C.tasFrom(100,0,15),100,0.01));
ok("TAS exceeds CAS at altitude", C.tasFrom(134,6500,C.isaTemp(6500))>134);
ok("POH 6500 ft 65% eco: CAS 134 gives TAS 148",
   near(C.tasFrom(134,6500,C.isaTemp(6500)),148,1.0), C.tasFrom(134,6500,C.isaTemp(6500)).toFixed(1));
ok("warmer air gives a higher TAS for the same CAS",
   C.tasFrom(134,6500,25) > C.tasFrom(134,6500,2));

H("10. Wind triangle");
let w = C.windTriangle(150, 0, 0, 30);
ok("direct headwind: GS = TAS - wind", near(w.gs,120,0.01), w.gs.toFixed(2));
ok("direct headwind: no drift", near(w.wcaDeg,0,0.01));
w = C.windTriangle(150, 0, 180, 30);
ok("direct tailwind: GS = TAS + wind", near(w.gs,180,0.01), w.gs.toFixed(2));
w = C.windTriangle(150, 0, 90, 30);
ok("pure crosswind: no head component", near(w.head,0,0.01));
ok("pure crosswind: GS = sqrt(TAS^2 - XW^2)", near(w.gs,Math.sqrt(150*150-30*30),0.01), w.gs.toFixed(2));
ok("pure crosswind: drift = asin(30/150)", near(w.wcaDeg,Math.asin(30/150)*180/Math.PI,0.01));
w = C.windTriangle(150, 90, 45, 20);
ok("quartering headwind slows the aircraft", w.gs<150 && w.head>0, `gs ${w.gs.toFixed(1)} head ${w.head.toFixed(1)}`);
ok("zero wind leaves GS equal to TAS", near(C.windTriangle(150,123,0,0).gs,150,1e-9));

H("11. Great-circle navigation");
const LFSN=[0,0,48.692,6.230], LFST=[0,0,48.538,7.628], LFPG=[0,0,49.013,2.550];
ok("LFSN to LFST is about 56 NM", near(C.gcNM(LFSN,LFST),56,1.5), C.gcNM(LFSN,LFST).toFixed(1));
ok("LFSN to LFST tracks about 099 T", near(C.gcTrack(LFSN,LFST),99,2), C.gcTrack(LFSN,LFST).toFixed(0));
ok("reverse track is the reciprocal", near((C.gcTrack(LFST,LFSN)+180)%360, C.gcTrack(LFSN,LFST), 1.5));
ok("distance is symmetric", near(C.gcNM(LFSN,LFPG),C.gcNM(LFPG,LFSN),1e-9));
ok("zero distance to itself", near(C.gcNM(LFSN,LFSN),0,1e-9));
ok("1 degree of latitude is 60 NM", near(C.gcNM([0,0,45,5],[0,0,46,5]),60,0.3), C.gcNM([0,0,45,5],[0,0,46,5]).toFixed(2));
const mid=C.midpoint(LFSN,LFST);
ok("midpoint lies between the endpoints", mid[2]>48.5&&mid[2]<48.75&&mid[3]>6.2&&mid[3]<7.7);
ok("midpoint is equidistant", near(C.gcNM(LFSN,mid),C.gcNM(mid,LFST),0.1));

H("12. Sun times — Nancy, 9 August 2026");
const d=new Date(Date.UTC(2026,7,9));
const dawn=C.sunEvent(48.692,6.230,d,C.CIVIL_Z,true), rise=C.sunEvent(48.692,6.230,d,C.SUN_Z,true);
const set_=C.sunEvent(48.692,6.230,d,C.SUN_Z,false), dusk=C.sunEvent(48.692,6.230,d,C.CIVIL_Z,false);
const hm=m=>`${String(Math.floor(m/60)).padStart(2,"0")}:${String(Math.round(m%60)).padStart(2,"0")}`;
console.log(`  dawn ${hm(dawn)}  sunrise ${hm(rise)}  sunset ${hm(set_)}  dusk ${hm(dusk)} UTC`);
ok("sunrise about 04:19 UTC", near(rise,4*60+19,4), hm(rise));
ok("sunset about 19:01 UTC", near(set_,19*60+1,4), hm(set_));
ok("civil dawn precedes sunrise", dawn<rise);
ok("civil dusk follows sunset", dusk>set_);
ok("civil twilight is roughly 35 min at this latitude", near(rise-dawn,36,8), (rise-dawn).toFixed(0));
ok("day is about 14h40m in August", near(set_-rise,14*60+42,15), ((set_-rise)/60).toFixed(2)+" h");
const dj=new Date(Date.UTC(2026,11,21));
const rj=C.sunEvent(48.692,6.230,dj,C.SUN_Z,true), sj=C.sunEvent(48.692,6.230,dj,C.SUN_Z,false);
ok("December day is much shorter than August", (sj-rj) < (set_-rise)-300, ((sj-rj)/60).toFixed(2)+" h");
ok("polar night returns null", C.sunEvent(80,20,dj,C.SUN_Z,true)===null);

H("13. Weight and balance — POH Figure 6.3 worked example");
const A=C.WB.arms, kg=l=>l*C.WB.fuel.kgPerL;
const items=[[846.5,961.6],[77.1,A.front.mm],[77.1,A.front.mm],[154.2,A.rear.mm],[49.9,A.baggage.mm],[kg(249.8),A.fuel.mm]];
const tow=items.reduce((s,i)=>s+i[0],0), mom=items.reduce((s,i)=>s+i[0]*i[1],0), cg=mom/tow;
console.log(`  computed ${tow.toFixed(1)} kg, CG ${cg.toFixed(0)} mm (${(cg/25.4).toFixed(2)} in)`);
ok("total mass matches the POH 3053 lb", near(tow*C.LB_PER_KG,3053,1.5), (tow*C.LB_PER_KG).toFixed(0));
ok("CG matches the POH 46.35 in", near(cg/25.4,46.35,0.05), (cg/25.4).toFixed(2));
ok("POH moment 141.50 lb.in/1000 reproduced",
   near(tow*C.LB_PER_KG*(cg/25.4)/1000,141.50,0.4), (tow*C.LB_PER_KG*(cg/25.4)/1000).toFixed(2));
ok("forward limit at 1400 kg is 1071 mm", near(C.fwdLimitAt(1400),1071,0.01));
ok("forward limit at 1250 kg is 949 mm", near(C.fwdLimitAt(1250),949,0.01));
ok("forward limit at 1000 kg is 913 mm", near(C.fwdLimitAt(1000),913,0.01));
ok("forward limit below 1000 kg stays 913 mm", near(C.fwdLimitAt(800),913,0.01));
ok("forward limit interpolates linearly at 1325 kg", near(C.fwdLimitAt(1325),(949+1071)/2,0.01));
ok("sample loading sits inside the envelope", cg>=C.fwdLimitAt(tow) && cg<=C.WB.aftLimit);

H("14. Speeds and glide");
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
