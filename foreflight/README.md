# TB20 — ForeFlight setup sheet

Numbers to type into ForeFlight, derived from the same verified POH transcription
that drives the calculator in this repository.

## What ForeFlight will and will not accept

| | |
|---|---|
| **Cruise / climb / descent profile** | **You can build this.** "By-Altitude Profile", created in ForeFlight on the **Web** (plan.foreflight.com → Aircraft → Add Custom Profile). Requires a **Premium / Performance Plus** subscription. |
| **Weight & balance** | You can build this, in the aircraft profile. |
| **Runway performance** (take-off and landing distances) | **You cannot.** These are authored by ForeFlight per aircraft type and serial-number range. There is no user-entry path, so the TB20 take-off and landing figures stay in this repository's calculator. |

**There is no import file.** ForeFlight has no performance-profile file format —
their own guide tells you to prepare the numbers in a spreadsheet and paste them
into the web table. Hence a CSV rather than something ForeFlight can ingest.

Every altitude row you fill must have **all** its fields completed, or the profile
errors during planning. ForeFlight interpolates linearly between the rows you give
it, so more rows means better accuracy.

## Climb model

Gear up, flaps up, 2575 RPM full throttle, full rich, ISA, at 1400 kg (MTOM —
the conservative planning case).

| Altitude ft | Climb IAS kt | Rate of climb ft/min |
|---|---|---|
| 500 | 95 | 1100 |
| 2500 | 95 | 972 |
| 4500 | 95 | 844 |
| 6500 | 95 | 716 |
| 8500 | 95 | 588 |
| 10500 | 95 | 460 |
| 12500 | 95 | 332 |

Climb fuel flow — **low 20.3 US gal/h**, **high 14.2 US gal/h**.

These are derived by differencing the POH's cumulative climb-fuel table over the
lower half (500–4500 ft) and upper half (8500–12500 ft) of the climb. Differencing
a column rounded to 0.1 gal makes individual segments wobble, so the halves are
used rather than segment-by-segment values.

At 1075 kg the POH climb speed is 86 KIAS and the rates are considerably higher;
95 KIAS at MTOM is the conservative choice for a single planning profile.

## Cruise models

Build these as separate profiles so you can pick one per flight. **RPM changes with
altitude** where the POH stops tabulating a setting the engine can no longer hold —
the CSV records which RPM each row actually uses.

**Long range — 55% best economy** is the only setting tabulated across the whole
band, so it is the best single profile if you want just one.

See `tb20-foreflight-tables.csv` for all three, with TAS, fuel flow, RPM and MP.

## Descent model

**The POH contains no descent data.** ForeFlight requires it, so these are
assumptions, not manufacturer figures — change them to match how you actually fly:

- Descent IAS **130 kt**, rate **500 ft/min**
- Fuel flow **10.5 US gal/h** low and high (the 55% figure as a proxy)

## Weight and balance

Datum is the **front face of the firewall**.

| Station | Arm in | Arm mm | Limit |
|---|---|---|---|
| Front seats | 45.38 | 1153 | — |
| Front seats, 2-in back-off option | 47.44 | 1205 | — |
| Rear seats | 80.00 | 2032 | 509 lb / 231 kg |
| Baggage | 102.36 | 2600 | 143 lb / 65 kg |
| Fuel | 42.70 | 1085 | 86.2 US gal usable |

Max take-off and max landing mass **3086 lb / 1400 kg**. Fuel 88.8 gal total,
86.2 usable, 2.6 unusable, at 6.0 lb/US gal.

CG envelope, gear extended — enter as polygon vertices:

| Weight lb | Fwd CG in | Aft CG in |
|---|---|---|
| 2205 and below | 35.9 | 47.4 |
| 2756 | 37.4 | 47.4 |
| 3086 | 42.2 | 47.4 |

Straight-line variation between the points. Below 2205 lb the forward limit stays
at 35.9 in.

**Empty mass and arm are yours to supply** from the aircraft's current weighing
form. Do not use the POH sample figures (1866 lb at 37.86 in) — they belong to the
manual's example aeroplane.

## Caution

Everything here comes from the TB20 Pilot's **Information** Manual, which states on
its own title page that it is non-official and is not a substitute for the approved
AFM. A ForeFlight profile feeds real fuel and time planning — check these numbers
against your own manual before you rely on them, and bias the profile against
actual flight data once you have some.
