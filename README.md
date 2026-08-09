# TB20 Performance & Loading

**Live:** https://ren205.github.io/tb20-performance/


A single self-contained HTML page that computes take-off, landing, climb, cruise
and weight & balance for the SOCATA TB20, from the tables in the aircraft's
Pilot's Information Manual.

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
| Take-off | POH 5.8–5.9 (Fig 5.6 / 5.7) |
| Landing | POH 5.30–5.31 (Fig 5.27 / 5.28) |
| Climb | POH 5.10–5.13 (Fig 5.8–5.11) |
| Cruise | POH 5.16–5.29 (Fig 5.13–5.26), both mixtures, 7 altitudes |
| W & B | POH 2.9 (limits) and Fig 6.3 (arms) |
| Reference | Stall speeds, airspeed calibration, holding, antenna penalties |

Interpolation is linear on weight, pressure altitude and ISA deviation. Every
tabulated corner reproduces the POH exactly. Beyond the tables, temperature and
pressure altitude **extrapolate rather than clamp** — clamping would under-read
distance on a hot or high day — and the app flags loudly when it does so.

## Factoring bases

Selectable on the take-off and landing tabs. Every factor applied is itemised on
screen with its numeric value, its source citation and a running distance.

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

## Fuel planning

The first tab builds a full fuel plan: taxi, climb, cruise, descent,
contingency, alternate and final reserve, with a breakdown table naming the
source of every line.

Climb comes from the POH climb tables and cruise from the POH level-flight
tables. **Descent is not in the POH** — its rate and flow are your assumptions,
labelled as such in the table, and the descent leg is credited with ground
distance at cruise TAS. Final reserve is priced at the POH holding consumption
(45% BHP, 8.5 US gal/h = 32 L/h).

The result hands forward: *Use total fuel in weight & balance* → W&B computes
take-off and landing mass → *Use take-off mass in Departure* / *Use landing mass
in Arrival*. That chain exists so no mass is ever retyped between two safety
calculations.

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

## Forecast for a planned time

Set a planned time (UTC) and press **Fetch forecast**. It queries the free
[Open-Meteo](https://open-meteo.com) hourly model for the aerodrome's
coordinates and fills OAT, QNH and wind for that hour, setting the wind
reference to True.

This is the one part of the tool that needs a connection — it cannot work in
flight, and it will not work from a file opened directly off disk. Results are
cached, so a fetched forecast survives offline; on reload the cache is shown
with its age but is **not** re-applied.

It is **model output, not an observation**: no gusts, and temperature can be a
couple of degrees out, which moves the take-off distance by a few percent. Use a
METAR for the actual departure calculation whenever one exists. A TAF is not
used, because TAFs give wind but carry neither QNH nor temperature, and many
smaller aerodromes (LFSN among them) issue none at all.

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
- W&B uses the POH's own metric figures where it states them (CG limits, baggage
  station), because the manual rounds them independently of the inch values
  (it prints 0.913 m where 35.9 in is 911.9 mm). Seat and fuel arms exist only
  in inches in Figure 6.3 and are converted; the arms table labels which is which.

## Before you rely on the W&B tab

The empty mass and arm default to the POH's **sample** aeroplane
(846.5 kg at 961.6 mm). Replace them with the figures from your aircraft's
current weighing form. If that form gives the arm in inches, multiply by 25.4.

The tab refuses to be quiet about this: while the sample figures are still in
place it shows a red banner, and once changed it shows an amber one until you
tick the box confirming they are your aircraft's. A wrong empty mass produces a
plausible answer with no other symptom, which is the one silent failure mode
this tool could have.

## Offline

The page registers a service worker that precaches the whole app and serves it
cache-first, so offline is deterministic rather than dependent on the browser's
cache heuristics. The header shows **offline ready** once the cache is in place,
next to the build version.

Verified by killing the web server and reloading: the page and all 1433
aerodromes load from cache with every tab working.

The service worker only applies to the hosted copy over https (or localhost).
A `TB20-Performance.html` opened straight off disk simply runs without it.

## Printing

The Reference and result tabs print reasonably — `@media print` drops the
navigation, buttons and text boxes, switches to a light palette and expands
every tab, so a single print gives one paper copy of the whole plan.

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
| `src/logic.js` | Factoring bases, W&B, rendering, persistence |

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
