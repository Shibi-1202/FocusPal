# FocusPal Color System

## Color Palette

### Primary Colors
| Color | Hex | Usage |
|-------|-----|-------|
| Orange | `#d6542c` | Primary accent, buttons, critical priority |
| Peach | `#eda28a` | Secondary accent, info states |
| Blue | `#124c81` | Important actions, high priority |
| Slate | `#4a6190` | Medium priority, secondary elements |
| Gray | `#98a8bb` | Low priority, muted elements |
| Purple | `#3c345c` | Personal tasks, special states |

### Background Colors
| Color | Hex | Usage |
|-------|-----|-------|
| Dark | `#1a1a1a` | Main background |
| Darker | `#0f0f0f` | Deeper backgrounds |
| Card | `#242424` | Card/panel backgrounds |
| Hover | `#2a2a2a` | Hover states |

### Text Colors
| Color | Hex | Usage |
|-------|-----|-------|
| Primary | `#ffffff` | Main text |
| Secondary | `#98a8bb` | Secondary text |
| Muted | `#6b7280` | Disabled/muted text |

## Priority System

Tasks use color-coded priorities:

- 🟠 **Critical** (`#d6542c`) - Urgent, must-do tasks
- 🔵 **High** (`#124c81`) - Important, high priority
- 🟣 **Medium** (`#4a6190`) - Normal priority
- ⚪ **Low** (`#98a8bb`) - Nice to have, flexible
- 🟡 **Info** (`#eda28a`) - Meetings, reminders, non-work
- 🟣 **Personal** (`#3c345c`) - Personal tasks, breaks

## Usage

### In HTML
```html
<link rel="stylesheet" href="colors.css">
```

### CSS Variables
```css
/* Primary colors */
background-color: var(--primary-orange);
color: var(--primary-blue);

/* Priority colors */
background-color: var(--priority-critical);
color: var(--priority-high);

/* Text colors */
color: var(--text-primary);
color: var(--text-secondary);
```

### Utility Classes
```html
<!-- Background -->
<div class="bg-primary">Orange background</div>
<div class="bg-secondary">Blue background</div>

<!-- Text -->
<span class="text-primary">White text</span>
<span class="text-secondary">Gray text</span>

<!-- Priority -->
<div class="bg-priority-critical">Critical task</div>
<div class="priority-high">High priority text</div>

<!-- Glow effects -->
<div class="glow-orange">Orange glow</div>
<div class="glow-blue">Blue glow</div>
```

## Glow Effects

Widget states use colored glows:
- Orange glow: Critical tasks active
- Blue glow: High priority tasks active
- Purple glow: Personal tasks / Idle state

```css
box-shadow: var(--glow-orange);
box-shadow: var(--glow-blue);
box-shadow: var(--glow-purple);
```

## Opacity Levels

Widget transparency:
- Idle: 75% opacity (`--opacity-idle: 0.75`)
- Hover: 90% opacity (`--opacity-hover: 0.9`)
- Active: 100% opacity (`--opacity-active: 1`)
