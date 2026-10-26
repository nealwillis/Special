"""Compare ShiftCheck's observed federal holidays with the open-source `holidays` package.

Usage: npx tsx scripts/dump-holidays.ts > ours.txt && python scripts/check_holidays.py ours.txt
Needs: pip install holidays
"""
import sys
from datetime import date

import holidays

ours = {}
for line in open(sys.argv[1]):
    d, name = line.strip().split(" ", 1)
    ours[date.fromisoformat(d)] = name

theirs = {}
for y in range(2021, 2100):
    for d, name in holidays.country_holidays("US", years=y).items():
        # The package lists both the statutory date and the "(observed)" date. A weekend date is not a day off.
        if d.weekday() < 5:
            theirs[d] = name

# Compare the same calendar window on both sides.
lo, hi = date(2021, 1, 1), date(2099, 12, 31)
ours = {d: n for d, n in ours.items() if lo <= d <= hi}
theirs = {d: n for d, n in theirs.items() if lo <= d <= hi}

only_ours = sorted(set(ours) - set(theirs))
only_theirs = sorted(set(theirs) - set(ours))
matched = len(set(ours) & set(theirs))
print(f"holidays package {holidays.__version__}")
print(f"ours={len(ours)} theirs={len(theirs)} matched={matched}")
for d in only_ours:
    print("only ours:  ", d, ours[d])
for d in only_theirs:
    print("only theirs:", d, theirs[d])
