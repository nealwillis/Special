import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { addDays } from '../core/time';
import type { Employee, EmployeeWeekSummary, Shift } from '../core/timesheet';
import { formatHours, formatMoney, formatShift } from '../lib/format';
import { colors } from '../theme';

interface Props {
  employee: Employee;
  summary: EmployeeWeekSummary | undefined;
  shifts: Shift[];
  weekStart: string;
  errorsByShift: Map<string, string>;
  thresholdMinutes: number;
  onAdjustEnd: (shiftId: string, deltaMinutes: number) => void;
  onRemove: (shiftId: string) => void;
}

export function EmployeeCard({ employee, summary, shifts, weekStart, errorsByShift, thresholdMinutes, onAdjustEnd, onRemove }: Props) {
  const [open, setOpen] = useState(false);
  const paid = summary?.paidMinutes ?? 0;
  const overtime = summary?.overtimeMinutes ?? 0;
  const holiday = summary?.holidayMinutes ?? 0;
  const hasErrors = shifts.some((s) => errorsByShift.has(s.id));
  const weekOpens = `${weekStart}T00:00`;
  const weekCloses = `${addDays(weekStart, 7)}T00:00`;

  // Bar scale: the 40h threshold sits at 80% of the width so overtime has room to show.
  const scale = Math.max(thresholdMinutes * 1.25, paid);
  const regularPct = ((paid - overtime) / scale) * 100;
  const overtimePct = (overtime / scale) * 100;
  const thresholdPct = (thresholdMinutes / scale) * 100;

  return (
    <View style={styles.card}>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${employee.name}, ${formatHours(paid)} hours. ${open ? 'Hide' : 'Show'} shifts`}
        style={styles.header}
      >
        <View style={styles.headerText}>
          <Text style={styles.name}>{employee.name}</Text>
          <Text style={styles.role}>
            {employee.role} · {formatMoney(employee.hourlyRateCents)}/h
          </Text>
        </View>
        <View style={styles.headerRight}>
          <Text style={styles.pay}>{formatMoney(summary?.grossPayCents ?? 0)}</Text>
          <Text style={styles.chevron}>{open ? '▲' : '▼'}</Text>
        </View>
      </Pressable>

      <View style={styles.bar} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <View style={[styles.barRegular, { width: `${regularPct}%` }]} />
        <View style={[styles.barOvertime, { width: `${overtimePct}%` }]} />
        <View style={[styles.threshold, { left: `${thresholdPct}%` }]} />
      </View>

      <View style={styles.stats}>
        <Text style={styles.stat}>{formatHours(paid)} h worked</Text>
        {overtime > 0 && (
          <Text style={[styles.badge, styles.badgeOvertime]}>{formatHours(overtime)} h overtime</Text>
        )}
        {holiday > 0 && <Text style={[styles.badge, styles.badgeHoliday]}>{formatHours(holiday)} h holiday</Text>}
        {hasErrors && <Text style={[styles.badge, styles.badgeError]}>needs fixing</Text>}
      </View>

      {open && (
        <View style={styles.shifts}>
          {shifts.length === 0 && <Text style={styles.empty}>No shifts this week.</Text>}
          {shifts.map((s) => (
            <View key={s.id} style={styles.shiftRow}>
              <View style={styles.shiftText}>
                <Text style={styles.shiftTime}>{formatShift(s.start, s.end)}</Text>
                <Text style={styles.shiftMeta}>{s.breakMinutes > 0 ? `${s.breakMinutes} min unpaid break` : 'No break'}</Text>
                {s.start < weekOpens && (
                  <Text style={styles.shiftMeta}>Started last week. Only the hours after midnight count in this week.</Text>
                )}
                {s.end > weekCloses && (
                  <Text style={styles.shiftMeta}>Runs past Saturday midnight. Those hours count in next week.</Text>
                )}
                {errorsByShift.has(s.id) && <Text style={styles.shiftError}>{errorsByShift.get(s.id)}</Text>}
              </View>
              <View style={styles.actions}>
                <SmallButton label="-15m" a11y={`End shift 15 minutes earlier`} onPress={() => onAdjustEnd(s.id, -15)} />
                <SmallButton label="+15m" a11y={`End shift 15 minutes later`} onPress={() => onAdjustEnd(s.id, 15)} />
                <SmallButton label="✕" a11y={`Remove shift ${formatShift(s.start, s.end)}`} onPress={() => onRemove(s.id)} />
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function SmallButton({ label, a11y, onPress }: { label: string; a11y: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      hitSlop={6}
      style={({ pressed }) => [styles.smallButton, pressed && styles.pressed]}
    >
      <Text style={styles.smallButtonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.border },
  header: { flexDirection: 'row', alignItems: 'center' },
  headerText: { flex: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontSize: 16, fontWeight: '600', color: colors.text },
  role: { fontSize: 13, color: colors.muted, marginTop: 2 },
  pay: { fontSize: 16, fontWeight: '600', color: colors.text, fontVariant: ['tabular-nums'] },
  chevron: { fontSize: 11, color: colors.muted },
  bar: { height: 8, borderRadius: 4, backgroundColor: colors.track, marginTop: 12, flexDirection: 'row', overflow: 'hidden' },
  barRegular: { backgroundColor: colors.accent },
  barOvertime: { backgroundColor: colors.overtime },
  threshold: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: colors.text, opacity: 0.5 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 8 },
  stat: { fontSize: 13, color: colors.text, marginRight: 4, fontVariant: ['tabular-nums'] },
  badge: { fontSize: 12, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, overflow: 'hidden', fontWeight: '500' },
  badgeOvertime: { backgroundColor: colors.overtimeSoft, color: colors.overtimeText },
  badgeHoliday: { backgroundColor: colors.holidaySoft, color: colors.holidayText },
  badgeError: { backgroundColor: colors.errorSoft, color: colors.errorText },
  shifts: { marginTop: 10, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 6 },
  empty: { fontSize: 13, color: colors.muted, paddingVertical: 6 },
  shiftRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 8 },
  shiftText: { flex: 1 },
  shiftTime: { fontSize: 13, color: colors.text },
  shiftMeta: { fontSize: 12, color: colors.muted, marginTop: 1 },
  shiftError: { fontSize: 12, color: colors.errorText, marginTop: 2 },
  actions: { flexDirection: 'row', gap: 6 },
  smallButton: { minWidth: 40, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 6, backgroundColor: colors.track, alignItems: 'center' },
  smallButtonText: { fontSize: 12, color: colors.text, fontWeight: '500' },
  pressed: { opacity: 0.6 },
});
