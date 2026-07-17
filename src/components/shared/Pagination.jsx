// components/shared/Pagination.jsx
// Reusable page control: Previous, 1, 2 ... 207, Next
// Used by BillingRecordsScreen and ReceiptScreen (both paginate at 5/page).

import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { colors, spacing, fonts } from '../../utils/theme';

const DOTS = '...';
const SIBLING_COUNT = 1;

function buildRange(start, end) {
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

function getPaginationRange(currentPage, totalPages) {
  const totalNumbers = SIBLING_COUNT * 2 + 5; // first, last, current, 2 siblings, 2 dots

  if (totalPages <= totalNumbers) {
    return buildRange(1, totalPages);
  }

  const leftSibling = Math.max(currentPage - SIBLING_COUNT, 1);
  const rightSibling = Math.min(currentPage + SIBLING_COUNT, totalPages);

  const showLeftDots = leftSibling > 2;
  const showRightDots = rightSibling < totalPages - 1;

  if (!showLeftDots && showRightDots) {
    const leftRange = buildRange(1, 3 + SIBLING_COUNT * 2);
    return [...leftRange, DOTS, totalPages];
  }

  if (showLeftDots && !showRightDots) {
    const rightRange = buildRange(totalPages - (3 + SIBLING_COUNT * 2) + 1, totalPages);
    return [1, DOTS, ...rightRange];
  }

  return [1, DOTS, ...buildRange(leftSibling, rightSibling), DOTS, totalPages];
}

export default function Pagination({ currentPage, totalItems, pageSize, onPageChange }) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  const range = useMemo(
    () => getPaginationRange(currentPage, totalPages),
    [currentPage, totalPages]
  );

  if (totalPages <= 1) return null;

  const goTo = (page) => {
    if (page < 1 || page > totalPages || page === currentPage) return;
    onPageChange(page);
  };

  return (
    <View style={styles.wrapper}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        <TouchableOpacity
          style={[styles.navBtn, currentPage === 1 && styles.disabledBtn]}
          disabled={currentPage === 1}
          onPress={() => goTo(currentPage - 1)}
        >
          <Text style={[styles.navText, currentPage === 1 && styles.disabledText]}>Previous</Text>
        </TouchableOpacity>

        {range.map((page, idx) =>
          page === DOTS ? (
            <View key={`dots-${idx}`} style={styles.dotsWrap}>
              <Text style={styles.dotsText}>...</Text>
            </View>
          ) : (
            <TouchableOpacity
              key={page}
              style={[styles.pageBtn, page === currentPage && styles.pageBtnActive]}
              onPress={() => goTo(page)}
            >
              <Text style={[styles.pageText, page === currentPage && styles.pageTextActive]}>
                {page}
              </Text>
            </TouchableOpacity>
          )
        )}

        <TouchableOpacity
          style={[styles.navBtn, currentPage === totalPages && styles.disabledBtn]}
          disabled={currentPage === totalPages}
          onPress={() => goTo(currentPage + 1)}
        >
          <Text style={[styles.navText, currentPage === totalPages && styles.disabledText]}>
            Next
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingVertical: spacing.sm,
  },
  row: {
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 2,
  },
  navBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  disabledBtn: {
    opacity: 0.4,
  },
  navText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: colors.primary,
  },
  disabledText: {
    color: colors.textMuted,
  },
  pageBtn: {
    minWidth: 34,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    alignItems: 'center',
  },
  pageBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  pageText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: colors.text,
  },
  pageTextActive: {
    color: colors.white,
    fontFamily: fonts.bodySemiBold,
  },
  dotsWrap: {
    paddingHorizontal: 4,
  },
  dotsText: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textMuted,
  },
});