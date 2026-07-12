import React, { useState, useEffect } from 'react';
import { StyleSheet, StatusBar, Modal, ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { Baloo2_800ExtraBold } from '@expo-google-fonts/baloo-2/800ExtraBold';
import { Baloo2_700Bold } from '@expo-google-fonts/baloo-2/700Bold';
import { Baloo2_600SemiBold } from '@expo-google-fonts/baloo-2/600SemiBold';
import { Baloo2_500Medium } from '@expo-google-fonts/baloo-2/500Medium';
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './src/services/firebase';

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
import { fonts, colors }    from './src/utils/theme';
import { ThemeProvider }    from './src/context/ThemeContext';

/**
 * NOTE ON DARK MODE ROLLOUT:
 * ThemeProvider now wraps the whole app, and its `userId` prop is kept in
 * sync with the current Firebase user below — this is what lets the dark
 * mode preference load from Firestore/cache and apply globally.
 *
 * However, only screens that individually call useTheme() (instead of the
 * old static `import { colors } from utils/theme`) will actually respond
 * to it. ProfileScreen is migrated. Every other screen listed above still
 * uses the old static import and will keep rendering in light mode until
 * it's migrated the same way — that's expected, not a bug, and each
 * screen can be migrated independently without breaking the others.
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
 * The Firestore `role` field on a user's `guests/{uid}` doc is still the
 * string 'admin' — that hasn't been renamed. Right now it means "this
 * user is Front Desk staff (or higher)." Only the local `screen` state
 * value has been renamed from 'admin' to 'frontdesk' below, to route into
 * FrontDeskShell instead of the old AdminShell. When a real Admin module
 * is built, this role check will need to distinguish an actual admin
 * from front desk staff (e.g. role: 'frontdesk' vs role: 'admin') — until
 * then, anyone with role === 'admin' in Firestore lands in the Front Desk
 * portal, not a real admin panel.
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

  // ── Firebase auth state ─────────────────────────────────────────────
  const [user, setUser]               = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);

      if (firebaseUser) {
        // Re-run the same role lookup LoginScreen does on every auth-state
        // resolution (not just fresh logins), so a page refresh — which
        // silently restores the existing Firebase session — still routes
        // staff back into the Front Desk portal instead of falling back
        // to the default 'home' screen.
        let role = 'guest';
        try {
          const guestDoc = await getDoc(doc(db, 'guests', firebaseUser.uid));
          if (guestDoc.exists() && guestDoc.data().role === 'admin') {
            role = 'admin';
          }
        } catch (roleLookupError) {
          console.warn('Role lookup failed on session restore, defaulting to guest:', roleLookupError);
        }
        setScreen(role === 'admin' ? 'frontdesk' : 'home');
      } else {
        setScreen('home');
      }

      setAuthLoading(false);
    });
    return unsubscribe;
  }, []);

  // ── Screen state ────────────────────────────────────────────────────
  // 'home' | 'login' | 'register' | 'forgotPassword' | 'profile' | 'about'
  // | 'contact' | 'myReservations' | 'roomRates' | 'reviewPay' | 'frontdesk'
  const [screen, setScreen]                   = useState('home');
  const [showReservation, setShowReservation] = useState(false);
  const [bookingDetails, setBookingDetails]   = useState(null);
  const [selectedRooms, setSelectedRooms]     = useState(null);

  // ── Auth handlers ───────────────────────────────────────────────────
  const handleLogin = (firebaseUser, role) => {
    setUser(firebaseUser);
    setScreen(role === 'admin' ? 'frontdesk' : 'home');
  };

  const handleRegister = async () => {
    try {
      await signOut(auth);
    } catch (e) {
      console.warn('Sign out after register failed:', e.message);
    }
    setUser(null);
    setScreen('login');
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
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

  const handleConfirmed = () => {
    setBookingDetails(null);
    setSelectedRooms(null);
    setScreen('home');
  };

  // My Reservations is guest-account-only (it reads the signed-in user's
  // email to pull their bookings) — bounce unauthenticated taps to login
  // instead of opening the screen with nothing to show.
  const goToMyReservations = () => setScreen(user ? 'myReservations' : 'login');

  // ── Loading gate ────────────────────────────────────────────────────
  if (!fontsLoaded || authLoading) {
    return (
      <SafeAreaProvider>
        <ThemeProvider userId={user?.uid}>
          <SafeAreaView style={styles.safeArea}>
            <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          </SafeAreaView>
        </ThemeProvider>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <ThemeProvider userId={user?.uid}>
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
            />
          )}

          {/* ── Front Desk ────────────────────────────────────────── */}
          {screen === 'frontdesk' && (
            <FrontDeskShell
              onLoggedOut={handleLogout}
              staffName={user?.displayName || user?.email || 'Front Desk Staff'}
              staffRole="Front Desk"
              staffUid={user?.uid}
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
            />
          )}
          {screen === 'reviewPay' && (
            <ReviewPayScreen
              bookingDetails={bookingDetails}
              selectedRooms={selectedRooms}
              user={user}
              onBackToRooms={goBackToRoomRates}
              onConfirm={handleConfirmed}
            />
          )}

          {/* ── Reservation modal ─────────────────────────────────── */}
          {/* user prop added so ReservationScreen can tag the Firestore doc */}
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
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});