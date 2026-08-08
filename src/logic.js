
/* ==================================================================
 * Factoring bases.
 *
 * Part-NCO is deliberately not given a regulatory multiplier: NCO.POL.110
 * requires only that performance be "adequate", and neither the rule nor its
 * AMC/GM prescribes any number. The figures offered under that basis are the
 * UK CAA Safety Sense 09 advisory factors, flagged as advisory in the ledger.
 *
 * Both the Part-CAT AMC and the CAA leaflet say their surface factors apply
 * "unless otherwise specified in the AFM". The TB20 POH does specify grass
 * factors, so POH values win wherever the POH covers the surface; the
 * regulatory table is used only where the POH is silent.
 * ================================================================== */
const SURFACES = {
  tar_dry:     { label:"Tar / paved, dry",  poh:1.00 },
  tar_wet:     { label:"Tar / paved, wet",  cat:{to:1.00, ldg:1.15}, caa:{to:1.00, ldg:1.15} },
  hard_sod:    { label:"Hard sod",          poh:1.07 },
  grass_short: { label:"Short grass, dry",  poh:1.10 },
  grass_wet:   { label:"Grass, wet",        cat:{to:1.30, ldg:1.15}, caa:{to:1.30, ldg:1.35} },
  grass_high:  { label:"High grass",        poh:1.25 },
  soft:        { label:"Soft ground / snow",cat:{to:1.25, ldg:1.25}, caa:{to:1.25, ldg:1.25} }
};

const BASES = {
  none:{
    label:"Unfactored",
    kind:"none",
    note:["info","Unfactored — POH figures only",
      "Runway-surface and wind corrections from POH 5.7 are applied, but no regulatory or advisory " +
      "safety factor. These are test-pilot figures on a new aeroplane: they carry no margin for " +
      "technique, engine condition or wear."],
    windCredit:false, overall:{to:1.00, ldg:1.00}, slopePer1pct:0, surfaceSet:"caa",
    overallSrc:"none"
  },
  nco:{
    label:"Part-NCO",
    kind:"advisory",
    note:["warn","Part-NCO prescribes no performance factors",
      "NCO.POL.110 requires only that performance be adequate for the aerodrome and the rules of the " +
      "air; neither the rule nor its AMC/GM sets any multiplier. The factors applied here are the " +
      "<b>UK CAA Safety Sense 09</b> advisory values — good practice, not law. Your operating " +
      "authority may expect something different."],
    windCredit:false, overall:{to:1.33, ldg:1.43}, slopePer1pct:0.05, surfaceSet:"caa",
    overallSrc:"CAA SSL09 general safety factor"
  },
  cat:{
    label:"Part-CAT B",
    kind:"regulatory",
    note:["info","Part-CAT, performance class B",
      "CAT.POL.A.305: unfactored take-off distance × <b>1.25</b> must not exceed TORA. " +
      "CAT.POL.A.330: full stop from 50 ft within <b>70%</b> of LDA (× <b>1.43</b>). " +
      "Wind credit is limited to 50% of headwind and 150% of tailwind."],
    windCredit:true, overall:{to:1.25, ldg:1/0.70}, slopePer1pct:0.05, surfaceSet:"cat",
    overallSrc:"CAT.POL.A.305 (vs TORA) / CAT.POL.A.330 (70% LDA)"
  }
};

/* Weight & balance — POH Section 2.9 (limits) and Figure 6.3 (arms).
   Datum is the front face of the firewall; arms in mm, masses in kg.

   The POH states the CG limits and the baggage / cargo stations in both units,
   and its metric figures are independently rounded rather than exact
   conversions (35.9 in is 911.9 mm, but the manual says 0.913 m). The stated
   metric values are used verbatim. The seat and fuel arms appear only in
   inches in Figure 6.3, so those are converted and marked as such.

   Figure 6.3's sample uses a baggage arm of 102.54 in (2604 mm) while Section
   6.3 states 102.36 in (2.600 m). The dual-unit figure is used here; the
   difference moves the CG by under 0.2 mm at any realistic load. */
const MM_PER_IN = 25.4;
const WB = {
  arms:{
    front:        { mm:45.38*MM_PER_IN, src:"conv" },
    frontBackoff: { mm:47.44*MM_PER_IN, src:"conv" },
    rear:         { mm:80.00*MM_PER_IN, src:"conv" },
    fuel:         { mm:42.70*MM_PER_IN, src:"conv" },
    baggage:      { mm:2600,            src:"poh"  }
  },
  fwdLimit:[[1000,913],[1250,949],[1400,1071]],   // kg, mm — POH 2.9 metric
  aftLimit:1205,                                   // mm — POH 2.9 metric
  maxKg:{ tow:1400, baggage:65, rearSeats:231 },
  fuel:{ usableL:326, kgPerL:0.72 }
};
const inOf = mm => mm / MM_PER_IN;
const fwdLimitAt = kg => interp(clamp(kg, WB.fwdLimit[0][0], WB.fwdLimit[2][0]),
                                WB.fwdLimit.map(p=>p[0]), WB.fwdLimit.map(p=>p[1]));

/* ------------------------------------------------------------------ */
const $ = id => document.getElementById(id);
const num = id => { const v = parseFloat($(id).value); return Number.isFinite(v) ? v : 0; };
let basis = "none", mix = "bestPower";

/* Field sets. Take-off and landing are separate aerodromes, so each carries
   its own weather, runway and declared distances. */
const DEP = { icao:"depIcao", elev:"elev", qnh:"qnh", oat:"oat", wt:"wt", rwy:"rwy",
              wdir:"wdir", wspd:"wspd", wref:"wref", varn:"varn", slope:"slope",
              surf:"surf", tora:"tora", toda:"toda", asda:"asda", lda:null };
const ARR = { icao:"arrIcao", elev:"aElev", qnh:"aQnh", oat:"aOat", wt:"aWt", rwy:"aRwy",
              wdir:"aWdir", wspd:"aWspd", wref:"aWref", varn:"aVarn", slope:"aSlope",
              surf:"aSurf", tora:null, toda:null, asda:null, lda:"lda" };

function conditions(S){
  const g = k => S[k] ? num(S[k]) : 0;
  const elev = g("elev"), qnh = g("qnh") || 1013.25, oat = g("oat");
  const pa   = elev + (1013.25 - qnh) * 27;
  const dev  = oat - isaTemp(pa);
  const wRaw = g("wt");
  /* QFU is magnetic. METAR and TAF winds are true, ATIS and tower winds are
     magnetic, so a true wind is converted before being resolved against the
     runway. Variation is east-positive: magnetic = true - variation. */
  const trueWind = $(S.wref).value === "true";
  const varn = g("varn");
  const windMag = trueWind ? g("wdir") - varn : g("wdir");
  const ang  = ((windMag - g("rwy")) * Math.PI) / 180;
  const spd  = g("wspd");
  const surfEl = $(S.surf).value;
  return { icao: ($(S.icao).value || "").toUpperCase(), elev, qnh, oat, pa, dev,
           da: pa + 118.8 * dev, wRaw, w: clamp(wRaw, W_KG[0], W_KG[1]),
           hw: spd * Math.cos(ang), xw: Math.abs(spd * Math.sin(ang)),
           windMag: ((windMag % 360) + 360) % 360, trueWind, varn,
           slope: g("slope"), surf: SURFACES[surfEl] ? surfEl : "tar_dry",
           tora: g("tora") * FT_PER_M, toda: g("toda") * FT_PER_M,
           asda: g("asda") * FT_PER_M, lda: g("lda") * FT_PER_M };
}

const windFactor = hw => hw >= 0 ? 1 - 0.10 * (hw / 10) : 1 + 0.30 * (-hw / 10);
const flag = (cls, title, body) => `<div class="flag ${cls}"><b>${title}</b>${body||""}</div>`;

/* Build the ordered list of multipliers for one case, each with its source, so
   the ledger can show exactly what was applied and where it came from. */
function factors(kind, c, B){
  const out = [];
  // 1. wind — regulatory credit limit first, then the POH's own correction
  let hw = c.hw;
  if (B.windCredit){
    hw = hw >= 0 ? hw * 0.5 : hw * 1.5;
    out.push({ name:`Wind credit — ${fmt(Math.abs(c.hw),1)} kt ${c.hw>=0?"HW":"TW"} counted as ${fmt(Math.abs(hw),1)} kt`,
               f:null, src:"CAT.POL.A.305(c)(6) / .330(a)(2)" });
  }
  if (Math.abs(hw) > 0.05)
    out.push({ name:`Wind — ${fmt(Math.abs(hw),1)} kt ${hw>=0?"headwind":"tailwind"}`,
               f:windFactor(hw), src:"POH 5.7" });
  // 2. surface — POH wherever it covers the surface, regulation only where silent
  const s = SURFACES[c.surf];
  if (s.poh !== undefined){
    if (s.poh !== 1.00) out.push({ name:`Surface — ${s.label}`, f:s.poh, src:"POH 5.7" });
  } else {
    const set = s[B.surfaceSet] || s.caa;
    const f = set[kind];
    if (f !== 1.00) out.push({ name:`Surface — ${s.label}`, f,
      src: B.surfaceSet === "cat" ? "AMC1-CAT.POL.A.305 / .330" : "CAA SSL09" });
  }
  /* 3. slope — upslope penalises take-off, downslope penalises landing.
        Take-off uses AMC1-CAT.POL.A.305 (+5% per 1% upslope). For landing,
        CAT.POL.A.330(a)(4) requires slope to be accounted for but its AMC
        gives no figure, so the CAA's "2% downhill = x1.1" is used in both
        factored bases. Slope is entered as +up on departure and +down on
        arrival, so a positive value always means the penalising direction. */
  if (B.slopePer1pct && c.slope > 0)
    out.push({ name:`Slope — ${fmt(c.slope,1)}% ${kind === "to" ? "up" : "down"}`,
      f: 1 + B.slopePer1pct * c.slope,
      src: kind === "to" ? (B.kind === "regulatory" ? "AMC1-CAT.POL.A.305" : "CAA SSL09")
                         : (B.kind === "regulatory"
                              ? "CAT.POL.A.330(a)(4), figure from CAA SSL09" : "CAA SSL09") });
  return out;   // the operational factor is applied by the declared-distance test
}

/* Declared-distance tests for the active basis.
 *
 * CAT.POL.A.305(b) offers two routes. With no stopway or clearway declared,
 * the single test is TOD x 1.25 against TORA. Once a stopway and/or clearway
 * exists, the TORA test drops to x 1.00 and the TODA and ASDA tests join it.
 * The published text separates those three with "or", but its predecessor
 * EU-OPS 1.530 used "and", and an "or" reading would make route (2) weaker
 * than route (1); all three are therefore required here. Each is shown
 * separately so the individual results stay visible.
 */
function tests(kind, c, B){
  if (kind === "ldg")
    return [{ name:"LDA", f:B.overall.ldg, avail:c.lda, src:B.overallSrc }];
  if (B.kind !== "regulatory")
    return [{ name:"TORA", f:B.overall.to, avail:c.tora, src:B.overallSrc }];
  if (!(c.toda > 0 || c.asda > 0))
    return [{ name:"TORA", f:1.25, avail:c.tora, src:"CAT.POL.A.305(b)(1)" }];
  return [
    { name:"TORA", f:1.00, avail:c.tora, src:"CAT.POL.A.305(b)(2)(i)" },
    { name:"TODA", f:1.15, avail:c.toda, src:"CAT.POL.A.305(b)(2)(ii)" },
    { name:"ASDA", f:1.30, avail:c.asda, src:"CAT.POL.A.305(b)(2)(iii)" }
  ];
}

/* The governing test drives the headline figure and the last ledger row. */
function withPrimary(fx, t, B){
  return t.f === 1.00 ? fx : fx.concat([{
    name:`${B.kind === "regulatory" ? "Regulatory" : "Advisory"} factor — vs ${t.name}`,
    f:t.f, src:t.src }]);
}

function checksTable(cond, ts){
  const m = ft => fmt(toM(ft)) + " m";
  let h = `<tr><th>Test</th><th>Factor</th><th>Required</th><th>Available</th><th>Margin</th></tr>`;
  let fail = 0, given = 0;
  for (const t of ts){
    const req = cond * t.f;
    const head = `<td>${t.name}<br><span class="src">${t.src}</span></td><td>x${t.f.toFixed(2)}</td><td>${m(req)}</td>`;
    if (!t.avail){ h += `<tr>${head}<td colspan="2" style="color:var(--dim)">not entered</td></tr>`; continue; }
    given++;
    const sp = t.avail - req; if (sp < 0) fail++;
    h += `<tr>${head}<td>${m(t.avail)}</td>` +
         `<td style="color:${sp<0?"var(--bad)":"var(--good)"}">${sp<0?"\u2212":"+"}${m(Math.abs(sp))}</td></tr>`;
  }
  return { html:h, fail, given };
}
const product = fx => fx.reduce((a,x) => a * (x.f ?? 1), 1);

function ledger(base, fx, total){
  const m = ft => fmt(toM(ft)) + " m";
  let h = `<div><span class="f">POH unfactored, tar dry, no wind</span><span class="n">${m(base)}</span></div>`;
  let run = base;
  for (const x of fx){
    if (x.f != null) run *= x.f;
    h += `<div><span class="f">${x.name}<br><span class="src">${x.src}</span></span>` +
         `<span class="n">${x.f != null ? "×" + x.f.toFixed(3) + " → " + m(run) : "—"}</span></div>`;
  }
  h += `<div><span>Total ×${product(fx).toFixed(3)}</span><span>${m(total)}</span></div>`;
  return h;
}

/* ------------------------------------------------------------------ */
function renderConditions(c, ids, flagsId, isArr){
  $(ids.pa).textContent  = fmt(c.pa) + " ft";
  $(ids.isa).textContent = (c.dev >= 0 ? "+" : "") + fmt(c.dev,1) + " °C";
  $(ids.da).textContent  = fmt(c.da) + " ft";
  $(ids.hw).textContent  = c.hw >= 0 ? fmt(c.hw,1)+" kt HW" : fmt(-c.hw,1)+" kt TW";
  $(ids.xw).textContent  = fmt(c.xw,1) + " kt";
  $(ids.wt).textContent  = fmt(c.wRaw)+" kg / "+fmt(c.wRaw*LB_PER_KG)+" lb";
  let f = "";
  if (c.wRaw > MTOW_KG) f += flag("bad", isArr ? "Over max landing mass" : "Over max take-off mass",
      `${fmt(c.wRaw)} kg exceeds ${fmt(MTOW_KG)} kg. Figures below are not valid.`);
  else if (c.wRaw < W_KG[0] && c.wRaw > 0) f += flag("warn","Below the lightest tabulated mass",
      `Computed at ${fmt(W_KG[0])} kg — conservative (real distances will be shorter).`);
  if (c.trueWind && c.varn)
    f += flag("info","Wind converted to magnetic",
      `True ${fmt(((c.windMag + c.varn) % 360 + 360) % 360)}° with ${fmt(Math.abs(c.varn),1)}°` +
      `${c.varn >= 0 ? "E" : "W"} variation is magnetic ${fmt(c.windMag)}°, resolved against the QFU.`);
  else if (c.trueWind && !c.varn && $(isArr ? "aWspd" : "wspd").value > 0)
    f += flag("warn","Variation is zero",
      `The wind is set to true but no magnetic variation is entered, so it is being resolved ` +
      `directly against a magnetic QFU. Enter the local variation.`);
  if (c.xw > XW_DEMO) f += flag("bad","Crosswind above demonstrated",
      `${fmt(c.xw,1)} kt vs 25 kt demonstrated.`);
  else if (c.xw > XW_DEMO*0.8) f += flag("warn","Crosswind approaching demonstrated limit",
      `${fmt(c.xw,1)} kt of 25 kt.`);
  if (c.hw < 0) f += flag("warn","Tailwind component",
      `${fmt(-c.hw,1)} kt — the POH adds 30% per 10 kt.`);
  $(flagsId).innerHTML = f;
}
const DEP_IDS = { pa:"dPA", isa:"dISA", da:"dDA", hw:"dHW", xw:"dXW", wt:"dWT" };
const ARR_IDS = { pa:"aDPA", isa:"aDISA", da:"aDDA", hw:"aDHW", xw:"aDXW", wt:"aDWT" };

function rangeFlags(c, paAxis){
  let f = "";
  const hi = paAxis[paAxis.length-1];
  if (c.pa > hi) f += flag("bad","Pressure altitude beyond the table",
      `${fmt(c.pa)} ft is above the tabulated ${fmt(hi)} ft — extrapolated, treat as unreliable.`);
  if (Math.abs(c.dev) > 20) f += flag("warn","Temperature beyond the table",
      `ISA${c.dev>0?"+":""}${fmt(c.dev,0)} °C is outside ISA±20 — linearly extrapolated.`);
  return f;
}

function renderTakeoff(c){
  const B = BASES[basis], cf = factors("to", c, B);
  const ts = tests("to", c, B), fx = withPrimary(cf, ts[0], B), k = product(fx);
  const base50 = lookup3(TAKEOFF, c.w, c.pa, c.dev, PA_TO, o=>o.c50);
  const roll   = lookup3(TAKEOFF, c.w, c.pa, c.dev, PA_TO, o=>o.roll);
  const cond   = base50 * product(cf);           // conditions applied, before the operational factor
  $("to50").innerHTML  = dist(base50*k);
  $("toRoll").innerHTML= dist(roll*product(cf)*ts[0].f);
  $("toRaw").innerHTML = dist(base50);
  $("toVlo").innerHTML = fmt(interp(c.w, W_KG, [TO_V[2370].lift, TO_V[3086].lift])) + ` <small>KIAS</small>`;
  $("toV50").innerHTML = fmt(interp(c.w, W_KG, [TO_V[2370].c50,  TO_V[3086].c50]))  + ` <small>KIAS</small>`;
  $("toFx").innerHTML  = ledger(base50, fx, base50*k);
  const ch = checksTable(cond, ts);
  $("toChecks").innerHTML = ch.html;
  $("toChkNote").innerHTML = ts.length > 1
    ? "A stopway and/or clearway is declared, so CAT.POL.A.305(b)(2) applies: the TORA test drops to " +
      "&times;1.00 and the TODA and ASDA tests join it. All three are required here \u2014 see the note in " +
      "Reference on the &ldquo;or&rdquo; in the published text."
    : (BASES[basis].kind === "regulatory"
        ? "No stopway or clearway declared, so CAT.POL.A.305(b)(1) applies: &times;1.25 against TORA. " +
          "Enter a TODA or ASDA to switch to route (2)."
        : "");
  $("toFlags").innerHTML = rangeFlags(c, PA_TO) +
    (ch.given ? (ch.fail ? flag("bad", ch.fail>1?`${ch.fail} declared-distance tests fail`:"Declared distance too short",
                               "See the runway requirement table below.")
                         : flag("ok","All declared-distance tests pass","")) : "");
}

function renderLanding(c){
  const B = BASES[basis], cf = factors("ldg", c, B);
  const ts = tests("ldg", c, B), fx = withPrimary(cf, ts[0], B), k = product(fx);
  const base50 = lookup3(LANDING, c.w, c.pa, c.dev, PA_TO, o=>o.c50);
  const roll   = lookup3(LANDING, c.w, c.pa, c.dev, PA_TO, o=>o.roll);
  $("ld50").innerHTML  = dist(base50*k);
  $("ldRoll").innerHTML= dist(roll*product(cf)*ts[0].f);
  $("ldRaw").innerHTML = dist(base50);
  $("ldV").innerHTML   = fmt(interp(c.w, W_KG, [LD_V[2370], LD_V[3086]]),1) + ` <small>KIAS</small>`;
  $("ldFx").innerHTML  = ledger(base50, fx, base50*k);
  const ch = checksTable(base50*product(cf), ts);
  $("ldChecks").innerHTML = ch.html;
  $("ldFlags").innerHTML = rangeFlags(c, PA_TO) +
    (ch.given ? (ch.fail ? flag("bad","LDA too short","See the runway requirement table below.")
                         : flag("ok","Landing distance available is adequate","")) : "");
}

function renderClimb(c){
  const roc = lookup3(ROC, c.w, c.pa, c.dev, PA_CL, o=>o);
  const v   = interp(c.w, W_KG, [CLB_V[2370], CLB_V[3086]]);
  $("roc").innerHTML  = fmt(roc) + ` <small>ft/min</small>`;
  $("clbV").innerHTML = fmt(v) + ` <small>KIAS</small>`;
  $("clbG").innerHTML = fmt(roc / (v*(1+0.02*c.pa/1000) * 101.27) * 6076) + ` <small>ft/NM</small>`;
  let f = rangeFlags(c, PA_CL);
  if (roc < 200) f += flag("bad","Very low rate of climb", `${fmt(roc)} ft/min at these conditions.`);
  else if (roc < 500) f += flag("warn","Low rate of climb", `${fmt(roc)} ft/min.`);
  $("clbFlags").innerHTML = f;

  const a = num("cFrom"), b = num("cTo");
  const at = k => Math.max(0, lookup3(CLIMB, c.w, k, c.dev, PA_CL, o=>o.t));
  const af = k => Math.max(0, lookup3(CLIMB, c.w, k, c.dev, PA_CL, o=>o.f));
  const ad = k => Math.max(0, lookup3(CLIMB, c.w, k, c.dev, PA_CL, o=>o.d));
  const dt = Math.max(0, at(b)-at(a)), df = Math.max(0, af(b)-af(a)), dd = Math.max(0, ad(b)-ad(a));
  $("cT").innerHTML = `${Math.floor(dt)}<small>:</small>${String(Math.round((dt%1)*60)).padStart(2,"0")} <small>min</small>`;
  $("cF").innerHTML = fmt(df,1) + ` <small>US gal / ${fmt(df*3.785,0)} L</small>`;
  $("cD").innerHTML = fmt(dd,1) + ` <small>NM still air</small>`;
  $("cFlags").innerHTML = b <= a ? flag("warn","Check the altitudes","Target is not above the start altitude.")
    : (b > 12500 ? flag("warn","Above the table","Climb table stops at 12 500 ft — extrapolated.") : "");
}

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
    if (rows.length) out.push({ bhp, tas: A[bhp].tas + f*(B2[bhp].tas-A[bhp].tas), rows });
  }
  return { rows: out, clamped: pa < alts[0] || pa > alts[alts.length-1] };
}

function renderCruise(){
  const pa = num("crzAlt"), fuelL = num("crzFuel"), d = num("crzDist"), res = num("crzRes");
  const fuel = fuelL / 3.785;                       // litres in, US gal for the tables
  const { rows, clamped } = cruiseAt(mix, pa);
  let h = `<tr><th>%BHP</th><th>RPM</th><th>MP</th><th>TAS</th><th>L/h</th><th>gal/h</th>
           <th>Endur</th><th>Range</th>${d?"<th>Leg</th><th>Fuel L</th>":""}</tr>`;
  for (const b of rows) b.rows.forEach((r,i) => {
    const usable = Math.max(0, fuel - res/60*r.ff), endur = usable/r.ff, range = endur*b.tas;
    const legT = d ? d/b.tas : 0;
    h += `<tr${i===0?' class="rec"':''}><td>${i===0?b.bhp+"%":""}</td><td>${r.rpm}</td>
      <td>${r.mp.toFixed(1)}</td><td>${Math.round(b.tas)}</td><td>${(r.ff*3.785).toFixed(1)}</td>
      <td>${r.ff.toFixed(1)}</td>
      <td>${Math.floor(endur)}:${String(Math.round((endur%1)*60)).padStart(2,"0")}</td>
      <td>${Math.round(range)}</td>
      ${d?`<td>${Math.floor(legT)}:${String(Math.round((legT%1)*60)).padStart(2,"0")}</td>
           <td>${(legT*r.ff*3.785).toFixed(1)}</td>`:""}</tr>`;
  });
  $("crzTable").innerHTML = h;
  $("crzFlags").innerHTML = (clamped ? flag("warn","Outside the cruise table",
      "Cruise data covers 500–12 500 ft; the nearest tabulated altitude was used.") : "")
    + (rows.length ? "" : flag("bad","No data at this altitude",""));
}

/* ---------------------------- W & B ---------------------------- */
function renderWB(){
  const frontArm = ($("wbBackoff").checked ? WB.arms.frontBackoff : WB.arms.front).mm;
  const fuelKg = l => l * WB.fuel.kgPerL;
  const items = [
    { n:"Empty aircraft", kg:num("wbEW"), arm:num("wbEA") },
    { n:"Pilot",          kg:num("wbP"),  arm:frontArm },
    { n:"Front passenger",kg:num("wbFP"), arm:frontArm },
    { n:"Rear passengers",kg:num("wbR"),  arm:WB.arms.rear.mm },
    { n:"Baggage",        kg:num("wbB"),  arm:WB.arms.baggage.mm },
    { n:`Fuel — ${fmt(num("wbF"))} L`, kg:fuelKg(num("wbF")), arm:WB.arms.fuel.mm }
  ];
  const sum = a => a.reduce((s,x)=>s+x, 0);
  const tow  = sum(items.map(i=>i.kg));
  const mom  = sum(items.map(i=>i.kg*i.arm));
  const cg   = tow ? mom/tow : 0;
  const tripKg = fuelKg(Math.min(num("wbTF"), num("wbF")));
  const ldw  = tow - tripKg, ldMom = mom - tripKg*WB.arms.fuel.mm, ldCg = ldw ? ldMom/ldw : 0;

  $("wbTOW").innerHTML = fmt(tow,1) + ` <small>kg / ${fmt(tow*LB_PER_KG)} lb</small>`;
  $("wbCG").innerHTML  = fmt(cg,0) + ` <small>mm / ${fmt(inOf(cg),2)} in</small>`;
  const fwd = fwdLimitAt(tow);
  $("wbLim").innerHTML = fmt(fwd,0) + `<small> – </small>` + fmt(WB.aftLimit,0) + ` <small>mm</small>`;

  let h = `<tr><th>Item</th><th>Mass kg</th><th>Arm mm</th><th>Moment kg·mm</th></tr>`;
  for (const i of items) if (i.kg)
    h += `<tr><td>${i.n}</td><td>${fmt(i.kg,1)}</td><td>${fmt(i.arm,0)}</td><td>${fmt(i.kg*i.arm)}</td></tr>`;
  h += `<tr class="rec"><td><b>Take-off</b></td><td><b>${fmt(tow,1)}</b></td><td><b>${fmt(cg,0)}</b></td><td><b>${fmt(mom)}</b></td></tr>`;
  if (tripKg) h += `<tr><td>After ${fmt(num("wbTF"))} L trip fuel</td><td>${fmt(ldw,1)}</td><td>${fmt(ldCg,0)}</td><td>${fmt(ldMom)}</td></tr>`;
  $("wbTable").innerHTML = h;

  let f = "";
  if (tow > WB.maxKg.tow) f += flag("bad","Over max take-off mass",
      `${fmt(tow,1)} kg exceeds ${WB.maxKg.tow} kg by ${fmt(tow-WB.maxKg.tow,1)} kg.`);
  if (num("wbB") > WB.maxKg.baggage) f += flag("bad","Baggage over limit",
      `${fmt(num("wbB"),1)} kg exceeds the ${WB.maxKg.baggage} kg baggage-compartment limit.`);
  if (num("wbR") > WB.maxKg.rearSeats) f += flag("bad","Rear seats over limit",
      `${fmt(num("wbR"),1)} kg exceeds the ${WB.maxKg.rearSeats} kg maximum on the rear seats.`);
  if (num("wbF") > WB.fuel.usableL) f += flag("warn","More than usable fuel",
      `${fmt(num("wbF"))} L exceeds the ${WB.fuel.usableL} L usable.`);
  const chk = (w, g, when) => {
    if (!w) return "";
    const lo = fwdLimitAt(w);
    if (g < lo) return flag("bad",`CG forward of limit ${when}`,
      `${fmt(g,0)} mm vs ${fmt(lo,0)} mm forward limit at ${fmt(w,1)} kg.`);
    if (g > WB.aftLimit) return flag("bad",`CG aft of limit ${when}`,
      `${fmt(g,0)} mm vs ${fmt(WB.aftLimit,0)} mm aft limit.`);
    return flag("ok",`Within envelope ${when}`,
      `CG ${fmt(g,0)} mm, limits ${fmt(lo,0)}–${fmt(WB.aftLimit,0)} mm at ${fmt(w,1)} kg.`);
  };
  f += chk(tow, cg, "at take-off");
  if (tripKg) f += chk(ldw, ldCg, "after trip fuel");
  $("wbFlags").innerHTML = f;

  drawEnvelope(tow, cg, tripKg ? ldw : null, ldCg);

  $("wbRef").innerHTML = `<tr><th>Station</th><th>Arm mm</th><th>Arm in</th><th>Source</th><th>Limit</th></tr>` +
    [["Front seats (standard)", WB.arms.front, "—"],
     ["Front seats (2-in back-off)", WB.arms.frontBackoff, "—"],
     ["Rear seats", WB.arms.rear, "231 kg"],
     ["Fuel", WB.arms.fuel, "326 L usable"],
     ["Baggage", WB.arms.baggage, "65 kg"]]
    .map(([n,a,lim]) => `<tr><td>${n}</td><td>${fmt(a.mm,0)}</td><td>${fmt(inOf(a.mm),2)}</td>` +
      `<td><span class="src">${a.src === "poh" ? "POH metric" : "converted from in"}</span></td><td>${lim}</td></tr>`).join("") +
    `<tr><td>Max take-off mass</td><td colspan="3">—</td><td>1400 kg</td></tr>` +
    `<tr><td>CG forward limit</td><td colspan="4">913 mm @1000 kg · 949 mm @1250 kg · 1071 mm @1400 kg — POH metric</td></tr>` +
    `<tr><td>CG aft limit</td><td colspan="4">1205 mm, all masses — POH metric</td></tr>`;
}

function drawEnvelope(tow, cg, ldw, ldCg){
  const W=560, H=380, L=52, R=14, T=14, Bm=40;
  const x0=880, x1=1250, y0=850, y1=1450;
  const X = v => L + (v-x0)/(x1-x0)*(W-L-R);
  const Y = v => T + (1-(v-y0)/(y1-y0))*(H-T-Bm);
  const env = [[1000,913],[1250,949],[1400,1071],[1400,1205],[1000,1205]];
  // envelope below 1000 kg keeps the 35.9 in forward limit
  const poly = [[y0,913],...env,[y0,1205]].map(([w,a])=>`${X(a)},${Y(w)}`).join(" ");
  let g = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Weight and balance envelope">`;
  g += `<polygon points="${poly}" fill="rgba(88,166,255,.13)" stroke="#58a6ff" stroke-width="2"/>`;
  for (let a=900; a<=1250; a+=50) g +=
    `<line x1="${X(a)}" y1="${Y(y0)}" x2="${X(a)}" y2="${Y(y1)}" stroke="#2d3540" stroke-width="1"/>
     <text x="${X(a)}" y="${H-Bm+18}" fill="#8b949e" font-size="11" text-anchor="middle">${a}</text>`;
  for (let w=900; w<=1400; w+=100) g +=
    `<line x1="${X(x0)}" y1="${Y(w)}" x2="${X(x1)}" y2="${Y(w)}" stroke="#2d3540" stroke-width="1"/>
     <text x="${L-8}" y="${Y(w)+4}" fill="#8b949e" font-size="11" text-anchor="end">${w}</text>`;
  g += `<text x="${(L+W-R)/2}" y="${H-6}" fill="#8b949e" font-size="11" text-anchor="middle">CG — mm aft of firewall</text>`;
  g += `<text x="14" y="${T+10}" fill="#8b949e" font-size="11">kg</text>`;
  if (ldw != null && tow) g += `<line x1="${X(cg)}" y1="${Y(tow)}" x2="${X(ldCg)}" y2="${Y(ldw)}"
      stroke="#8b949e" stroke-width="1.5" stroke-dasharray="4 3"/>`;
  if (ldw != null) g += `<circle cx="${X(ldCg)}" cy="${Y(ldw)}" r="6" fill="none" stroke="#e6edf3" stroke-width="2"/>`;
  if (tow){
    const ok = cg >= fwdLimitAt(tow) && cg <= WB.aftLimit && tow <= WB.maxKg.tow;
    g += `<circle cx="${X(cg)}" cy="${Y(tow)}" r="7" fill="${ok?"#3fb950":"#f85149"}" stroke="#0d1117" stroke-width="2"/>`;
  }
  $("wbChart").innerHTML = g + `</svg>`;
}

/* ---------------------------- shell ---------------------------- */
function renderRef(){
  let h = `<tr><th>Config</th><th>KIAS</th><th>KCAS</th></tr>`;
  for (const [k,rows] of Object.entries(CAL))
    rows.forEach((r,i)=> h += `<tr><td>${i===0?k:""}</td><td>${r[0]}</td><td>${r[1]}</td></tr>`);
  $("calTable").innerHTML = h;
  $("antTable").innerHTML = `<tr><th>Item</th><th>KIAS</th><th>Range</th></tr>` +
    ANT.map(a=>`<tr><td>${a[0]}</td><td>${a[1].toFixed(2)}</td><td>${a[2].toFixed(2)}%</td></tr>`).join("");
  $("regTable").innerHTML =
    `<tr><th>Factor</th><th>Unfactored</th><th>Part-NCO</th><th>Part-CAT B</th></tr>` +
    `<tr><td>Overall — take-off, no stopway/clearway</td><td>1.00</td><td>1.33</td><td>1.25 vs TORA</td></tr>` +
    `<tr><td>Overall — take-off, stopway/clearway declared</td><td>1.00</td><td>1.33</td><td>1.00 vs TORA · 1.15 vs TODA · 1.30 vs ASDA</td></tr>` +
    `<tr><td>Overall — landing</td><td>1.00</td><td>1.43</td><td>1.43 (70% LDA)</td></tr>` +
    `<tr><td>Headwind credit</td><td>100%</td><td>100%</td><td>50%</td></tr>` +
    `<tr><td>Tailwind penalty</td><td>100%</td><td>100%</td><td>150%</td></tr>` +
    `<tr><td>Upslope per 1% — take-off</td><td>—</td><td>+5%</td><td>+5%</td></tr>` +
    `<tr><td>Downslope per 1% — landing</td><td>—</td><td>+5%</td><td>+5%</td></tr>` +
    `<tr><td>Hard sod</td><td colspan="3">1.07 — POH 5.7, used in every basis</td></tr>` +
    `<tr><td>Short grass, dry</td><td colspan="3">1.10 — POH 5.7, used in every basis</td></tr>` +
    `<tr><td>High grass</td><td colspan="3">1.25 — POH 5.7, used in every basis</td></tr>` +
    `<tr><td>Wet grass — T/O</td><td>1.30</td><td>1.30</td><td>1.30</td></tr>` +
    `<tr><td>Wet grass — landing</td><td>1.35</td><td>1.35</td><td>1.15</td></tr>` +
    `<tr><td>Wet paved — landing</td><td>1.15</td><td>1.15</td><td>1.15</td></tr>` +
    `<tr><td>Soft ground / snow</td><td>1.25</td><td>1.25</td><td>1.25</td></tr>`;
  $("regRefNote").innerHTML =
    `Where the POH itself specifies a surface factor, that value is used in <em>every</em> basis — both ` +
    `AMC1-CAT.POL.A.305 and CAA SSL09 defer to the AFM ("unless otherwise specified in the AFM"). ` +
    `The regulatory tables are used only for surfaces the POH does not cover. ` +
    `<b>Part-NCO mandates no factors at all</b> — the NCO column is UK CAA advisory guidance.<br><br>` +
    `<b>On CAT.POL.A.305(b)(2):</b> the published text separates the TORA, TODA and ASDA tests with ` +
    `&ldquo;or&rdquo;, but its predecessor EU-OPS 1.530 used &ldquo;and&rdquo;, and reading it as a true ` +
    `&ldquo;or&rdquo; would make route (2) less demanding than route (1) — which cannot be the intent. ` +
    `This app therefore requires all three, and shows each test separately so you can judge for yourself.`;
}

function renderAll(){
  const dep = conditions(DEP), arr = conditions(ARR);
  const B = BASES[basis];
  $("regNote").innerHTML = flag(B.note[0], B.note[1], B.note[2]);
  renderConditions(dep, DEP_IDS, "condFlags", false);
  renderConditions(arr, ARR_IDS, "aCondFlags", true);
  renderTakeoff(dep); renderLanding(arr); renderClimb(dep); renderCruise(); renderWB();
  // aerodrome identifiers on the result headings
  $("toHead").textContent = dep.icao ? `Take-off distance — ${dep.icao}` : "Take-off distance";
  $("ldHead").textContent = arr.icao ? `Landing distance — ${arr.icao}` : "Landing distance";
}

const FIELDS = ["depIcao","elev","qnh","oat","wt","rwy","wdir","wspd","wref","varn","slope","surf","tora","toda","asda",
                "arrIcao","aElev","aQnh","aOat","aWt","aRwy","aWdir","aWspd","aWref","aVarn","aSlope","aSurf","lda",
                "cFrom","cTo","crzAlt","crzFuel","crzDist","crzRes",
                "wbEW","wbEA","wbP","wbFP","wbR","wbB","wbF","wbTF"];
try {
  const s = JSON.parse(localStorage.getItem("tb20.v3") || "{}");
  for (const k of FIELDS){
    const el = $(k); if (!el || s[k] === undefined) continue;
    // a value saved by an older build may no longer be a valid option
    if (el.tagName === "SELECT" && ![...el.options].some(o => o.value === s[k])) continue;
    el.value = s[k];
  }
  if (s._mix) mix = s._mix;
  if (s._basis) basis = s._basis;
  if (s._backoff) $("wbBackoff").checked = s._backoff;
} catch(e){ /* first run, or storage unavailable */ }

function save(){
  try {
    const o = { _mix:mix, _basis:basis, _backoff:$("wbBackoff").checked };
    for (const k of FIELDS) if ($(k)) o[k] = $(k).value;
    localStorage.setItem("tb20.v3", JSON.stringify(o));
  } catch(e){ /* private mode — not worth interrupting the pilot over */ }
}
for (const k of FIELDS) if ($(k)) $(k).addEventListener("input", () => { renderAll(); save(); });
$("wbBackoff").addEventListener("change", () => { renderAll(); save(); });

$("tabs").addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  for (const x of $("tabs").children) x.setAttribute("aria-selected", x === b);
  for (const s of document.querySelectorAll("main > section")) s.hidden = s.id !== b.dataset.t;
  const tab = b.dataset.t, perf = tab === "to" || tab === "ldg";
  $("condDep").hidden = !(tab === "to" || tab === "clb");
  $("condArr").hidden = tab !== "ldg";
  $("regCard").hidden = !perf;          // factoring only applies to take-off and landing
});
$("regCard").hidden = false;

// Same-day, same-region flights usually share weather; the runway, mass and
// declared distances stay per-aerodrome and are deliberately not copied.
$("copyDep").addEventListener("click", () => {
  for (const [from, to] of [["qnh","aQnh"],["oat","aOat"],["wdir","aWdir"],
                            ["wspd","aWspd"],["wref","aWref"],["varn","aVarn"]])
    $(to).value = $(from).value;
  renderAll(); save();
});

// TODA and ASDA only mean something under CAT.POL.A.305(b)(2); the other
// bases test against TORA and LDA alone, so the fields are hidden there.
function syncDeclaredFields(){
  const cat = BASES[basis].kind === "regulatory";
  $("fToda").hidden = !cat;
  $("fAsda").hidden = !cat;
}
$("regSeg").addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  basis = b.dataset.r;
  for (const x of $("regSeg").children) x.setAttribute("aria-pressed", x === b);
  syncDeclaredFields(); renderAll(); save();
});
$("mixSeg").addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  mix = b.dataset.m;
  for (const x of $("mixSeg").children) x.setAttribute("aria-pressed", x === b);
  renderCruise(); save();
});
for (const x of $("regSeg").children) x.setAttribute("aria-pressed", x.dataset.r === basis);
for (const x of $("mixSeg").children) x.setAttribute("aria-pressed", x.dataset.m === mix);

syncDeclaredFields();
renderRef();
renderAll();
