**ShiftCheck** | React Native (Expo), TypeScript, Vercel Serverless Functions, Jest, GitHub Actions | Live: _pending Vercel import_ | Code: https://github.com/nealwillis/Special

- Built a cross-platform React Native (Expo, TypeScript) app to calculate weekly regular hours, FLSA overtime and federal holiday pay for a small team, and a REST API on Vercel serverless functions that recomputed totals with server-side pay rates and confirmed the phone's numbers to the cent.
- Wrote 57 Jest tests covering overnight shifts, workweek boundaries and invalid input, run in GitHub Actions on every push; validated the holiday engine against an independent library (869 of 869 dates from 2021 to 2099) and cut calculation time for 9,840 shifts from 48.3 ms to 32.5 ms.
