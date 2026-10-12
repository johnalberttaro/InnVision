import React from 'react';
import { View, Text, Switch, ScrollView, StyleSheet } from 'react-native';
import { colors, spacing, radius, fonts } from '../../utils/portalTheme';
import { usePref } from '../../utils/staffPreferences';

/**
 * StaffSettingsScreen — the "Settings" page reached from the button just
 * above the profile footer in the Admin, Front Desk and Kitchen/F&B
 * sidebars. One shared screen for all three portals.
 *
 * Account details and password changes are NOT here — those live on My
 * Profile (tap your name at the bottom of the sidebar). This page only
 * holds display/behavior preferences, saved on this device and browser
 * (see utils/staffPreferences.js):
 *  - Show date & weather in the top bar (all roles)
 *  - Ask before logging out (all roles)
 *  - Sound alert for new kitchen orders (F&B only — the chime only exists
 *    on the Kitchen Orders screen, so it isn't offered elsewhere)
 *
 * Props:
 *  - role: 'admin' | 'frontdesk' | 'fnb'
 */
export default function StaffSettingsScreen({ role = 'admin' }) {
  const [showDateWeather, setShowDateWeather] = usePref('showDateWeather', true);
  const [confirmLogout, setConfirmLogout] = usePref('confirmLogout', true);
  const [soundAlerts, setSoundAlerts] = usePref('soundAlerts', true);

  const rows = [
    {
      key: 'showDateWeather',
      label: 'Show date and weather in the top bar',
      description: 'Hides the clock and weather next to the notification bell. Wide screens only.',
      value: showDateWeather,
      onChange: setShowDateWeather,
    },
    {
      key: 'confirmLogout',
      label: 'Ask before logging out',
      description: 'Shows a "Log Out?" confirmation when you tap the power icon by your name.',
      value: confirmLogout,
      onChange: setConfirmLogout,
    },
  ];

  if (role === 'fnb') {
    rows.push({
      key: 'soundAlerts',
      label: 'Sound alert for new kitchen orders',
      description: 'Plays a short chime when Front Desk sends an order to the kitchen. Web only.',
      value: soundAlerts,
      onChange: setSoundAlerts,
    });
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.column}>
        <Text style={styles.title}>Settings</Text>
        <Text style={styles.subtitle}>
          Preferences for this device. To change your password, photo or phone number, tap your name at the bottom of the sidebar.
        </Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Preferences</Text>
          {rows.map((row, i) => (
            <View key={row.key} style={[styles.row, i > 0 && styles.rowBorder]}>
              <View style={styles.rowText}>
                <Text style={styles.rowLabel}>{row.label}</Text>
                <Text style={styles.rowDescription}>{row.description}</Text>
              </View>
              <Switch
                value={row.value}
                onValueChange={row.onChange}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor={colors.white}
                accessibilityLabel={row.label}
              />
            </View>
          ))}
        </View>

        <Text style={styles.footnote}>Saved on this browser or device only.</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, flexGrow: 1 },
  column: { width: '100%', maxWidth: 720 },

  title: { fontFamily: fonts.headingBold, fontSize: 24, color: colors.primary },
  subtitle: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted, marginTop: 2, marginBottom: spacing.lg },

  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  cardTitle: { fontFamily: fonts.headingSemiBold, fontSize: 15, color: colors.text, marginBottom: spacing.xs },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  rowText: { flex: 1, minWidth: 0 },
  rowLabel: { fontFamily: fonts.bodySemiBold, fontSize: 13.5, color: colors.text },
  rowDescription: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, marginTop: 2 },

  footnote: { fontFamily: fonts.body, fontSize: 11.5, color: colors.textMuted, marginTop: spacing.md },
});