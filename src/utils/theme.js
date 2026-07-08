// Shared theme tokens — keeps colors/spacing consistent across screens.
//
// ─────────────────────────────────────────────────────────────────────────
// DARK MODE ARCHITECTURE
//
// This file now exports TWO color palettes (lightColors / darkColors)
// instead of one. Screens should stop importing `colors` directly and
// instead call useTheme() from context/ThemeContext.js, which returns
// whichever palette is currently active plus spacing/radius/fonts.
//
// The plain `colors` export below is kept ONLY for backward compatibility
// with screens that haven't been migrated to useTheme() yet — it always
// equals lightColors. Those screens will keep rendering in light mode
// until they're individually migrated (a static `import { colors }` can't
// react to theme changes — that's a hard JS/React constraint, not a bug).
//
// Semantic token note: `colors.white` means "literally white" in both
// palettes. For "the color of text/icons drawn on top of a
// primary/accent-colored element" (which needs to FLIP between light and
// dark mode, since primary itself flips), use the new `onPrimary` token
// instead of `white`.
// ─────────────────────────────────────────────────────────────────────────

export const lightColors = {
  background: '#ffffff',
  card: '#ffffff',
  cardAlt: '#f7f7f7', // soft grey for section backgrounds
  border: '#e0e0e0',

  primary: '#1a1a1a',       // near-black — nav, headings, primary structure
  primaryDark: '#000000',   // pressed/active state of primary
  primaryTint: '#f2f2f2',   // subtle grey-tinted background (e.g. selected rows)
  onPrimary: '#ffffff',     // text/icons drawn ON TOP of primary/accent-colored elements
  accent: '#1a1a1a',        // same as primary — single-color identity
  accentDark: '#000000',
  accentTint: '#f2f2f2',

  // Booking-engine step/CTA accent (Room & Rates / Review & Pay flow)
  step: '#1a1a1a',          // active step + reserve button — black CTA
  stepBg: '#ebebeb',        // inactive step background
  stepDone: '#4a4a4a',      // completed step indicator — dark grey
  priceStrike: '#a0a0a0',

  // Landing/search hero
  heroBackground: '#1a1a1a',
  heroBackgroundDark: '#000000',
  heroCard: '#ffffff',
  heroCta: '#1a1a1a',
  heroCtaDark: '#000000',
  heroIcon: '#1a1a1a',

  // Calendar popup
  calendarToday: '#1a1a1a',
  calendarRangeBg: '#f2f2f2',
  calendarPast: '#cfcfcf',

  // Homepage (nav bar, hero carousel, About section)
  navBackground: '#ffffff',
  homeHeroGreen: '#1a1a1a',     // kept name for backward compatibility
  homeHeroGreenDark: '#000000',
  aboutBackground: '#f7f7f7',   // soft grey band
  aboutAccent: '#1a1a1a',
  overlayDim: 'rgba(0,0,0,0.45)',
  dotInactive: 'rgba(255,255,255,0.55)',
  dotActive: '#ffffff',

  text: '#1a1a1a',          // near-black — clean and sharp
  textMuted: '#6b6b6b',     // mid-grey for secondary text
  danger: '#b3261e',
  dangerBg: '#fdecea',
  white: '#ffffff',
  disabled: '#cfcfcf',
};

export const darkColors = {
  background: '#000000',
  card: '#1a1a1a',
  cardAlt: '#242424',    // dark equivalent of the light soft-grey section bg
  border: '#333333',

  primary: '#f2f2f2',        // flips to near-white so it still pops against dark bg
  primaryDark: '#ffffff',
  primaryTint: '#2a2a2a',
  onPrimary: '#0a0a0a',      // text/icons on top of the now-light primary color
  accent: '#f2f2f2',
  accentDark: '#ffffff',
  accentTint: '#2a2a2a',

  step: '#f2f2f2',
  stepBg: '#2a2a2a',
  stepDone: '#8a8a8a',
  priceStrike: '#7a7a7a',

  heroBackground: '#1a1919',
  heroBackgroundDark: '#1a1919',
  heroCard: '#1a1a1a',
  heroCta: '#f2f2f2',
  heroCtaDark: '#ffffff',
  heroIcon: '#f2f2f2',

  calendarToday: '#f2f2f2',
  calendarRangeBg: '#2a2a2a',
  calendarPast: '#4a4a4a',

  navBackground: '#141414',
  homeHeroGreen: '#000000',
  homeHeroGreenDark: '#000000',
  aboutBackground: '#1f1f1f',
  aboutAccent: '#f2f2f2',
  overlayDim: 'rgba(0,0,0,0.6)',
  dotInactive: 'rgba(255,255,255,0.35)',
  dotActive: '#ffffff',

  text: '#f2f2f2',
  textMuted: '#a3a3a3',
  danger: '#ff6659',
  dangerBg: '#3b1f1c',
  white: '#ffffff',       // stays literally white in both palettes
  disabled: '#555555',
};

// Backward-compatible default — always light. Screens not yet migrated to
// useTheme() (context/ThemeContext.js) will keep importing this and will
// render in light mode regardless of the user's dark mode preference,
// until they're migrated one by one.
export const colors = lightColors;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
};

// Font families — loaded once via useFonts() in App.jsx.
// Headings/buttons/app-name use Baloo 2 (bold, rounded, catchy — friendly
// without being childish); body text uses Inter (clean, highly legible at
// small sizes, keeps dense UI text like dates and labels easy to read).
export const fonts = {
  headingBold: 'Baloo2_700Bold',
  headingExtraBold: 'Baloo2_800ExtraBold',
  headingSemiBold: 'Baloo2_600SemiBold',
  headingMedium: 'Baloo2_500Medium',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemiBold: 'Inter_600SemiBold',
};