package runner

// Verdict represents the formal outcome of sandboxed code execution or test grading.
type Verdict string

const (
	VerdictAC  Verdict = "AC"  // Accepted / Exited zero
	VerdictWA  Verdict = "WA"  // Wrong Answer
	VerdictTLE Verdict = "TLE" // Time Limit Exceeded
	VerdictMLE Verdict = "MLE" // Memory Limit Exceeded
	VerdictRE  Verdict = "RE"  // Runtime Error / Non-zero Exit
	VerdictCE  Verdict = "CE"  // Compile Error
	VerdictOLE Verdict = "OLE" // Output Limit Exceeded
	VerdictIE  Verdict = "IE"  // Internal Sandbox Error
	VerdictSK  Verdict = "SK"  // Skipped (budget exhausted)
)
