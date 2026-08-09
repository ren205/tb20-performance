# Verification

Two Node scripts that check the transcribed POH data and the pure maths.
They import `verify_core.js`, which is the app's own data and functions with
the DOM stripped out — so they test the shipping code, not a copy of it.

    node test/verify-tables.js     # every tabulated POH cell, plus a physics cross-check
    node test/verify-logic.js      # monotonicity, units, atmosphere, navigation, W&B

`verify_core.js` is generated from `src/`. Regenerate it after changing the
data or the maths, otherwise the tests check a stale snapshot.

The factor arithmetic and the fuel chain are checked in the browser instead,
since they depend on the DOM; see the session notes in the repository history.
