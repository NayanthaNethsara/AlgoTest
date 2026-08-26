import type { Language } from "@/types/code";

export const LANGUAGES: Language[] = [
  {
    id: "cpp",
    label: "C++",
    monaco: "cpp",
    starter: `#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    return 0;
}
`,
  },
  {
    id: "python",
    label: "Python",
    monaco: "python",
    starter: `import sys
input = sys.stdin.readline


def main():
    pass


if __name__ == "__main__":
    main()
`,
  },
  {
    id: "js",
    label: "JavaScript",
    monaco: "javascript",
    starter: `const fs = require('fs');

function main() {
    const input = fs.readFileSync('/dev/stdin', 'utf-8');
}

main();
`,
  },
];
