
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

const $ = id => document.getElementById(id);
const num = id => { const v = parseFloat($(id).value); return Number.isFinite(v) ? v : 0; };
// Part-NCO by default: Unfactored is raw test-pilot data with no margin,
// which is not something to land on by forgetting to choose.
let basis = "nco", mix = "bestPower";
let crzSrc = "omb", gtAirframe = false;

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
  /* Gradient from the proper atmosphere rather than a 2%/1000 ft rule of
     thumb, which overstates TAS and so under-reads the gradient. The POH
     climb speed is an IAS; instrument error is assumed nil, and the airspeed
     calibration table shows IAS and CAS agreeing closely in this range. */
  const tas  = tasFrom(v, c.pa, c.oat);
  const grad = roc / (tas * KT_FPM);                       // still air, a fraction
  const gs   = tas - c.hw;                                 // headwind is positive
  const gradG = gs > 5 ? roc / (gs * KT_FPM) : null;       // over the ground
  $("clbG").innerHTML  = fmt(grad*100,1) + ` <small>% / ${fmt(grad*FT_NM)} ft/NM</small>`;
  $("clbGG").innerHTML = gradG == null ? `—`
    : fmt(gradG*100,1) + ` <small>% / ${fmt(gradG*FT_NM)} ft/NM</small>`;
  let f = rangeFlags(c, PA_CL);
  if (roc < 200) f += flag("bad","Very low rate of climb", `${fmt(roc)} ft/min at these conditions.`);
  else if (roc < 500) f += flag("warn","Low rate of climb", `${fmt(roc)} ft/min.`);
  if (gradG != null && gradG < grad) f += flag("warn","Tailwind flattens the climb",
      `${fmt(-c.hw,1)} kt tailwind takes the gradient over the ground from ` +
      `${fmt(grad*100,1)}% to <b>${fmt(gradG*100,1)}%</b>. A departure gradient is measured over the ground.`);
  if (gradG == null) f += flag("bad","Headwind exceeds the climb speed",
      `A ${fmt(c.hw,0)} kt headwind against ${fmt(tas,0)} kt TAS leaves no forward progress, so no ` +
      `ground gradient can be computed. Check the wind entry.`);
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


/* ------------------------------------------------------------------ *
 * OM.B QRH cruise lookup — bilinear on pressure altitude and ISA
 * deviation. Beyond either axis the caller is told rather than given a
 * silently extrapolated number, because the QRH stops where the engine
 * can no longer hold the setting.
 * ------------------------------------------------------------------ */
function ombAt(bhp, pa, dev, gt){
  const e = OMB[String(bhp)];
  if (!e) return null;
  const A = e.alts, D = e.devs;
  const grab = key => {
    const perDev = D.map((_,di) => interp(clamp(pa, A[0], A[A.length-1]), A, e[key][di]));
    return interp(clamp(dev, D[0], D[D.length-1]), D, perDev);
  };
  return {
    bhp, rpm:e.rpm, gph:e.gph,
    mp:   grab("mp"),
    kias: grab(gt ? "kiasGT" : "kias"),
    tas:  grab(gt ? "tasGT"  : "tas"),
    paLo:A[0], paHi:A[A.length-1], devLo:D[0], devHi:D[D.length-1]
  };
}

function renderCruise(){
  const pa = num("crzAlt");
  $("crzOatWrap").hidden   = crzSrc !== "omb";
  $("crzAirframe").hidden  = crzSrc !== "omb";
  $("mixSeg").hidden       = crzSrc !== "poh";

  if (crzSrc === "omb"){
    const oat = num("crzOat"), dev = oat - isaTemp(pa);
    const rows = [55, 65].map(b => ombAt(b, pa, dev, gtAirframe)).filter(Boolean);
    $("crzInfo").innerHTML = `<div class="adinfo">PA ${fmt(pa)} ft · OAT ${fmt(oat)} °C ·
      <b>ISA${dev>=0?"+":""}${fmt(dev,0)}</b> · ${gtAirframe ? "GT" : "non-GT"} airframe ·
      best power at 2300 RPM</div>`;
    let h = `<tr><th>Setting</th><th>RPM</th><th>MP in.Hg</th><th>KIAS</th><th>TAS kt</th>` +
            `<th>US gal/h</th><th>L/h</th></tr>`;
    for (const r of rows)
      h += `<tr${r.bhp===65?' class="rec"':''}><td>${r.bhp}% — ${r.bhp===55?"economy":"normal"} cruise</td>` +
           `<td>${r.rpm}</td><td>${r.mp.toFixed(1)}</td><td>${Math.round(r.kias)}</td>` +
           `<td>${Math.round(r.tas)}</td><td>${r.gph.toFixed(1)}</td><td>${(r.gph*3.785).toFixed(1)}</td></tr>`;
    $("crzTable").innerHTML = h;

    let f = "";
    const over = rows.filter(r => pa > r.paHi);
    if (over.length) f += flag("warn","Above the tabulated altitude",
      over.map(r => `${r.bhp}% stops at ${fmt(r.paHi)} ft`).join(" · ") +
      `. The nearest tabulated altitude was used — that setting may not be attainable up here.`);
    if (pa < rows[0].paLo) f += flag("warn","Below the tabulated altitude",
      `The tables start at ${fmt(rows[0].paLo)} ft.`);
    if (Math.abs(dev) > 20) f += flag("warn","Temperature beyond the tables",
      `ISA${dev>0?"+":""}${fmt(dev,0)} is outside ISA±20 — the nearest tabulated case was used.`);
    $("crzFlags").innerHTML = f;
    $("crzNote").innerHTML =
      `From the <b>OM.B QRH, Ed1-Amd0 2025-02</b>, pages 9–17. Both settings are best-power mixture at ` +
      `2300 RPM. Unlike the POH tables these carry ISA−20 to ISA+20, so they respond to temperature. ` +
      `Interpolated on altitude and on ISA deviation. 55% is tabulated to 10 000 ft, 65% to 8 000 ft. ` +
      `Serial 1088 predates the GT airframe, so non-GT is the default.`;
    return;
  }

  /* POH 1988 level-flight tables — more power settings and both mixtures,
     but tabulated at ISA only. */
  const { rows, clamped } = cruiseAt(mix, pa);
  $("crzInfo").innerHTML = `<div class="adinfo">PA ${fmt(pa)} ft · ISA only ·
    ${mix === "bestPower" ? "best power" : "best economy"} · 1335 kg</div>`;
  let h = `<tr><th>%BHP</th><th>RPM</th><th>MP in.Hg</th><th>CAS kt</th><th>TAS kt</th><th>L/h</th><th>US gal/h</th></tr>`;
  for (const b of rows) b.rows.forEach((r,i) => {
    h += `<tr${i===0?' class="rec"':''}><td>${i===0?b.bhp+"%":""}</td><td>${r.rpm}</td>` +
         `<td>${r.mp.toFixed(1)}</td><td>${i===0?Math.round(b.cas):""}</td>` +
         `<td>${i===0?Math.round(b.tas):""}</td>` +
         `<td>${(r.ff*3.785).toFixed(1)}</td><td>${r.ff.toFixed(1)}</td></tr>`;
  });
  $("crzTable").innerHTML = h;
  $("crzFlags").innerHTML = (clamped ? flag("warn","Outside the cruise table",
      "POH cruise data covers 500–12 500 ft; the nearest tabulated altitude was used.") : "")
    + (rows.length ? "" : flag("bad","No data at this altitude",""));
  $("crzNote").innerHTML =
    `POH level-flight tables at <b>1335 kg</b>, no antennas or external lights, ` +
    `<b>tabulated at ISA only</b> — they do not respond to temperature. A typical IFR antenna fit ` +
    `costs about −3.2 kt. The OM.B QRH above is the operator's current document and carries ISA±20.`;
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
  // normalise what is shown, not just what is looked up
  if ($(S.icao).value !== code) $(S.icao).value = code;
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
  // normalise what is shown, not just what is looked up
  if ($(S.icao).value !== code) $(S.icao).value = code;
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


/* Captured by the take-off and landing renderers for the summary. */
let TO_ROLL = 0, TO_50 = 0, TO_VLO = 0, TO_V50 = 0, LD_ROLL = 0, LD_50 = 0, LD_V50 = 0;
const BUILD = "__VERSION__";

/* ==================================================================
 * Flight summary
 * ================================================================== */
function summaryText(){
  const dep = conditions(DEP), arr = conditions(ARR);
  const B = BASES[basis];
  const m = ft => fmt(toM(ft)) + " m";
  const rule = "-".repeat(52);
  const L = [];
  L.push(`TB20 PERFORMANCE`);
  L.push(`computed ${new Date().toISOString().slice(0,16).replace("T"," ")}Z  ·  build ${BUILD}`);
  L.push(`factoring basis: ${B.label}`);
  L.push(rule);
  L.push(`TAKE-OFF  ${dep.icao || "----"}`);
  L.push(`  PA ${fmt(dep.pa)} ft   ISA${dep.dev>=0?"+":""}${fmt(dep.dev,0)}   ${fmt(dep.wRaw)} kg`);
  L.push(`  Wind ${fmt(Math.abs(dep.hw),0)} kt ${dep.hw>=0?"HW":"TW"}, ${fmt(dep.xw,0)} kt cross`);
  L.push(`  Ground roll     ${m(TO_ROLL)}`);
  L.push(`  To 50 ft        ${m(TO_50)}` + (dep.tora ? `   TORA ${m(dep.tora)}` : ""));
  L.push(`  Lift-off ${fmt(TO_VLO)} KIAS   over 50 ft ${fmt(TO_V50)} KIAS`);
  L.push(rule);
  L.push(`LANDING   ${arr.icao || "----"}`);
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


/* ==================================================================
 * Weight and balance — F-GVLD, TB20 serial 1088
 *
 * Empty mass and arm come from the RMA weighing report (Rennes), corrected
 * for the CGR-30P avionics change:
 *
 *   weighed              947.000 kg   nose 219, left 372, right 356
 *   CG from the wheels   X = d - p1*D/M = 1.465 - 0.4417 = 1.0233 m
 *   less TKS aboard      -22.672 kg at 2.769 m   (20.8 L at density 1.09)
 *   corrected empty      924.328 kg at 0.980 m,  moment 906.2862 m.kg
 *   avionics change      -2.000 kg, moment -1.5065 m.kg
 *   -------------------------------------------------------------
 *   current empty        922.328 kg at 0.98097 m, moment 904.7797 m.kg
 *
 * The weighing removed the TKS fluid, so it is NOT in the empty mass and has
 * to be loaded as its own station whenever it is aboard.
 *
 * Station arms are the weighing report's own figures. They agree with POH
 * Figure 6.3 to within about 3 mm (the POH gives 45.38 in = 1152.7 mm for the
 * front seats where the report rounds to 1155); the report is used because it
 * is the controlling document for this airframe.
 *
 * CG limits are POH 2.9 and match the envelope drawn on the weighing report.
 * ================================================================== */
const WB = {
  reg:   "F-GVLD",
  serial:"1088",
  empty: { kg: 922.328, mm: 980.97 },
  arms:  { front:1155, rear:2035, baggage:2600, tks:2800, fuel:1085 },
  dens:  { fuel:0.72, tks:1.09 },
  fwdLimit: [[1000,913],[1250,949],[1400,1071]],
  aftLimit: 1205,
  maxKg: { tow:1400, baggage:65, rearSeats:231 },
  fuelMaxL: 326
};
const fwdLimitAt = kg => interp(clamp(kg, WB.fwdLimit[0][0], WB.fwdLimit[2][0]),
                                WB.fwdLimit.map(p=>p[0]), WB.fwdLimit.map(p=>p[1]));

function wbItems(fuelL){
  return [
    { n:"Empty aircraft",  kg:num("wbEW"),                        mm:num("wbEA") },
    { n:"Pilot",           kg:num("wbP"),                         mm:WB.arms.front },
    { n:"Front passenger", kg:num("wbFP"),                        mm:WB.arms.front },
    { n:"Rear seats",      kg:num("wbR"),                         mm:WB.arms.rear },
    { n:"Baggage",         kg:num("wbB"),                         mm:WB.arms.baggage },
    { n:`TKS ${fmt(num("wbTKS"))} L`, kg:num("wbTKS")*WB.dens.tks, mm:WB.arms.tks },
    { n:`Fuel ${fmt(fuelL)} L`, kg:fuelL*WB.dens.fuel,            mm:WB.arms.fuel }
  ];
}
const wbTotals = items => {
  const kg  = items.reduce((s,i)=>s+i.kg, 0);
  const mom = items.reduce((s,i)=>s+i.kg*i.mm, 0);
  return { kg, mom, cg: kg ? mom/kg : 0 };
};

let WB_M1 = 0, WB_M2 = 0;

function renderWB(){
  const f1 = num("wbF1"), f2 = num("wbF2");
  const a = wbTotals(wbItems(f1)), b = wbTotals(wbItems(f2));

  $("wbM1").innerHTML = fmt(a.kg,1) + ` <small>kg</small>`;
  $("wbC1").innerHTML = fmt(a.cg,0) + ` <small>mm</small>`;
  $("wbM2").innerHTML = fmt(b.kg,1) + ` <small>kg</small>`;
  $("wbC2").innerHTML = fmt(b.cg,0) + ` <small>mm</small>`;

  // itemised, with the fuel row shown at both states
  const its = wbItems(f1);
  let h = `<tr><th>Item</th><th>Mass kg</th><th>Arm mm</th><th>Moment kg·m</th></tr>`;
  for (const i of its) if (i.kg)
    h += `<tr><td>${i.n}</td><td>${fmt(i.kg,1)}</td><td>${fmt(i.mm,0)}</td><td>${fmt(i.kg*i.mm/1000,1)}</td></tr>`;
  h += `<tr class="rec"><td><b>With fuel at start</b></td><td><b>${fmt(a.kg,1)}</b></td>` +
       `<td><b>${fmt(a.cg,0)}</b></td><td><b>${fmt(a.mom/1000,1)}</b></td></tr>`;
  h += `<tr><td>Fuel at end ${fmt(f2)} L</td><td>${fmt(f2*WB.dens.fuel,1)}</td>` +
       `<td>${fmt(WB.arms.fuel,0)}</td><td>${fmt(f2*WB.dens.fuel*WB.arms.fuel/1000,1)}</td></tr>`;
  h += `<tr class="rec"><td><b>With fuel at end</b></td><td><b>${fmt(b.kg,1)}</b></td>` +
       `<td><b>${fmt(b.cg,0)}</b></td><td><b>${fmt(b.mom/1000,1)}</b></td></tr>`;
  $("wbTable").innerHTML = h;

  // load limits
  let lf = "";
  if (num("wbB") > WB.maxKg.baggage) lf += flag("bad","Baggage over limit",
      `${fmt(num("wbB"),1)} kg exceeds the ${WB.maxKg.baggage} kg compartment limit.`);
  if (num("wbR") > WB.maxKg.rearSeats) lf += flag("bad","Rear seats over limit",
      `${fmt(num("wbR"),1)} kg exceeds the ${WB.maxKg.rearSeats} kg maximum on the rear seats.`);
  if (f1 > WB.fuelMaxL) lf += flag("warn","More than usable fuel",
      `${fmt(f1)} L exceeds the ${WB.fuelMaxL} L usable.`);
  if (f2 > f1) lf += flag("warn","Fuel at end exceeds fuel at start",
      "Check the two figures — the aeroplane does not gain fuel in flight.");
  $("wbLoadFlags").innerHTML = lf;

  // envelope verdicts
  const verdict = (t, when) => {
    if (!t.kg) return "";
    const lo = fwdLimitAt(t.kg);
    if (t.kg > WB.maxKg.tow) return flag("bad",`Over maximum mass ${when}`,
      `${fmt(t.kg,1)} kg exceeds ${WB.maxKg.tow} kg by ${fmt(t.kg-WB.maxKg.tow,1)} kg.`);
    if (t.cg < lo) return flag("bad",`CG forward of limit ${when}`,
      `${fmt(t.cg,0)} mm against a ${fmt(lo,0)} mm forward limit at ${fmt(t.kg,1)} kg.`);
    if (t.cg > WB.aftLimit) return flag("bad",`CG aft of limit ${when}`,
      `${fmt(t.cg,0)} mm against the ${WB.aftLimit} mm aft limit.`);
    return flag("ok",`Within envelope ${when}`,
      `CG ${fmt(t.cg,0)} mm, limits ${fmt(lo,0)}–${WB.aftLimit} mm at ${fmt(t.kg,1)} kg.`);
  };
  $("wbFlags").innerHTML = verdict(a,"with fuel at start") + verdict(b,"with fuel at end");

  WB_M1 = a.kg; WB_M2 = b.kg;
  $("wbToDep").textContent = a.kg ? `Use ${fmt(a.kg,0)} kg as take-off mass` : "Use as take-off mass";
  $("wbToArr").textContent = b.kg ? `Use ${fmt(b.kg,0)} kg as landing mass`  : "Use as landing mass";
  $("wbToDep").disabled = !a.kg;
  $("wbToArr").disabled = !b.kg;

  drawEnvelope(a, b);

  $("wbAcInfo").innerHTML = `<div class="adinfo"><b>${WB.reg}</b> · TB20 serial ${WB.serial} ·
    empty ${fmt(WB.empty.kg,1)} kg at ${fmt(WB.empty.mm,1)} mm, moment
    ${fmt(WB.empty.kg*WB.empty.mm/1000,1)} kg·m<br>
    From the RMA weighing report, corrected for the CGR-30P avionics change
    (−2.00 kg, −1.51 kg·m). <b>The weighing drained the TKS</b>, so TKS fluid is a separate
    station below whenever it is aboard.</div>`;

  $("wbRef").innerHTML = `<tr><th>Station</th><th>Arm mm</th><th>Limit</th><th>Source</th></tr>` +
    [["Front seats", WB.arms.front, "—"],
     ["Rear seats",  WB.arms.rear,  WB.maxKg.rearSeats+" kg"],
     ["Baggage",     WB.arms.baggage, WB.maxKg.baggage+" kg"],
     ["TKS fluid",   WB.arms.tks,   "1.09 kg/L"],
     ["Fuel",        WB.arms.fuel,  WB.fuelMaxL+" L usable, 0.72 kg/L"]]
    .map(([n,mm,lim]) => `<tr><td>${n}</td><td>${mm}</td><td>${lim}</td>` +
      `<td><span class="src">weighing report</span></td></tr>`).join("") +
    `<tr><td>Maximum mass</td><td>—</td><td>${WB.maxKg.tow} kg</td><td><span class="src">POH 2.9</span></td></tr>` +
    `<tr><td>CG forward limit</td><td colspan="2">913 mm @1000 kg · 949 @1250 · 1071 @1400</td>` +
      `<td><span class="src">POH 2.9</span></td></tr>` +
    `<tr><td>CG aft limit</td><td colspan="2">1205 mm, all masses</td><td><span class="src">POH 2.9</span></td></tr>`;

  $("wbSrc").innerHTML =
    `Arms are the weighing report's own figures; they agree with POH Figure 6.3 to about 3 mm. ` +
    `Oil is included in the empty mass. Replace the empty mass and arm above if the aircraft is ` +
    `reweighed or its equipment changes again.`;
}

function drawEnvelope(a, b){
  const W=560, H=380, L=52, R=14, T=14, Bm=40;
  const x0=880, x1=1250, y0=850, y1=1450;
  const X = v => L + (v-x0)/(x1-x0)*(W-L-R);
  const Y = v => T + (1-(v-y0)/(y1-y0))*(H-T-Bm);
  const env = [[1000,913],[1250,949],[1400,1071],[1400,1205],[1000,1205]];
  const poly = [[y0,913],...env,[y0,1205]].map(([w,c])=>`${X(c)},${Y(w)}`).join(" ");
  let g = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Weight and balance envelope">`;
  g += `<polygon points="${poly}" fill="rgba(88,166,255,.13)" stroke="#58a6ff" stroke-width="2"/>`;
  for (let c=900; c<=1250; c+=50) g +=
    `<line x1="${X(c)}" y1="${Y(y0)}" x2="${X(c)}" y2="${Y(y1)}" stroke="#2d3540" stroke-width="1"/>
     <text x="${X(c)}" y="${H-Bm+18}" fill="#8b949e" font-size="11" text-anchor="middle">${c}</text>`;
  for (let w=900; w<=1400; w+=100) g +=
    `<line x1="${X(x0)}" y1="${Y(w)}" x2="${X(x1)}" y2="${Y(w)}" stroke="#2d3540" stroke-width="1"/>
     <text x="${L-8}" y="${Y(w)+4}" fill="#8b949e" font-size="11" text-anchor="end">${w}</text>`;
  g += `<text x="${(L+W-R)/2}" y="${H-6}" fill="#8b949e" font-size="11" text-anchor="middle">CG — mm aft of firewall</text>`;
  g += `<text x="14" y="${T+10}" fill="#8b949e" font-size="11">kg</text>`;
  const inside = t => t.kg && t.cg>=fwdLimitAt(t.kg) && t.cg<=WB.aftLimit && t.kg<=WB.maxKg.tow;
  if (a.kg && b.kg) g += `<line x1="${X(a.cg)}" y1="${Y(a.kg)}" x2="${X(b.cg)}" y2="${Y(b.kg)}"
      stroke="#8b949e" stroke-width="1.5" stroke-dasharray="4 3"/>`;
  if (b.kg) g += `<circle cx="${X(b.cg)}" cy="${Y(b.kg)}" r="6" fill="none" stroke="${inside(b)?"#e6edf3":"#f85149"}" stroke-width="2"/>`;
  if (a.kg) g += `<circle cx="${X(a.cg)}" cy="${Y(a.kg)}" r="7" fill="${inside(a)?"#3fb950":"#f85149"}" stroke="#0d1117" stroke-width="2"/>`;
  $("wbChart").innerHTML = g + `</svg>`;
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
  renderTakeoff(dep); renderLanding(arr); renderClimb(dep); renderCruise();
  renderRefLive(dep); bestRunway("dep"); bestRunway("arr"); renderWB(); renderSummary();
  // aerodrome identifiers on the result headings
  $("toHead").textContent = dep.icao ? `Take-off distance — ${dep.icao}` : "Take-off distance";
  $("ldHead").textContent = arr.icao ? `Landing distance — ${arr.icao}` : "Landing distance";
}

const FIELDS = ["crzOat","wbEW","wbEA","wbP","wbFP","wbR","wbB","wbTKS","wbF1","wbF2",
                "depIcao","elev","qnh","oat","wt","rwy","wdir","wspd","wref","varn","slope","surf","tora","toda","asda",
                "arrIcao","aElev","aQnh","aOat","aWt","aRwy","aWdir","aWspd","aWref","aVarn","aSlope","aSurf","lda",
                "depMetar","arrMetar","depRwy","arrRwy","depTime","arrTime",
                "glAlt",
                "cFrom","cTo","crzAlt",
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
  if (s._crzSrc) crzSrc = s._crzSrc;
  if (s._gt !== undefined) gtAirframe = !!s._gt;
  /* One-time migration. A saved basis normally wins, but changing the default
     would otherwise never reach anyone who has already used the app — leaving
     them in Unfactored, or in a basis they only tried once, without having
     chosen it. Force Part-NCO once, then respect the choice from then on. */
  if (s._basisMigrated) { if (s._basis) basis = s._basis; }
  else { basis = "nco"; }
} catch(e){ /* first run, or storage unavailable */ }

function save(){
  try {
    const o = { _mix:mix, _basis:basis, _basisMigrated:true, _crzSrc:crzSrc, _gt:gtAirframe };
    for (const k of FIELDS) if ($(k)) o[k] = $(k).value;
    localStorage.setItem("tb20.v3", JSON.stringify(o));
  } catch(e){ /* private mode — not worth interrupting the pilot over */ }
}
for (const k of FIELDS)
  if ($(k) && k !== "depMetar" && k !== "arrMetar")
    $(k).addEventListener("input", () => { renderAll(); save(); });
$("depMetar").addEventListener("input", () => applyMetar("dep", true));
$("arrMetar").addEventListener("input", () => applyMetar("arr", true));
/* Explicit hand-off. The W&B tab stays independent; these only move a number
   when tapped, so nothing couples the tabs behind your back. */
$("wbToDep").addEventListener("click", () => {
  if (!WB_M1) return;
  $("wt").value = Math.round(WB_M1);
  document.querySelector('#tabs button[data-t=to]').click();
  renderAll(); save();
});
$("wbToArr").addEventListener("click", () => {
  if (!WB_M2) return;
  $("aWt").value = Math.round(WB_M2);
  document.querySelector('#tabs button[data-t=ldg]').click();
  renderAll(); save();
});

$("depIcao").addEventListener("input", () => { syncAerodrome("dep"); renderAll(); save(); });
$("arrIcao").addEventListener("input", () => { syncAerodrome("arr"); renderAll(); save(); });
$("depRwy").addEventListener("change", () => applyRunway("dep"));
$("arrRwy").addEventListener("change", () => applyRunway("arr"));
$("depFetch").addEventListener("click", () => fetchForecast("dep"));
$("arrFetch").addEventListener("click", () => fetchForecast("arr"));

// Hand results forward: fuel decides the load, the load decides the masses,
// the masses drive take-off and landing. Retyping between them invites a typo.




$("sumCopy").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(summaryText()); $("sumCopy").textContent = "Copied"; }
  catch(e){ $("sumCopy").textContent = "Copy failed — select the text instead"; }
  setTimeout(() => { $("sumCopy").textContent = "Copy to clipboard"; }, 2500);
});
$("sumMail").addEventListener("click", () => {
  const subj = `TB20 performance ${$("depIcao").value || "----"}-${$("arrIcao").value || "----"}` +
               ` ${new Date().toISOString().slice(0,10)}`;
  // mailto opens the mail app with it prefilled; nothing is sent until you send it
  location.href = `mailto:?subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(summaryText())}`;
});
$("sumPrint").addEventListener("click", () => window.print());

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
$("crzSrc").addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  crzSrc = b.dataset.s;
  for (const x of $("crzSrc").children) x.setAttribute("aria-pressed", x === b);
  renderCruise(); save();
});
$("gtSeg").addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  gtAirframe = b.dataset.g === "1";
  for (const x of $("gtSeg").children) x.setAttribute("aria-pressed", x === b);
  renderCruise(); save();
});
$("mixSeg").addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  mix = b.dataset.m;
  for (const x of $("mixSeg").children) x.setAttribute("aria-pressed", x === b);
  renderCruise(); save();
});
for (const x of $("regSeg").children) x.setAttribute("aria-pressed", x.dataset.r === basis);
for (const x of $("mixSeg").children) x.setAttribute("aria-pressed", x.dataset.m === mix);
for (const x of $("crzSrc").children) x.setAttribute("aria-pressed", x.dataset.s === crzSrc);
for (const x of $("gtSeg").children)  x.setAttribute("aria-pressed", (x.dataset.g === "1") === gtAirframe);

syncDeclaredFields();
renderRef();
renderAll();
save();   // persist the one-time basis migration

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
