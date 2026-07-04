import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { colors, spacing, radius, fonts } from '../../utils/theme';
import {
  buildMonthGrid,
  getWeekdayLabels,
  getMonthLabel,
  isSameDay,
  isBeforeDay,
  isWithinRange,
  addMonths,
} from '../../utils/calendarHelpers';

/**
 * Range-select calendar: tap a start date, then an end date. Tapping a new
 * start date after a range is already chosen begins a fresh range.
 * Renders two consecutive months stacked (current + next), with arrows to
 * page forward/back, which reads well on a phone-width screen.
 * Used by: screens/reservation/ReservationScreen.jsx
 *
 * Props:
 *  - checkIn: Date | null
 *  - checkOut: Date | null
 *  - onSelectRange: (checkIn: Date, checkOut: Date | null) => void
 *  - onDone: () => void
 */
export default function RangeCalendar({ checkIn, checkOut, onSelectRange, onDone }) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(checkIn ? checkIn.getFullYear() : today.getFullYear());
  const [viewMonth, setViewMonth] = useState(checkIn ? checkIn.getMonth() : today.getMonth());

  const goPrevMonth = () => {
    const { year, month } = addMonths(viewYear, viewMonth, -1);
    setViewYear(year);
    setViewMonth(month);
  };

  const goNextMonth = () => {
    const { year, month } = addMonths(viewYear, viewMonth, 1);
    setViewYear(year);
    setViewMonth(month);
  };

  const handleDayPress = (date) => {
    const isPast = isBeforeDay(date, today) && !isSameDay(date, today);
    if (isPast) return;

    if (!checkIn || (checkIn && checkOut)) {
      // Starting a fresh range
      onSelectRange(date, null);
    } else if (isSameDay(date, checkIn)) {
      // Tapping check-in again clears it
      onSelectRange(null, null);
    } else if (isBeforeDay(date, checkIn)) {
      // Picked an earlier date than current check-in: restart range from here
      onSelectRange(date, null);
    } else {
      // Valid check-out
      onSelectRange(checkIn, date);
    }
  };

  const { year: nextYear, month: nextMonth } = addMonths(viewYear, viewMonth, 1);

  return (
    <View style={styles.wrap}>
      <View style={styles.navRow}>
        <TouchableOpacity onPress={goPrevMonth} style={styles.navButton} accessibilityLabel="Previous month">
          <Text style={styles.navArrow}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.navHint}>Tap a check-in date, then a check-out date</Text>
        <TouchableOpacity onPress={goNextMonth} style={styles.navButton} accessibilityLabel="Next month">
          <Text style={styles.navArrow}>›</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        <MonthGrid
          year={viewYear}
          month={viewMonth}
          today={today}
          checkIn={checkIn}
          checkOut={checkOut}
          onDayPress={handleDayPress}
        />
        <View style={styles.monthSpacer} />
        <MonthGrid
          year={nextYear}
          month={nextMonth}
          today={today}
          checkIn={checkIn}
          checkOut={checkOut}
          onDayPress={handleDayPress}
        />
      </ScrollView>

      <TouchableOpacity
        style={[styles.doneButton, !(checkIn && checkOut) && styles.doneButtonDisabled]}
        onPress={onDone}
        disabled={!(checkIn && checkOut)}
      >
        <Text style={styles.doneText}>{checkIn && checkOut ? 'Done' : 'Select check-in and check-out'}</Text>
      </TouchableOpacity>
    </View>
  );
}

function MonthGrid({ year, month, today, checkIn, checkOut, onDayPress }) {
  const cells = buildMonthGrid(year, month);
  const weekdayLabels = getWeekdayLabels();

  return (
    <View>
      <Text style={styles.monthTitle}>{getMonthLabel(year, month)}</Text>
      <View style={styles.weekdayRow}>
        {weekdayLabels.map((label) => (
          <Text key={label} style={styles.weekdayLabel}>{label}</Text>
        ))}
      </View>
      <View style={styles.grid}>
        {cells.map((cell, idx) => {
          const isPast = isBeforeDay(cell.date, today) && !isSameDay(cell.date, today);
          const isCheckIn = isSameDay(cell.date, checkIn);
          const isCheckOut = isSameDay(cell.date, checkOut);
          const inRange = isWithinRange(cell.date, checkIn, checkOut);
          const disabled = !cell.inMonth || isPast;

          return (
            <TouchableOpacity
              key={idx}
              style={[
                styles.dayCell,
                inRange && styles.dayCellInRange,
                (isCheckIn || isCheckOut) && styles.dayCellSelected,
              ]}
              onPress={() => cell.inMonth && onDayPress(cell.date)}
              disabled={disabled}
            >
              <Text
                style={[
                  styles.dayText,
                  !cell.inMonth && styles.dayTextOutside,
                  isPast && styles.dayTextPast,
                  (isCheckIn || isCheckOut) && styles.dayTextSelected,
                ]}
              >
                {cell.date.getDate()}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const CELL_SIZE = 36;

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  navButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navArrow: {
    fontSize: 22,
    color: colors.step,
    fontFamily: fonts.headingSemiBold,
  },
  navHint: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    fontFamily: fonts.body,
    color: colors.textMuted,
  },
  scroll: {
    maxHeight: 360,
  },
  monthSpacer: {
    height: spacing.lg,
  },
  monthTitle: {
    fontSize: 14,
    fontFamily: fonts.headingSemiBold,
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  weekdayRow: {
    flexDirection: 'row',
    marginBottom: spacing.xs,
  },
  weekdayLabel: {
    width: CELL_SIZE,
    textAlign: 'center',
    fontSize: 11,
    fontFamily: fonts.bodySemiBold,
    color: colors.textMuted,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: CELL_SIZE / 2,
  },
  dayCellInRange: {
    backgroundColor: colors.calendarRangeBg,
    borderRadius: 0,
  },
  dayCellSelected: {
    backgroundColor: colors.step,
    borderRadius: CELL_SIZE / 2,
  },
  dayText: {
    fontSize: 13,
    fontFamily: fonts.body,
    color: colors.text,
  },
  dayTextOutside: {
    color: colors.disabled,
  },
  dayTextPast: {
    color: colors.calendarPast,
    textDecorationLine: 'line-through',
  },
  dayTextSelected: {
    color: colors.white,
    fontFamily: fonts.bodySemiBold,
  },
  doneButton: {
    backgroundColor: colors.step,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  doneButtonDisabled: {
    backgroundColor: colors.disabled,
  },
  doneText: {
    color: colors.white,
    fontFamily: fonts.headingSemiBold,
    fontSize: 14,
  },
});
