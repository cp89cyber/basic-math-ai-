# Basic Math AI

Very small browser app that learns arithmetic guesses from binary feedback.

## Run locally

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000` in a browser.

## How it works

- Enter a problem like `2+2`, `9-4`, `3*7`, or `8/2`.
- The learner generates one answer at a time.
- Mark each answer `Wrong` or `Right`.
- When a guess is marked right, the app stores that exact problem and updates its operator-specific hypothesis weights.
- Learning persists in `localStorage`, so refreshes keep prior progress.

## Scope

- Supported operators: `+`, `-`, `*`, `/`
- Inputs must be signed integers.
- Division by zero is rejected.
- Division must resolve to a whole number in this version.

This is a toy learner, not a real ML model. It combines exact-problem memory with a fixed library of weighted arithmetic hypotheses.
