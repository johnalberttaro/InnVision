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
//
// PALETTE NOTE: the black-and-white identity has been replaced with a warm
// cream/charcoal palette (cream surfaces, dark warm-brown/charcoal for
// primary structure and text) across both light and dark modes. `white`
// stays literally white as before — it's a separate token from `cream`.
// ─────────────────────────────────────────────────────────────────────────

export const lightColors = {
  background: '#F5EFE6',
  card: '#FDFAF4',
  cardAlt: '#EFE7D8', // warm cream for section backgrounds
  border: '#E2D6C1',

  primary: '#332B22',        // dark warm charcoal-brown — nav, headings, primary structure
  primaryDark: '#1F1912',    // pressed/active state of primary
  primaryTint: '#EFE7D8',    // subtle cream-tinted background (e.g. selected rows)
  onPrimary: '#FDFAF4',      // text/icons drawn ON TOP of primary/accent-colored elements
  accent: '#332B22',         // same as primary — single-color identity
  accentDark: '#1F1912',
  accentTint: '#EFE7D8',

  // Booking-engine step/CTA accent (Room & Rates / Review & Pay flow)
  step: '#332B22',           // active step + reserve button — charcoal CTA
  stepBg: '#E9DFC9',         // inactive step background
  stepDone: '#6B5F4C',       // completed step indicator — warm mid-brown
  priceStrike: '#B3A48C',

  // Landing/search hero
  heroBackground: '#332B22',
  heroBackgroundDark: '#1F1912',
  heroCard: '#FDFAF4',
  heroCta: '#332B22',
  heroCtaDark: '#1F1912',
  heroIcon: '#332B22',

  // Calendar popup
  calendarToday: '#332B22',
  calendarRangeBg: '#EFE7D8',
  calendarPast: '#D8CBB0',

  // Homepage (nav bar, hero carousel, About section)
  navBackground: '#FDFAF4',
  homeHeroGreen: '#332B22',     // kept name for backward compatibility
  homeHeroGreenDark: '#1F1912',
  aboutBackground: '#EFE7D8',   // soft cream band
  aboutAccent: '#332B22',
  overlayDim: 'rgba(30,24,16,0.45)',
  dotInactive: 'rgba(255,255,255,0.55)',
  dotActive: '#ffffff',

  text: '#332B22',          // dark warm charcoal — clean and sharp
  textMuted: '#8A7C64',     // warm mid-tan for secondary text
  danger: '#b3261e',
  dangerBg: '#fdecea',
  white: '#ffffff',
  disabled: '#D8CBB0',
};

export const darkColors = {
  background: '#1E1A14',
  card: '#2A2419',
  cardAlt: '#332C1F',    // dark equivalent of the light soft-cream section bg
  border: '#453C2B',

  primary: '#F0E6D2',        // flips to warm cream so it still pops against dark bg
  primaryDark: '#FFFFFF',
  primaryTint: '#332C1F',
  onPrimary: '#1E1A14',      // text/icons on top of the now-light primary color
  accent: '#F0E6D2',
  accentDark: '#FFFFFF',
  accentTint: '#332C1F',

  step: '#F0E6D2',
  stepBg: '#332C1F',
  stepDone: '#A99B7C',
  priceStrike: '#7A6F58',

  heroBackground: '#181410',
  heroBackgroundDark: '#181410',
  heroCard: '#2A2419',
  heroCta: '#F0E6D2',
  heroCtaDark: '#FFFFFF',
  heroIcon: '#F0E6D2',

  calendarToday: '#F0E6D2',
  calendarRangeBg: '#332C1F',
  calendarPast: '#544A34',

  navBackground: '#211C15',
  homeHeroGreen: '#181410',
  homeHeroGreenDark: '#181410',
  aboutBackground: '#282217',
  aboutAccent: '#F0E6D2',
  overlayDim: 'rgba(0,0,0,0.6)',
  dotInactive: 'rgba(255,255,255,0.35)',
  dotActive: '#ffffff',

  text: '#F0E6D2',
  textMuted: '#B3A48C',
  danger: '#ff6659',
  dangerBg: '#3b1f1c',
  white: '#ffffff',       // stays literally white in both palettes
  disabled: '#5A5140',
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