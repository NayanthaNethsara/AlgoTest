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
    id: "java",
    label: "Java",
    monaco: "java",
    starter: `import java.util.*;
import java.io.*;

public class Main {
    public static void main(String[] args) throws IOException {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
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
];
