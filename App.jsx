import React, { useState, useEffect } from 'react';
import { StyleSheet, StatusBar, Modal } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { Baloo2_800ExtraBold } from '@expo-google-fonts/baloo-2/800ExtraBold';
import { Baloo2_700Bold } from '@expo-google-fonts/baloo-2/700Bold';
import { Baloo2_600SemiBold } from '@expo-google-fonts/baloo-2/600SemiBold';
import { Baloo2_500Medium } from '@expo-google-fonts/baloo-2/500Medium';
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { supabase } from './src/services/supabase';

import HomeScreen           from './src/screens/home/HomeScreen';
import LoginScreen          from './src/screens/form/LoginScreen';
import RegisterScreen       from './src/screens/form/Registerscreen';
import ForgotPasswordScreen from './src/screens/form/Forgotpasswordscreen';
import ProfileScreen        from './src/screens/profile/Profilescreen';
import AboutScreen          from './src/screens/about/AboutScreen';
import ContactUsScreen      from './src/screens/contact/ContactUsScreen';
import MyReservationsScreen from './src/screens/bookingLookup/MyReservationsScreen';
import ReservationScreen    from './src/screens/reservation/ReservationScreen';
import RoomSelectionScreen  from './src/screens/roomRates/RoomSelectionScreen';
import ReviewPayScreen      from './src/screens/reviewPay/ReviewPayScreen';
import FrontDeskShell       from './src/screens/frontdesk/FrontDeskShell';
import AdminShell           from './src/screens/admin/AdminShell';
import LoadingScreen        from './src/screens/LoadingScreen';
import { fonts }            from './src/utils/theme';
import { ThemeProvider }    from './src/context/ThemeContext';

/**
 * MIGRATED TO SUPABASE AUTH. This file was missed during the original
 * migration pass — every individual screen (LoginScreen, RegisterScreen,
 * etc.) was moved over, but App.jsx's own session-state management was
 * never touched, meaning:
 *   - The Firebase onAuthStateChanged listener here never fired (nobody
 *     signs in via Firebase anymore), so this always fell through to
 *     `setScreen('home')` on every load — session persistence across a
 *     page reload / app restart was silently broken. Login only
 *     "worked" in testing because LoginScreen calls onLogin() directly
 *     on a fresh sign-in, which is a different code path than restoring
 *     an existing session.
 *   - The role lookup queried Firestore's `guests/{uid}` doc via
 *     resolveUserRole() — completely disconnected from the new Supabase
 *     `profiles.role` enum.
 *   - ThemeProvider's `userId={user?.uid}` was passing `undefined` the
 *     whole time, since a Supabase user has `.id`, not `.uid`.
 *
 * Now: supabase.auth.getSession() checks for an existing session once on
 * startup (the actual fix for the reload problem), and
 * supabase.auth.onAuthStateChange() keeps `user` in sync afterward, only
 * re-resolving the role/route on real SIGNED_IN / SIGNED_OUT events (not
 * every background token refresh, which would otherwise yank someone
 * back to their role's home screen mid-navigation for no reason).
 * handleLogin() is left in place as the fast, direct path LoginScreen
 * already uses (it does its own role lookup and calls onLogin directly)
 * — the two don't conflict, they just mean a fresh login's role gets
 * resolved twice (once directly, once via the listener), which is
 * harmless.
 *
 * STILL OUTSTANDING (flagged, not fixed here — out of scope for this
 * pass): ThemeContext.js itself still reads/writes dark-mode preference
 * via Firestore (`doc(db, 'guests', userId)`), which is now backed by
 * Supabase user IDs that don't exist in that Firestore collection at
 * all — dark mode persistence is non-functional until that file gets
 * its own Supabase migration pass. `firebase.js` therefore still can't
 * be deleted yet; ThemeContext.js is the one remaining thing that needs
 * it.
 *
 * NOTE ON SAFE AREA:
 * SafeAreaView/SafeAreaProvider now come from 'react-native-safe-area-context'
 * instead of the core 'react-native' package. The core RN SafeAreaView only
 * applies inset padding on iOS — on Android it's a no-op — which was letting
 * headers render under the status bar (clock/battery) on Android devices.
 * SafeAreaProvider must wrap the tree for useSafeAreaInsets() to work in any
 * descendant. HomeHeader relies entirely on THIS root SafeAreaView for its
 * top inset (it does not call useSafeAreaInsets() itself) — don't add a
 * second inset call there, or the header gets double-padded.
 *
 * A few other screens (LoginScreen, RegisterScreen, ForgotPasswordScreen,
 * ProfileScreen, HamburgerMenu, RateCard) still import the deprecated core
 * `SafeAreaView` from 'react-native' directly rather than going through
 * this provider — that's a known remaining cleanup item, not yet migrated.
 *
 * NOTE ON FRONT DESK / ADMIN SPLIT:
 * profiles.role is a real Postgres enum ('admin' | 'frontdesk' | 'guest')
 * now, set at signup by the on_auth_user_created trigger and defaulting
 * to 'guest' — no more resolveUserRole() guessing across differently-
 * shaped legacy fields the way the Firestore `guests` docs needed.
 */
export default function App() {
  const [fontsLoaded] = useFonts({
    [fonts.headingExtraBold]: Baloo2_800ExtraBold,
    [fonts.headingBold]:      Baloo2_700Bold,
    [fonts.headingSemiBold]:  Baloo2_600SemiBold,
    [fonts.headingMedium]:    Baloo2_500Medium,
    [fonts.body]:             Inter_400Regular,
    [fonts.bodyMedium]:       Inter_500Medium,
    [fonts.bodySemiBold]:     Inter_600SemiBold,
  });

  // ── Supabase auth state ─────────────────────────────────────────────
  const [user, setUser]               = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Keeps LoadingScreen visible for at least 5 seconds, regardless of how
  // fast fonts/auth actually resolve underneath it — without this, the
  // branded loading screen could flash by in well under a second on a
  // fast connection, defeating the point of having one.
  const [minLoadTimeElapsed, setMinLoadTimeElapsed] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setMinLoadTimeElapsed(true), 3000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    let mounted = true;

    const resolveRoleAndRoute = async (sessionUser) => {
      if (!sessionUser) {
        setScreen('home');
        return;
      }
      let role = 'guest';
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', sessionUser.id)
          .single();
        if (error) throw error;
        if (data?.role) role = data.role;
      } catch (roleLookupError) {
        console.warn('Role lookup failed on session restore, defaulting to guest:', roleLookupError);
      }
      const nextScreen = role === 'admin' ? 'admin' : role === 'frontdesk' ? 'frontdesk' : 'home';
      setScreen(nextScreen);
    };

    // Checks for an existing session ONCE on startup — this is the actual
    // fix for the reload-logs-you-out problem: without this, `user` only
    // ever gets set by handleLogin() at the moment of a fresh sign-in.
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      const sessionUser = data?.session?.user || null;
      setUser(sessionUser);
      resolveRoleAndRoute(sessionUser).finally(() => {
        if (mounted) setAuthLoading(false);
      });
    });

    // Keeps `user` in sync with sign-in/sign-out afterward. Only
    // re-resolves the role/route on actual SIGNED_IN / SIGNED_OUT
    // events — Supabase also fires this listener on background token
    // refreshes, which shouldn't reroute someone away from wherever
    // they currently are.
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      const sessionUser = session?.user || null;
      setUser(sessionUser);
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
        resolveRoleAndRoute(sessionUser);
      }
    });

    return () => {
      mounted = false;
      authListener?.subscription?.unsubscribe();
    };
  }, []);

  // ── Screen state ────────────────────────────────────────────────────
  // 'home' | 'login' | 'register' | 'forgotPassword' | 'profile' | 'about'
  // | 'contact' | 'myReservations' | 'roomRates' | 'reviewPay' | 'frontdesk' | 'admin'
  const [screen, setScreen]                   = useState('home');
  const [showReservation, setShowReservation] = useState(false);
  const [bookingDetails, setBookingDetails]   = useState(null);
  const [selectedRooms, setSelectedRooms]     = useState(null);

  // ── Auth handlers ───────────────────────────────────────────────────
  const handleLogin = (supabaseUser, role) => {
    setUser(supabaseUser);
    const nextScreen = role === 'admin' ? 'admin' : role === 'frontdesk' ? 'frontdesk' : 'home';
    setScreen(nextScreen);
  };

  const handleRegister = async () => {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.warn('Sign out after register failed:', e.message);
    }
    setUser(null);
    setScreen('login');
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      setUser(null);
      setScreen('home');
    } catch (e) {
      console.error('Logout error:', e);
    }
  };

  // ── Booking flow ────────────────────────────────────────────────────
  const openReservation  = () => setShowReservation(true);
  const closeReservation = () => setShowReservation(false);

  const goToRoomRates = (details) => {
    setBookingDetails(details);
    setShowReservation(false);
    setScreen('roomRates');
  };

  const goBackToSearch    = () => { setScreen('home'); setShowReservation(true); };
  const goToReviewPay     = (rooms) => { setSelectedRooms(rooms); setScreen('reviewPay'); };
  const goBackToRoomRates = () => setScreen('roomRates');
  const goHome = () => {
    setBookingDetails(null);
    setSelectedRooms(null);
    setScreen('home');
  };

  const handleConfirmed = () => {
    goHome();
  };

  // My Reservations is guest-account-only (it reads the signed-in user's
  // id to pull their bookings) — bounce unauthenticated taps to login
  // instead of opening the screen with nothing to show.
  const goToMyReservations = () => setScreen(user ? 'myReservations' : 'login');

  // ── Loading gate ────────────────────────────────────────────────────
  if (!fontsLoaded || authLoading || !minLoadTimeElapsed) {
    return (
      <SafeAreaProvider>
        <ThemeProvider userId={user?.id}>
          <SafeAreaView style={styles.safeArea}>
            <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
            <LoadingScreen />
          </SafeAreaView>
        </ThemeProvider>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <ThemeProvider userId={user?.id}>
        <SafeAreaView style={styles.safeArea}>
          <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />

          {/* ── Home ──────────────────────────────────────────────── */}
          {screen === 'home' && (
            <HomeScreen
              onBookNow={openReservation}
              onSignIn={() => setScreen('login')}
              onProfilePress={() => setScreen('profile')}
              onAboutPress={() => setScreen('about')}
              onContactPress={() => setScreen('contact')}
              onFindBooking={goToMyReservations}
              isAuthenticated={!!user}
              user={user}
              onLogout={handleLogout}
              onHomePress={goHome}
            />
          )}

          {/* ── Admin ─────────────────────────────────────────────── */}
          {screen === 'admin' && (
            <AdminShell
              onLoggedOut={handleLogout}
              adminName={user?.user_metadata?.display_name || user?.email || 'Administrator'}
            />
          )}

          {/* ── Front Desk ────────────────────────────────────────── */}
          {screen === 'frontdesk' && (
            <FrontDeskShell
              onLoggedOut={handleLogout}
              staffName={user?.user_metadata?.display_name || user?.email || 'Front Desk Staff'}
              staffRole="Front Desk"
              staffUid={user?.id}
            />
          )}

          {/* ── Auth ──────────────────────────────────────────────── */}
          {screen === 'login' && (
            <LoginScreen
              onLogin={handleLogin}
              onForgotPress={() => setScreen('forgotPassword')}
              onRegisterPress={() => setScreen('register')}
              onBack={() => setScreen('home')}
            />
          )}
          {screen === 'register' && (
            <RegisterScreen
              onRegister={handleRegister}
              onLoginPress={() => setScreen('login')}
            />
          )}
          {screen === 'forgotPassword' && (
            <ForgotPasswordScreen
              onLoginPress={() => setScreen('login')}
            />
          )}

          {/* ── Profile ───────────────────────────────────────────── */}
          {screen === 'profile' && (
            <ProfileScreen
              user={user}
              onBookNow={openReservation}
              onLogout={handleLogout}
              onBackPress={() => setScreen('home')}
            />
          )}

          {/* ── About ─────────────────────────────────────────────── */}
          {screen === 'about' && (
            <AboutScreen
              onBack={() => setScreen('home')}
            />
          )}

          {/* ── Contact Us ────────────────────────────────────────── */}
          {screen === 'contact' && (
            <ContactUsScreen
              onBack={() => setScreen('home')}
            />
          )}

          {/* ── My Reservations ──────────────────────────────────────── */}
          {screen === 'myReservations' && (
            <MyReservationsScreen
              onBack={() => setScreen('home')}
            />
          )}

          {/* ── Booking ───────────────────────────────────────────── */}
          {screen === 'roomRates' && (
            <RoomSelectionScreen
              bookingDetails={bookingDetails}
              onEditSearch={goBackToSearch}
              onReserve={goToReviewPay}
              onHomePress={goHome}
            />
          )}
          {screen === 'reviewPay' && (
            <ReviewPayScreen
              bookingDetails={bookingDetails}
              selectedRooms={selectedRooms}
              user={user}
              onBackToRooms={goBackToRoomRates}
              onConfirm={handleConfirmed}
              onHomePress={goHome}
            />
          )}

          {/* ── Reservation modal ─────────────────────────────────── */}
          {/* user prop added so ReservationScreen can tag the reservation
              row with this user's id */}
          <Modal
            visible={showReservation}
            animationType="slide"
            onRequestClose={closeReservation}
            presentationStyle="fullScreen"
          >
            <ReservationScreen
              user={user}
              onSearch={goToRoomRates}
              onClose={closeReservation}
            />
          </Modal>
        </SafeAreaView>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
});