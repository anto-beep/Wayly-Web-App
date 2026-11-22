# Wayly — Phase 1+2+3 Redeploy Verification
Lighthouse comparison: Phase 0 (pre-fix) vs Phase 1 (post-redeploy, code-split live).

| URL | Form | Perf Before → After | Δ | LCP Before → After | A11y | BP | SEO |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/` | mobile | 53 → **56** | +3 | 6.0s → **4.2s** | 92 | 82 | 100 |
| `/` | desktop | 32 → **37** | +5 | 6.2s → **4.4s** | 92 | 81 | 100 |
| `/features` | mobile | 56 → **63** | +7 | 6.1s → **5.0s** | 99 | 82 | 100 |
| `/features` | desktop | 34 → **43** | +9 | 6.1s → **5.1s** | 96 | 81 | 100 |
| `/pricing` | mobile | 56 → **69** | +13 | 6.6s → **4.7s** | 99 | 82 | 100 |
| `/pricing` | desktop | 35 → **42** | +7 | 6.1s → **5.1s** | 99 | 81 | 100 |
| `/ai-tools/statement-decoder` | mobile | 56 → **68** | +12 | 6.2s → **5.2s** | 91 | 82 | 100 |
| `/ai-tools/statement-decoder` | desktop | 39 → **43** | +4 | 6.4s → **5.2s** | 91 | 81 | 100 |
| `/ai-tools/budget-calculator` | mobile | 60 → **71** | +11 | 6.5s → **5.0s** | 96 | 82 | 100 |
| `/ai-tools/budget-calculator` | desktop | 37 → **46** | +9 | 6.6s → **5.0s** | 96 | 81 | 100 |
| `/resources/articles` | mobile | 60 → **68** | +8 | 5.7s → **5.2s** | 99 | 82 | 100 |
| `/resources/articles` | desktop | 38 → **44** | +6 | 6.9s → **5.5s** | 99 | 81 | 100 |
| `/resources/articles/support-at-home-statement` | mobile | 55 → **63** | +8 | 6.0s → **5.4s** | 100 | 82 | 100 |
| `/resources/articles/support-at-home-statement` | desktop | 33 → **39** | +6 | 6.5s → **5.6s** | 100 | 81 | 100 |
| `/resources/articles/wayly-statement-decoder-support-at-home-statement-explained` | mobile | 56 → **63** | +7 | 6.3s → **5.5s** | 99 | 82 | 100 |
| `/resources/articles/wayly-statement-decoder-support-at-home-statement-explained` | desktop | 33 → **40** | +7 | 6.6s → **5.5s** | 99 | 81 | 100 |

**Average Performance gain:** +7.6 points across 16 runs
**Average LCP improvement:** 1.19s faster across 16 runs
