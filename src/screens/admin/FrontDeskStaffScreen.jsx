import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  where,
  getDocs,
} from 'firebase/firestore';
import { db } from '../../services/firebase';
import { colors, spacing, radius, fonts } from '../../utils/theme';
import { resolveUserRole } from '../../utils/roleHelpers';
import { formatCurrency } from '../../utils/Roomsservice';

/**
 * FrontDeskStaffScreen — Admin-only read-only roster of front desk staff.
 *
 * This is the "list / summarize front desk roles" view inside the Admin
 * Portal. It is intentionally READ-ONLY: account creation / removal /
 * role changes live in FrontDeskAccountScreen (the "Front Desk Accounts"
 * menu item), so the admin keeps strictly more access here. This screen
 * just shows who is on the front desk team, their contact info, what they
 * can do, and a per-staff activity summary (payments recorded, total
 * collected) derived from billing records tagged with processedByUid.
 */
export default function FrontDeskStaffScreen() {
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const staffQuery = query(collection(db, 'guests'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(
      staffQuery,
      (snapshot) => {
        const roster = snapshot.docs
          .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
          .filter((guest) => resolveUserRole(guest) === 'frontdesk' && guest.role !== 'inactive');
        setStaff(roster);
        setLoading(false);
        loadStaffActivity(roster);
      },
      (error) => {
        console.error('Failed to load front desk roster:', error);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, []);

  // Activity is derived from billing records where processedByUid matches a
  // staff member — i.e. payments they recorded at the front desk. We avoid
  // subscribing (one-time fetch is enough for a summary), and guard against
  // open rules / read errors so the roster still renders if this fails.
  const [activity, setActivity] = useState({});
  const loadStaffActivity = async (roster) => {
    if (roster.length === 0) {
      setActivity({});
      return;
    }
    try {
      const snap = await getDocs(query(collection(db, 'billingRecords'), where('processedByUid', '!=', null)));
      const totals = {};
      snap.forEach((docSnap) => {
        const rec = docSnap.data();
        const uid = rec.processedByUid;
        if (!uid) return;
        if (!totals[uid]) totals[uid] = { payments: 0, collected: 0 };
        totals[uid].payments += 1;
        totals[uid].collected += Number(rec.amountPaid) || 0;
      });
      setActivity(totals);
    } catch (err) {
      console.error('Failed to load front desk activity:', err);
      setActivity({});
    }
  };

  const activeCount = staff.length;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.pageTitle}>Front Desk Roster</Text>
          <Text style={styles.pageSubtitle}>
            Read-only overview of front desk staff accounts. Manage accounts from “Front Desk Accounts”.
          </Text>
        </View>
        <View style={styles.countBadge}>
          <Text style={styles.countNumber}>{loading ? '—' : activeCount}</Text>
          <Text style={styles.countLabel}>Active</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : staff.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyIcon}>👥</Text>
          <Text style={styles.emptyTitle}>No front desk staff yet</Text>
          <Text style={styles.emptyText}>
            Front desk accounts created in “Front Desk Accounts” will appear here.
          </Text>
        </View>
      ) : (
        staff.map((member) => (
          <View key={member.id} style={styles.staffCard}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {(member.displayName || `${member.firstName || ''} ${member.lastName || ''}`.trim() || '?')
                  .charAt(0)
                  .toUpperCase()}
              </Text>
            </View>

            <View style={styles.staffTextWrap}>
              <Text style={styles.staffName}>
                {member.displayName || `${member.firstName || ''} ${member.lastName || ''}`.trim() || 'Front Desk Staff'}
              </Text>
              <Text style={styles.staffMeta}>{member.email || 'No email provided'}</Text>
              {member.phone ? <Text style={styles.staffMeta}>{member.phone}</Text> : null}
              <Text style={styles.staffMeta}>Added {formatDateLabel(member.createdAt)}</Text>

              <View style={styles.permWrap}>
                {FRONTDESK_PERMISSIONS.map((perm) => (
                  <View key={perm} style={styles.permChip}>
                    <Text style={styles.permChipText}>{perm}</Text>
                  </View>
                ))}
              </View>

              {(() => {
                const stat = activity[member.id];
                if (!stat) return null;
                return (
                  <View style={styles.activityWrap}>
                    <View style={styles.activityItem}>
                      <Text style={styles.activityNumber}>{stat.payments}</Text>
                      <Text style={styles.activityLabel}>Payments</Text>
                    </View>
                    <View style={styles.activityItem}>
                      <Text style={styles.activityNumber}>{formatCurrency(stat.collected)}</Text>
                      <Text style={styles.activityLabel}>Collected</Text>
                    </View>
                  </View>
                );
              })()}
            </View>

            <View style={styles.roleBadge}>
              <Text style={styles.roleBadgeText}>FRONT DESK</Text>
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );
}

// Summary of what a front desk role can do in this app. Display-only —
// the authoritative access control still lives in Firestore rules + the
// role field, not in this list.
const FRONTDESK_PERMISSIONS = [
  'Manage Reservations',
  'Room Status',
  'Guest Records',
  'Billing & Payments',
];

function formatDateLabel(value) {
  try {
    if (!value) return '—';
    if (typeof value?.toDate === 'function') {
      return value.toDate().toLocaleDateString();
    }
    return new Date(value).toLocaleDateString();
  } catch {
    return '—';
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xl,
  },
  pageTitle: { fontSize: 22, fontFamily: fonts.headingExtraBold, color: colors.primary, marginBottom: spacing.xs },
  pageSubtitle: { fontSize: 13, fontFamily: fonts.body, color: colors.textMuted, marginTop: 2, maxWidth: 420 },
  countBadge: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  countNumber: { fontSize: 20, fontFamily: fonts.headingExtraBold, color: colors.primary },
  countLabel: { fontSize: 10, fontFamily: fonts.bodySemiBold, color: colors.textMuted, letterSpacing: 0.5 },

  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xxl },
  emptyCard: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xxl,
    alignItems: 'center',
  },
  emptyIcon: { fontSize: 36, marginBottom: spacing.md },
  emptyTitle: { fontSize: 16, fontFamily: fonts.headingBold, color: colors.text, marginBottom: spacing.xs },
  emptyText: { fontSize: 12, fontFamily: fonts.body, color: colors.textMuted, textAlign: 'center', maxWidth: 320 },

  staffCard: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  avatarText: { color: colors.white, fontFamily: fonts.headingBold, fontSize: 16 },
  staffTextWrap: { flex: 1, marginRight: spacing.md },
  staffName: { fontSize: 14, fontFamily: fonts.bodySemiBold, color: colors.text, marginBottom: spacing.xs },
  staffMeta: { fontSize: 11, fontFamily: fonts.body, color: colors.textMuted, marginTop: 2 },
  permWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
  permChip: {
    backgroundColor: colors.accentTint,
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  permChipText: { fontSize: 10, fontFamily: fonts.bodySemiBold, color: colors.accent },
  roleBadge: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  roleBadgeText: { fontSize: 9, fontFamily: fonts.bodySemiBold, color: colors.primary, letterSpacing: 0.5 },
  activityWrap: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  activityItem: { flex: 1 },
  activityNumber: { fontSize: 15, fontFamily: fonts.headingExtraBold, color: colors.primary },
  activityLabel: { fontSize: 10, fontFamily: fonts.bodySemiBold, color: colors.textMuted, letterSpacing: 0.3, marginTop: 2 },
});