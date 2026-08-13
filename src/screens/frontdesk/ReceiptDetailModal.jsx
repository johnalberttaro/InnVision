// ReceiptDetailModal.jsx
// View/print modal for a single payment receipt, opened by tapping a
// row on ReceiptsScreen.jsx (the top-level "Receipts" sidebar item).
//
// FIXED: this file previously contained an accidental duplicate of
// RecordPaymentModal (the "Record Payment" form used elsewhere in
// Billing Management) — tapping "View" on a receipt opened a
// payment-entry form instead of an actual receipt. This is the real
// component: it fetches the receipt's linked folio for extra context
// (room numbers, stay dates), renders it as a properly designed,
// on-brand receipt, and adds a working Print action.
//
// DESIGN: built to actually look like InnVision's receipt, not a
// generic dialog — real logo, the app's warm cream/charcoal palette
// (lightColors from utils/theme.js, hardcoded rather than the live
// theme — a printed/paper receipt should stay light regardless of
// whether the app itself is in dark mode), dashed section dividers
// like a real paper receipt, and a rotated "PAID" stamp.
//
// PRINT, CROSS-PLATFORM: no new native dependency was added (the
// project already learned that lesson once with expo-file-system on
// SDK 54 — see Roomsservice.js history). On web, Print renders a
// branded, print-only HTML document — logo, colors, dashed dividers,
// PAID stamp and all — in a new tab and calls window.print(); the
// browser's own print dialog already includes "Save as PDF", so that
// covers downloading too. On native (Expo Go), there's no system-level
// "print" primitive without adding expo-print, so Print instead opens
// the OS share sheet via React Native's built-in Share API with a
// plain-text version of the receipt.

import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Platform,
  Share,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, fonts } from '../../utils/portalTheme';
import { getBillingRecord } from '../../utils/BillingService';

const LOGO_SOURCE = require('../../../assets/logo.png');

// The printed/shared receipt always uses the light brand palette,
// independent of the app's live dark-mode state — a receipt is meant
// to be read on paper (or a PDF standing in for paper), so it should
// always render light, the same way it would if this were a real
// thermal-printer receipt at the front desk.
const PRINT_COLORS = {
  background: '#F5EFE6',
  card: '#FDFAF4',
  cardAlt: '#EFE7D8',
  border: '#E2D6C1',
  primary: '#332B22',
  primaryTint: '#EFE7D8',
  onPrimary: '#FDFAF4',
  text: '#332B22',
  textMuted: '#8A7C64',
};

const PAYMENT_METHOD_LABELS = {
  cash: 'Cash',
  card: 'Card',
  hotel: 'Pay at Hotel',
  pay_at_hotel: 'Pay at Hotel',
  online: 'E-wallet',
  gcash: 'GCash',
  maya: 'Maya',
  maribank: 'Maribank',
  gotyme: 'GoTyme',
};

function paymentMethodLabel(method) {
  if (!method) return '—';
  return PAYMENT_METHOD_LABELS[method.toLowerCase()] || method;
}

function formatCurrency(amount) {
  return `₱${(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(value, withTime = false) {
  if (!value) return '—';
  const date = new Date(value);
  if (isNaN(date.getTime())) return String(value);
  return withTime
    ? date.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
    : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Resolves the bundled logo to a real URI so it can be embedded as an
// <img> tag in the print HTML (a require() alone isn't usable there).
// Falls back to no logo, never throws — a missing logo shouldn't block
// printing the actual receipt.
function resolveLogoUri() {
  try {
    const resolved = Image.resolveAssetSource(LOGO_SOURCE);
    return resolved?.uri || null;
  } catch {
    return null;
  }
}

// Builds a self-contained, print-ready HTML document for the web print
// path — on-brand (logo, palette, dashed dividers, PAID stamp) so the
// printed/PDF result actually looks like it came from InnVision instead
// of a generic browser print-out.
function buildReceiptHtml(receipt, folio, logoUri) {
  const rows = [
    ['Receipt No.', receipt.receiptNumber || '—'],
    ['Date', formatDate(receipt.paymentDate, true)],
    ['Guest Name', receipt.guestName || '—'],
  ];
  if (folio?.folioNumber) rows.push(['Folio No.', folio.folioNumber]);
  if (folio?.roomNumbers?.length) rows.push(['Room(s)', folio.roomNumbers.join(', ')]);
  if (folio?.checkInDate || folio?.checkOutDate) {
    rows.push(['Stay Dates', `${formatDate(folio.checkInDate)} – ${formatDate(folio.checkOutDate)}`]);
  }
  rows.push(['Payment Method', paymentMethodLabel(receipt.paymentMethod)]);
  rows.push(['Processed By', receipt.processedByName || '—']);
  rows.push(['Remaining Balance', formatCurrency(receipt.remainingBalanceAfter)]);

  const rowsHtml = rows
    .map(([label, value]) => `
      <div class="row">
        <span class="label">${escapeHtml(label)}</span>
        <span class="value">${escapeHtml(value)}</span>
      </div>
    `)
    .join('');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Receipt ${escapeHtml(receipt.receiptNumber || '')}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@600;800&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; }
  html, body { background: ${PRINT_COLORS.background}; }
  body {
    font-family: 'Inter', -apple-system, Helvetica, Arial, sans-serif;
    color: ${PRINT_COLORS.text};
    padding: 40px 20px;
    max-width: 460px;
    margin: 0 auto;
  }
  .sheet {
    background: ${PRINT_COLORS.card};
    border: 1px solid ${PRINT_COLORS.border};
    border-radius: 18px;
    padding: 28px 26px 24px;
    position: relative;
    overflow: hidden;
  }
  .header { text-align: center; margin-bottom: 4px; }
  .logo { width: 52px; height: 52px; object-fit: contain; margin-bottom: 8px; }
  .hotel-name {
    font-family: 'Baloo 2', 'Inter', sans-serif;
    font-weight: 800;
    font-size: 20px;
    color: ${PRINT_COLORS.primary};
    letter-spacing: 0.2px;
  }
  .hotel-sub { font-size: 11.5px; color: ${PRINT_COLORS.textMuted}; margin-top: 2px; }

  .stamp {
    display: inline-block;
    border: 2px solid #1E7B34;
    color: #1E7B34;
    font-family: 'Baloo 2', 'Inter', sans-serif;
    font-weight: 800;
    font-size: 13px;
    letter-spacing: 2px;
    padding: 5px 18px;
    border-radius: 8px;
    transform: rotate(-6deg);
    margin: 14px 0 4px;
  }

  .dashed {
    border-top: 1.5px dashed ${PRINT_COLORS.border};
    margin: 18px 0 6px;
  }

  .row {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    padding: 7px 0;
    font-size: 13px;
  }
  .row .label { color: ${PRINT_COLORS.textMuted}; }
  .row .value { text-align: right; font-weight: 600; color: ${PRINT_COLORS.text}; }

  .total-box {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: ${PRINT_COLORS.primaryTint};
    border-radius: 12px;
    padding: 14px 16px;
    margin-top: 14px;
  }
  .total-label {
    font-family: 'Baloo 2', 'Inter', sans-serif;
    font-weight: 600;
    font-size: 14px;
    color: ${PRINT_COLORS.primary};
  }
  .total-value {
    font-family: 'Baloo 2', 'Inter', sans-serif;
    font-weight: 800;
    font-size: 22px;
    color: ${PRINT_COLORS.primary};
  }

  .footer {
    text-align: center;
    margin-top: 22px;
    font-size: 11px;
    color: ${PRINT_COLORS.textMuted};
    line-height: 1.6;
  }
  .footer strong { color: ${PRINT_COLORS.text}; }

  @media print {
    html, body { background: #fff; }
    body { padding: 0; max-width: none; }
    .sheet { border: none; border-radius: 0; box-shadow: none; }
  }
</style>
</head>
<body>
  <div class="sheet">
    <div class="header">
      ${logoUri ? `<img class="logo" src="${logoUri}" alt="InnVision" />` : ''}
      <div class="hotel-name">InnVision Training Hotel</div>
      <div class="hotel-sub">Consolatrix College of Toledo City, Inc.</div>
      <div class="stamp">✓ PAID</div>
    </div>

    <div class="dashed"></div>
    ${rowsHtml}
    <div class="dashed"></div>

    <div class="total-box">
      <span class="total-label">Amount Paid</span>
      <span class="total-value">${formatCurrency(receipt.amountPaid)}</span>
    </div>

    <div class="footer">
      <strong>Thank you for staying with InnVision.</strong><br />
      Receipt generated ${escapeHtml(formatDate(new Date().toISOString(), true))}
    </div>
  </div>
</body>
</html>`;
}

// Plain-text version for the native share-sheet fallback (no logo/CSS
// there, but keeps the same receipt-like shape and section ordering).
function buildReceiptText(receipt, folio) {
  const divider = '– – – – – – – – – – – – – – – –';
  const lines = [
    'InnVision Training Hotel',
    'Consolatrix College of Toledo City, Inc.',
    '✓ PAID',
    divider,
    `Receipt No.: ${receipt.receiptNumber || '—'}`,
    `Date: ${formatDate(receipt.paymentDate, true)}`,
    `Guest Name: ${receipt.guestName || '—'}`,
  ];
  if (folio?.folioNumber) lines.push(`Folio No.: ${folio.folioNumber}`);
  if (folio?.roomNumbers?.length) lines.push(`Room(s): ${folio.roomNumbers.join(', ')}`);
  if (folio?.checkInDate || folio?.checkOutDate) {
    lines.push(`Stay Dates: ${formatDate(folio.checkInDate)} – ${formatDate(folio.checkOutDate)}`);
  }
  lines.push(`Payment Method: ${paymentMethodLabel(receipt.paymentMethod)}`);
  lines.push(`Processed By: ${receipt.processedByName || '—'}`);
  lines.push(`Remaining Balance: ${formatCurrency(receipt.remainingBalanceAfter)}`);
  lines.push(divider);
  lines.push(`Amount Paid: ${formatCurrency(receipt.amountPaid)}`);
  lines.push(divider);
  lines.push('Thank you for staying with InnVision.');
  return lines.join('\n');
}

/**
 * Props:
 *  - visible: boolean
 *  - receipt: object | null   a receipt from BillingService (getAllReceipts/
 *                             searchReceipts) — id, folioId, receiptNumber,
 *                             guestName, paymentDate, paymentMethod,
 *                             amountPaid, remainingBalanceAfter, processedByName
 *  - onClose: () => void
 */
export default function ReceiptDetailModal({ visible, receipt, onClose }) {
  const styles = getStyles(colors, spacing, radius, fonts);

  const [folio, setFolio] = useState(null);
  const [folioLoading, setFolioLoading] = useState(false);
  const [printError, setPrintError] = useState(null);

  // Room numbers / stay dates aren't stored on the receipt itself, only
  // a folioId — fetch the linked folio for that extra context. Purely
  // additive: if this fails, the receipt still shows everything it has.
  useEffect(() => {
    setFolio(null);
    setPrintError(null);
    if (!visible || !receipt?.folioId) return;

    let cancelled = false;
    setFolioLoading(true);
    getBillingRecord(receipt.folioId)
      .then((data) => { if (!cancelled) setFolio(data); })
      .catch((err) => console.error('Failed to load folio for receipt:', err))
      .finally(() => { if (!cancelled) setFolioLoading(false); });

    return () => { cancelled = true; };
  }, [visible, receipt?.folioId]);

  if (!receipt) return null;

  const handlePrint = async () => {
    setPrintError(null);
    if (Platform.OS === 'web') {
      const html = buildReceiptHtml(receipt, folio, resolveLogoUri());
      const printWindow = window.open('', '_blank', 'width=520,height=720');
      if (!printWindow) {
        setPrintError('Please allow pop-ups for this site to print the receipt.');
        return;
      }
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.focus();
      // Give the new tab a beat to finish rendering (incl. the webfont)
      // before invoking print.
      setTimeout(() => printWindow.print(), 350);
    } else {
      try {
        await Share.share({
          title: `Receipt ${receipt.receiptNumber || ''}`,
          message: buildReceiptText(receipt, folio),
        });
      } catch (err) {
        console.error('Failed to share/print receipt:', err);
        setPrintError('Could not open the share sheet. Please try again.');
      }
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <TouchableOpacity onPress={onClose} style={styles.closeIconBtn} accessibilityLabel="Close">
            <Ionicons name="close" size={20} color={colors.textMuted} />
          </TouchableOpacity>

          <View style={styles.brandHeader}>
            <Image source={LOGO_SOURCE} style={styles.logoImage} resizeMode="contain" />
            <Text style={styles.hotelName}>InnVision Training Hotel</Text>
            <Text style={styles.hotelSub}>Consolatrix College of Toledo City, Inc.</Text>
            <View style={styles.paidStamp}>
              <Ionicons name="checkmark" size={13} color="#1E7B34" />
              <Text style={styles.paidStampText}>PAID</Text>
            </View>
          </View>

          <View style={styles.receiptMetaRow}>
            <Text style={styles.receiptNumber}>{receipt.receiptNumber || '—'}</Text>
            <Text style={styles.receiptDate}>{formatDate(receipt.paymentDate, true)}</Text>
          </View>

          <View style={styles.dashedDivider} />

          <ScrollView style={styles.detailsScroll} showsVerticalScrollIndicator={false}>
            <DetailRow label="Guest Name" value={receipt.guestName || '—'} styles={styles} />
            {!!folio?.folioNumber && <DetailRow label="Folio No." value={folio.folioNumber} styles={styles} />}
            {!!folio?.roomNumbers?.length && (
              <DetailRow label="Room(s)" value={folio.roomNumbers.join(', ')} styles={styles} />
            )}
            {(!!folio?.checkInDate || !!folio?.checkOutDate) && (
              <DetailRow
                label="Stay Dates"
                value={`${formatDate(folio?.checkInDate)} – ${formatDate(folio?.checkOutDate)}`}
                styles={styles}
              />
            )}
            {folioLoading && !folio && (
              <View style={styles.folioLoadingRow}>
                <ActivityIndicator size="small" color={colors.textMuted} />
                <Text style={styles.folioLoadingText}>Loading stay details…</Text>
              </View>
            )}
            <DetailRow label="Payment Method" value={paymentMethodLabel(receipt.paymentMethod)} styles={styles} />
            <DetailRow label="Processed By" value={receipt.processedByName || '—'} styles={styles} />
            <DetailRow label="Remaining Balance" value={formatCurrency(receipt.remainingBalanceAfter)} styles={styles} last />
          </ScrollView>

          <View style={styles.dashedDivider} />

          <View style={styles.totalBox}>
            <Text style={styles.totalLabel}>Amount Paid</Text>
            <Text style={styles.totalValue}>{formatCurrency(receipt.amountPaid)}</Text>
          </View>

          <Text style={styles.thankYouText}>Thank you for staying with InnVision.</Text>

          {!!printError && <Text style={styles.errorText}>{printError}</Text>}

          <View style={styles.actionsRow}>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.printButton} onPress={handlePrint} activeOpacity={0.85}>
              <Ionicons name="print-outline" size={16} color={colors.onPrimary} />
              <Text style={styles.printButtonText}>Print</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function DetailRow({ label, value, styles, last }) {
  return (
    <View style={[styles.detailRow, last && styles.detailRowLast]}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue} numberOfLines={2}>{value}</Text>
    </View>
  );
}

function getStyles(colors, spacing, radius, fonts) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.lg,
    },
    card: {
      width: '100%',
      maxWidth: 420,
      maxHeight: '88%',
      backgroundColor: colors.card,
      borderRadius: radius.lg + 4,
      padding: spacing.lg,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.2,
      shadowRadius: 24,
      elevation: 10,
    },
    closeIconBtn: {
      position: 'absolute', top: spacing.sm, right: spacing.sm, zIndex: 1,
      width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center',
      backgroundColor: colors.cardAlt,
    },

    brandHeader: { alignItems: 'center', paddingTop: spacing.xs },
    logoImage: { width: 48, height: 48, marginBottom: spacing.xs },
    hotelName: { fontFamily: fonts.headingExtraBold, fontSize: 18, color: colors.primary, textAlign: 'center' },
    hotelSub: { fontFamily: fonts.body, fontSize: 11, color: colors.textMuted, marginTop: 2, textAlign: 'center' },

    paidStamp: {
      flexDirection: 'row', alignItems: 'center', gap: 3,
      borderWidth: 1.5, borderColor: '#1E7B34', borderRadius: 8,
      paddingVertical: 4, paddingHorizontal: spacing.md,
      marginTop: spacing.sm, transform: [{ rotate: '-6deg' }],
    },
    paidStampText: { fontFamily: fonts.headingBold, fontSize: 12, color: '#1E7B34', letterSpacing: 1.5 },

    receiptMetaRow: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      marginTop: spacing.md,
    },
    receiptNumber: { fontFamily: fonts.headingSemiBold, fontSize: 13, color: colors.primary },
    receiptDate: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted },

    dashedDivider: {
      borderTopWidth: 1.5,
      borderStyle: 'dashed',
      borderColor: colors.border,
      marginVertical: spacing.sm,
    },

    detailsScroll: { maxHeight: 260 },
    detailRow: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      paddingVertical: spacing.xs + 2,
    },
    detailRowLast: {},
    detailLabel: { fontFamily: fonts.body, fontSize: 12.5, color: colors.textMuted },
    detailValue: { fontFamily: fonts.bodySemiBold, fontSize: 12.5, color: colors.text, flexShrink: 1, textAlign: 'right', marginLeft: spacing.md },

    folioLoadingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.sm },
    folioLoadingText: { fontFamily: fonts.body, fontSize: 11, color: colors.textMuted, fontStyle: 'italic' },

    totalBox: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      backgroundColor: colors.primaryTint, borderRadius: radius.md,
      paddingVertical: spacing.sm + 4, paddingHorizontal: spacing.md,
      marginTop: spacing.xs,
    },
    totalLabel: { fontFamily: fonts.headingSemiBold, fontSize: 14, color: colors.primary },
    totalValue: { fontFamily: fonts.headingExtraBold, fontSize: 22, color: colors.primary },

    thankYouText: {
      fontFamily: fonts.body, fontSize: 11.5, color: colors.textMuted, fontStyle: 'italic',
      textAlign: 'center', marginTop: spacing.sm,
    },

    errorText: { fontFamily: fonts.body, fontSize: 11, color: '#B3261E', marginTop: spacing.sm, textAlign: 'center' },

    actionsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
    closeButton: {
      flex: 1, paddingVertical: spacing.sm + 4, borderRadius: radius.md,
      borderWidth: 1, borderColor: colors.border, alignItems: 'center',
    },
    closeButtonText: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.textMuted },
    printButton: {
      flex: 1.4, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
      paddingVertical: spacing.sm + 4, borderRadius: radius.md, backgroundColor: colors.primary,
    },
    printButtonText: { fontFamily: fonts.headingSemiBold, fontSize: 13, color: colors.onPrimary },
  });
}