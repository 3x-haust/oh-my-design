# Probe applicability

Pass only when all are true:

- The copy deck declares exactly one Interaction scope: stateful, navigation-only, or static.
- A navigation-only portfolio runs `.omd/probes/primary.json` for project selection and
  records recovery copy/probe N/A with reasons. It does not invent an error, empty, or
  recovery screen.
- If the implementation adds genuine stateful behavior, both primary and recovery plans
  exist and both `omd probe` results are supplied.
- If the result is static, both probes are N/A with reasons and no interaction claim is made.
- Every eye interaction claim cites the applicable probe result.
