// Portal theme — a separate, monochrome palette for staff-facing
// screens (Admin, Front Desk, Kitchen/F&B), independent from the warm
// cream/charcoal palette guest-facing screens (Home, Order Food, the
// booking flow) use from theme.js.
//
// WHY A SEPARATE FILE rather than editing theme.js's colors directly:
// every portal screen imports { colors, spacing, radius, fonts } from
// theme.js's static `colors` export — which is the SAME export guest
// screens rely on (theme.js's own header comment confirms `colors` is
// permanently pinned to lightColors, kept only for screens that
// haven't migrated to the dark-mode-aware useTheme() hook — and every
// portal screen built throughout this whole project is one of those
// unmigrated screens). Editing theme.js's colors in place would have
// changed the guest experience too, which was explicitly not wanted.
// A second file with the identical shape means only each portal
// file's IMPORT PATH needs to change — none of its actual styling
// code does, since every color token name stays the same.
//
// ROLLOUT: change the import path in every portal screen from
//   import { colors, spacing, radius, fonts } from '../../utils/theme';
// to
//   import { colors, spacing, radius, fonts } from '../../utils/portalTheme';
// (adjust the relative path depth to match each file's actual folder
// nesting). Guest-facing screens keep importing from theme.js,
// unchanged.
//
// MONOCHROME BY DESIGN: no separate bright accent hue — primary/accent
// are the same near-black used for text, matching how the guest
// theme's own `primary` already works (a single structural color, not
// a separate brand hue). Several tokens below (hero*, calendar*,
// homeHeroGreen, aboutBackground/Accent, dot*, navBackground, step*)
// are guest-booking-flow specific and portals never actually render
// them — they're carried over as harmless placeholders (same shape as
// theme.js) purely so nothing breaks if a screen unexpectedly
// references one, not because they mean anything in a portal context.
//
// danger/dangerBg are deliberately left the SAME as the guest theme's
// values — red-for-error is a universal convention that shouldn't
// change just because the base palette did.

import { spacing, radius, fonts } from './theme';

export const portalColors = {
  background: '#F7F7F8',
  card: '#FFFFFF',
  cardAlt: '#F0F0F2',
  border: '#E1E1E4',

  primary: '#1A1A1E',
  primaryDark: '#000000',
  primaryTint: '#F0F0F2',
  onPrimary: '#FFFFFF',
  accent: '#1A1A1E',
  accentDark: '#000000',
  accentTint: '#F0F0F2',

  step: '#1A1A1E',
  stepBg: '#E1E1E4',
  stepDone: '#6B6B70',
  priceStrike: '#B0B0B5',

  // Guest-flow-only tokens — see file header. Not used by any portal
  // screen; carried over unchanged in spirit (mapped onto the new
  // neutral palette) purely for shape-compatibility.
  heroBackground: '#1A1A1E',
  heroBackgroundDark: '#000000',
  heroCard: '#FFFFFF',
  heroCta: '#1A1A1E',
  heroCtaDark: '#000000',
  heroIcon: '#1A1A1E',

  calendarToday: '#1A1A1E',
  calendarRangeBg: '#F0F0F2',
  calendarPast: '#D6D6DA',

  navBackground: '#FFFFFF',
  homeHeroGreen: '#1A1A1E',
  homeHeroGreenDark: '#000000',
  aboutBackground: '#F0F0F2',
  aboutAccent: '#1A1A1E',
  overlayDim: 'rgba(0,0,0,0.45)',
  dotInactive: 'rgba(0,0,0,0.25)',
  dotActive: '#1A1A1E',

  text: '#1A1A1E',
  textMuted: '#6B6B70',
  danger: '#b3261e',
  dangerBg: '#fdecea',
  white: '#ffffff',
  disabled: '#D6D6DA',
};

// Matches theme.js's own backward-compatible pattern — a plain
// `colors` export (not a hook), since every portal screen currently
// imports it statically rather than through useTheme().
export const colors = portalColors;

// Spacing, radius, and fonts are unchanged from the guest theme — this
// request was about color only, not typography or layout rhythm — so
// these are re-exported directly from theme.js rather than duplicated,
// keeping one single source of truth for them.
export { spacing, radius, fonts };