import type { LanguageDoc } from "./types";

export const C_DOC: LanguageDoc = {
  slug: "c",
  name: "C",
  version: "GCC 13 (C17)",
  iconName: "c",
  summary:
    "Competitive programming guide for C: standard I/O (scanf/printf), qsort comparator, memory management, math library, and string handling.",
  topics: [
    {
      id: "compile-and-run",
      title: "How to Compile & Run (Windows, Linux, macOS)",
      summary:
        "Compiler invocation flags, linking the math library (-lm), and running with redirected files.",
      items: [
        {
          id: "c-cli-linux-mac",
          name: "1. Linux & macOS",
          syntax: `# 1. Install gcc (Ubuntu / Debian):
sudo apt update && sudo apt install -y build-essential gcc

# 2. Compile with optimizations and math library link:
gcc -O2 -std=c17 -Wall -Wextra main.c -o main -lm

# 3. Execute with input file:
./main < input.txt

# 4. Measure execution time:
time ./main < input.txt > output.txt`,
          description:
            "Standard terminal commands. Always include -lm when using math functions from <math.h>.",
        },
        {
          id: "c-cli-windows",
          name: "2. Windows (PowerShell & Command Prompt)",
          syntax: `# --- Windows Command Prompt (cmd.exe) ---
# Compile:
gcc -O2 -std=c17 -Wall main.c -o main.exe
# Run with input redirection:
main.exe < input.txt > output.txt

# --- Windows PowerShell ---
# Compile:
gcc -O2 -std=c17 -Wall main.c -o main.exe
# Run with piped input:
Get-Content input.txt | .\\main.exe`,
          description:
            "Windows execution with MinGW-w64 gcc.",
        },
        {
          id: "c-cli-judge",
          name: "3. Judge Sandbox Evaluation Command",
          syntax: `# The exact command used by the Labyrithm evaluation sandbox:
gcc -O2 -std=c17 -o main main.c -lm
./main  # (stdin piped in isolated Linux cgroup)`,
          description:
            "Compiled with -O2 optimization and standard C17 compliance.",
        },
      ],
    },
    {
      id: "io",
      title: "Standard Input / Output (scanf & printf)",
      summary: "Format specifiers, EOF reading loops, fast line reading, and character I/O.",
      items: [
        {
          id: "c-format-specifiers",
          name: "Common Format Specifiers",
          syntax: `int a;
long long b;
double c;
char d;
char str[100];

// Reading:
scanf("%d %lld %lf %c %s", &a, &b, &c, &d, str);

// Writing:
printf("%d %lld %.6lf %c %s\\n", a, b, c, d, str);`,
          description:
            "Always pass memory addresses (&variable) to scanf for primitive types (strings are already pointers).",
        },
        {
          id: "c-eof-loop",
          name: "Reading Until End of File (EOF)",
          syntax: `#include <stdio.h>

int main(void) {
    int x;
    // Loop until standard input reaches EOF:
    while (scanf("%d", &x) == 1) {
        printf("Read: %d\\n", x);
    }
    return 0;
}`,
          description:
            "Standard competitive programming loop when total number of test cases is unspecified.",
        },
      ],
    },
    {
      id: "sorting",
      title: "Sorting with qsort()",
      summary: "Standard C library quicksort using custom comparator functions.",
      items: [
        {
          id: "c-qsort-ints",
          name: "Sorting Integers (Ascending & Descending)",
          syntax: `#include <stdio.h>
#include <stdlib.h>

// Ascending comparator:
int cmp_asc(const void* a, const void* b) {
    int x = *(const int*)a;
    int y = *(const int*)b;
    if (x < y) return -1;
    if (x > y) return 1;
    return 0;
}

// Descending comparator:
int cmp_desc(const void* a, const void* b) {
    return cmp_asc(b, a);
}

int main(void) {
    int arr[] = {5, 2, 9, 1, 5, 6};
    int n = sizeof(arr) / sizeof(arr[0]);

    // Syntax: qsort(array, num_elements, element_size, comparator)
    qsort(arr, n, sizeof(int), cmp_asc);

    for (int i = 0; i < n; i++) printf("%d ", arr[i]);
    printf("\\n");
    return 0;
}`,
          description:
            "Standard qsort syntax. Use explicit < and > comparisons rather than (x - y) to avoid integer overflow bugs.",
        },
      ],
    },
    {
      id: "strings-memory",
      title: "Strings & Memory",
      summary: "String manipulation functions from <string.h> and dynamic memory allocation.",
      items: [
        {
          id: "c-string-helpers",
          name: "String Operations (<string.h>)",
          syntax: `#include <string.h>

char s1[100] = "hello";
char s2[100] = "world";

int len = strlen(s1);         // String length
strcpy(s1, s2);               // Copy s2 into s1
strcat(s1, s2);               // Concatenate s2 to s1
int cmp = strcmp(s1, s2);     // Returns 0 if equal, <0 if s1 < s2, >0 if s1 > s2

// Set buffer memory to zeroes:
memset(s1, 0, sizeof(s1));`,
          description:
            "Standard string functions operating on null-terminated character arrays.",
        },
      ],
    },
  ],
};
