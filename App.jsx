import React, { useState, useEffect } from 'react';
import { SafeAreaView, StyleSheet, StatusBar, Modal, ActivityIndicator, View } from 'react-native';
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
import ReservationScreen    from './src/screens/reservation/ReservationScreen';
import RoomSelectionScreen  from './src/screens/roomRates/RoomSelectionScreen';
import ReviewPayScreen      from './src/screens/reviewPay/ReviewPayScreen';
import AdminShell           from './src/screens/admin/Adminshell';
import { fonts, colors }    from './src/utils/theme';

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
        // an admin back into the admin panel instead of falling back to
        // the default 'home' screen.
        let role = 'guest';
        try {
          const guestDoc = await getDoc(doc(db, 'guests', firebaseUser.uid));
          if (guestDoc.exists() && guestDoc.data().role === 'admin') {
            role = 'admin';
          }
        } catch (roleLookupError) {
          console.warn('Role lookup failed on session restore, defaulting to guest:', roleLookupError);
        }
        setScreen(role === 'admin' ? 'admin' : 'home');
      } else {
        setScreen('home');
      }

      setAuthLoading(false);
    });
    return unsubscribe;
  }, []);

  // ── Screen state ────────────────────────────────────────────────────
  // 'home' | 'login' | 'register' | 'forgotPassword' | 'profile' | 'about'
  // | 'roomRates' | 'reviewPay' | 'admin'
  const [screen, setScreen]                   = useState('home');
  const [showReservation, setShowReservation] = useState(false);
  const [bookingDetails, setBookingDetails]   = useState(null);
  const [selectedRate, setSelectedRate]       = useState(null);

  // ── Auth handlers ───────────────────────────────────────────────────
  const handleLogin = (firebaseUser, role) => {
    setUser(firebaseUser);
    setScreen(role === 'admin' ? 'admin' : 'home');
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
  const goToReviewPay     = (rate) => { setSelectedRate(rate); setScreen('reviewPay'); };
  const goBackToRoomRates = () => setScreen('roomRates');

  const handleConfirmed = () => {
    setBookingDetails(null);
    setSelectedRate(null);
    setScreen('home');
  };

  // ── Loading gate ────────────────────────────────────────────────────
  if (!fontsLoaded || authLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />

      {/* ── Home ──────────────────────────────────────────────── */}
      {screen === 'home' && (
        <HomeScreen
          onBookNow={openReservation}
          onSignIn={() => setScreen('login')}
          onProfilePress={() => setScreen('profile')}
          onAboutPress={() => setScreen('about')}
          isAuthenticated={!!user}
          user={user}
          onLogout={handleLogout}
        />
      )}

      {/* ── Admin ─────────────────────────────────────────────── */}
      {screen === 'admin' && (
        <AdminShell
          onLoggedOut={handleLogout}
          adminName={user?.displayName || user?.email || 'Admin User'}
          adminRole="Hotel Administrator"
        />
      )}

      {/* ── Auth ──────────────────────────────────────────────── */}
      {screen === 'login' && (
        <LoginScreen
          onLogin={handleLogin}
          onForgotPress={() => setScreen('forgotPassword')}
          onRegisterPress={() => setScreen('register')}
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
          onEditProfile={() => console.log('TODO: edit profile')}
          onBackPress={() => setScreen('home')}
        />
      )}

      {/* ── About ─────────────────────────────────────────────── */}
      {screen === 'about' && (
        <AboutScreen
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
          selectedRate={selectedRate}
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