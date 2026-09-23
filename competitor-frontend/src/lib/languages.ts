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
    id: "c",
    label: "C",
    monaco: "c",
    starter: `#include <stdio.h>
#include <stdlib.h>

int main(void) {
    return 0;
}
`,
  },
  {
    id: "java",
    label: "Java",
    monaco: "java",
    starter: `import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner scanner = new Scanner(System.in);
    }
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
  {
    id: "rust",
    label: "Rust",
    monaco: "rust",
    starter: `use std::io::{self, Read};

fn main() {
    let mut input = String::new();
    io::stdin().read_to_string(&mut input).unwrap();
    let mut tokens = input.split_whitespace();

    // Solution here
}
`,
  },
];

export const LANGUAGE_OPTIONS = LANGUAGES.map((lang) => ({
  value: lang.id,
  label: lang.label,
}));

const LANGUAGE_ALIASES: Record<string, string> = {
  "c++": "cpp",
  "g++": "cpp",
  py: "python",
  python3: "python",
  javascript: "js",
  node: "js",
  rs: "rust",
};

export function getLanguage(languageId: string): Language | undefined {
  const id = languageId.trim().toLowerCase();
  const normalizedId = LANGUAGE_ALIASES[id] ?? id;
  return LANGUAGES.find((language) => language.id === normalizedId);
}

export function normalizeLanguageId(languageId: string): string {
  return getLanguage(languageId)?.id ?? languageId;
}
