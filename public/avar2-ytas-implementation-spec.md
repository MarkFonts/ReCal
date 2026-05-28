# Implementing avar2 YTAS-follows-opsz in the Cal Sans Customizer

## Context

The customizer already applies `fontTools.varLib.instancer` to shift axis defaults (opsz, GEOM). This spec adds an **avar2 injection step** that makes the YTAS axis automatically adjust based on the opsz position. This runs in the Pyodide Web Worker alongside the existing instancer calls.

## What avar2 does

avar2 (axis variation table version 2) allows one axis's effective value to be modified based on another axis's position. In this case: when opsz is small (text sizes), YTAS automatically shifts upward (taller ascenders for legibility). When opsz is at default or above, YTAS stays at its fvar default.

**Critical behavior note:** avar2 is NOT a "default override." It transforms the YTAS value unconditionally — even if the user explicitly sets YTAS via `font-variation-settings`. The user cannot override avar2 via CSS. This is by spec design. The UI should communicate this clearly (e.g. "YTAS auto-adjusts with optical size" with no "override" language).

## The mapping

Three anchor points defining a piecewise-linear relationship:

| opsz (user-space) | YTAS effective value |
|---|---|
| 8 (axis min) | 770 |
| 11 | 745 |
| 14 (axis default) | 720 (no change) |
| > 14 | 720 (no change) |

Between anchors, values interpolate linearly. Above opsz=14, no mapping fires — YTAS stays at fvar default (720).

## Implementation

### Step 1: Build a designspace document in memory

```python
from fontTools.designspaceLib import (
    DesignSpaceDocument,
    AxisDescriptor,
    AxisMappingDescriptor,
)

def build_avar2_designspace(font):
    """Build a designspace with avar2 axis mappings for YTAS-follows-opsz.
    
    Reads axis ranges from the font's fvar table so it stays correct
    even after instancer has shifted defaults.
    """
    ds = DesignSpaceDocument()

    # Read axes from the font's current fvar
    fvar = font['fvar']
    axis_info = {}
    for a in fvar.axes:
        ax = AxisDescriptor()
        ax.tag = a.axisTag
        ax.name = {
            "opsz": "Optical size",
            "wght": "Weight",
            "GEOM": "Geometric Form",
            "YTAS": "Ascender Height",
            "SHRP": "Sharp",
        }.get(a.axisTag, a.axisTag)
        ax.minimum = a.minValue
        ax.default = a.defaultValue
        ax.maximum = a.maxValue
        ds.addAxis(ax)
        axis_info[a.axisTag] = {
            "min": a.minValue,
            "default": a.defaultValue,
            "max": a.maxValue,
        }

    # Helper: build a full location dict using defaults for all axes,
    # overriding only opsz and YTAS. Axis mappings require ALL axes
    # to be present in input/output locations, keyed by AXIS NAME
    # (not tag).
    tag_to_name = {a.tag: a.name for a in ds.axes}

    def make_loc(opsz_val, ytas_val):
        loc = {}
        for a in ds.axes:
            if a.tag == "opsz":
                loc[a.name] = opsz_val
            elif a.tag == "YTAS":
                loc[a.name] = ytas_val
            else:
                loc[a.name] = a.default
        return loc

    def add_mapping(opsz_val, ytas_out):
        m = AxisMappingDescriptor()
        m.inputLocation = make_loc(opsz_val, axis_info["YTAS"]["default"])
        m.outputLocation = make_loc(opsz_val, ytas_out)
        ds.axisMappings.append(m)

    # Anchors — MUST include the identity anchor at the default opsz
    add_mapping(14.0, 720.0)   # identity: no YTAS change at default opsz
    add_mapping(11.0, 745.0)   # mid-small: moderate bump
    add_mapping(8.0,  770.0)   # smallest: largest bump

    return ds
```

### Step 2: Apply avar2 to the font

```python
from fontTools.varLib.avar.build import build as build_avar
import tempfile, os

def apply_avar2(font):
    """Inject avar2 YTAS-follows-opsz mapping into the font.
    
    Call this AFTER instancer has shifted axis defaults,
    so the designspace reads the correct post-shift fvar values.
    """
    ds = build_avar2_designspace(font)
    
    # build_avar requires a file path, not an in-memory object
    with tempfile.NamedTemporaryFile(suffix=".designspace", delete=False) as f:
        ds_path = f.name
    
    try:
        ds.write(ds_path)
        build_avar(font, ds_path)
    finally:
        os.unlink(ds_path)
    
    return font
```

### Step 3: Integration into the worker pipeline

In the existing `applyConfig` function (or equivalent), the call order is:

```python
def apply_config(font_bytes, config):
    font = TTFont(BytesIO(font_bytes))
    
    # 1. Shift axis defaults via instancer
    axis_limits = {}
    for tag, new_default in config["axisDefaults"].items():
        axis = next(a for a in font['fvar'].axes if a.axisTag == tag)
        axis_limits[tag] = (axis.minValue, new_default, axis.maxValue)
    
    if axis_limits:
        font = instantiateVariableFont(
            font, axis_limits, inplace=False, optimize=True
        )
    
    # 2. Inject avar2 (AFTER instancer, reads post-shift fvar)
    if config.get("avar2_ytas", False):
        apply_avar2(font)
    
    # 3. Other operations (rename, freeze features, etc.)
    # ...
    
    # 4. Save
    ttf_buf = BytesIO()
    font.save(ttf_buf)
    
    font.flavor = "woff2"
    woff2_buf = BytesIO()
    font.save(woff2_buf)
    
    return {"ttf": ttf_buf.getvalue(), "woff2": woff2_buf.getvalue()}
```

**Order matters:** instancer MUST run before avar2 injection, because `build_avar2_designspace` reads the font's current fvar to get the (potentially shifted) axis defaults and ranges. If you inject avar2 first and then run instancer, instancer will try to process the avar2 table and may produce unexpected results.

### Step 4: UI

Add a toggle in the customizer UI:

```
☑ Auto-adjust ascender height for small sizes (avar2)
  At small optical sizes, ascenders grow taller for better legibility.
  This cannot be overridden via CSS font-variation-settings.
```

The "cannot be overridden" note is important — don't let the UI suggest this is a default that users of the font can change. It's a hard transformation. When the toggle is on, the YTAS slider in the customizer should either:
- Be visually dimmed with a note "controlled by optical size"
- Show the effective YTAS value at the current opsz preview position (read-only)

When the toggle is off, YTAS slider works normally (manual control, no avar2 injected).

### Step 5: Make the mapping user-configurable (stretch goal)

Instead of hardcoding the three anchors, expose them in the UI:

```
opsz = 8   → YTAS = [770] (editable)
opsz = 11  → YTAS = [745] (editable)
opsz = 14  → YTAS = [720] (locked to YTAS default)
```

The opsz=14 anchor is always locked to the YTAS fvar default (identity mapping). The other two are editable. If the user changes the opsz default via the axis-defaults slider, the identity anchor moves to match.

Pass the custom anchors through the config:

```json
{
  "avar2_ytas": true,
  "avar2_anchors": [
    {"opsz": 8, "ytas": 770},
    {"opsz": 11, "ytas": 745}
  ]
}
```

Update `build_avar2_designspace` to accept these as parameters instead of hardcoded values.

## Browser support

avar2 requires HarfBuzz-based rendering. Current support:
- **Safari (macOS Sonoma+):** ✓
- **Chrome (recent):** ✓
- **Firefox (recent):** ✓
- **Older browsers / design apps:** silently ignored (YTAS stays at fvar default)

Graceful degradation — the font works everywhere, the avar2 behavior just doesn't fire in unsupported environments.

## Key gotchas

1. **Axis mapping locations use axis NAMES, not tags.** `"Optical size"` not `"opsz"`. fontTools will throw a `KeyError` on the axis tag if you use tags.
2. **`build_avar` overwrites any existing avar table.** If instancer created avar v1 segments during the default shift, `build_avar` replaces them. This is fine — `build_avar` rebuilds both v1 and v2 from the designspace.
3. **`build_avar` requires a file path**, not an in-memory designspace object. Use a temp file.
4. **The identity anchor at the default opsz is mandatory.** Without it, the mapping has no "zero point" and produces incorrect interpolation across the whole range.
5. **avar2 transforms are unconditional.** Explicitly setting YTAS=720 in CSS does NOT bypass the avar2 delta. The delta gets added regardless. The UI must not promise override capability.
