# DECISIONS

Written before any code, then appended to as the build went. Dated lines are the running log.

## Target role

Intern, Mobile Applications Development (The Talent Curator, Jersey City NJ / Remote, Summer 2027).
The company sells HR and workforce management services to small businesses.

## Top technical requirements from the posting

1. **Cross-platform mobile development**: React Native (JavaScript/TypeScript) or Flutter, building iOS and Android features.
2. **API integration**: connect a mobile front end to cloud-based REST APIs.
3. **Testing and code quality**: clean, well-tested code, automated test cases, finding and fixing bugs.
4. **Development tools**: mobile deployment pipelines (CI), RESTful APIs, Git.
5. **Technical documentation**: documented code base, user flows, and testing procedures.

Domain hint: "mobile solutions that empower small businesses and workforce management."

## Three project ideas

| # | Idea | Req 1 | Req 2 | Req 3 | Req 4 | Req 5 | One-day + deployable? |
|---|------|-------|-------|-------|-------|-------|------------------------|
| A | **ShiftCheck**: Expo (React Native + TypeScript) app where a small-business manager reviews a week of employee shifts and sees regular hours, overtime (FLSA 40-hour week), federal holiday hours and gross pay. Backed by a small REST API on Vercel serverless functions. | Yes | Yes (own REST API, GET + POST) | Yes (pure, testable payroll logic with edge cases) | Yes (GitHub Actions + Vercel Git deploys) | Yes | Yes. Expo exports to web for a live URL; same code runs in Expo Go on iOS/Android. |
| B | Flutter job-search tracker over a public jobs API (USAJOBS or Adzuna). | Yes | Yes (real third-party API) | Partly (mostly UI glue, little core logic to test) | Yes | Yes | Risky. Both APIs need registered keys, the Flutter SDK is a large install, and this build environment blocks most outbound hosts. |
| C | Native SwiftUI PTO-request app. | Native iOS only | Possible | Yes | Weak | Yes | No. Xcode does not run on Linux, so it can't be built, tested in CI, or deployed from here. |

## Pick: A (ShiftCheck)

- Hits all five requirements. B and C each miss or weaken one or more.
- Matches the company's domain (workforce management for small businesses) without pretending to be their product.
- The core logic (overtime, overnight shifts, holiday observance rules) has real edge cases. That gives the tests something real to catch, which is what an interviewer will probe.
- **Data:** the US federal holiday calendar comes from the rules in 5 U.S.C. 6103 (real, computed, no API key). The employee roster and shifts are **synthetic**, generated from a fixed seed, and labeled synthetic in the API response, the UI and the README.

## Stack

- The posting names React Native (TS) or Flutter. I chose **React Native via Expo, in TypeScript**: it's one of the two named options, TypeScript lets the same payroll module run on the phone and in the API, and Expo's web export gives a live URL an interviewer can open without installing anything.
- **Backend:** Vercel serverless functions in `/api`, in the same repo and language. No database (see log).
- **Tests:** Jest (`jest-expo` preset) for the core logic, the API handlers and a screen render test.
- **CI:** GitHub Actions runs typecheck, tests and the web build on every push and PR.

## Log

All entries 2026-10-26 (the build day).

### Tradeoffs

- 2026-10-26: **Expo vs bare React Native CLI.** Chose Expo: the same TypeScript runs in Expo Go on iOS and Android with no Xcode or Android Studio, and `expo export --platform web` produces the static site Vercel hosts. Cost: native modules outside the Expo SDK would need a development build.
- 2026-10-26: **Single screen with `useState` vs Expo Router.** The template recommends Expo Router, but the app has one screen and no deep links. Router would add file-based routing and dependencies for nothing. I'd add it when a second screen (for example, an employee detail page) exists.
- 2026-10-26: **Where the pay math runs: phone only, server only, or both.** Chose both, from one shared module (`src/core`). The phone recalculates instantly as you edit a shift. "Check totals with server" posts the shifts, and the server recomputes using its own roster and pay rates, so a client can't send a higher rate. Server-only would mean a network round trip for every edit. Phone-only means trusting the client with payroll.
- 2026-10-26: **Wall-clock strings + `Date.UTC` vs real time zones (Temporal, Luxon).** Shifts are `YYYY-MM-DDTHH:mm` with no zone, and all math goes through `Date.UTC`. Results are identical on a phone in New Jersey, a CI runner in UTC and a Vercel function anywhere. Cost: a shift that crosses a DST change is off by an hour (listed in Known limitations).
- 2026-10-26: **Money as integer cents, rounded once per employee-week** vs floats or rounding per shift. Rounding per shift can drift by a cent or more over a week; rounding once keeps the error under half a cent per person per week.
- 2026-10-26: **Unpaid break on a shift that crosses midnight.** Options: charge the whole break to the first day, or spread it by length. Chose spreading by length, with largest-remainder rounding so the whole minutes always add back to the exact break. Charging it all to one day would shift holiday hours depending on which side of midnight the break fell.
- 2026-10-26: **Holiday hours count on the observed date** (e.g. Fri Jul 3, 2026) rather than the statutory date (Sat Jul 4). This matches how a Monday to Friday business gives the day off. Someone who works the actual Saturday gets no premium. That's a policy choice, and it's documented.
- 2026-10-26: **Holiday premium stacks on top of overtime** vs crediting it toward overtime (29 CFR 778.203). Stacking is simpler and errs toward overpaying. A real payroll engine would make this configurable.
- 2026-10-26: **Compute federal holidays from the statute vs call a holiday API (Nager.Date).** Computing needs no key, has no runtime dependency and works offline. The build environment's network policy also blocked Nager.Date. To get the independent check an API would have given, I compared against the `holidays` Python package (see Measured).
- 2026-10-26: **No database; deterministic synthetic generator.** A seeded PRNG (mulberry32 keyed on the week) means the same week always returns the same shifts, so the client preview and server check can be compared and GET responses can be CDN-cached. Cost: edits aren't saved, and reloading resets them.
- 2026-10-26: **Vercel serverless functions in this repo vs a Fly.io backend.** Vercel gives one deploy, one language and one repo, and nothing to keep running. Fly.io would make sense with a database or long-lived connections, and this project has neither.
- 2026-10-26: **Handlers take a Web `Request` and return a `Response`** instead of using Express. The same functions run in Vercel, in the local server (`scripts/serve.ts`) and directly in Jest with no HTTP mocking.
- 2026-10-26: **Overlapping shifts: reject the later one** vs merging them. Merging would hide a data-entry mistake. Rejecting shows it in the UI ("needs fixing") without double-counting hours.
- 2026-10-26: **Hand-written number and date formatting** vs `Intl`. The output is identical on Hermes, React Native Web and Node, so tests assert exact strings.

### Things that broke or gave a wrong result

- 2026-10-26: **Every screen test failed (5 of 5)** with "`render` function has not been called". Found by running `jest`. Cause: React Native Testing Library v14 made `render` and `fireEvent` async, so the tests queried the screen before it existed. Fix: `await render(...)` and `await fireEvent.press(...)`. After the fix one test still failed with "Found multiple elements with text /h overtime/", because two synthetic employees have overtime. I changed it to read the screen's Overtime total via its accessibility label.
- 2026-10-26: **A correct number looked wrong.** The Playwright screenshot showed Morgan Lee's list including "Sat Nov 21, 10:00 PM to Sun 6:45 AM", a shift that started in the previous week. It looked like double counting. I checked by hand: 382 + 465 + 480 + 495 + 141 = 1963 minutes = 32.72 h, and only the 405 minutes after Sunday midnight (minus 23 minutes of prorated break) count this week, so the math was right. The UI wasn't, so I added notes ("Started last week...", "Runs past Saturday midnight...") and a test for them.
- 2026-10-26: **Slow engine.** The first measurement was 48.3 ms median for 9,840 shifts. On re-reading the code, `computeTimesheet` rebuilt `new Set(employeeIds)` for every shift (O(shifts x employees)). Hoisting it out of the loop brought the median to 32.5 ms, measured with the same script.
- 2026-10-26: **TypeScript 6 broke the typecheck in two places.** (1) `tsc` reported "Cannot find name 'describe'" across every test file because TS 6 no longer loads all `@types` packages by default. Fix: `"types": ["jest", "node"]`. (2) Compiling `/api` as CommonJS (to copy what Vercel does) failed with TS5011 (needs `rootDir`) and TS5107 (`moduleResolution: node` deprecated). Fix: a separate `api/tsconfig.json` with `NodeNext`. I then required the compiled functions from plain Node and called them.
- 2026-10-26: **Stale compiled JS almost shipped.** Reviewing `git status` before the first commit, I found six `.js` files next to the `.ts` sources in `src/core` and `src/server`. Their timestamps matched my first, failed `tsc -p api/tsconfig.json` run: TS 6 had emitted files outside the config's root next to their sources. Node resolves `.js` before `.ts`, so after the next edit Vercel would have loaded the old logic while the tests passed against the new code. Fix: `outDir: ../.api-build` (gitignored) in `api/tsconfig.json` so a stray compile can never land beside the sources, `src/**/*.js` and `api/**/*.js` in `.gitignore`, files deleted, and the 57 tests re-run without them.
- 2026-10-26: **Blocked hosts in the build environment.** `npx expo install` (which calls api.expo.dev), docs.expo.dev, date.nager.at and vercel.com were all denied by the environment's network policy. I took SDK-compatible versions from `node_modules/expo/bundledNativeModules.json`, computed holidays locally, and set deployment up through Vercel's GitHub integration instead of the CLI.

### Measured (all real runs, 2026-10-26, Node 22 in the build container)

- 2026-10-26: **57 tests** in 5 suites (core logic, API handlers, screen) pass in about 1.2 s. `npm ci` + typecheck + tests + web build all pass from a clean install.
- 2026-10-26: **Holiday accuracy: 869 of 869** observed federal holiday dates from 2021 through 2099 match the independent `holidays` Python package (v0.107), via `scripts/check_holidays.py`. Also 44 of 44 against a hand-entered table of OPM's 2024-2027 schedules (in the test suite).
- 2026-10-26: **Engine speed:** 9,840 synthetic shifts (48 employees, 52 weeks) in **32.5 ms median**, 38.2 ms p95 over 25 runs (`npm run measure`). Was 48.3 ms before the Set fix.
- 2026-10-26: **API latency on localhost:** GET /api/week p50 1.2 ms, POST /api/timesheet p50 1.2 ms over 200 sequential requests. This is local handler time with no internet in the path, not production latency. Run `BASE_URL=<deployed url> npm run measure` for production numbers.
- 2026-10-26: **Web bundle:** 414 KB raw, 123 KB gzipped.
