
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
// Part-NCO by default: Unfactored is raw test-pilot data with no margin,
// which is not something to land on by forgetting to choose.
let basis = "nco", mix = "bestPower";

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
           // `|| 0` collapses negative zero, which would otherwise print as "-0.0 kt"
           hw: spd * Math.cos(ang) || 0, xw: Math.abs(spd * Math.sin(ang)) || 0,
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
  if (c.qnh && (c.qnh < 940 || c.qnh > 1060)) f += flag("warn","QNH looks implausible",
      `${fmt(c.qnh)} hPa is outside 940–1060. Check the setting — a wrong QNH moves the pressure ` +
      `altitude by about 27 ft per hPa.`);
  if (Math.abs(c.dev) > 35) f += flag("warn","Temperature far from ISA",
      `ISA${c.dev > 0 ? "+" : ""}${fmt(c.dev,0)} °C. Check the OAT and elevation — this is well outside ` +
      `the tabulated range and the figures are extrapolated.`);
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
  TO_ROLL = roll*product(cf)*ts[0].f; TO_50 = base50*k;
  TO_VLO = interp(c.w, W_KG, [TO_V[2370].lift, TO_V[3086].lift]);
  TO_V50 = interp(c.w, W_KG, [TO_V[2370].c50, TO_V[3086].c50]);
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
  LD_ROLL = roll*product(cf)*ts[0].f; LD_50 = base50*k;
  LD_V50 = interp(c.w, W_KG, [LD_V[2370], LD_V[3086]]);
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
    if (rows.length) out.push({ bhp, tas: A[bhp].tas + f*(B2[bhp].tas-A[bhp].tas),
                                cas: A[bhp].cas + f*(B2[bhp].cas-A[bhp].cas), rows });
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

  /* The empty mass and arm decide every number on this tab, and a wrong one
     produces a plausible answer with no symptom — so the sample figures are
     called out until they are replaced and explicitly confirmed. */
  const onSample = Math.abs(num("wbEW") - 846.5) < 0.05 && Math.abs(num("wbEA") - 961.6) < 0.05;
  $("wbOwnFlag").innerHTML =
    onSample ? flag("bad","These are the POH's sample aircraft figures",
        "846.5 kg at 961.6 mm belongs to the manual's example aeroplane, not yours. " +
        "Every mass and CG below is wrong until you enter your own weighing-form figures.")
    : !$("wbConfirm").checked ? flag("warn","Empty mass and arm not confirmed",
        "Tick the box above once you have checked these against your aircraft's current weighing form.")
    : "";

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
  WB_TOW = tow; WB_LDW = ldw; WB_CG = cg; WB_LDCG = ldCg;

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


/* ------------------------------------------------------------------ *
 * Raw METAR parsing.
 *
 * METAR is a rigid whitespace-delimited token format, so it is parsed
 * token by token rather than with one regex over the whole string — that
 * stops visibility groups ("1/2SM"), RVR ("R23L/0600") and runway state
 * groups being mistaken for the temperature group.
 *
 * Winds in a METAR are degrees TRUE, so applying one also switches that
 * aerodrome's wind-reference selector to True. Nothing is inferred that
 * the report does not actually contain.
 * ------------------------------------------------------------------ */
const METAR_WORDS = ["METAR","SPECI","AUTO","NOSIG","CAVOK","TEMPO","BECMG",
                     "RMK","COR","NIL","SNOCLO"];

function parseMetar(raw){
  const s = (raw || "").toUpperCase().replace(/=+\s*$/, "").trim();
  if (!s) return null;
  const tok = s.split(/\s+/), r = {};
  for (let i = 0; i < tok.length; i++){
    const t = tok[i]; let m;
    if (!r.station && /^[A-Z]{4}$/.test(t) && !METAR_WORDS.includes(t) &&
        /^\d{6}Z$/.test(tok[i+1] || "")) { r.station = t; continue; }
    if ((m = t.match(/^(\d{2})(\d{2})(\d{2})Z$/))){
      r.day = +m[1]; r.hh = +m[2]; r.mi = +m[3]; continue;
    }
    if ((m = t.match(/^(\d{3}|VRB)(\d{2,3})(?:G(\d{2,3}))?(KT|MPS|KMH)$/))){
      const kt = v => m[4] === "MPS" ? v * 1.94384 : m[4] === "KMH" ? v * 0.539957 : v;
      r.vrb = m[1] === "VRB";
      if (!r.vrb) r.wdir = +m[1];
      r.wspd = Math.round(kt(+m[2]));
      if (m[3]) r.gust = Math.round(kt(+m[3]));
      r.windUnit = m[4];
      continue;
    }
    if ((m = t.match(/^(\d{3})V(\d{3})$/))){ r.varFrom = +m[1]; r.varTo = +m[2]; continue; }
    if ((m = t.match(/^(M?\d{2})\/(M?\d{2}|\/\/)$/))){
      r.temp = parseInt(m[1].replace("M","-"), 10); continue;
    }
    if ((m = t.match(/^Q(\d{3,4})$/))){ r.qnh = +m[1]; continue; }
    if ((m = t.match(/^A(\d{4})$/))){
      r.inHg = +m[1] / 100; r.qnh = Math.round(r.inHg * 33.8639); continue;
    }
  }
  if (r.temp === undefined && r.qnh === undefined && r.wspd === undefined) return null;
  return r;
}

/* Age in minutes. A METAR carries day-of-month and time but no month, so a
   timestamp that lands in the future is read as last month's. */
function metarAgeMin(r){
  if (r.day === undefined) return null;
  const now = new Date();
  let d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), r.day, r.hh, r.mi));
  if (d - now > 6 * 3600e3)
    d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, r.day, r.hh, r.mi));
  return Math.round((now - d) / 60000);
}
const hhmm = m => `${Math.floor(Math.abs(m)/60)} h ${String(Math.abs(m)%60).padStart(2,"0")} min`;

/* apply=false renders the summary without writing to the fields — used on
   reload, so a stored METAR reports its age without clobbering edited values. */
function applyMetar(which, apply){
  const S   = which === "dep" ? DEP : ARR;
  const box = which === "dep" ? "depMetar" : "arrMetar";
  const out = which === "dep" ? "depMetarOut" : "arrMetarOut";
  const raw = $(box).value;
  if (!raw.trim()){ $(out).innerHTML = ""; return; }
  const r = parseMetar(raw);
  if (!r){
    $(out).innerHTML = flag("warn","Could not read that",
      "No wind, temperature or pressure group was recognised. Paste the whole report, " +
      "for example <code>METAR LFSN 081330Z AUTO 12004KT CAVOK 32/10 Q1017</code>.");
    return;
  }
  const set = [];
  if (apply){
    if (r.temp !== undefined){ $(S.oat).value  = r.temp; set.push(`OAT ${r.temp} °C`); }
    if (r.qnh  !== undefined){ $(S.qnh).value  = r.qnh;  set.push(`QNH ${r.qnh} hPa`); }
    if (r.wspd !== undefined){ $(S.wspd).value = r.wspd; }
    if (r.wdir !== undefined){ $(S.wdir).value = r.wdir; }
    if (r.wspd !== undefined)
      set.push(r.vrb ? `wind ${r.wspd} kt (direction left as entered)`
                     : `wind ${String(r.wdir).padStart(3,"0")}°T / ${r.wspd} kt`);
    if (r.wspd !== undefined) $(S.wref).value = "true";   // METAR winds are true
  }
  let f = "";
  const age = metarAgeMin(r);
  const head = `${r.station || "—"}${r.day !== undefined
      ? ` · ${String(r.day).padStart(2,"0")} ${String(r.hh).padStart(2,"0")}:${String(r.mi).padStart(2,"0")}Z` : ""}`;
  f += flag(age !== null && age > 60 ? "warn" : "ok",
      apply ? `Applied — ${head}` : `Stored report — ${head}`,
      (set.length ? set.join(" · ") + ". " : "") +
      (age === null ? "" : age < 0 ? `Timestamped ${hhmm(age)} in the future — check it.`
                                   : `Observed ${hhmm(age)} ago.`) +
      (apply ? " Wind reference set to True." : " Re-paste to apply."));

  // Station mismatch is the mistake worth catching: right numbers, wrong field.
  const icao = ($(S.icao).value || "").toUpperCase().trim();
  if (r.station && icao && r.station !== icao)
    f += flag("bad","This report is for a different aerodrome",
      `The METAR is <b>${r.station}</b> but this panel is set to <b>${icao}</b>.`);
  if (age !== null && age > 60)
    f += flag("warn","Report is more than an hour old",
      "Weather this stale should not drive a departure calculation — fetch a current one.");
  if (r.vrb)
    f += flag("warn","Variable wind direction",
      `The report gives VRB${String(r.wspd).padStart(2,"0")}KT, so no direction can be resolved. ` +
      `Set the wind direction yourself — for a runway decision, assume the least favourable.`);
  if (r.gust)
    f += flag("warn","Gusting",
      `Steady ${r.wspd} kt gusting <b>${r.gust} kt</b>. Only the steady wind was filled in; ` +
      `consider entering the gust for the crosswind and tailwind checks.`);
  if (r.varFrom !== undefined)
    f += flag("info","Variable between two directions",
      `Wind varying ${String(r.varFrom).padStart(3,"0")}° to ${String(r.varTo).padStart(3,"0")}°. ` +
      `The mean direction was used; the extremes may give a worse crosswind.`);
  if (r.inHg)
    f += flag("info","Altimeter converted",
      `A${String(Math.round(r.inHg*100)).padStart(4,"0")} = ${r.inHg.toFixed(2)} inHg → ${r.qnh} hPa.`);
  if (r.temp === undefined || r.qnh === undefined)
    f += flag("warn","Incomplete report",
      `${r.temp === undefined ? "No temperature group. " : ""}` +
      `${r.qnh === undefined ? "No pressure group. " : ""}Enter the missing value by hand.`);
  $(out).innerHTML = f;
  if (apply){ renderAll(); save(); }
}


/* ==================================================================
 * Aerodrome pre-fill (bundled, offline) and forecast (online, optional)
 *
 * The bundled data is crowd-sourced and is a typing aid only. It fills
 * elevation, QFU, slope and surface — never declared distances, which do not
 * exist in any free dataset and must come from the AIP or VAC plate.
 *
 * QFU comes from the runway designator, which is magnetic by definition, so
 * no variation conversion is needed. It is rounded to 10 degrees, so the QFU
 * can be up to 5 degrees out; that is negligible for a wind component.
 * ================================================================== */
const SURF_MAP = { A:"tar_dry", G:"grass_short", S:"soft" };
const SURF_NAME = { A:"paved", G:"grass", S:"soft/gravel", X:"water/snow", "?":"unknown" };
const adLookup = c => AD[(c || "").toUpperCase().trim()] || null;
const qfuOf = ident => (parseInt(ident, 10) % 36 || 36) * 10;

/* Slope of the roll from end `n` toward the far end, percent, positive uphill. */
function slopeUp(r, n){
  const near = n === 0 ? r[4] : r[5], far = n === 0 ? r[5] : r[4];
  if (near == null || far == null || !r[2]) return null;
  const s = (far - near) / r[2] * 100;
  return Math.abs(s) > 5 ? null : s;        // implausible, treat as unknown
}

function syncAerodrome(which){
  const S    = which === "dep" ? DEP : ARR;
  const sel  = $(which === "dep" ? "depRwy" : "arrRwy");
  const info = $(which === "dep" ? "depAdInfo" : "arrAdInfo");
  const code = ($(S.icao).value || "").toUpperCase().trim();
  const a    = adLookup(code);
  const prev = sel.value;
  sel.innerHTML = "";
  if (!a){
    sel.disabled = true;
    sel.innerHTML = '<option value="">—</option>';
    info.innerHTML = code.length >= 3
      ? flag("warn","Not in the bundled data",
          `<b>${code}</b> is not in the snapshot (France, Germany, Benelux, Switzerland, ` +
          `Italy, Spain, UK, Austria, Portugal, Denmark). Enter the fields by hand.`)
      : "";
    return;
  }
  sel.disabled = false;
  let opts = '<option value="">— choose a runway —</option>';
  a[4].forEach((r, ri) => [0,1].forEach(n => {
    const up = slopeUp(r, n);
    opts += `<option value="${ri}.${n}">${r[n]} — QFU ${qfuOf(r[n])}° · ` +
            `${Math.round(r[2]*0.3048)} m · ${SURF_NAME[r[3]]}` +
            `${up == null ? "" : ` · ${Math.abs(up).toFixed(1)}% ${up >= 0 ? "up" : "down"}`}</option>`;
  }));
  sel.innerHTML = opts;
  if (prev) sel.value = prev;
  $(S.elev).value = a[1];
  info.innerHTML =
    `<div class="adinfo"><b>${a[0]}</b> · elevation ${fmt(a[1])} ft · ` +
    `${a[4].length} runway${a[4].length > 1 ? "s" : ""}<br>` +
    `Physical length is shown for reference only — <b>it is not a declared distance</b>. ` +
    `Take TORA/TODA/ASDA/LDA from the AIP or VAC plate. Source: OurAirports, unofficial.</div>`;
}

function applyRunway(which){
  const S   = which === "dep" ? DEP : ARR;
  const sel = $(which === "dep" ? "depRwy" : "arrRwy");
  const a   = adLookup($(S.icao).value);
  if (!a || !sel.value) return;
  const [ri, n] = sel.value.split(".").map(Number);
  const r = a[4][ri];
  $(S.rwy).value  = qfuOf(r[n]);
  $(S.elev).value = a[1];
  const up = slopeUp(r, n);
  // departure field is +uphill, arrival field is +downhill
  if (up != null) $(S.slope).value = (which === "dep" ? up : -up).toFixed(1);
  if (SURF_MAP[r[3]]) $(S.surf).value = SURF_MAP[r[3]];
  renderAll(); save();
}

/* ---- Open-Meteo forecast, matched to the planned time ----
   Model output, not an observation: no gusts, and temperature can be a couple
   of degrees off. Needs a connection, so the result is cached to survive the
   flight. Model winds are degrees true, like a METAR.                        */
const FX_KEY = w => "tb20.fx." + w;

function showForecast(which, fx, live){
  const out = $(which === "dep" ? "depFxOut" : "arrFxOut");
  const ageMin = Math.round((Date.now() - fx.at) / 60000);
  let f = flag(live ? "ok" : "warn",
    live ? `Forecast applied — ${fx.icao} at ${fx.valid}Z`
         : `Cached forecast — ${fx.icao} at ${fx.valid}Z`,
    `OAT ${fx.t} °C · QNH ${fx.q} hPa · wind ${String(fx.wd).padStart(3,"0")}°T / ${fx.ws} kt. ` +
    `Fetched ${ageMin < 1 ? "just now" : hhmm(ageMin) + " ago"}.` +
    (live ? " Wind reference set to True." : " Re-fetch to update."));
  f += flag("warn","This is model forecast data, not an observation",
    "Open-Meteo hourly model. It carries no gusts and its temperature can be a couple of " +
    "degrees out, which moves the take-off distance by a few percent. Use a METAR for the " +
    "actual departure calculation whenever one is available.");
  out.innerHTML = f;
}

function applyForecast(which, fx){
  const S = which === "dep" ? DEP : ARR;
  $(S.oat).value  = fx.t;
  $(S.qnh).value  = fx.q;
  $(S.wdir).value = fx.wd;
  $(S.wspd).value = fx.ws;
  $(S.wref).value = "true";        // model winds are true, as METAR winds are
}

async function fetchForecast(which){
  const S    = which === "dep" ? DEP : ARR;
  const out  = $(which === "dep" ? "depFxOut" : "arrFxOut");
  const btn  = $(which === "dep" ? "depFetch" : "arrFetch");
  const when = $(which === "dep" ? "depTime" : "arrTime").value;
  const code = ($(S.icao).value || "").toUpperCase().trim();
  const a    = adLookup(code);
  if (!a)   { out.innerHTML = flag("warn","No coordinates",
                "The forecast needs an aerodrome from the bundled data to know where to look."); return; }
  if (!when){ out.innerHTML = flag("warn","No planned time",
                "Set the planned time (UTC) first."); return; }
  const hour = when.slice(0,13) + ":00";
  btn.disabled = true; btn.textContent = "Fetching…";
  try {
    const u = `https://api.open-meteo.com/v1/forecast?latitude=${a[2]}&longitude=${a[3]}` +
      `&hourly=temperature_2m,pressure_msl,wind_speed_10m,wind_direction_10m` +
      `&wind_speed_unit=kn&timezone=UTC&forecast_days=16`;
    const res = await fetch(u);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const d = await res.json();
    let i = d.hourly.time.indexOf(hour);
    if (i < 0){                                   // fall back to the nearest hour held
      const target = Date.parse(hour + "Z");
      let best = Infinity;
      d.hourly.time.forEach((t, k) => {
        const dt = Math.abs(Date.parse(t + "Z") - target);
        if (dt < best){ best = dt; i = k; }
      });
      if (i < 0 || best > 36 * 3600e3) throw new Error("outside the forecast range");
    }
    const fx = { icao:code, valid:d.hourly.time[i].slice(0,16).replace("T"," "),
                 t:Math.round(d.hourly.temperature_2m[i]),
                 q:Math.round(d.hourly.pressure_msl[i]),
                 wd:Math.round(d.hourly.wind_direction_10m[i]),
                 ws:Math.round(d.hourly.wind_speed_10m[i]), at:Date.now() };
    try { localStorage.setItem(FX_KEY(which), JSON.stringify(fx)); } catch(e){ /* full or private */ }
    applyForecast(which, fx);
    showForecast(which, fx, true);
    renderAll(); save();
  } catch (err){
    let f = flag("bad","Could not fetch the forecast",
      `${err.message}. This needs a connection — it cannot work in flight, and it will not ` +
      `work at all from a file opened directly off disk. Enter the weather by hand, or paste a METAR.`);
    try {
      const c = JSON.parse(localStorage.getItem(FX_KEY(which)) || "null");
      if (c) f += flag("warn","A cached forecast is held",
        `${c.icao} at ${c.valid}Z — OAT ${c.t} °C, QNH ${c.q} hPa, wind ` +
        `${String(c.wd).padStart(3,"0")}°T / ${c.ws} kt. Not applied; press again with a connection.`);
    } catch(e){ /* ignore */ }
    out.innerHTML = f;
  } finally {
    btn.disabled = false; btn.textContent = "Fetch forecast for the planned time";
  }
}


/* ==================================================================
 * Reference data — POH Section 2 (limitations) and 3.24 (glide)
 * ================================================================== */
const VSPEEDS = [
  ["V<sub>NE</sub>",  "Never exceed",              189, 187, "Do not exceed in any operation"],
  ["V<sub>NO</sub>",  "Maximum structural cruise", 151, 150, "Only in smooth air, and then with care"],
  ["V<sub>A</sub>",   "Manoeuvring",               130, 129, "No abrupt or full control movement above"],
  ["V<sub>FE</sub>",  "Flaps extended — take-off", 130, 129, "Flap position dependent"],
  ["V<sub>FE</sub>",  "Flaps extended — landing",  102, 103, "Flap position dependent"],
  ["V<sub>LO</sub>",  "Gear operating",            130, 129, "Do not extend or retract above"],
  ["V<sub>LE</sub>",  "Gear extended",             140, 139, "Do not exceed with gear down"]
];
const ASI_MARKS = [
  ["White arc",  "59 – 103",  "Full flap operating range. Lower limit is V<sub>SO</sub> at maximum mass."],
  ["Green arc",  "70 – 150",  "Normal operating range. Lower limit is V<sub>S1</sub>, flaps retracted."],
  ["Yellow arc", "150 – 187", "Caution — smooth air only."],
  ["Red line",   "187",       "Maximum speed for all operations."]
];
/* POH 3.24: maximum aerodynamic efficiency 8 clean, 5 with landing flaps. */
const GLIDE = { clean:{ ld:8, kias:92 }, dirty:{ ld:5, kias:70 } };
const glideNM = (ft, g) => ft * g.ld / 6076.12;
/* Va scales with the square root of the mass ratio. */
const vaAt = kg => 129 * Math.sqrt(clamp(kg, 700, MTOW_KG) / MTOW_KG);

/* ==================================================================
 * Fuel planning
 *
 * Climb and cruise come from the POH tables. Descent does not exist in the
 * POH, so its rate and flow are the pilot's assumptions and are labelled as
 * such; the descent leg is credited with ground distance at cruise TAS.
 * Final reserve is priced at the POH holding flow (45% BHP, 8.5 US gal/h).
 * ================================================================== */
const GAL_L = 3.785;
/* NCO.OP.125 final reserve. The rule reads "at normal cruising altitude", so
   the reserve is priced at the selected cruise consumption, not at the POH
   holding flow — holding would under-read it by roughly a third. */
const RESERVES = { 10:"VFR local", 30:"VFR day", 45:"VFR night / IFR" };
let resMin = 30;

function fuelBands(){                  // populate the %BHP and RPM selects
  const mix = $("fuMix").value, pa = num("fuAlt");
  const { rows } = cruiseAt(mix, pa);
  const bsel = $("fuBhp"), rsel = $("fuRpm");
  const wantB = bsel.value, wantR = rsel.value;
  bsel.innerHTML = rows.map(b => `<option value="${b.bhp}">${b.bhp}%</option>`).join("");
  if (rows.some(b => String(b.bhp) === wantB)) bsel.value = wantB;
  const band = rows.find(b => String(b.bhp) === bsel.value) || rows[0];
  rsel.innerHTML = band ? band.rows.map(r => `<option value="${r.rpm}">${r.rpm}</option>`).join("") : "";
  if (band && band.rows.some(r => String(r.rpm) === wantR)) rsel.value = wantR;
  return band ? { band, row: band.rows.find(r => String(r.rpm) === rsel.value) || band.rows[0] } : null;
}

function renderFuel(){
  const dep = conditions(DEP), arr = conditions(ARR);
  const pick = fuelBands();
  const info = $("fuFrom");
  if (!pick){
    info.innerHTML = flag("bad","No cruise data at that altitude","The POH cruise tables cover 500–12 500 ft.");
    $("fuTable").innerHTML = ""; $("fuTotal").textContent = "—"; return;
  }
  const { band, row } = pick;
  const ffL = row.ff * GAL_L;
  const cruisePA = num("fuAlt");
  /* The POH tabulates TAS at ISA. When the temperature aloft is known, TAS is
     recomputed from the POH's own CAS column — which reproduces the tabulated
     TAS exactly at ISA, so this only ever corrects for the departure from it. */
  const oatAloft = WINDS ? WINDS.temp : isaTemp(cruisePA);
  const tas = WINDS ? tasFrom(band.cas, cruisePA, oatAloft) : band.tas;

  /* Ground speed along the direct track when winds aloft are known. */
  const A = adLookup($("rtDep").value), B = adLookup($("rtDest").value);
  const track = (A && B) ? gcTrack(A, B) : null;
  const wt = (WINDS && track != null)
    ? windTriangle(tas, track, WINDS.dir, WINDS.spd) : null;
  const gs = wt ? wt.gs : tas;

  /* The climb table spans 1075–1400 kg. Clamp before the lookup, as the
     performance panels do, so a mass outside it cannot silently extrapolate
     into less climb fuel than the aeroplane will actually burn. */
  const massRaw = num("fuMass"), mass = clamp(massRaw, W_KG[0], W_KG[1]);
  const cruiseAlt = num("fuAlt");
  const trip = num("fuTrip"), altn = num("fuAltn");

  /* Climb and descent depend on the two aerodromes, which are entered on the
     Take-off and Landing tabs — say so, since those panels are not shown here. */
  info.innerHTML = `<div class="adinfo">
    <b>Climb</b> from ${dep.icao || "departure"} at ${fmt(dep.elev)} ft,
    ISA${dep.dev >= 0 ? "+" : ""}${fmt(dep.dev,0)} °C ·
    <b>descent</b> to ${arr.icao || "arrival"} at ${fmt(arr.elev)} ft ·
    <b>cruise</b> ${band.bhp}% / ${row.rpm} RPM, MP ${row.mp.toFixed(1)} in.Hg,
    TAS ${Math.round(tas)} kt${wt ? `, GS <b>${Math.round(gs)} kt</b>` : ""}, ${ffL.toFixed(1)} L/h.<br>
    ${wt ? `Track ${deg3(track)}°T · wind ${deg3(WINDS.dir)}°/${WINDS.spd} kt gives
       ${fmt(Math.abs(wt.head),0)} kt ${wt.head >= 0 ? "headwind" : "tailwind"},
       drift ${fmt(Math.abs(wt.wcaDeg),0)}° ${wt.wcaDeg >= 0 ? "right" : "left"}.<br>` : ""}
    <span class="src">Aerodromes and temperatures come from the Take-off and Landing tabs.</span>
    </div>`;
  $("fuWindOut").innerHTML = windsNote(cruisePA, track).html;

  // climb, from the POH cumulative-from-sea-level table
  const at = (k,f) => Math.max(0, lookup3(CLIMB, mass, k, dep.dev, PA_CL, f));
  const clT = Math.max(0, at(cruiseAlt,o=>o.t) - at(dep.elev,o=>o.t));         // minutes
  const clF = Math.max(0, at(cruiseAlt,o=>o.f) - at(dep.elev,o=>o.f)) * GAL_L; // litres
  const clD = Math.max(0, at(cruiseAlt,o=>o.d) - at(dep.elev,o=>o.d));         // NM

  // descent — assumption, not POH
  const dRate = Math.max(1, num("fuDrate")), dFlow = num("fuDflow");
  const deT = Math.max(0, (cruiseAlt - arr.elev)) / dRate;      // minutes
  const deD = deT / 60 * gs;                                     // NM over the ground
  const deF = deT / 60 * dFlow;

  const crD = Math.max(0, trip - clD - deD);
  const crT = crD / gs * 60;
  const crF = crT / 60 * ffL;

  const tripF = clF + crF + deF;
  const contF = tripF * num("fuCont") / 100;
  const altF  = altn > 0 ? (altn / gs * 60) / 60 * ffL : 0;
  const resF  = resMin / 60 * ffL;
  const taxi  = num("fuTaxi");
  const total = taxi + tripF + contF + altF + resF;
  const usable = num("fuUsable");

  const L = v => fmt(v,1) + " L";
  // durations here are in minutes; show them as h:mm
  const T = m => `${Math.floor(m/60)}:${String(Math.round(m%60)).padStart(2,"0")}`;
  $("fuTotal").innerHTML = fmt(total,1) + ` <small>L / ${fmt(total/GAL_L,1)} US gal</small>`;
  $("fuLeft").innerHTML  = fmt(usable-total,1) + ` <small>L</small>`;
  $("fuTime").innerHTML  = T(clT+crT+deT) + ` <small>h:mm</small>`;

  $("fuTable").innerHTML =
    `<tr><th>Phase</th><th>Distance NM</th><th>Time</th><th>Fuel L</th><th>Source</th></tr>` +
    `<tr><td>Taxi &amp; start</td><td>—</td><td>—</td><td>${fmt(taxi,1)}</td><td><span class="src">your allowance</span></td></tr>` +
    `<tr><td>Climb to ${fmt(cruiseAlt)} ft</td><td>${fmt(clD,1)}</td><td>${T(clT)}</td><td>${fmt(clF,1)}</td><td><span class="src">POH 5.12–5.13</span></td></tr>` +
    `<tr><td>Cruise</td><td>${fmt(crD,1)}</td><td>${T(crT)}</td><td>${fmt(crF,1)}</td><td><span class="src">POH 5.16–5.29</span></td></tr>` +
    `<tr><td>Descent to ${fmt(arr.elev)} ft</td><td>${fmt(deD,1)}</td><td>${T(deT)}</td><td>${fmt(deF,1)}</td><td><span class="src">your assumption</span></td></tr>` +
    `<tr class="rec"><td><b>Trip</b></td><td><b>${fmt(clD+crD+deD,1)}</b></td><td><b>${T(clT+crT+deT)}</b></td><td><b>${fmt(tripF,1)}</b></td><td></td></tr>` +
    `<tr><td>Contingency ${fmt(num("fuCont"))}%</td><td>—</td><td>—</td><td>${fmt(contF,1)}</td><td><span class="src">of trip fuel</span></td></tr>` +
    (altn > 0 ? `<tr><td>Alternate ${fmt(altn)} NM</td><td>${fmt(altn,1)}</td><td>${T(altn/gs*60)}</td><td>${fmt(altF,1)}</td><td><span class="src">same cruise setting</span></td></tr>` : "") +
    `<tr><td>Final reserve ${resMin} min — ${RESERVES[resMin]}</td><td>—</td><td>${T(resMin)}</td>` +
    `<td>${fmt(resF,1)}</td><td><span class="src">NCO.OP.125, at cruise flow</span></td></tr>` +
    `<tr class="rec"><td><b>Total required</b></td><td></td><td></td><td><b>${fmt(total,1)}</b></td><td></td></tr>`;

  let f = "";
  if (deD > 0 && trip)
    f += flag("info","Top of descent",
      `Start down <b>${fmt(deD,0)} NM</b> before ${arr.icao || "the destination"} — ` +
      `${fmt(cruisePA - arr.elev)} ft at ${fmt(dRate)} ft/min is ${T(deT)}, covering ` +
      `${fmt(deD,0)} NM at ${Math.round(gs)} kt${wt ? " ground speed" : " TAS"}.`);
  if (!trip) f += flag("info","No trip distance yet","Enter the trip distance to price the cruise leg.");
  if (total > usable) f += flag("bad","Exceeds usable fuel",
      `Needs ${L(total)} but only ${L(usable)} is usable — short by ${L(total-usable)}. ` +
      `Shorten the leg, add a stop, or reduce power.`);
  else if (trip && total > usable*0.9) f += flag("warn","Little fuel margin",
      `Needs ${L(total)} of ${L(usable)} usable — ${L(usable-total)} spare.`);
  else if (trip) f += flag("ok","Within usable fuel", `${L(usable-total)} spare after all allowances.`);
  if (trip && clD + deD > trip) f += flag("warn","Trip shorter than climb and descent",
      `Climb and descent alone cover ${fmt(clD+deD,1)} NM. The cruise leg is zero and the figures ` +
      `above do not represent a real profile.`);
  if (cruiseAlt <= dep.elev) f += flag("warn","Cruise altitude is not above the departure field","");
  if (massRaw > MTOW_KG) f += flag("bad","Climb mass over MTOM",
      `${fmt(massRaw)} kg exceeds ${fmt(MTOW_KG)} kg — the climb figures are not valid.`);
  else if (massRaw && massRaw < W_KG[0]) f += flag("warn","Climb mass below the tabulated range",
      `Climb computed at ${fmt(W_KG[0])} kg, the lightest the POH tabulates. Conservative: a lighter ` +
      `aeroplane climbs faster and burns less.`);
  $("fuFlags").innerHTML = f;
  FUEL_TOTAL = total; FUEL_MIN = clT + crT + deT;
}
let FUEL_TOTAL = 0, WB_TOW = 0, WB_LDW = 0, WB_CG = 0, WB_LDCG = 0;
let TO_ROLL = 0, TO_50 = 0, TO_VLO = 0, TO_V50 = 0, LD_ROLL = 0, LD_50 = 0, LD_V50 = 0;
const BUILD = "__VERSION__";


/* ==================================================================
 * Route
 *
 * The route is the first thing known about a flight, so it is entered once
 * here and drives everything downstream: the departure and arrival panels,
 * the climb and descent legs, and the trip and alternate distances.
 *
 * Distances are great-circle between the bundled aerodrome coordinates —
 * the direct track, not the route actually flown. They are written into the
 * distance fields as a starting point and can be overridden; the route card
 * keeps showing the direct figure so an override is visible rather than silent.
 * ================================================================== */
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
const deg3 = d => String(Math.round(d) % 360).padStart(3, "0");

let ROUTE = { trip:null, altn:null };

function syncRoute(fillDistances){
  const up = id => ($(id).value || "").toUpperCase().trim();
  const dep = up("rtDep"), dest = up("rtDest"), altn = up("rtAltn");
  if ($("rtDep").value !== dep) $("rtDep").value = dep;
  if ($("rtDest").value !== dest) $("rtDest").value = dest;
  if ($("rtAltn").value !== altn) $("rtAltn").value = altn;

  // feed the performance panels
  $("depIcao").value = dep;
  $("arrIcao").value = dest;
  syncAerodrome("dep"); syncAerodrome("arr");

  const A = adLookup(dep), B = adLookup(dest), C = adLookup(altn);
  ROUTE.trip = (A && B) ? gcNM(A, B) : null;
  ROUTE.altn = (B && C) ? gcNM(B, C) : null;
  if (fillDistances){
    if (ROUTE.trip != null) $("fuTrip").value = Math.round(ROUTE.trip);
    if (ROUTE.altn != null) $("fuAltn").value = Math.round(ROUTE.altn);
  }

  let h = "";
  const leg = (from, to, a, b, nm) => a && b
    ? `<tr><td>${from} → ${to}</td><td>${a[0].slice(0,26)} → ${b[0].slice(0,26)}</td>` +
      `<td>${deg3(gcTrack(a,b))}°T</td><td>${fmt(nm,0)} NM</td></tr>`
    : "";
  if (A || B || C){
    h += `<div class="scroll"><table><tr><th>Leg</th><th></th><th>Track</th><th>Direct</th></tr>` +
         leg(dep, dest, A, B, ROUTE.trip) + leg(dest, altn, B, C, ROUTE.altn) + `</table></div>`;
  }
  const miss = [[dep,A],[dest,B],[altn,C]].filter(([c,r]) => c && !r).map(([c]) => c);
  if (miss.length) h += flag("warn","Not in the bundled data",
      `${miss.join(", ")} — enter that aerodrome's elevation, runway and distances by hand.`);
  if (ROUTE.trip != null && num("fuTrip") && Math.abs(num("fuTrip") - ROUTE.trip) > 1)
    h += flag("info","Trip distance overridden",
      `Using ${fmt(num("fuTrip"))} NM against a direct track of ${fmt(ROUTE.trip,0)} NM.`);
  if (ROUTE.altn != null && num("fuAltn") && Math.abs(num("fuAltn") - ROUTE.altn) > 1)
    h += flag("info","Alternate distance overridden",
      `Using ${fmt(num("fuAltn"))} NM against a direct track of ${fmt(ROUTE.altn,0)} NM.`);
  if (dep && dest && dep === dest)
    h += flag("info","Departure and destination are the same","A local flight — set the trip distance by hand.");
  $("rtOut").innerHTML = h;
}


/* ==================================================================
 * Atmosphere, wind triangle, and true airspeed
 * ================================================================== */
/* ICAO standard atmosphere pressure ratio at a pressure altitude, and the
   altitude of a pressure level — used to pick the right forecast level. */
const deltaP  = paFt => Math.pow(1 - 6.87535e-6 * paFt, 5.25588);
const plToAlt = hPa  => (1 - Math.pow(hPa / 1013.25, 1 / 5.25588)) / 6.87535e-6;
const PLEVELS = [1000, 975, 950, 925, 900, 850, 800, 700, 600, 500];
const nearestPL = paFt =>
  PLEVELS.reduce((a, b) => Math.abs(plToAlt(b) - paFt) < Math.abs(plToAlt(a) - paFt) ? b : a);

/* TAS from CAS at a pressure altitude and an actual temperature.
   Checked against the POH: 6500 ft, 65% best economy, CAS 134 kt at ISA
   returns 148 kt, exactly the manual's tabulated TAS. */
function tasFrom(cas, paFt, oatC){
  const sigma = deltaP(paFt) / ((oatC + 273.15) / 288.15);
  return cas / Math.sqrt(sigma);
}

/* Wind triangle for a desired track. Returns ground speed, drift and the
   head (positive) or tail (negative) component along track. */
function windTriangle(tas, trackDeg, windFromDeg, windKt){
  const rad = Math.PI / 180, d = (windFromDeg - trackDeg) * rad;
  const head  = windKt * Math.cos(d);      // +ve slows you down
  const cross = windKt * Math.sin(d);      // +ve from the right
  const wca   = Math.asin(Math.max(-1, Math.min(1, cross / tas)));
  const gs    = tas * Math.cos(wca) - head;
  return { gs: Math.max(1, gs), head, cross, wcaDeg: wca / rad };
}

/* ==================================================================
 * Sun times
 *
 * EASA defines night as the period between the end of evening civil twilight
 * and the beginning of morning civil twilight, so civil twilight — not sunset —
 * is what decides whether a 45-minute reserve applies. Both are computed.
 * Classic Almanac algorithm; returns minutes UTC, or null in polar cases.
 * ================================================================== */
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
const SUN_Z = 90.8333, CIVIL_Z = 96;
const hhmmUTC = m => m == null ? "—"
  : `${String(Math.floor(m / 60) % 24).padStart(2,"0")}:${String(Math.round(m % 60)).padStart(2,"0")}Z`;

/* ==================================================================
 * Favoured runway
 * ================================================================== */
function bestRunway(which){
  const S    = which === "dep" ? DEP : ARR;
  const out  = $(which === "dep" ? "depBestRwy" : "arrBestRwy");
  const a    = adLookup($(S.icao).value);
  const spd  = num(S.wspd);
  if (!a || !spd){ out.innerHTML = ""; return; }
  const trueWind = $(S.wref).value === "true";
  const windMag  = trueWind ? num(S.wdir) - num(S.varn) : num(S.wdir);
  const rows = [];
  a[4].forEach((r, ri) => [0,1].forEach(n => {
    const qfu = qfuOf(r[n]), d = (windMag - qfu) * Math.PI / 180;
    rows.push({ id:r[n], sel:`${ri}.${n}`, qfu,
                hw: spd * Math.cos(d), xw: Math.abs(spd * Math.sin(d)) });
  }));
  rows.sort((x, y) => y.hw - x.hw);
  const chosen = $(which === "dep" ? "depRwy" : "arrRwy").value;
  let h = `<div class="scroll"><table><tr><th>Runway</th><th>QFU</th><th>Head/tail</th><th>Cross</th><th></th></tr>` +
    rows.map(r => {
      const bad = r.xw > XW_DEMO, warn = r.xw > XW_DEMO * 0.8 || r.hw < 0;
      return `<tr${r.sel === chosen ? ' class="rec"' : ''}><td>${r.id}</td><td>${deg3(r.qfu)}°M</td>` +
             `<td>${fmt(Math.abs(r.hw),1)} kt ${r.hw >= 0 ? "HW" : "TW"}</td>` +
             `<td style="color:${bad ? "var(--bad)" : warn ? "var(--warn)" : "var(--ink)"}">${fmt(r.xw,1)} kt</td>` +
             `<td><span class="src">${r.sel === chosen ? "selected" : ""}</span></td></tr>`;
    }).join("") + `</table></div>`;
  const best = rows[0];
  if (chosen && chosen !== best.sel)
    h += flag("warn","A different runway favours the wind",
      `${best.id} gives ${fmt(Math.abs(best.hw),1)} kt ${best.hw >= 0 ? "headwind" : "tailwind"} ` +
      `and ${fmt(best.xw,1)} kt crosswind.`);
  out.innerHTML = `<div class="metar"><label>Runway options in this wind</label>${h}</div>`;
}


/* ==================================================================
 * Winds aloft — Open-Meteo pressure-level forecast at the cruise level,
 * sampled at the midpoint of each leg. Online, cached, clearly model data.
 * ================================================================== */
let WINDS = null;                       // { level, dir, spd, temp, at, valid }

function midpoint(a, b){
  const rad = Math.PI/180, deg = 180/Math.PI;
  const p1 = a[2]*rad, l1 = a[3]*rad, p2 = b[2]*rad, dl = (b[3]-a[3])*rad;
  const bx = Math.cos(p2)*Math.cos(dl), by = Math.cos(p2)*Math.sin(dl);
  const p3 = Math.atan2(Math.sin(p1)+Math.sin(p2), Math.sqrt((Math.cos(p1)+bx)**2 + by**2));
  return [0,0, p3*deg, (l1 + Math.atan2(by, Math.cos(p1)+bx))*deg];
}

async function fetchWinds(){
  const out = $("fuWindOut"), btn = $("fuWind");
  const A = adLookup($("rtDep").value), B = adLookup($("rtDest").value);
  if (!A || !B){ out.innerHTML = flag("warn","Route incomplete",
      "Both departure and destination must be in the bundled data to locate the leg."); return; }
  const when = $("rtEtd").value;
  if (!when){ out.innerHTML = flag("warn","No off-blocks time","Set the off-blocks time (UTC) first."); return; }
  const pa = num("fuAlt"), lvl = nearestPL(pa), mid = midpoint(A, B);
  btn.disabled = true; btn.textContent = "Fetching…";
  try {
    const u = `https://api.open-meteo.com/v1/forecast?latitude=${mid[2].toFixed(3)}&longitude=${mid[3].toFixed(3)}` +
      `&hourly=wind_speed_${lvl}hPa,wind_direction_${lvl}hPa,temperature_${lvl}hPa` +
      `&wind_speed_unit=kn&timezone=UTC&forecast_days=16`;
    const res = await fetch(u);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const d = await res.json();
    const hour = when.slice(0,13) + ":00";
    let i = d.hourly.time.indexOf(hour);
    if (i < 0){
      const target = Date.parse(hour + "Z"); let best = Infinity;
      d.hourly.time.forEach((t,k) => { const dt = Math.abs(Date.parse(t+"Z")-target); if (dt<best){best=dt;i=k;} });
      if (best > 36*3600e3) throw new Error("outside the forecast range");
    }
    WINDS = { level:lvl, dir:Math.round(d.hourly[`wind_direction_${lvl}hPa`][i]),
              spd:Math.round(d.hourly[`wind_speed_${lvl}hPa`][i]),
              temp:Math.round(d.hourly[`temperature_${lvl}hPa`][i]),
              valid:d.hourly.time[i].slice(0,16).replace("T"," "), at:Date.now() };
    try { localStorage.setItem("tb20.winds", JSON.stringify(WINDS)); } catch(e){}
    renderFuel();
  } catch (err){
    out.innerHTML = flag("bad","Could not fetch winds aloft",
      `${err.message}. This needs a connection. Without it the plan assumes still air, which ` +
      `understates fuel into a headwind.`);
  } finally { btn.disabled = false; btn.textContent = "Fetch winds aloft for the cruise level"; }
}

function windsNote(pa, track){
  if (!WINDS) return { gs:null, html: flag("warn","Still air assumed",
      "No winds aloft fetched, so cruise time uses TAS. Into a headwind this understates the fuel " +
      "required — fetch the winds before relying on the figure.") };
  const age = Math.round((Date.now() - WINDS.at)/60000);
  const isaAt = isaTemp(plToAlt(WINDS.level));
  return { ok:true, html: flag("ok", `Winds aloft — ${WINDS.level} hPa (${fmt(plToAlt(WINDS.level))} ft) at ${WINDS.valid}Z`,
      `${deg3(WINDS.dir)}°T / ${WINDS.spd} kt, ${WINDS.temp} °C ` +
      `(ISA${WINDS.temp - isaAt >= 0 ? "+" : ""}${fmt(WINDS.temp - isaAt,0)}). ` +
      `Fetched ${age < 1 ? "just now" : hhmm(age)+" ago"}. Model forecast, not an observation.`) };
}


/* ==================================================================
 * Sun times for the route, and the reserve they imply
 * ================================================================== */
function renderSun(){
  const out = $("sunOut");
  const A = adLookup($("rtDep").value), B = adLookup($("rtDest").value);
  const etd = $("rtEtd").value;
  if (!etd || (!A && !B)){ out.innerHTML = ""; SUN = null; return; }
  const d = new Date(etd + "Z");
  if (isNaN(d)){ out.innerHTML = ""; SUN = null; return; }
  const rows = [], leg = [];
  for (const [name, ad] of [["Departure", A], ["Destination", B]]){
    if (!ad) continue;
    const r = {
      name, icao: name === "Departure" ? $("rtDep").value : $("rtDest").value,
      dawn: sunEvent(ad[2], ad[3], d, CIVIL_Z, true),
      rise: sunEvent(ad[2], ad[3], d, SUN_Z,   true),
      set:  sunEvent(ad[2], ad[3], d, SUN_Z,   false),
      dusk: sunEvent(ad[2], ad[3], d, CIVIL_Z, false)
    };
    rows.push(r); leg.push(r);
  }
  if (!rows.length){ out.innerHTML = ""; SUN = null; return; }
  let h = `<div class="scroll"><table><tr><th>Aerodrome</th><th>Civil dawn</th><th>Sunrise</th>` +
          `<th>Sunset</th><th>Civil dusk</th></tr>` +
    rows.map(r => `<tr><td>${r.icao} ${r.name === "Departure" ? "(dep)" : "(dest)"}</td>` +
      `<td>${hhmmUTC(r.dawn)}</td><td>${hhmmUTC(r.rise)}</td><td>${hhmmUTC(r.set)}</td>` +
      `<td>${hhmmUTC(r.dusk)}</td></tr>`).join("") + `</table></div>`;

  /* EASA night runs from the end of evening civil twilight to the beginning of
     morning civil twilight, so civil dusk/dawn — not sunset — decide whether a
     45-minute reserve applies. */
  const etaMin = (d.getUTCHours()*60 + d.getUTCMinutes() + (FUEL_MIN || 0)) % 1440;
  const dest = leg[leg.length-1];
  const isNight = t => dest.dawn != null && dest.dusk != null && (t > dest.dusk || t < dest.dawn);
  SUN = { night: isNight(etaMin), etaMin, dest };
  h += flag(SUN.night ? "warn" : "info",
    SUN.night ? "Arrival is at night" : "Arrival is by day",
    `Estimated arrival ${hhmmUTC(etaMin)} against civil dusk ${hhmmUTC(dest.dusk)} at ${dest.icao}. ` +
    (SUN.night
      ? `Night VFR or IFR — NCO.OP.125 requires a <b>45 minute</b> final reserve.`
      : `VFR by day — a 30 minute final reserve satisfies NCO.OP.125.`));
  if (SUN.night && resMin < 45)
    h += flag("bad","Reserve too short for a night arrival",
      `The reserve is set to ${resMin} min. Select <b>VFR night / IFR · 45 min</b>.`);
  out.innerHTML = h;
}
let SUN = null, FUEL_MIN = 0;

/* ==================================================================
 * Flight summary
 * ================================================================== */
function summaryText(){
  const dep = conditions(DEP), arr = conditions(ARR);
  const B = BASES[basis];
  const m  = ft => fmt(toM(ft)) + " m";
  const L  = [];
  const rule = "-".repeat(52);
  L.push(`TB20 PERFORMANCE & LOADING`);
  L.push(`${$("rtDep").value || "----"} -> ${$("rtDest").value || "----"}` +
         ($("rtAltn").value ? `  alt ${$("rtAltn").value}` : "") +
         ($("rtEtd").value ? `   off-blocks ${$("rtEtd").value.replace("T"," ")}Z` : ""));
  L.push(`computed ${new Date().toISOString().slice(0,16).replace("T"," ")}Z  ·  build ${BUILD}`);
  L.push(rule);
  L.push(`MASS & BALANCE`);
  L.push(`  Take-off mass   ${fmt(WB_TOW,1)} kg    CG ${fmt(WB_CG,0)} mm  (${fmt(fwdLimitAt(WB_TOW),0)}-${WB.aftLimit})`);
  L.push(`  Landing mass    ${fmt(WB_LDW,1)} kg    CG ${fmt(WB_LDCG,0)} mm  (${fmt(fwdLimitAt(WB_LDW),0)}-${WB.aftLimit})`);
  L.push(rule);
  L.push(`FUEL`);
  L.push(`  Total required  ${fmt(FUEL_TOTAL,1)} L  of ${fmt(num("fuUsable"),0)} L usable`);
  L.push(`  Reserve         ${resMin} min (${RESERVES[resMin]})`);
  if (WINDS) L.push(`  Winds aloft     ${deg3(WINDS.dir)}/${WINDS.spd} kt at ${WINDS.level} hPa`);
  else       L.push(`  Winds aloft     not fetched - still air assumed`);
  L.push(rule);
  L.push(`TAKE-OFF  ${dep.icao || "----"}   ${B.label}`);
  L.push(`  PA ${fmt(dep.pa)} ft   ISA${dep.dev>=0?"+":""}${fmt(dep.dev,0)}   ${fmt(dep.wRaw)} kg`);
  L.push(`  Wind ${fmt(Math.abs(dep.hw),0)} kt ${dep.hw>=0?"HW":"TW"}, ${fmt(dep.xw,0)} kt cross`);
  L.push(`  Ground roll     ${m(TO_ROLL)}`);
  L.push(`  To 50 ft        ${m(TO_50)}` + (dep.tora ? `   TORA ${m(dep.tora)}` : ""));
  L.push(`  Lift-off ${fmt(TO_VLO)} KIAS   over 50 ft ${fmt(TO_V50)} KIAS`);
  L.push(rule);
  L.push(`LANDING   ${arr.icao || "----"}   ${B.label}`);
  L.push(`  PA ${fmt(arr.pa)} ft   ISA${arr.dev>=0?"+":""}${fmt(arr.dev,0)}   ${fmt(arr.wRaw)} kg`);
  L.push(`  Wind ${fmt(Math.abs(arr.hw),0)} kt ${arr.hw>=0?"HW":"TW"}, ${fmt(arr.xw,0)} kt cross`);
  L.push(`  Ground roll     ${m(LD_ROLL)}`);
  L.push(`  From 50 ft      ${m(LD_50)}` + (arr.lda ? `   LDA ${m(arr.lda)}` : ""));
  L.push(`  Over 50 ft      ${fmt(LD_V50,1)} KIAS`);
  L.push(rule);
  L.push(`Computed from the TB20 Pilot's Information Manual (non-official).`);
  L.push(`Cross-check against the approved AFM before flight.`);
  return L.join("\n");
}

function renderSummary(){
  const txt = summaryText();
  $("sumOut").innerHTML =
    `<pre style="white-space:pre-wrap;font:600 12.5px/1.55 var(--mono);color:var(--ink);
      background:var(--panel2);border:1px solid var(--line);border-radius:11px;padding:13px;margin:0;
      overflow-x:auto">${txt.replace(/[&<>]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]))}</pre>`;
}

/* ---------------------------- shell ---------------------------- */
function renderRef(){
  $("vTable").innerHTML = `<tr><th>Speed</th><th></th><th>KCAS</th><th>KIAS</th><th>Remarks</th></tr>` +
    VSPEEDS.map(v => `<tr><td>${v[0]}</td><td>${v[1]}</td><td>${v[2]}</td><td>${v[3]}</td>` +
                     `<td><span class="src">${v[4]}</span></td></tr>`).join("");
  $("asiTable").innerHTML = `<tr><th>Marking</th><th>KIAS</th><th>Significance</th></tr>` +
    ASI_MARKS.map(m => `<tr><td>${m[0]}</td><td>${m[1]}</td><td><span class="src">${m[2]}</span></td></tr>`).join("");
  $("glideTable").innerHTML =
    `<tr><th>Configuration</th><th>Speed KIAS</th><th>Glide ratio</th><th>Per 1000 ft</th></tr>` +
    `<tr><td>Gear up, flaps up</td><td>${GLIDE.clean.kias}</td><td>${GLIDE.clean.ld} : 1</td><td>${glideNM(1000,GLIDE.clean).toFixed(2)} NM</td></tr>` +
    `<tr><td>Gear up, flaps landing</td><td>${GLIDE.dirty.kias}</td><td>${GLIDE.dirty.ld} : 1</td><td>${glideNM(1000,GLIDE.dirty).toFixed(2)} NM</td></tr>`;
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

function renderRefLive(dep){
  $("vaNow").innerHTML   = fmt(vaAt(dep.wRaw),0) + ` <small>KIAS at ${fmt(dep.wRaw)} kg</small>`;
  $("glideV").innerHTML  = GLIDE.clean.kias + ` <small>KIAS · ${GLIDE.clean.ld}:1</small>`;
  const a = num("glAlt");
  $("glClean").innerHTML = fmt(glideNM(a, GLIDE.clean),1) + ` <small>NM from ${fmt(a)} ft</small>`;
  $("glDirty").innerHTML = fmt(glideNM(a, GLIDE.dirty),1) + ` <small>NM from ${fmt(a)} ft</small>`;
}

function renderAll(){
  const dep = conditions(DEP), arr = conditions(ARR);
  const B = BASES[basis];
  $("regNote").innerHTML = flag(B.note[0], B.note[1], B.note[2]);
  renderConditions(dep, DEP_IDS, "condFlags", false);
  renderConditions(arr, ARR_IDS, "aCondFlags", true);
  renderTakeoff(dep); renderLanding(arr); renderClimb(dep); renderCruise(); renderWB();
  renderFuel(); renderRefLive(dep); syncRoute(false); renderSun();
  bestRunway("dep"); bestRunway("arr"); renderSummary();
  // aerodrome identifiers on the result headings
  $("toHead").textContent = dep.icao ? `Take-off distance — ${dep.icao}` : "Take-off distance";
  $("ldHead").textContent = arr.icao ? `Landing distance — ${arr.icao}` : "Landing distance";
}

const FIELDS = ["depIcao","elev","qnh","oat","wt","rwy","wdir","wspd","wref","varn","slope","surf","tora","toda","asda",
                "arrIcao","aElev","aQnh","aOat","aWt","aRwy","aWdir","aWspd","aWref","aVarn","aSlope","aSurf","lda",
                "depMetar","arrMetar","depRwy","arrRwy","depTime","arrTime",
                "rtDep","rtDest","rtAltn","rtEtd","fuTrip","fuAlt","fuAltn","fuMass","fuMix","fuBhp","fuRpm","fuTaxi","fuCont",
                "fuDrate","fuDflow","fuUsable","glAlt",
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
  if (s._wbConfirm) $("wbConfirm").checked = s._wbConfirm;
  if (s._res) resMin = +s._res;
} catch(e){ /* first run, or storage unavailable */ }

function save(){
  try {
    const o = { _mix:mix, _basis:basis, _backoff:$("wbBackoff").checked,
                _wbConfirm:$("wbConfirm").checked, _res:resMin };
    for (const k of FIELDS) if ($(k)) o[k] = $(k).value;
    localStorage.setItem("tb20.v3", JSON.stringify(o));
  } catch(e){ /* private mode — not worth interrupting the pilot over */ }
}
for (const k of FIELDS)
  if ($(k) && k !== "depMetar" && k !== "arrMetar")
    $(k).addEventListener("input", () => { renderAll(); save(); });
$("depMetar").addEventListener("input", () => applyMetar("dep", true));
$("arrMetar").addEventListener("input", () => applyMetar("arr", true));
for (const id of ["rtDep","rtDest","rtAltn"])
  $(id).addEventListener("input", () => { syncRoute(true); renderAll(); save(); });
$("depRwy").addEventListener("change", () => applyRunway("dep"));
$("arrRwy").addEventListener("change", () => applyRunway("arr"));
$("depFetch").addEventListener("click", () => fetchForecast("dep"));
$("arrFetch").addEventListener("click", () => fetchForecast("arr"));
$("wbBackoff").addEventListener("change", () => { renderAll(); save(); });
$("wbConfirm").addEventListener("change", () => { renderAll(); save(); });

// Hand results forward: fuel decides the load, the load decides the masses,
// the masses drive take-off and landing. Retyping between them invites a typo.
$("fuToWb").addEventListener("click", () => {
  $("wbF").value = FUEL_TOTAL.toFixed(1);
  document.querySelector('#tabs button[data-t=wb]').click();
  renderAll(); save();
});
$("wbToDep").addEventListener("click", () => {
  $("wt").value = Math.round(WB_TOW);
  document.querySelector('#tabs button[data-t=to]').click();
  renderAll(); save();
});
$("wbToArr").addEventListener("click", () => {
  $("aWt").value = Math.round(WB_LDW || WB_TOW);
  document.querySelector('#tabs button[data-t=ldg]').click();
  renderAll(); save();
});
$("resSeg").addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  resMin = +b.dataset.r;
  for (const x of $("resSeg").children) x.setAttribute("aria-pressed", x === b);
  renderAll(); save();      // the sun block also depends on the reserve choice
});
$("fuWind").addEventListener("click", fetchWinds);
$("sumCopy").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(summaryText()); $("sumCopy").textContent = "Copied"; }
  catch(e){ $("sumCopy").textContent = "Copy failed — select the text instead"; }
  setTimeout(() => { $("sumCopy").textContent = "Copy to clipboard"; }, 2500);
});
$("sumMail").addEventListener("click", () => {
  const subj = `TB20 ${$("rtDep").value || "----"}-${$("rtDest").value || "----"}` +
               ($("rtEtd").value ? ` ${$("rtEtd").value.slice(0,10)}` : "");
  // mailto opens the mail app with it prefilled; nothing is sent until you send it
  location.href = `mailto:?subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(summaryText())}`;
});
$("sumPrint").addEventListener("click", () => window.print());
for (const id of ["fuMix","fuAlt","fuBhp","fuRpm"])
  $(id).addEventListener("change", () => { fuelBands(); renderFuel(); save(); });

/* Which shared panels belong to a tab. Fuel, W&B and Reference stand alone —
   the aerodrome panels and the factoring basis have nothing to do with them. */
function syncTabChrome(tab){
  for (const s of document.querySelectorAll("main > section")) s.hidden = s.id !== tab;
  $("condDep").hidden = !(tab === "to" || tab === "clb");   // departure drives take-off and climb
  $("condArr").hidden = tab !== "ldg";                       // arrival drives landing only
  $("regCard").hidden = !(tab === "to" || tab === "ldg");    // factoring applies to distances only
}

$("tabs").addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  for (const x of $("tabs").children) x.setAttribute("aria-selected", x === b);
  syncTabChrome(b.dataset.t);
});

// Run it for whichever tab starts selected, rather than waiting for a click.
syncTabChrome((document.querySelector('#tabs button[aria-selected="true"]')
               || $("tabs").firstElementChild).dataset.t);

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
for (const x of $("resSeg").children) x.setAttribute("aria-pressed", +x.dataset.r === resMin);
for (const x of $("mixSeg").children) x.setAttribute("aria-pressed", x.dataset.m === mix);

try { WINDS = JSON.parse(localStorage.getItem("tb20.winds") || "null"); } catch(e){}
syncDeclaredFields();
syncRoute(false);   // restore the route without overwriting edited distances
fuelBands();
renderRef();
renderAll();

/* Version stamp — so you can tell which build is on the iPad. */
document.querySelector("header .warnbar").insertAdjacentHTML("afterend",
  `<div class="ver">build __VERSION__ · <span id="swState">standalone</span></div>`);

/* Register the service worker so offline is deterministic instead of relying
   on the browser's cache heuristics. Only meaningful over https from a real
   origin — a file:// copy simply carries on without it. */
const secureOrigin = location.protocol === "https:" || location.hostname === "localhost";
if ("serviceWorker" in navigator && secureOrigin){
  const badge = txt => { const e = $("swState"); if (e) e.textContent = txt; };
  const offerUpdate = worker => {
    if (document.getElementById("swUpdate")) return;
    document.querySelector("header").insertAdjacentHTML("beforeend",
      `<div class="flag warn" id="swUpdate" style="margin-top:8px;cursor:pointer">
         <b>A newer version is available</b>Tap to load it. Your entered figures are kept.</div>`);
    $("swUpdate").addEventListener("click", () => {
      worker.postMessage({ type:"SKIP_WAITING" });
      navigator.serviceWorker.addEventListener("controllerchange", () => location.reload(), { once:true });
    });
  };
  navigator.serviceWorker.register("sw.js").then(reg => {
    if (navigator.serviceWorker.controller) badge("offline ready");
    navigator.serviceWorker.ready.then(() => badge("offline ready"));
    if (reg.waiting) offerUpdate(reg.waiting);          // update downloaded on a previous visit
    reg.addEventListener("updatefound", () => {
      const w = reg.installing;
      w && w.addEventListener("statechange", () => {
        if (w.state === "installed"){
          if (navigator.serviceWorker.controller) offerUpdate(w);   // an update, not a first install
          else badge("offline ready");
        }
      });
    });
    reg.update();                                       // check for a newer build on each launch
  }).catch(() => badge("offline not cached"));
}
// show age of any stored report without overwriting edited fields
applyMetar("dep", false);
applyMetar("arr", false);
// runway lists depend on the restored ICAO, so build them after restore
syncAerodrome("dep"); syncAerodrome("arr");
for (const w of ["dep","arr"]){
  try {
    const c = JSON.parse(localStorage.getItem(FX_KEY(w)) || "null");
    if (c) showForecast(w, c, false);   // report it without re-applying
  } catch(e){ /* ignore */ }
}
