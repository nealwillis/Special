// Prints every observed federal holiday from 2021 through 2099 as "YYYY-MM-DD name", one per line.
// Used by scripts/check_holidays.py to compare against an independent implementation.
import { federalHolidays, MAX_SUPPORTED_YEAR, MIN_SUPPORTED_YEAR } from '../src/core/holidays';

for (let y = MIN_SUPPORTED_YEAR; y <= MAX_SUPPORTED_YEAR; y++) {
  for (const h of federalHolidays(y)) console.log(`${h.observed} ${h.name}`);
}
