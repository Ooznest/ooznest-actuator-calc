# Actuator Calculator — Theory of Operation

## Overview

This calculator estimates whether a given stepper motor + actuator combination
can drive a load at a requested speed. It uses an **empirical single-point
calibration model** — one motor+actuator pair was physically tested, and the
formula constants were fitted to match those observations. All other combos
are estimated by scaling from that reference.

**Reference pair:** NEMA23-345-300 motor + TR8×8 lead screw

---

## 1. No-Load RPM (Electrical Stall Speed)

The maximum free-spinning speed of the motor under no load, before
back-EMF cancels the supply voltage.

```
noLoadRpm = (5500/8) × √(4 / L) × √(V_headroom) × (I_set / 1.25)^0.15
```

```text
V_headroom = max(0.4, (24 - I_set × R) / 22.5)
```

| Symbol        | Value / Source             | Units  | Meaning |
|---------------|----------------------------|--------|---------|
| 5500          | TUNABLE — empirical base   | RPM    | Upper-bound base speed for reference motor at full headroom |
| 8             | TUNABLE — empirical div    | —      | Normalisation divisor (stepper pole geometry factor) |
| 4             | Reference motor inductance | mH     | Inductance of the NEMA23-345-300 (our measured reference) |
| L             | motor.inductance           | mH     | Phase inductance of the selected motor |
| V_headroom    | max(0.4, (24 - I×R) / 22.5) | V/V  | Supply voltage remaining after resistive losses, with a conservative floor |
| 24            | Supply voltage             | V      | Fixed DC bus voltage |
| I             | Driver current setting     | A      | User-selected current |
| R             | motor.resistance           | Ω      | Phase winding resistance |
| 22.5          | 24 - 1.25×1.2             | V      | Reference voltage headroom (1.25A × 1.2Ω) |
| I_set         | Driver current setting     | A      | Same as I |
| 1.25          | Reference current          | A      | Typical stepper driver default (normalisation point) |
| 0.15          | TUNABLE — current exponent | —      | Weak positive effect of current on no-load speed |

### Tuning notes
- **5500/8 (687.5 RPM baseline):** Fudge factor. Adjust this to shift the
  entire no-load RPM curve up or down. Calibrated to match measured
  no-load speed of the reference pair.
- **4 mH reference inductance:** Tied to the reference motor. Change this
  if you calibrate to a different reference motor.
- **0.15 exponent:** Very weak current correction. Rarely needs adjustment.

---

## 2. Torque Derating with Speed

Stepper motors lose torque as speed increases because inductive reactance
limits how fast current can rise in the windings.

```
fraction = max(0, 1 - (rpm / noLoadRpm) ^ exponent)
```

| Symbol      | Value / Source          | Units  | Meaning |
|-------------|-------------------------|--------|---------|
| rpm         | speed / lead            | rev/min| Current operating speed |
| noLoadRpm   | From §1                 | rev/min| Maximum free-spinning speed |
| exponent    | TUNABLE — see below     | —      | Curve shape — lower values drop faster before the stall boundary |
| fraction    | 0 to 1                  | —      | Proportion of holding torque available |

### Tuning notes
- **exponent = 2.2** — Used for the measured reference pair (NEMA23-345-300
  + TR8×8 screw). This is the fitted reference curve shape.
- **exponent = 1.65** — Estimate for all other motor/transmission combos. For
  `0 < rpm/noLoadRpm < 1`, this lower exponent causes a faster torque drop,
  making the untested estimate more conservative.
- Increasing the exponent retains more torque through the middle of the speed
  range; decreasing it makes the curve fall faster. Both curves reach zero at
  the no-load boundary.

---

## 3. Available Motor Torque at Speed

```
torque_Nm = T_hold × 0.0980665 × currentRatio × fraction × derate
```

| Symbol        | Value / Source           | Units      | Meaning |
|---------------|--------------------------|------------|---------|
| T_hold        | motor.torque             | kg·cm      | Motor holding torque (datasheet) |
| 0.0980665     | Conversion constant      | N·m/(kg·cm)| Converts kg·cm → N·m (g/100) |
| currentRatio  | min(1, I_set / I_rated) | —          | Torque scaling when under-driving |
| I_rated       | motor.current            | A          | Motor's rated phase current |
| fraction      | From §2                  | —          | Speed derating factor |
| derate        | TUNABLE — see below      | —          | Confidence derating factor |

### Tuning notes
- **derate = 1.0** — Full confidence. Used for the measured reference pair.
- **derate = 0.75** — 25% penalty. Used for untested motor/actuator combos
  to account for estimation uncertainty. The calculator does not have measured
  torque-speed curves for every motor and actuator combination, so this
  conservative allowance prevents the theoretical maximum from being treated
  as a guaranteed real-world result.
- This is NOT a factor of safety — it's a model confidence adjustment.
- A separate Factor of Safety (FOS) is applied later to the final force.

---

## 4. Torque-to-Linear Force Conversion

### Lead Screw

```
F_drive = torque_Nm × η × 2π / (lead / 1000)
```

| Symbol    | Value / Source      | Units     | Meaning |
|-----------|---------------------|-----------|---------|
| torque_Nm | From §3             | N·m       | Motor torque at speed |
| η         | actuator.efficiency | —         | Screw efficiency (e.g. 0.42 for TR8×8) |
| lead      | actuator.lead       | mm/rev    | Linear travel per revolution |
| lead/1000 | —                   | m/rev     | Lead in metres |
| F_drive   | —                   | N         | Linear output force |

### Belt Drive

```
F_drive = torque_Nm × η / (lead / 1000 / 2π)
```

Same power balance principle — belt lead is already linear (mm/rev).

### Derivation

Power conservation: torque × angular_vel = force × linear_vel
- Angular velocity = 2π × rpm
- Linear velocity = lead × rpm (screw) or lead × rpm (belt)

Rearranging gives the formulas above.

---

## 5. Required Force from Load

```
F_required = m × (g·sin(θ) + g·μ·cos(θ) + a/1000)
```

| Symbol | Value / Source    | Units  | Meaning |
|--------|--------------------|--------|---------|
| m      | movingMass         | kg     | Payload + selected gantry plate mass |
| g      | 9.80665            | m/s²   | Standard gravity |
| θ      | orientation angle  | rad    | 90° = vertical, 0° = horizontal; inclined motion is not modelled |
| μ      | actuator.friction  | —      | Coefficient of friction |
| a      | accel              | mm/s²  | Requested acceleration |
| a/1000 | —                  | m/s²   | Acceleration in SI units |

Three components:
- **Gravity:**    m × g × sin(θ)
- **Friction:**   m × g × μ × cos(θ)
- **Inertia:**    m × a

The payload-capacity graph converts design force back into payload mass,
subtracting the selected gantry plate mass. Its right axis shows the
corresponding force in newtons.

---

## 6. Design Check

```
F_design = F_drive / FOS

torquePass = (F_design ≥ F_required)
```

| Symbol     | Value / Source | Units | Meaning |
|------------|----------------|-------|---------|
| FOS        | User input     | —     | Factor of safety; raw capacity is divided by this value |
| F_design   | —              | N     | Available force after safety margin |
| F_required | From §5        | N     | Force needed to move the load |

---

## 7. Maximum Usable Speed

The stall point at speed — found by binary search for the intersection
of the torque-speed curve with the load demand:

```
Find speed where: capacity(speed).force == requirement().total
```

At low speed the motor has excess torque; at high speed it doesn't.
The crossover is the maximum usable speed.

---

## 8. Gantry Plate Checks

Published gantry ratings already include the complete wheel arrangement and
the website's safety factor of 3. Wheel-level ratings are therefore not added
or multiplied in the calculator.

Each `gantryplates.json` entry retains both values for audit:

```text
published rating = value displayed on ooznest.co.uk
actual rating    = published rating × 3
usable rating    = actual rating / selected user FOS
```

The selected **Plate direction** chooses the bearing-load direction:

```text
vertical plate   → radial (Cy) static plate rating
horizontal plate → axial  (Cz) static plate rating at the selected rail width

plateDemand = movingMass × (g + acceleration / 1000)
platePass   = plateDemand ≤ usable plate rating
```

Axial `Cz` values vary with rail width, so the calculator exposes the widths
published for the selected plate rather than guessing one. The supplied moment
ratings are also restored from the website's FOS 3 and divided by the selected
user FOS:

```text
M_payload = payload × (g + acceleration / 1000) × (offset / 1000)
M_limit = min(actual My, actual Mz) / selected user FOS
```

These are static screening checks, not a dynamic structural certification.
The moment check remains deliberately conservative until its load direction is
modelled separately.

## Known Limitations

1. **Step angle only affects step rate.** Motor data stores 200 full steps/rev
   for 1.8° motors and 400 full steps/rev for 0.9° motors. This changes the
   generated step frequency, but does not create a measured torque curve or
   add a driver pulse-rate limit.

2. **Single-point calibration.** All constants were fitted to one
   motor+actuator pair. Untested combos use a 0.75 derate and the
   1.65 exponent — these are educated guesses, not measurements.

3. **derate vs FOS are separate.** derate (0.75) is model confidence.
   FOS (user input) is design safety. They serve different purposes
   and are applied independently.

4. **No thermal model.** Motor heating at sustained high current is
   not accounted for.

5. **No resonance model.** Mid-band resonance or mechanical resonance
   effects are not modelled.

6. **Vertical drag is simplified.** The coefficient-of-friction term tends to
   zero for vertical motion because it uses `cos(90°)`. Real screw/nut drag,
   wheel preload, cable drag and alignment losses are not separately measured.

---

## Reference Data

These are the current library values used by the calculator. Motor voltage is
the nominal phase voltage (`rated current × phase resistance`), not the 24 V
power-supply voltage.

### Motors

| Motor | Holding torque (kg-cm) | Rated current (A) | Resistance/phase (Ω) | Inductance/phase (mH) | Nominal phase V | Steps/rev |
|---|---:|---:|---:|---:|---:|---:|
| NEMA17 · 21 oz-in | 1.5 | 1.40 | 1.90 | 2.0 | 2.66 | 200 |
| NEMA17 · 35 oz-in · 0.9° | 2.5 | 1.33 | 2.10 | 2.5 | 2.79 | 400 |
| NEMA17 · 44 oz-in | 3.2 | 1.33 | 2.10 | 2.5 | 2.79 | 200 |
| NEMA17 · 50 oz-in · 0.9° | 3.5 | 1.68 | 1.65 | 3.5 | 2.77 | 400 |
| NEMA17 · 61.5 oz-in · 0.9° | 4.4 | 1.68 | 1.65 | 2.8 | 2.77 | 400 |
| NEMA17 · 62 oz-in | 4.4 | 1.68 | 1.65 | 3.6 | 2.77 | 200 |
| NEMA17 · 77 oz-in | 5.5 | 1.68 | 1.65 | 2.8 | 2.77 | 200 |
| NEMA17 · 114 oz-in | 8.2 | 2.00 | 2.00 | 3.3 | 4.00 | 200 |
| NEMA23 · 175 oz-in | 12.6 | 2.00 | 1.40 | 5.1 | 2.80 | 200 |
| NEMA23 · 175 oz-in · 2.8 A | 12.6 | 2.80 | 1.10 | 3.0 | 3.08 | 200 |
| NEMA23 · 265 oz-in | 19.1 | 2.80 | 1.13 | 7.6 | 3.16 | 200 |
| NEMA23 · 345 oz-in | 24.5 | 3.00 | 1.20 | 4.0 | 3.60 | 200 |

### Drive systems (actuators)

| ID | Drive | Type | Travel/rev (mm) | Efficiency | Friction coefficient | Listed max travel (mm) |
|---|---|---|---:|---:|---:|---:|
| `cbeam-screw` | C-Beam TR8×8 lead screw | Screw | 8 | 0.42 | 0.050 | 1,000 |
| `nema23-screw` | TR8×8 lead screw | Screw | 8 | 0.42 | 0.050 | 1,500 |
| `nema17-screw` | Compact TR8×8 lead screw | Screw | 8 | 0.38 | 0.050 | 1,000 |
| `belt-gt2-30t` | GT2 / 30-tooth pulley | Belt | 60 | 0.95 | 0.035 | 2,000 |
| `belt-gt3-20t` | GT3 / 20-tooth pulley | Belt | 60 | 0.95 | 0.035 | 2,000 |

### Gantry plates

The data source stores original website values and recovered values separately.
The table shows original static radial (`Cy`) capacity and recovered static
capacity before the calculator applies the selected FOS.

| ID | Gantry plate | Mass (kg) | Published Cy static (N) | Recovered Cy static (N) | Published My / Mz (Nm) |
|---|---|---:|---:|---:|---:|
| `cbeam-medium` | Medium C-Beam · 77.5×77.5 mm | 0.083 | 35.59 | 106.77 | 5.338 / 4.341 |
| `cbeam-large` | Large C-Beam · 75×155 mm | 0.175 | 35.59 | 106.77 | 12.233 / 9.949 |
| `cbeam-xl` | Extra-large C-Beam · 125×125 mm | 0.232 | 144.71 | 434.13 | 36.396 / 7.729 |
| `vslot-xs` | Extra-small V-Slot · 50×50 mm | 0.036 | 35.59 | 106.77 | 2.669 / 2.171 |
| `vslot-small` | Small V-Slot · 65×65 mm | 0.029 | 144.71 | 434.13 | 14.471 / 2.894 |
| `vslot-medium` | Medium V-Slot · 100×88 mm | 0.058 | 144.71 | 434.13 | 21.939 / 4.388 |
| `vslot-large` | Large V-Slot · 127×88 mm | 0.073 | 144.71 | 434.13 | 21.939 / 4.388 |

## Data and Tunable Constants

Motor, transmission and gantry data are stored separately in:

- `motors.json`
- `transmission.json`
- `gantryplates.json`

The calculation code is in `index.js`, in the `capacity()` function.

| Constant      | Current Value | Purpose                        | How to tune |
|---------------|---------------|--------------------------------|-------------|
| 5500          | 5500 RPM      | No-load speed base scaler      | Increase to raise all no-load RPM estimates |
| 8             | 8             | Normalisation divisor          | Paired with 5500 — adjust ratio 5500/8 |
| 4             | 4 mH          | Reference motor inductance     | Change to match your reference motor's actual inductance |
| 0.15          | 0.15          | Current effect exponent        | Increase to make current setting have more effect |
| 2.2           | 2.2           | Torque derating exponent (measured) | Increase for steeper torque drop-off |
| 1.65          | 1.65          | Torque derating exponent (estimated) | Increase for steeper drop-off on untested combos |
| 0.75          | 0.75          | Confidence derate (untested)   | Decrease for more pessimistic estimates |
| 0.4           | 0.4           | Min voltage headroom floor     | Adjust to change behaviour at very low voltage |
