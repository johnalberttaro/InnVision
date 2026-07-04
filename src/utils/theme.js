// Shared theme tokens — keeps colors/spacing consistent across screens.
//
// Palette identity: clean white + pure black/charcoal.
// Black carries all structural weight (nav, headings, primary buttons, CTAs).
// Backgrounds stay white and soft grey — no color distractions, just clean
// contrast. One strong neutral palette reads professional and timeless.

export const colors = {
  background: '#ffffff',
  card: '#ffffff',
  cardAlt: '#f7f7f7', // soft grey for section backgrounds
  border: '#e0e0e0',

  primary: '#1a1a1a',       // near-black — nav, headings, primary structure
  primaryDark: '#000000',   // pressed/active state of primary
  primaryTint: '#f2f2f2',   // subtle grey-tinted background (e.g. selected rows)
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