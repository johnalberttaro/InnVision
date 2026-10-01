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
// generic dialog — real logo, a clean white/neutral palette (the same
// neutral tokens portalTheme.js uses for staff screens, hardcoded here
// rather than imported — a printed/paper receipt should stay light
// regardless of whether the app itself is in dark mode), dashed
// section dividers like a real paper receipt, and a rotated "PAID"
// stamp. Headings and body are both set in Inter — one typeface
// throughout, no second display font — matching the rest of the staff
// portal's own typography.
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
//
// ROOM CHARGES: mirrors the "Room Charges" card added to
// BillingRecordDetailScreen.jsx — the same room/F&B charge
// transactions (getRoomChargesForReservation) are itemized here too,
// in the in-app modal, the printed/PDF HTML, and the native share
// text, so a receipt doesn't just show a total with nothing indicating
// what part of it was food or service charged to the room. This is
// folio-level context, not per-payment attribution: a payment is an
// amount against the folio's running balance with no link to specific
// charges, so the list below is "what's been charged to this room,"
// shown alongside (not broken out from) what this particular receipt
// paid. It IS filtered on one thing: only charges posted at or before
// THIS receipt's paymentDate are shown, so reopening an old,
// already-issued receipt never grows a new line for something charged
// to the room afterward — a receipt has to stay a fixed record of a
// moment, not a live view of the folio (that live view is the "Room
// Charges" card on BillingRecordDetailScreen.jsx).

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
import { getBillingRecord, getRoomChargesForReservation } from '../../utils/BillingService';

const LOGO_SOURCE = require('../../../assets/logo.png');

// The printed/shared receipt always uses the light brand palette,
// independent of the app's live dark-mode state — a receipt is meant
// to be read on paper (or a PDF standing in for paper), so it should
// always render light, the same way it would if this were a real
// thermal-printer receipt at the front desk.
const PRINT_COLORS = {
  background: '#FFFFFF',
  card: '#FFFFFF',
  cardAlt: '#F0F0F2',
  border: '#E1E1E4',
  primary: '#1A1A1E',
  primaryTint: '#F0F0F2',
  onPrimary: '#FFFFFF',
  text: '#1A1A1E',
  textMuted: '#6B6B70',
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
function buildReceiptHtml(receipt, folio, logoUri, roomCharges) {
  const renderRow = (label, value) => `
      <div class="row">
        <span class="label">${escapeHtml(label)}</span>
        <span class="value">${escapeHtml(value)}</span>
      </div>
    `;

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
  const rowsHtml = rows.map(([label, value]) => renderRow(label, value)).join('');

  // Itemized room/F&B charges — see the header comment. Its own small
  // labeled group, kept with the folio/stay rows above rather than the
  // payment rows below (Payment Method/Processed By/Remaining Balance
  // describe *this* payment; Room Charges describes the folio) — and
  // only built when there are any, so a stay with none prints no empty
  // section.
  const roomChargesHtml = roomCharges?.length
    ? `<div class="section-label">Room Charges</div>${roomCharges
        .map((c) => renderRow(c.note || 'Room charge', formatCurrency(c.amount)))
        .join('')}`
    : '';

  const paymentRowsHtml = [
    ['Payment Method', paymentMethodLabel(receipt.paymentMethod)],
    ['Processed By', receipt.processedByName || '—'],
    ['Remaining Balance', formatCurrency(receipt.remainingBalanceAfter)],
  ]
    .map(([label, value]) => renderRow(label, value))
    .join('');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Receipt ${escapeHtml(receipt.receiptNumber || '')}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap" rel="stylesheet">
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
    font-family: 'Inter', -apple-system, Helvetica, Arial, sans-serif;
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
    font-family: 'Inter', -apple-system, Helvetica, Arial, sans-serif;
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

  .section-label {
    font-family: 'Inter', -apple-system, Helvetica, Arial, sans-serif;
    font-weight: 600;
    font-size: 10.5px;
    letter-spacing: 0.6px;
    text-transform: uppercase;
    color: ${PRINT_COLORS.textMuted};
    margin: 6px 0 0;
  }

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
    font-family: 'Inter', -apple-system, Helvetica, Arial, sans-serif;
    font-weight: 600;
    font-size: 14px;
    color: ${PRINT_COLORS.primary};
  }
  .total-value {
    font-family: 'Inter', -apple-system, Helvetica, Arial, sans-serif;
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
    ${roomChargesHtml}
    ${paymentRowsHtml}
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
function buildReceiptText(receipt, folio, roomCharges) {
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
  // Itemized room/F&B charges — see the header comment. Grouped with
  // the folio/stay lines above, same ordering as the print HTML and
  // the in-app modal.
  if (roomCharges?.length) {
    lines.push('Room Charges:');
    roomCharges.forEach((c) => {
      lines.push(`  ${c.note || 'Room charge'}: ${formatCurrency(c.amount)}`);
    });
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
  const [roomCharges, setRoomCharges] = useState([]);
  const [folioLoading, setFolioLoading] = useState(false);
  const [printError, setPrintError] = useState(null);

  // Room numbers / stay dates aren't stored on the receipt itself, only
  // a folioId — fetch the linked folio for that extra context. Purely
  // additive: if this fails, the receipt still shows everything it has.
  useEffect(() => {
    setFolio(null);
    setRoomCharges([]);
    setPrintError(null);
    if (!visible || !receipt?.folioId) return;

    let cancelled = false;
    setFolioLoading(true);
    getBillingRecord(receipt.folioId)
      .then((data) => {
        if (cancelled) return;
        setFolio(data);
        // Sequenced after the folio fetch resolves (needs its
        // reservationRef) — same source and shape as the "Room
        // Charges" card on BillingRecordDetailScreen.jsx. Purely
        // additive: a failure here still leaves the rest of the
        // receipt intact.
        if (data?.reservationRef) {
          getRoomChargesForReservation(data.reservationRef)
            .then((charges) => {
              if (cancelled) return;
              // A receipt is a fixed record of a moment, not a live
              // view of the folio — only keep charges posted at or
              // before THIS receipt's paymentDate, so reopening an
              // old receipt never shows a charge that was added to
              // the room after that payment was already made and
              // receipted (e.g. an e-wallet payment that zeroed the
              // balance, followed days later by a room-service order
              // that shouldn't retroactively show up on it).
              const cutoff = new Date(receipt.paymentDate).getTime();
              setRoomCharges(
                isNaN(cutoff)
                  ? charges
                  : charges.filter((c) => new Date(c.timestamp).getTime() <= cutoff)
              );
            })
            .catch((err) => console.error('Failed to load room charges for receipt:', err));
        }
      })
      .catch((err) => console.error('Failed to load folio for receipt:', err))
      .finally(() => { if (!cancelled) setFolioLoading(false); });

    return () => { cancelled = true; };
  }, [visible, receipt?.folioId]);

  if (!receipt) return null;

  const handlePrint = async () => {
    setPrintError(null);
    if (Platform.OS === 'web') {
      const html = buildReceiptHtml(receipt, folio, resolveLogoUri(), roomCharges);
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
          message: buildReceiptText(receipt, folio, roomCharges),
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
            {!!roomCharges.length && (
              <>
                <Text style={styles.sectionLabel}>Room Charges</Text>
                {roomCharges.map((c) => (
                  <DetailRow key={c.id} label={c.note || 'Room charge'} value={formatCurrency(c.amount)} styles={styles} />
                ))}
              </>
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

    sectionLabel: {
      fontFamily: fonts.headingSemiBold, fontSize: 10.5, color: colors.textMuted,
      textTransform: 'uppercase', letterSpacing: 0.6, marginTop: spacing.xs,
    },

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