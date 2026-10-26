import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { EmployeeCard } from '../components/EmployeeCard';
import { addDays, formatLocalDateTime, parseLocalDateTime } from '../core/time';
import type { Shift } from '../core/timesheet';
import { summarizeWeek } from '../core/week';
import { ApiError, fetchWeek, verifyTimesheet, WeekResponse } from '../lib/api';
import { formatDay, formatHours, formatMoney, formatWeekRange } from '../lib/format';
import { colors } from '../theme';

/** Opens on Thanksgiving week 2026 so a first-time viewer sees overtime and holiday hours straight away. */
export const DEMO_WEEK = '2026-11-22';

type Load = { state: 'loading' } | { state: 'error'; message: string } | { state: 'ready'; week: WeekResponse };
type Check =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'match'; ms: number }
  | { state: 'mismatch'; detail: string }
  | { state: 'error'; message: string };

export function WeekScreen({ initialWeek = DEMO_WEEK }: { initialWeek?: string }) {
  const [weekStart, setWeekStart] = useState(initialWeek);
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [check, setCheck] = useState<Check>({ state: 'idle' });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoad({ state: 'loading' });
    setCheck({ state: 'idle' });
    fetchWeek(weekStart)
      .then((week) => {
        if (cancelled) return;
        setLoad({ state: 'ready', week });
        setShifts(week.shifts);
      })
      .catch((e: unknown) => {
        if (!cancelled) setLoad({ state: 'error', message: e instanceof ApiError ? e.message : 'Something went wrong.' });
      });
    return () => {
      cancelled = true;
    };
  }, [weekStart, reloadKey]);

  const week = load.state === 'ready' ? load.week : null;
  const summary = useMemo(
    () => (week ? summarizeWeek(week.weekStart, week.employees, shifts, week.policy) : null),
    [week, shifts],
  );
  const errorsByShift = useMemo(() => new Map(summary?.errors.map((e) => [e.shiftId, e.message]) ?? []), [summary]);

  const editShifts = useCallback((update: (prev: Shift[]) => Shift[]) => {
    setShifts(update);
    setCheck({ state: 'idle' });
  }, []);

  const adjustEnd = useCallback(
    (shiftId: string, delta: number) =>
      editShifts((prev) =>
        prev.map((s) => {
          if (s.id !== shiftId) return s;
          const end = parseLocalDateTime(s.end);
          return end === null ? s : { ...s, end: formatLocalDateTime(end + delta) };
        }),
      ),
    [editShifts],
  );
  const removeShift = useCallback((shiftId: string) => editShifts((prev) => prev.filter((s) => s.id !== shiftId)), [editShifts]);

  const runCheck = useCallback(async () => {
    if (!week || !summary) return;
    setCheck({ state: 'checking' });
    const started = Date.now();
    try {
      const server = await verifyTimesheet(week.weekStart, shifts);
      const ms = Date.now() - started;
      const same =
        JSON.stringify(server.totals) === JSON.stringify(summary.totals) &&
        JSON.stringify(server.summaries) === JSON.stringify(summary.summaries);
      setCheck(
        same
          ? { state: 'match', ms }
          : {
              state: 'mismatch',
              detail: `Server total ${formatMoney(server.totals.grossPayCents)}, phone total ${formatMoney(summary.totals.grossPayCents)}`,
            },
      );
    } catch (e) {
      setCheck({ state: 'error', message: e instanceof ApiError ? e.message : 'Something went wrong.' });
    }
  }, [week, summary, shifts]);

  const edited = week !== null && JSON.stringify(week.shifts) !== JSON.stringify(shifts);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.column}>
        <Text style={styles.title} accessibilityRole="header">
          ShiftCheck
        </Text>
        <Text style={styles.subtitle}>Weekly hours, overtime and holiday pay for a small team</Text>

        <View style={styles.banner} accessibilityRole="summary">
          <Text style={styles.bannerText}>
            Synthetic demo data. The employees and shifts are generated, not real people or payroll records.
          </Text>
        </View>

        <View style={styles.weekNav}>
          <NavButton label="‹" a11y="Previous week" onPress={() => setWeekStart((w) => addDays(w, -7))} />
          <Text style={styles.weekLabel}>{formatWeekRange(weekStart)}</Text>
          <NavButton label="›" a11y="Next week" onPress={() => setWeekStart((w) => addDays(w, 7))} />
        </View>

        {load.state === 'loading' && <ActivityIndicator style={styles.spinner} color={colors.accent} accessibilityLabel="Loading week" />}

        {load.state === 'error' && (
          <View style={[styles.notice, styles.noticeError]}>
            <Text style={styles.noticeErrorText}>{load.message}</Text>
            <Pressable onPress={() => setReloadKey((k) => k + 1)} accessibilityRole="button" style={styles.retry}>
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        )}

        {week && summary && (
          <>
            {summary.holidays.map((h) => (
              <Text key={h.observed} style={styles.holiday}>
                Federal holiday: {h.name}, {formatDay(h.observed)}
                {h.observed !== h.date ? ' (observed)' : ''}. Hours worked that day earn +{week.policy.holidayPremium}x.
              </Text>
            ))}

            <View style={styles.totals}>
              <Stat label="Hours" value={formatHours(summary.totals.paidMinutes)} />
              <Stat label="Overtime" value={formatHours(summary.totals.overtimeMinutes)} warn={summary.totals.overtimeMinutes > 0} />
              <Stat label="Gross pay" value={formatMoney(summary.totals.grossPayCents)} />
            </View>

            {week.employees.map((e) => (
              <EmployeeCard
                key={e.id}
                employee={e}
                summary={summary.summaries.find((s) => s.employeeId === e.id)}
                shifts={shifts.filter((s) => s.employeeId === e.id)}
                weekStart={week.weekStart}
                errorsByShift={errorsByShift}
                thresholdMinutes={week.policy.weeklyOvertimeThresholdMinutes}
                onAdjustEnd={adjustEnd}
                onRemove={removeShift}
              />
            ))}

            <View style={styles.footer}>
              <Pressable
                onPress={runCheck}
                disabled={check.state === 'checking'}
                accessibilityRole="button"
                style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
              >
                <Text style={styles.primaryText}>{check.state === 'checking' ? 'Checking…' : 'Check totals with server'}</Text>
              </Pressable>
              {edited && (
                <Pressable onPress={() => editShifts(() => week.shifts)} accessibilityRole="button" style={styles.secondary}>
                  <Text style={styles.secondaryText}>Undo my edits</Text>
                </Pressable>
              )}
              <CheckResult check={check} />
              <Text style={styles.fineprint}>
                Overtime: hours over {week.policy.weeklyOvertimeThresholdMinutes / 60} in a Sunday to Saturday week at{' '}
                {week.policy.overtimeMultiplier}x (FLSA and New Jersey weekly rule). Estimates only, not payroll or legal advice.
              </Text>
            </View>
          </>
        )}
      </View>
    </ScrollView>
  );
}

function CheckResult({ check }: { check: Check }) {
  if (check.state === 'match') {
    return (
      <Text style={[styles.notice, styles.noticeOk]} accessibilityLiveRegion="polite">
        Server agrees to the cent ({check.ms} ms round trip).
      </Text>
    );
  }
  if (check.state === 'mismatch') {
    return <Text style={[styles.notice, styles.noticeError, styles.noticeErrorText]}>Totals differ. {check.detail}</Text>;
  }
  if (check.state === 'error') {
    return <Text style={[styles.notice, styles.noticeError, styles.noticeErrorText]}>{check.message}</Text>;
  }
  return null;
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <View style={styles.stat} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, warn && styles.statWarn]}>{value}</Text>
    </View>
  );
}

function NavButton({ label, a11y, onPress }: { label: string; a11y: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={a11y} hitSlop={8} style={({ pressed }) => [styles.navButton, pressed && styles.pressed]}>
      <Text style={styles.navButtonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 48, alignItems: 'center' },
  column: { width: '100%', maxWidth: 640 },
  title: { fontSize: 28, fontWeight: '700', color: colors.text },
  subtitle: { fontSize: 14, color: colors.muted, marginTop: 2 },
  banner: { backgroundColor: colors.bannerSoft, borderRadius: 8, padding: 10, marginTop: 12 },
  bannerText: { fontSize: 13, color: colors.bannerText },
  weekNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, marginBottom: 8 },
  weekLabel: { fontSize: 16, fontWeight: '600', color: colors.text },
  navButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  navButtonText: { fontSize: 22, color: colors.text, lineHeight: 24 },
  spinner: { marginTop: 32 },
  holiday: { backgroundColor: colors.holidaySoft, color: colors.holidayText, borderRadius: 8, padding: 10, fontSize: 13, marginBottom: 8, overflow: 'hidden' },
  totals: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  stat: { flex: 1, backgroundColor: colors.surface, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colors.border },
  statLabel: { fontSize: 12, color: colors.muted },
  statValue: { fontSize: 18, fontWeight: '700', color: colors.text, marginTop: 2, fontVariant: ['tabular-nums'] },
  statWarn: { color: colors.overtimeText },
  footer: { marginTop: 8, gap: 10 },
  primary: { backgroundColor: colors.accent, borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  primaryText: { color: colors.accentText, fontSize: 15, fontWeight: '600' },
  secondary: { alignItems: 'center', paddingVertical: 6 },
  secondaryText: { color: colors.accent, fontSize: 14, fontWeight: '500' },
  pressed: { opacity: 0.7 },
  notice: { borderRadius: 8, padding: 10, fontSize: 13, overflow: 'hidden' },
  noticeOk: { backgroundColor: colors.successSoft, color: colors.successText },
  noticeError: { backgroundColor: colors.errorSoft },
  noticeErrorText: { color: colors.errorText, fontSize: 13 },
  retry: { marginTop: 8, alignSelf: 'flex-start' },
  retryText: { color: colors.accent, fontWeight: '600' },
  fineprint: { fontSize: 12, color: colors.muted, marginTop: 4 },
});
