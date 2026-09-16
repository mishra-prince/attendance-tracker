# DESIGN.md — Design System v3: Liquid Glass (Red / Black)

## Design plan

**Color** — six named values, black as the canvas, red held back to where it earns attention:
- `Void` `#0A0908` — page background. Not pure black; a hair of warmth so red sits naturally on it.
- `Carbon` `#1C1B1E` — base tone glass panels are built from, before blur/translucency is applied.
- `Signal Red` `#FF453A` — the one accent. Primary actions, live/active states, the ambient glow. Nowhere else.
- `Ember` `#B31217` — deep red for pressed states and the base of red gradients. Never used flat on its own.
- `Bone` `#F5F1EE` — primary text. Warm off-white, not stark `#FFFFFF`.
- `Ash` `#9C9793` — secondary text, muted labels.

**Type** — Inter throughout (one family, matches the geometric precision of the reference aesthetic). Two roles: a normal UI scale for everything functional, and an ultralight display cut reserved for the one number that matters on a given screen — a student's attendance percentage, a live headcount. That's the one place we borrow Apple's habit of a single huge, thin numeral doing the talking.

**Layout** — content sits on the black canvas; a very soft red glow breathes up from the bottom edge, like light through frosted glass from another room. Navigation and the tab bar are the "closest" glass — heaviest blur, floating above everything. Cards are the next layer down — medium blur. Inline text and data are flat, unblurred — they're read through the glass, not made of it.

```
┌─────────────────────────────────────┐
│  ░░ soft red glow, bottom-anchored ░░│
│                                       │
│   ┌───────────────────────────┐     │
│   │  92%        <- display sz │     │  ← medium-blur card
│   │  Data Structures          │     │
│   └───────────────────────────┘     │
│                                       │
│  ╭─────────────────────────────╮    │  ← heavy-blur, floating
│  │ 🏠   📅   ✓   👤            │    │     nav (pill shape)
│  ╰─────────────────────────────╯    │
└─────────────────────────────────────┘
```

**Principles**
1. **Glass, not glass-morphism-cliché.** Every translucent surface gets a hairline top highlight (light source from above, not a flat white border) so it reads as a material with thickness, not a CSS trick.
2. **Red is a signal, not a wash.** It marks what's actionable or live — never a background fill, never body text, never decoration for its own sake.
3. **Depth is blur tiers, not shadows.** Three tiers map to elevation: heavy (nav/tab bar) → medium (cards) → none (inline content). Don't mix drop-shadow depth cues with blur depth cues — pick blur.
4. **Materials react to what's behind them.** A "present" badge isn't a solid green pill sitting on top of the glass — it's the glass itself tinted faintly green, so it feels like it belongs to the same surface as everything else, not a sticker on top of it.

*Why this avoids the generic near-black-plus-one-accent look:* the brief explicitly asked for red and black, so that pairing itself isn't the risk — the risk is a flat accent color with no material behavior. The blur-tier system, the tinted-not-solid badges, and reserving red exclusively for the live/actionable layer are what make it feel like glass over a real surface rather than a dark template with a red button pasted on.

---

## Tokens

```css
--color-void:          #0A0908;   /* page bg */
--color-carbon:         #1C1B1E;   /* glass panel base, pre-blur */
--color-signal-red:     #FF453A;   /* the one accent */
--color-ember:          #B31217;   /* deep red, pressed states / gradient base */
--color-text-primary:   #F5F1EE;
--color-text-secondary: #9C9793;
--color-text-muted:     #6B6663;

/* Glass materials — three elevation tiers */
--glass-heavy-fill:     rgba(28, 27, 30, 0.62);
--glass-heavy-blur:     blur(28px) saturate(180%);
--glass-medium-fill:    rgba(28, 27, 30, 0.46);
--glass-medium-blur:    blur(16px) saturate(150%);
--glass-border:         rgba(255, 255, 255, 0.09);
--glass-top-highlight:  inset 0 1px 0 rgba(255, 255, 255, 0.16);

/* Ambient background glow — one radial, bottom-anchored, very soft */
--ambient-glow: radial-gradient(ellipse 80% 40% at 50% 120%,
                 rgba(255, 69, 58, 0.20), transparent 70%);
```

**Fallback rule:** `backdrop-filter` isn't universal — always pair a glass surface with a solid `background-color` fallback (`--color-carbon` at ~90% opacity) so the UI still reads correctly without blur support, just less "liquid."

## Glass material recipes

**Heavy (nav bar, tab bar — floats above content)**
```css
background: var(--glass-heavy-fill);
backdrop-filter: var(--glass-heavy-blur);
border: 1px solid var(--glass-border);
box-shadow: var(--glass-top-highlight), 0 8px 32px rgba(0,0,0,0.4);
border-radius: 999px; /* pill */
```

**Medium (cards, panels)**
```css
background: var(--glass-medium-fill);
backdrop-filter: var(--glass-medium-blur);
border: 1px solid var(--glass-border);
box-shadow: var(--glass-top-highlight), 0 4px 20px rgba(0,0,0,0.3);
border-radius: 28px; /* squircle-approximation */
```

**Buttons**
- Primary: `linear-gradient(180deg, var(--color-signal-red), var(--color-ember))`, 1px border `rgba(255,255,255,0.25)`, inset top highlight, pill radius, white text. One per screen — this is the "spend your boldness in one place" element.
- Secondary: `rgba(255,255,255,0.04)` fill, `1px solid var(--glass-border)`, medium blur, `--color-text-primary` text. This is the default button everywhere else.
- Destructive (reject, delete): same construction as primary but built from `--color-ember` alone, no red-to-red gradient — keeps it visually distinct from the brand-accent primary button even though both are "red."

**The one signature motion:** pressing the primary button triggers a brief (150ms) light-sweep across its surface — a diagonal highlight passing left to right — echoing how real refractive material catches light on contact. This is the single deliberate motion moment; everything else (hover states, transitions) stays a plain 120–150ms opacity/transform fade. Respect `prefers-reduced-motion` by disabling the sweep, not the state change itself.

## Status badges (glass-tinted, not solid pills)
Each status tints the glass surface with a faint wash of its hue rather than sitting on top as a solid chip — consistent with "materials react to what's behind them":

| Status | Fill | Border | Text |
|---|---|---|---|
| Present | `rgba(52,199,89,0.14)` | `rgba(52,199,89,0.4)` | `#8AE9A0` |
| Late | `rgba(255,159,10,0.14)` | `rgba(255,159,10,0.4)` | `#FFC670` |
| Absent | `rgba(255,69,58,0.16)` | `rgba(255,69,58,0.45)` | `#FF9891` |
| Excused / Medical | `rgba(10,132,255,0.14)` | `rgba(10,132,255,0.4)` | `#7AC0FF` |
| On duty | `rgba(191,90,242,0.14)` | `rgba(191,90,242,0.4)` | `#D6A6FF` |
| Pending | `rgba(255,255,255,0.06)` | `rgba(255,255,255,0.18)` | `--color-text-secondary` |

**Important accessibility note:** because Signal Red is both the brand accent *and* the Absent status color, color alone can't distinguish "this is a live/actionable element" from "this student was marked absent." Every status badge carries an icon + text label, never color alone — this was already required in the accessibility section below, but it's load-bearing here specifically because of the shared hue.

## Typography

- Family: Inter, system-ui fallback
- UI scale (unchanged from v2): 12 / 14 / 16 / 20 / 24 / 32 px, weights 400/500/600
- **Display scale (new):** 64 / 80 / 96 px, weight 200 (ultralight), letter-spacing -0.02em — reserved for exactly one hero numeral per screen: a student's overall attendance %, a live "present" headcount during an open session. Never used for more than one number on the same screen — if everything is huge, nothing is.

## Layout
- Sidebar (desktop) collapses to the floating glass tab bar (mobile) for Student/Teacher
- HOD: mid-density glass sidebar (Overview, Approvals, Reports)
- Admin/Super Admin: denser sidebar, same glass treatment but on a flatter, less "floating" rail since density matters more than drama at that depth
- Max content width 1200px, centered; the ambient red glow is fixed to the viewport, not the content column, so it doesn't scroll with long pages

## Accessibility
- Minimum 4.5:1 contrast for all badge text against its own tinted fill (values above were chosen to clear this against `--color-void`/`--color-carbon`)
- Status always carries icon + text, never color alone (see note above — non-negotiable given red's dual role)
- Visible focus ring on every interactive element: `box-shadow: 0 0 0 2px var(--color-signal-red)` — the one place red appears on a non-primary element, because focus indication is functional, not decorative
- Respect `prefers-reduced-motion`: disable the light-sweep, keep state changes instant
- Touch targets minimum 44×44px

## Iconography
`lucide-react`, outline style, `--color-text-secondary` by default, `--color-signal-red` only when the icon itself represents an active/live state (a pulsing "session open" indicator, for example) — not as decoration.
