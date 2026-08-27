# TB20 Performance

**Live:** https://ren205.github.io/tb20-performance/


A single self-contained HTML page that computes **take-off, climb, cruise and
landing performance** for the SOCATA TB20, from the tables in the aircraft's
Pilot's Information Manual.

Fuel planning is deliberately **not** here — that lives in SkyDemon and
ForeFlight. This does what they cannot: POH runway performance with the
regulatory factoring applied and shown, plus a standalone weight and balance
for the actual airframe.

**`TB20-Performance.html` is the tool.** Open it in any browser. It makes no
network requests of any kind — no fonts, no scripts, no analytics — so it works
with the iPad in airplane mode. Inputs persist in the browser's local storage.

## Source data and copyright

The performance and loading figures are transcribed from the SOCATA TB20
Pilot's Information Manual (P/N T00.18430320E2), which is © SOCATA / Daher.
That document states its contents may not be reproduced without written
permission from the copyright owner. This repository is published by an owner
of the aircraft for use with that aircraft. If you are the copyright holder and
want it taken down, open an issue and it will be removed.

No licence is granted for the transcribed manufacturer data. The surrounding
code is provided as-is with no warranty of any kind.

## Caution

The source manual is the **Pilot's Information Manual**, which states on its own
title page that it is non-official and must not be used as a substitute for the
approved AFM. Every figure here is a transcription from 300 dpi scans, read
visually rather than by OCR. **Spot-check the tables you actually depend on
against the paper manual before flying them.**

## What it covers

| Tab | Source |
|---|---|
| W & B | F-GVLD weighing report, CG limits POH 2.9 |
| Take-off | POH 5.8–5.9 (Fig 5.6 / 5.7) |
| Climb | POH 5.10–5.13 (Fig 5.8–5.11) |
| Cruise | POH 5.16–5.29 (Fig 5.13–5.26), both mixtures, 7 altitudes |
| Landing | POH 5.30–5.31 (Fig 5.27 / 5.28) |
| Summary | One page of the above, to copy, email or print |
| Reference | V-speeds, ASI markings, glide, stall speeds, calibration, holding |

Tabs run in the order of a flight. Departure and arrival are entered
independently on the Take-off and Landing tabs — type any ICAO into either.

Interpolation is linear on weight, pressure altitude and ISA deviation. Every
tabulated corner reproduces the POH exactly. Beyond the tables, temperature and
pressure altitude **extrapolate rather than clamp** — clamping would under-read
distance on a hot or high day — and the app flags loudly when it does so.

## Weight and balance

A standalone tab for **F-GVLD** (TB20 serial 1088), independent of the
performance tabs. Enter the load and two fuel quantities in litres — at start
and at end — and it gives mass and CG for both states, with the envelope.

Two buttons hand the results forward: *Use N kg as take-off mass* and *Use N kg
as landing mass*, which fill the Departure and Arrival panels and switch to that
tab. They name the figure they will copy, and they only act when tapped — the
tabs stay uncoupled otherwise.

Empty mass and arm are the aircraft's own, reconciled from its paperwork:

| | |
|---|---|
| Weighed | 947.000 kg (nose 219, left 372, right 356) |
| CG from the wheels | X = d − p₁D/M = 1.465 − 0.4417 = **1.0233 m** |
| Less TKS aboard | −22.672 kg at 2.769 m (20.8 L at 1.09) |
| Corrected empty | 924.328 kg at 0.980 m |
| CGR-30P avionics change | −2.000 kg, −1.5065 kg·m |
| **Current empty** | **922.328 kg at 980.97 mm** |

Every one of those reproduces the weighing report exactly, and the arithmetic is
checked in the test suite.

**The weighing drained the TKS**, so TKS fluid is not in the empty mass and is
loaded as its own station (2800 mm, 1.09 kg/L) whenever it is aboard.

Station arms are the weighing report's own figures; they agree with POH
Figure 6.3 to about 3 mm. Fuel is taken at 0.72 kg/L — the report's example
worked at 0.721, a difference of 0.2 kg on a full load.

**Note on the tanks.** They sit at 1085 mm, which is usually *aft* of the loaded
CG, so burning fuel moves the CG **forward** — toward the forward limit, not away
from it. With a heavy rear load the CG can sit aft of the tanks and the effect
reverses. Both directions are checked in the tests, and the tab shows the CG at
both fuel states so the direction is visible rather than assumed.

## Factoring bases

Selectable on the take-off and landing tabs. Every factor applied is itemised on
screen with its numeric value, its source citation and a running distance.

**Part-NCO is the default.** Unfactored gives raw test-pilot figures with no
margin at all, which is not a state to arrive at by forgetting to choose. Your
own selection is remembered and overrides the default.

- **Unfactored** — POH corrections only (surface and wind per POH 5.7). No margin.
- **Part-NCO** — Part-NCO prescribes *no* performance factors; NCO.POL.110 requires
  only that performance be "adequate", and its AMC/GM adds nothing. This basis
  therefore applies the **UK CAA Safety Sense 09** advisory factors (×1.33
  take-off, ×1.43 landing), labelled as advisory rather than regulatory.
- **Part-CAT B** — CAT.POL.A.305 and .330. Take-off ×1.25 against TORA; with a
  stopway or clearway declared this becomes ×1.00 TORA, ×1.15 TODA, ×1.30 ASDA.
  Landing within 70% of LDA (×1.43). Wind credit limited to 50% of headwind and
  150% of tailwind.

Where the POH itself specifies a surface factor, that value is used in *every*
basis — both AMC1-CAT.POL.A.305 and CAA SSL09 defer to the AFM ("unless
otherwise specified in the AFM"). The regulatory tables are used only for
surfaces the POH does not cover.

**On CAT.POL.A.305(b)(2):** the published text separates the TORA, TODA and ASDA
tests with "or", but its predecessor EU-OPS 1.530 used "and", and an "or"
reading would make route (2) less demanding than route (1). The app requires all
three and shows each separately.

## Aerodrome pre-fill

Type an ICAO into either panel and pick a runway end. It fills **field
elevation, QFU, slope and surface**. QFU comes from the runway designator,
which is magnetic by definition, so no variation conversion is involved — it is
rounded to 10°, so it can be up to 5° out, which is negligible for a wind
component. Slope is derived from the two threshold elevations and is signed
correctly for each panel (departure +uphill, arrival +downhill).

Coverage is France, Germany, Benelux, Switzerland, Italy, Spain, UK, Austria,
Portugal and Denmark — 1433 aerodromes, 1893 runways.

**It never fills declared distances.** No free dataset contains TORA/TODA/ASDA/
LDA; they are AIP figures and differ from physical runway length because of
displaced thresholds, stopways and clearways. Physical length is shown as a
read-only reference only. Take the declared distances from the AIP or VAC plate.

The data is from [OurAirports](https://ourairports.com) (public domain) and is
**crowd-sourced, not an official aeronautical source**. Treat it as a typing aid
and verify it. To refresh or widen the coverage, regenerate `src/aerodromes.js`
from that project's `airports.csv` and `runways.csv`.

## Weather entry

Each panel has a **METAR paste box**. Paste the raw report (from AeroWeather or
any other source) and it fills OAT, QNH and wind, and sets the wind reference to
True — because METAR winds are degrees true while the QFU is magnetic.

Parsing is token-by-token rather than one regex over the whole string, so
visibility (`1/2SM`), RVR (`R23L/0600`) and runway-state groups cannot be
mistaken for the temperature group. Handles `Q` and `A` pressure, KT/MPS/KMH,
negative temperatures, gusts, `VRB` and variable-direction ranges.

It warns rather than guessing:

- the report is for a **different aerodrome** than the panel's ICAO;
- the observation is **more than an hour old** (age is computed allowing for
  month rollover, since a METAR carries a day but no month);
- the wind is **VRB**, so no direction can be resolved — it fills the speed only;
- the wind is **gusting** — only the steady wind is filled, and you decide
  whether to use the gust for the crosswind and tailwind checks;
- the report is **incomplete**, e.g. no pressure or no temperature group.

Nothing is inferred that the report does not contain. On reload a stored report
shows its age but does **not** re-apply, so hand-edited values survive.

## Units and conventions

- Altitudes and elevations in **feet**; runway distances in **metres**;
  masses in **kg**; CG and arms in **mm**.
- **QFU is magnetic.** METAR/TAF winds are true, ATIS/tower winds are magnetic,
  so each aerodrome carries a wind-reference selector and a magnetic variation
  field (east-positive). A true wind is converted before being resolved against
  the QFU.
- Departure slope is entered **positive uphill**, arrival slope **positive
  downhill** — positive always means the penalising direction.

## Offline and updates

The page registers a service worker that precaches the whole app and serves it
cache-first, so offline is deterministic rather than dependent on the browser's
cache heuristics. The header shows **offline ready** once the cache is in place,
next to the build version.

Verified by killing the web server and reloading: the page and all 1433
aerodromes load from cache with every tab working.

A new build does **not** take over on its own — swapping the page underneath
someone midway through a mass-and-balance or departure calculation is worse than
running a build a few minutes old. Instead the header shows *"A newer version is
available"*; tapping it activates the update and reloads, keeping your entered
figures. The build version in the header tells you which one you are on.

The service worker only applies to the hosted copy over https (or localhost).
A `TB20-Performance.html` opened straight off disk simply runs without it.

## Printing

The Reference and result tabs print reasonably — `@media print` drops the
navigation, buttons and text boxes, switches to a light palette and expands
every tab, so a single print gives one paper copy of the whole plan.

## Verification

    node test/verify-tables.js     # 1040 checks
    node test/verify-logic.js      #   55 checks

`test/verify_core.js` is the app's own data and pure functions with the DOM
stripped out, so the tests exercise the shipping code rather than a copy.

What is checked:

- **Every tabulated POH cell** — take-off, landing, rate of climb and
  climb time/fuel/distance — is returned exactly at its own grid point, and
  every cruise value reproduces at each tabulated altitude.
- **An independent physics cross-check of the cruise columns.** TAS computed
  from the POH's own CAS by `TAS = CAS / √σ` at ISA reproduces the tabulated
  TAS to within 0.91 kt across every entry, which would not hold if a digit in
  either column had been mistyped.
- **Monotonicity** — distance rises with altitude, temperature and mass; climb
  rate falls with altitude and mass; roll is always shorter than the 50 ft
  distance; fuel flow and TAS fall with power; manifold pressure rises as RPM
  falls; best economy always burns less than best power at the same setting.
- **Conservative extrapolation** beyond the tables, and clamping below the
  lightest tabulated mass.
- **Units, atmosphere and true airspeed**, including the pressure-level mapping.
- **Weight and balance** — the weighing report reconciled from its wheel
  readings, the avionics change, the CG envelope, and the direction the CG moves
  as fuel burns on either side of the tanks.
- **Speeds and glide**, including V<sub>A</sub> scaling with mass.

The correction factors are verified in the browser, since they depend on the
DOM: the regulatory multipliers, the CAT wind credit and route (2) tests, the
POH wind and surface corrections, and slope.

## Editing

`src/` holds the page split into parts. After editing, run:

    ./build.sh

which concatenates them into `TB20-Performance.html` **and** `index.html`
(identical content — Pages serves the latter at the site root) and syntax-checks
the script block. Do not edit the built files directly; they are overwritten.

To build, commit and push in one step:

    ./publish.sh "what changed"

A `pre-commit` hook rebuilds automatically, so the published page can never
drift out of sync with `src/`.

| File | Contents |
|---|---|
| `src/head.html` | Meta tags and stylesheet |
| `src/body.html` | Markup for all six tabs |
| `src/data_block.js` | The POH tables, transcribed |
| `src/helpers.js` | Interpolation, unit conversion, formatting |
| `src/logic.js` | Factoring bases, aerodrome lookup, rendering, persistence |

## Getting it onto the iPad offline

A local file cannot be added to the iOS Home Screen — Safari only offers that
for a URL, which is what the Pages link is for.

Open **https://ren205.github.io/tb20-performance/** in Safari on the iPad, then
Share → **Add to Home Screen**. It launches in its own window with no browser
chrome, and because the page makes no network requests of any kind, it keeps
working once loaded.

**Verify it in airplane mode before relying on it.** iOS decides how long it
keeps a web app cached; if it ever fails to load offline, open it once with a
connection to refresh the cache before departure.

Alternatively, AirDrop `TB20-Performance.html` and open it from the Files app —
always offline, but no home-screen icon.
