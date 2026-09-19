"""Exercise the installed scanner; fixture text is never executed or a real credential."""

from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from codex_plugin_scanner.checks.code_quality import check_no_eval, check_no_shell_injection
from codex_plugin_scanner.checks.security import check_no_hardcoded_secrets


class ScannerRegressions(unittest.TestCase):
    def check_text(self, check, content, expected):
        with TemporaryDirectory(prefix="omd-scanner-canary-") as directory:
            root = Path(directory)
            (root / "surface.ts").write_text(content, encoding="utf-8")
            result = check(root)
            self.assertEqual(result.passed, expected, result.name)
            if not expected:
                self.assertTrue(result.findings)
                self.assertTrue(any(f.severity.value == "high" for f in result.findings))

    def test_task_identifier_is_not_a_provider_secret(self):
        self.check_text(check_no_hardcoded_secrets,
                        "const schema = 'task-flow-benchmark-projection-v1';", True)

    def test_provider_shaped_credential_still_fails(self):
        # Generated test data, not issued by any provider; never contact a provider.
        from secrets import token_hex
        candidate = "sk-" + token_hex(24)
        self.check_text(check_no_hardcoded_secrets,
                        "const credential = '" + candidate + "';", False)

    def test_regexp_matching_is_not_shell_execution(self):
        self.check_text(check_no_shell_injection,
                        "const record = text(value, `${label}.record`);\n"
                        "const match = RECORD.exec(record);", True)

    def test_shell_interpolation_still_fails(self):
        self.check_text(check_no_shell_injection,
                        "import { exec } from 'node:child_process';\n"
                        "exec(`command ${userInput}`);", False)

    def test_dynamic_execution_still_fails(self):
        self.check_text(check_no_eval, "eval(userInput);", False)
        self.check_text(check_no_eval, "new Function(userInput);", False)


if __name__ == "__main__":
    unittest.main()
