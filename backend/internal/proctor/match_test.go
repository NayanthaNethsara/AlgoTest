package proctor

import "testing"

// These cases mirror the tests in the agent's signals/processes.rs. The two
// implementations run over different inputs but share one organizer-edited term
// list, so a term that matches on one side must match on the other.
func TestMatchesTerm(t *testing.T) {
	tests := []struct {
		candidate string
		term      string
		want      bool
		why       string
	}{
		// The runtimes the denylist exists to catch.
		{"ai.ollama", "ai.ollama", true, "exact bundle id"},
		{"com.ollama.app", "ollama", true, "term as one path component"},
		{"Ollama", "ollama", true, "case-insensitive"},
		{"/usr/local/bin/ollama serve", "ollama", true, "inside a path"},
		{"python -m vllm.entrypoints.openai.api_server", "vllm", true, "dotted module path"},
		{"/opt/llama.cpp/main", "llama.cpp", true, "dotted term"},
		{"/Applications/LM Studio.app", "lm studio", true, "two-word term"},
		{"text-generation-webui/server.py", "text-generation-webui", true, "hyphenated term"},

		// The bug this replaces. Substring matching fired on any command line
		// containing the letters, including a contestant's own home directory.
		{"/home/janith/code/solution", "jan", false, "a contestant's name is not a runtime"},
		{"/Users/Janaka/.cargo/bin/cargo", "jan", false, "nor is another one"},
		{"janitor-daemon", "jan", false, "nor a prefix of an unrelated word"},

		// Cloud AI and Copilot tools
		{"node ~/.vscode/extensions/github.copilot-1.250.0/dist/copilot-agent.js", "copilot-agent", true, "copilot agent subprocess"},
		{"/Applications/Cursor.app/Contents/MacOS/Cursor", "cursor", true, "cursor binary"},
		{"claude --model claude-3-5-sonnet", "claude", true, "claude code cli"},
		{"aider --yes", "aider", true, "aider cli"},

		// Multi-word terms must appear whole and in order.
		{"studio-display-helper", "lm studio", false, "partial term"},
		{"studio lm", "lm studio", false, "order matters"},
		{"llama-farm/cpp-tools", "llama.cpp", false, "both tokens present but not adjacent"},

		// A typo in an editable table must not become a match-everything rule.
		{"ollama serve", "-", false, "punctuation-only term"},
		{"ollama serve", "", false, "empty term"},
		{"lm", "lm studio", false, "term longer than candidate"},
	}

	for _, tt := range tests {
		got := matchesTerm(tokenize(tt.candidate), tokenize(tt.term))
		if got != tt.want {
			t.Errorf("matchesTerm(%q, %q) = %v, want %v — %s", tt.candidate, tt.term, got, tt.want, tt.why)
		}
	}
}

func TestMatchForegroundReturnsTheMatchedCandidate(t *testing.T) {
	denylist := []string{"ai.ollama", "lmstudio"}

	t.Run("matches the focused app", func(t *testing.T) {
		if got := matchForeground("ai.ollama", nil, denylist); got != "ai.ollama" {
			t.Errorf("matchForeground = %q, want ai.ollama", got)
		}
	})

	t.Run("matches an app seen only in the dwell window", func(t *testing.T) {
		dwell := map[string]int64{"com.lmstudio.app": 4000}
		if got := matchForeground("com.apple.Terminal", dwell, denylist); got != "com.lmstudio.app" {
			t.Errorf("matchForeground = %q, want com.lmstudio.app", got)
		}
	})

	t.Run("an innocent editor is not a match", func(t *testing.T) {
		dwell := map[string]int64{"com.microsoft.VSCode": 900000}
		if got := matchForeground("com.apple.Terminal", dwell, denylist); got != "" {
			t.Errorf("matchForeground = %q, want no match", got)
		}
	})

	t.Run("an empty denylist matches nothing", func(t *testing.T) {
		if got := matchForeground("ai.ollama", nil, nil); got != "" {
			t.Errorf("matchForeground = %q, want no match", got)
		}
	})
}

func TestMatchUnauthorizedForeground(t *testing.T) {
	allowlist := []string{"com.microsoft.vscode", "chrome", "terminal"}

	t.Run("allows whitelisted focused app", func(t *testing.T) {
		if got := matchUnauthorizedForeground("com.microsoft.VSCode", nil, allowlist); got != "" {
			t.Errorf("matchUnauthorizedForeground = %q, want empty (allowed)", got)
		}
	})

	t.Run("flags unauthorized focused app", func(t *testing.T) {
		if got := matchUnauthorizedForeground("com.discord", nil, allowlist); got != "com.discord" {
			t.Errorf("matchUnauthorizedForeground = %q, want com.discord", got)
		}
	})

	t.Run("flags unauthorized app in dwell history", func(t *testing.T) {
		dwell := map[string]int64{"com.slack.Slack": 5000}
		if got := matchUnauthorizedForeground("com.microsoft.VSCode", dwell, allowlist); got != "com.slack.Slack" {
			t.Errorf("matchUnauthorizedForeground = %q, want com.slack.Slack", got)
		}
	})

	t.Run("empty allowlist permits all applications", func(t *testing.T) {
		if got := matchUnauthorizedForeground("com.discord", nil, nil); got != "" {
			t.Errorf("matchUnauthorizedForeground = %q, want empty (disabled allowlist)", got)
		}
	})

	t.Run("unknown app identifier is ignored", func(t *testing.T) {
		if got := matchUnauthorizedForeground("unknown", nil, allowlist); got != "" {
			t.Errorf("matchUnauthorizedForeground = %q, want empty for unknown", got)
		}
	})
}
