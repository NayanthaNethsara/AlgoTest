package scenarios

import (
	"strings"
)

type PayloadCategory string

const (
	CategoryCorrect      PayloadCategory = "AC"
	CategoryInfiniteLoop PayloadCategory = "TLE"
	CategoryMemoryHog    PayloadCategory = "MLE"
	CategoryCrash        PayloadCategory = "RTE"
	CategoryCompileError PayloadCategory = "CE"
	CategoryWrongAnswer  PayloadCategory = "WA"
)

type CodePayload struct {
	Language        string
	Category        PayloadCategory
	ExpectedVerdict string
	Code            string
	Description     string
}

func GetSubmissionPayloadMix() []CodePayload {
	return []CodePayload{
		// 1. Correct (AC) - C++
		{
			Language:        "cpp",
			Category:        CategoryCorrect,
			ExpectedVerdict: "AC",
			Description:     "Correct C++ Sum Solution",
			Code: `#include <iostream>
using namespace std;
int main() {
    int n;
    if (!(cin >> n)) return 0;
    long long sum = 0;
    for (int i = 0; i < n; i++) {
        long long val;
        cin >> val;
        sum += val;
    }
    cout << sum << "\n";
    return 0;
}`,
		},
		// 2. Infinite Loop (TLE) - C++
		{
			Language:        "cpp",
			Category:        CategoryInfiniteLoop,
			ExpectedVerdict: "TLE",
			Description:     "Infinite while loop (CPU saturation)",
			Code: `#include <iostream>
using namespace std;
int main() {
    volatile long long counter = 0;
    while (true) {
        counter++;
    }
    return 0;
}`,
		},
		// 3. Memory Limit Exceeded (MLE) - C++
		{
			Language:        "cpp",
			Category:        CategoryMemoryHog,
			ExpectedVerdict: "MLE",
			Description:     "500MB memory allocation exceeding 256MB sandbox limit",
			Code: `#include <vector>
#include <iostream>
using namespace std;
int main() {
    vector<char> memoryHog(500ULL * 1024 * 1024, 1);
    cout << memoryHog.size() << "\n";
    return 0;
}`,
		},
		// 4. Runtime Error (RTE) - C++
		{
			Language:        "cpp",
			Category:        CategoryCrash,
			ExpectedVerdict: "RTE",
			Description:     "Divide by zero runtime exception",
			Code: `#include <iostream>
using namespace std;
int main() {
    volatile int denominator = 0;
    int crash = 100 / denominator;
    cout << crash << "\n";
    return 0;
}`,
		},
		// 5. Compilation Error (CE) - C++
		{
			Language:        "cpp",
			Category:        CategoryCompileError,
			ExpectedVerdict: "CE",
			Description:     "Syntax error causing compilation failure",
			Code: `int main() {
    this_is_an_intentional_syntax_error_not_valid_cpp !!;
}`,
		},
		// 6. Wrong Answer (WA) - C++
		{
			Language:        "cpp",
			Category:        CategoryWrongAnswer,
			ExpectedVerdict: "WA",
			Description:     "Hardcoded incorrect sum",
			Code: `#include <iostream>
using namespace std;
int main() {
    cout << "-99999999\n";
    return 0;
}`,
		},
		// 7. Correct (AC) - Python
		{
			Language:        "python",
			Category:        CategoryCorrect,
			ExpectedVerdict: "AC",
			Description:     "Correct Python Sum Solution",
			Code: `import sys
data = sys.stdin.read().split()
if data:
    n = int(data[0])
    nums = [int(x) for x in data[1:n+1]]
    print(sum(nums))
`,
		},
		// 8. Infinite Loop (TLE) - Python
		{
			Language:        "python",
			Category:        CategoryInfiniteLoop,
			ExpectedVerdict: "TLE",
			Description:     "Python infinite while loop",
			Code: `x = 0
while True:
    x += 1
`,
		},
		// 9. Memory Limit Exceeded (MLE) - Python
		{
			Language:        "python",
			Category:        CategoryMemoryHog,
			ExpectedVerdict: "MLE",
			Description:     "Python 600MB bytearray allocation",
			Code: `b = bytearray(600 * 1024 * 1024)
print(len(b))
`,
		},
		// 10. Runtime Error (RTE) - Python
		{
			Language:        "python",
			Category:        CategoryCrash,
			ExpectedVerdict: "RTE",
			Description:     "Python ZeroDivisionError",
			Code: `x = 100 / 0
print(x)
`,
		},
	}
}

func SelectPayload(index int, mode string, defaultLang string) CodePayload {
	mix := GetSubmissionPayloadMix()
	if strings.ToLower(mode) == "mixed" || mode == "" {
		return mix[index%len(mix)]
	}

	// Filter by specific category or language if requested
	for _, p := range mix {
		if strings.EqualFold(string(p.Category), mode) || strings.EqualFold(p.ExpectedVerdict, mode) {
			return p
		}
	}

	return mix[0]
}
