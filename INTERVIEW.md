# Interview prep: ShiftCheck

For: Intern, Mobile Applications Development, The Talent Curator.
Everything below describes what is in this repo. Where something isn't built or verified, it says so.

## The architecture in plain English

ShiftCheck answers a manager's question: "what will this week of shifts cost me, and who is in overtime?"

There are three layers.

**1. The rules (`src/core`).** Plain TypeScript with no React and no network. It takes a list of shifts (start, end, unpaid break) and a roster with hourly rates, and works out each person's paid minutes, regular minutes, overtime and holiday minutes, and gross pay in cents. It splits overnight shifts at midnight so every hour lands on the day and workweek it was actually worked. It computes the federal holiday calendar from the law itself (third Monday in January, fourth Thursday in November, Saturday holidays observed Friday, and so on). Because this layer is pure functions, most of the tests are here.

**2. The app (`src/screens`, `src/components`, `src/lib`).** A React Native screen built with Expo. When it opens it asks the API for a week of shifts. It then runs the same rules code locally, so when you tap "+15m" on a shift the totals and overtime badge update instantly with no network call. "Check totals with server" posts the edited shifts to the API and compares the server's answer with the phone's, to the cent.

**3. The API (`src/server`, `api/`).** Two endpoints. `GET /api/week` returns the synthetic roster, the shifts for that week (including last week's overnight shift that runs into Sunday) and the week's holidays. `POST /api/timesheet` recomputes the totals. It uses its own pay rates and ignores anything the phone sends about rates, because payroll shouldn't trust the client. The handlers take a standard Web `Request` and return a `Response`, so the same code runs on Vercel, in my local server and in Jest.

The data is synthetic: a seeded random generator makes the same plausible week every time for a given date, and every response and the UI say so.

## Questions an interviewer would likely ask

**1. Why React Native with Expo instead of Flutter or native?**
The posting lists React Native (TypeScript) and Flutter as cross-platform options. I chose React Native because TypeScript let me share the payroll code between the app and the API. That sharing is what makes the "server agrees to the cent" check possible. Expo gave me iOS and Android through Expo Go without Xcode or Android Studio, plus a web export I could host so a reviewer can open the app in a browser. The cost is that a native module outside the Expo SDK would need a custom development build.

**2. Walk me through how the app talks to the API.**
`src/lib/api.ts` wraps `fetch`. On web the API is on the same origin, so paths are relative. A phone has no origin, so native builds read `EXPO_PUBLIC_API_URL`, which Expo inlines at build time. Each request has a 10-second timeout via `AbortController`. Network failures, timeouts and non-2xx responses become an `ApiError` with a readable message, and the screen shows it with a "Try again" button. The screen's `useEffect` also ignores a response if you've already moved to another week, so a slow response can't overwrite the current one.

**3. Why compute on the phone and on the server?**
On the phone, so editing feels instant and the UI doesn't need a round trip per tap. On the server, because it's the source of truth for pay rates: the POST handler looks up rates from its own roster, and a test sends inflated rates to prove they're ignored. Both sides call the same `summarizeWeek()` function, so a mismatch would mean different inputs, not different math.

**4. What was the hardest edge case?**
Overnight shifts. A Wednesday 10 PM to Thursday 7 AM shift on Thanksgiving has to be split at midnight: only the Thursday part gets the holiday premium. A Saturday 10 PM to Sunday 6 AM shift crosses the workweek boundary, so its hours belong to two different overtime calculations. The unpaid break also has to be divided between the pieces; I spread it by length with largest-remainder rounding so the whole minutes always add back up. Each case has a test.

**5. Tell me about a bug you found and how.**
Two that teach different things. First, the engine took 48 ms for about 10,000 shifts when I measured it. Re-reading the code, I found I was rebuilding a Set of employee IDs inside the per-shift loop. Moving it out brought the time to 32.5 ms on the same benchmark. Second, a screenshot showed a shift from the previous Saturday night in this week's list, which looked like double counting. I worked the minutes out by hand (1963 minutes = 32.72 h) and confirmed only the hours after Sunday midnight were counted. The math was right but the UI was misleading, so I added an explanation under those shifts and a test for it.

**6. How did you test it, and how do you know the holiday logic is right?**
57 Jest tests in three layers: pure logic (overtime, overnight splits, workweek boundaries, invalid and overlapping shifts, break rounding), the API handlers (status codes, validation, CORS, ignoring client-sent rates, request size cap), and the screen with React Native Testing Library (loading, editing a shift updates overtime, the server check, error and retry, week navigation). For holidays I didn't rely on my own tests alone. A script compares every observed date from 2021 to 2099 against the open-source `holidays` Python package, and all 869 matched. GitHub Actions runs typecheck, tests and the web build on every push.

**7. What would you change to ship this to real customers?**
A database and authentication, so edits persist and each business only sees its own staff. Real time zones (the current wall-clock approach is off by an hour across a DST change). Configurable policies: state holidays, daily overtime for states like California, and whether the holiday premium counts toward overtime. A development build and store release through EAS, plus tests on real devices. And measuring production latency, which I haven't done yet.

**8. What are you least sure about?**
Three things, honestly. The app hasn't run on a physical iOS or Android device; I tested it in Jest's React Native environment and in Chromium through React Native Web. The Vercel functions haven't run on Vercel yet: the build environment couldn't reach vercel.com, so I compiled them to CommonJS and called them from plain Node to check they work, and deployment is a one-time import through Vercel's GitHub integration. And the payroll rules are simplified; for example, the holiday premium stacks on top of overtime, which errs toward overpaying.
