// Tests scan local fixture servers on 127.0.0.1, which the scanner normally refuses (SSRF guard).
// Individual tests that check the guard itself switch this off again.
process.env.SCAN_ALLOW_PRIVATE_TARGETS = "true";
process.env.SCAN_AUTHORIZED_HOSTS = "";
