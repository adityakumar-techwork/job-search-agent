// Set up test environment variables before any test runs.
// These are fake-but-format-valid values — never real credentials.
process.env['DATABASE_URL'] = process.env['DATABASE_URL'] ?? 'postgresql://user:password@localhost:5432/test_db';
process.env['LLM_API_KEY'] = 'test-gemini-key-for-unit-tests';
delete process.env['CLAUDE_API_KEY'];
delete process.env['GEMINI_API_KEY'];
// Any LLM call a test forgets to mock fails fast against a closed local port instead of
// reaching Google with a fake key.
process.env['LLM_API_BASE_URL'] = 'http://127.0.0.1:9';
process.env['RECIPIENT_EMAIL'] = 'test@example.com';
process.env['RESUME_BASE64'] = 'dGVzdA=='; // bypasses RESUME_PATH file existence check
process.env['RESUME_PATH'] = './resume.pdf';
process.env['NODE_ENV'] = 'test';
