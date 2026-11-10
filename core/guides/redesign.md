# A redesign

A redesign changes how a product looks and is organised for people who already use it. Its first duty is to
lose nothing they rely on.

1. **Baseline every screen.** With the product running as it is: `omd studio baseline <url> <url> ...` for
   every screen the work touches. Each is saved under `.omd/studio/baseline/<screen>/` with desktop and phone
   captures and a record of its controls and the routes it leads to.
2. **Keep / change ledger.** Write `.omd/studio/ledger.json` before changing anything:
   `{"keep": ["the mark and its green", "every route", "the order of the table's columns", "the export
   format"], "change": [{"what": "Advanced filters", "to": "a filter bar above the table", "because": "the
   filters were three clicks away from the list they filter"}]}`. Keep the product's equity (mark, colours,
   names people know), its routes, behaviour and data contracts. Each change names the control or route in
   the old screen's own words, what replaces it, and the problem it solves for the person using it.
3. **Redesign the system, then the screens.** Follow `guides/product.md` for the system file and states.
   Diagnose the old screens first: say what is wrong in terms of hierarchy, density, grouping and flow, not
   in terms of style.
4. **Same screen, before and after.** `omd studio check --mode redesign [--origin http://localhost:71xx]`
   opens every baseline screen at the same route, writes old beside new to `.omd/studio/redesign/`, and
   fails when a control or route from the old screen is gone and the ledger does not record the change.
   Look at every pair: the new one must be better at the same job, at the same size, on the same data.
5. **Flow regression.** Walk each flow in the brief on the new build, start to finish, in a real browser.
