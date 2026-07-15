// BillingService.js
// Shared Firestore read/write service layer for the Billing Management module.
// Mirrors the conventions used in Roomsservice.js — plain functions, no classes,
// Firestore modular SDK, sequential human-readable IDs via a counters doc.

import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  runTransaction,
} from 'firebase/firestore';
import { db } from '../services/firebase'; // BillingService.js lives in src/utils/, matching Roomsservice.js — firebase.js is in src/services/

// ---------------------------------------------------------------------------
// Collections
// ---------------------------------------------------------------------------
const BILLING_RECORDS = 'billingRecords';
const PAYMENTS = 'payments';
const TRANSACTIONS = 'transactions';
const COUNTERS = 'counters'; // counters/billing -> { folioSeq: n, receiptSeq: n }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Atomically increments a named sequence in counters/billing and returns
 * a zero-padded formatted ID, e.g. getNextSequence('folioSeq', 'FOL') -> "FOL-0007"
 */
async function getNextSequence(fieldName, prefix) {
  const counterRef = doc(db, COUNTERS, 'billing');

  const nextValue = await runTransaction(db, async (transaction) => {
    const counterSnap = await transaction.get(counterRef);
    const current = counterSnap.exists() ? (counterSnap.data()[fieldName] || 0) : 0;
    const next = current + 1;

    if (counterSnap.exists()) {
      transaction.update(counterRef, { [fieldName]: next });
    } else {
      transaction.set(counterRef, { [fieldName]: next });
    }
    return next;
  });

  return `${prefix}-${String(nextValue).padStart(4, '0')}`;
}

function computeBillingStatus(totalAmountDue, amountPaid) {
  if (amountPaid <= 0) return 'unpaid';
  if (amountPaid >= totalAmountDue) return 'paid';
  return 'partially_paid';
}

// ---------------------------------------------------------------------------
// Billing Records
// ---------------------------------------------------------------------------

/**
 * Creates a guest folio. Called automatically by the check-in flow —
 * wire this into wherever a reservation transitions to "checked-in".
 *
 * If the reservation was paid online (paymentMode: 'online'), the folio
 * is auto-settled immediately after creation via recordPayment(), using
 * the reservation's eWalletProvider (e.g. 'gcash', 'maribank', 'gotyme')
 * as the payment method — so front desk sees it as Paid with a receipt
 * showing the e-wallet used, instead of Unpaid waiting to be collected.
 *
 * paymentMode/eWalletProvider can be passed in directly if the caller
 * already has them; otherwise they're looked up from the reservation doc
 * (reservationRef is expected to be the reservation's Firestore doc ID,
 * matching the 'reservations' collection used elsewhere in the app).
 */
export async function createBillingRecord({
  reservationRef,
  guestUid,
  guestName,
  roomNumbers,
  checkInDate,
  checkOutDate,
  roomCharges,
  additionalCharges = 0,
  taxServiceCharges = 0,
  paymentMode,
  eWalletProvider,
}) {
  const folioNumber = await getNextSequence('folioSeq', 'FOL');
  const totalAmountDue = roomCharges + additionalCharges + taxServiceCharges;

  const docRef = await addDoc(collection(db, BILLING_RECORDS), {
    folioNumber,
    reservationRef,
    guestUid,
    guestName,
    roomNumbers,
    checkInDate,
    checkOutDate,
    roomCharges,
    additionalCharges,
    taxServiceCharges,
    totalAmountDue,
    amountPaid: 0,
    remainingBalance: totalAmountDue,
    billingStatus: 'unpaid',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const folioId = docRef.id;

  // Fall back to reading the reservation doc if the caller didn't pass
  // payment info explicitly.
  if (paymentMode === undefined && reservationRef) {
    try {
      const resSnap = await getDoc(doc(db, 'reservations', reservationRef));
      if (resSnap.exists()) {
        const resData = resSnap.data();
        paymentMode = resData.paymentMode;
        eWalletProvider = resData.eWalletProvider;
      }
    } catch (err) {
      console.error('Could not look up reservation payment info for auto-settlement:', err);
    }
  }

  if (paymentMode === 'online' && totalAmountDue > 0) {
    try {
      await recordPayment({
        folioId,
        amount: totalAmountDue,
        paymentMethod: eWalletProvider || 'online',
        processedByUid: 'system',
        processedByName: 'Online Payment (Auto)',
      });
    } catch (err) {
      // Don't let an auto-settlement failure block folio creation — the
      // folio still exists as Unpaid and front desk can record payment
      // manually if this fails.
      console.error(`Auto-settlement failed for folio ${folioId}:`, err);
    }
  }

  return { id: folioId, folioNumber };
}

export async function getBillingRecord(folioId) {
  const snap = await getDoc(doc(db, BILLING_RECORDS, folioId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

export async function getAllBillingRecords() {
  const snap = await getDocs(
    query(collection(db, BILLING_RECORDS), orderBy('createdAt', 'desc'))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getBillingRecordsByStatus(status) {
  const snap = await getDocs(
    query(collection(db, BILLING_RECORDS), where('billingStatus', '==', status))
  );
  const records = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  // Sorted client-side, same reasoning as getReceiptsForFolio — avoids
  // requiring a Firestore composite index for where(billingStatus) +
  // orderBy(createdAt).
  return records.sort((a, b) => {
    const aTime = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
    const bTime = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
    return bTime - aTime;
  });
}

/**
 * Client-side search across folioNumber / guestName / roomNumbers.
 * Firestore doesn't do partial-text search natively, so for an 8-room
 * prototype we pull all records and filter in memory — fine at this scale.
 */
export async function searchBillingRecords(searchTerm) {
  const all = await getAllBillingRecords();
  const lower = searchTerm.toLowerCase();
  return all.filter(
    (r) =>
      r.folioNumber?.toLowerCase().includes(lower) ||
      r.guestName?.toLowerCase().includes(lower) ||
      r.roomNumbers?.some((rn) => String(rn).toLowerCase().includes(lower))
  );
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

/**
 * Records a payment against a folio, updates the folio's running totals and
 * billing status, generates a receipt, and writes a transaction log entry —
 * all in a single Firestore transaction so the numbers can't drift.
 */
export async function recordPayment({
  folioId,
  amount,
  paymentMethod, // "cash" | "gcash" | "card" | "pay_at_hotel"
  processedByUid,
  processedByName,
}) {
  if (amount <= 0) {
    throw new Error('Payment amount must be greater than zero.');
  }

  const folioRef = doc(db, BILLING_RECORDS, folioId);
  const receiptNumber = await getNextSequence('receiptSeq', 'RCP');

  const result = await runTransaction(db, async (transaction) => {
    const folioSnap = await transaction.get(folioRef);
    if (!folioSnap.exists()) {
      throw new Error('Billing record not found.');
    }
    const folio = folioSnap.data();

    const currentBalance = folio.remainingBalance;
    if (amount > currentBalance) {
      throw new Error(
        `Payment amount (${amount}) exceeds remaining balance (${currentBalance}).`
      );
    }

    const newAmountPaid = folio.amountPaid + amount;
    const newRemainingBalance = folio.totalAmountDue - newAmountPaid;
    const newStatus = computeBillingStatus(folio.totalAmountDue, newAmountPaid);

    transaction.update(folioRef, {
      amountPaid: newAmountPaid,
      remainingBalance: newRemainingBalance,
      billingStatus: newStatus,
      updatedAt: serverTimestamp(),
    });

    const paymentData = {
      folioId,
      receiptNumber,
      reservationRef: folio.reservationRef,
      guestName: folio.guestName,
      paymentDate: serverTimestamp(),
      paymentMethod,
      amountPaid: amount,
      remainingBalanceAfter: newRemainingBalance,
      processedByUid,
      processedByName,
    };
    const paymentRef = doc(collection(db, PAYMENTS));
    transaction.set(paymentRef, paymentData);

    const transactionData = {
      timestamp: serverTimestamp(),
      guestName: folio.guestName,
      reservationRef: folio.reservationRef,
      paymentType: paymentMethod,
      amount,
      staffUid: processedByUid,
      staffName: processedByName,
      status: 'completed',
    };
    const txnRef = doc(collection(db, TRANSACTIONS));
    transaction.set(txnRef, transactionData);

    return {
      receiptId: paymentRef.id,
      receiptNumber,
      transactionId: txnRef.id,
      newAmountPaid,
      newRemainingBalance,
      newStatus,
    };
  });

  return result;
}

// ---------------------------------------------------------------------------
// Receipts
// ---------------------------------------------------------------------------

export async function getReceipt(receiptId) {
  const snap = await getDoc(doc(db, PAYMENTS, receiptId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

export async function getReceiptsForFolio(folioId) {
  const snap = await getDocs(
    query(collection(db, PAYMENTS), where('folioId', '==', folioId))
  );
  const receipts = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  // Sorted client-side (newest first) to avoid requiring a Firestore
  // composite index for where(folioId) + orderBy(paymentDate) — folio
  // payment counts are always small, so this is cheap.
  return receipts.sort((a, b) => {
    const aTime = a.paymentDate?.toDate ? a.paymentDate.toDate().getTime() : new Date(a.paymentDate || 0).getTime();
    const bTime = b.paymentDate?.toDate ? b.paymentDate.toDate().getTime() : new Date(b.paymentDate || 0).getTime();
    return bTime - aTime;
  });
}

/**
 * Every receipt across all folios, newest first — powers the top-level
 * "Receipts" sidebar screen (Receiptsscreen.jsx). Mirrors
 * getAllBillingRecords: single-field orderBy, no composite index needed.
 */
export async function getAllReceipts() {
  const snap = await getDocs(
    query(collection(db, PAYMENTS), orderBy('paymentDate', 'desc'))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Client-side search across receiptNumber / guestName for the Receipts
 * screen's search bar — same in-memory approach as searchBillingRecords,
 * fine at prototype scale.
 */
export async function searchReceipts(searchTerm) {
  const all = await getAllReceipts();
  const lower = searchTerm.toLowerCase();
  return all.filter(
    (r) =>
      r.receiptNumber?.toLowerCase().includes(lower) ||
      r.guestName?.toLowerCase().includes(lower)
  );
}

// ---------------------------------------------------------------------------
// Outstanding Balances
// ---------------------------------------------------------------------------

export async function getOutstandingBalances() {
  const snap = await getDocs(
    query(collection(db, BILLING_RECORDS), where('billingStatus', 'in', ['unpaid', 'partially_paid']))
  );
  const records = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return records.sort((a, b) => {
    const aTime = a.updatedAt?.toDate ? a.updatedAt.toDate().getTime() : 0;
    const bTime = b.updatedAt?.toDate ? b.updatedAt.toDate().getTime() : 0;
    return bTime - aTime;
  });
}

/**
 * "Mark as settled" — a front-desk override for edge cases (e.g. waived
 * balance, comp'd stay) rather than a real payment. Writes a transaction
 * entry so it still shows up in the audit trail, tagged distinctly.
 */
export async function markBalanceSettled({ folioId, staffUid, staffName, reason }) {
  const folioRef = doc(db, BILLING_RECORDS, folioId);

  await runTransaction(db, async (transaction) => {
    const folioSnap = await transaction.get(folioRef);
    if (!folioSnap.exists()) throw new Error('Billing record not found.');
    const folio = folioSnap.data();

    transaction.update(folioRef, {
      amountPaid: folio.totalAmountDue,
      remainingBalance: 0,
      billingStatus: 'paid',
      updatedAt: serverTimestamp(),
    });

    const txnRef = doc(collection(db, TRANSACTIONS));
    transaction.set(txnRef, {
      timestamp: serverTimestamp(),
      guestName: folio.guestName,
      reservationRef: folio.reservationRef,
      paymentType: 'settled_override',
      amount: folio.remainingBalance,
      staffUid,
      staffName,
      status: 'completed',
      note: reason || 'Marked as settled by front desk',
    });
  });
}

// ---------------------------------------------------------------------------
// Transaction History
// ---------------------------------------------------------------------------

export async function getTransactionHistory({ maxResults = 100 } = {}) {
  const snap = await getDocs(
    query(collection(db, TRANSACTIONS), orderBy('timestamp', 'desc'), limit(maxResults))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getTransactionsByDateRange(startDate, endDate) {
  const snap = await getDocs(
    query(
      collection(db, TRANSACTIONS),
      where('timestamp', '>=', startDate),
      where('timestamp', '<=', endDate),
      orderBy('timestamp', 'desc')
    )
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getTransactionsByPaymentMethod(paymentType) {
  const snap = await getDocs(
    query(collection(db, TRANSACTIONS), where('paymentType', '==', paymentType))
  );
  const transactions = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return transactions.sort((a, b) => {
    const aTime = a.timestamp?.toDate ? a.timestamp.toDate().getTime() : 0;
    const bTime = b.timestamp?.toDate ? b.timestamp.toDate().getTime() : 0;
    return bTime - aTime;
  });
}

/**
 * Client-side search across guestName / reservationRef for the Transaction
 * History screen's search bar (same in-memory approach as billing search).
 */
export async function searchTransactions(searchTerm) {
  const all = await getTransactionHistory({ maxResults: 500 });
  const lower = searchTerm.toLowerCase();
  return all.filter(
    (t) =>
      t.guestName?.toLowerCase().includes(lower) ||
      t.reservationRef?.toLowerCase().includes(lower)
  );
}