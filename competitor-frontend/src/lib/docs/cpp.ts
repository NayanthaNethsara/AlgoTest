import type { LanguageDoc } from "./types";

export const CPP_DOC: LanguageDoc = {
  slug: "cpp",
  name: "C++",
  version: "GCC 13 (C++17)",
  iconName: "cpp",
  summary:
    "Core syntax, compilation commands, data types, operators, control flow, functions, and standard I/O references for C++17.",
  topics: [
    {
      id: "compile-and-run",
      title: "How to Compile & Run (Windows, Linux, macOS)",
      summary:
        "Platform-specific terminal commands to install compilers, compile, test with input files, and debug C++ code.",
      items: [
        {
          id: "cpp-cli-linux",
          name: "1. Linux (Ubuntu / Debian / Fedora / WSL)",
          syntax: `# 1. Install g++ compiler (Ubuntu / Debian):
sudo apt update && sudo apt install -y build-essential g++

# 2. Compile with competitive optimization flags:
g++ -O2 -std=c++17 -Wall -Wextra main.cpp -o main

# 3. Execute with input redirection:
./main < input.txt

# 4. Save output to file & benchmark time:
./main < input.txt > output.txt
time ./main < input.txt`,
          description:
            "Standard workflow for Linux terminals and Windows Subsystem for Linux (WSL).",
        },
        {
          id: "cpp-cli-windows",
          name: "2. Windows (PowerShell & Command Prompt)",
          syntax: `# Compiler Setup: Install MinGW-w64 or MSYS2 (add 'bin' folder to system PATH)

# --- Windows Command Prompt (cmd.exe) ---
# Compile:
g++ -O2 -std=c++17 -Wall main.cpp -o main.exe
# Run with input file:
main.exe < input.txt > output.txt

# --- Windows PowerShell ---
# Compile:
g++ -O2 -std=c++17 -Wall main.cpp -o main.exe
# Run in PowerShell (PowerShell uses Get-Content for piping):
Get-Content input.txt | .\\main.exe
# Or standard run:
.\\main.exe`,
          description:
            "Native Windows compilation using MinGW-w64 / MSYS2 via PowerShell and CMD.",
          notes: [
            "In PowerShell, '<' is reserved; pipe input using 'Get-Content input.txt | .\\main.exe' or switch to CMD.",
          ],
        },
        {
          id: "cpp-cli-macos",
          name: "3. macOS (Apple Silicon / Intel)",
          syntax: `# 1. Install Command Line Tools:
xcode-select --install

# 2. Or install GNU GCC via Homebrew for <bits/stdc++.h> support:
brew install gcc

# 3. Compile:
g++ -O2 -std=c++17 -Wall main.cpp -o main

# 4. Run with input redirection:
./main < input.txt > output.txt`,
          description:
            "Workflow for macOS Terminal using Xcode Command Line Tools or Homebrew GCC.",
        },
        {
          id: "cpp-cli-sanitizers",
          name: "4. Catching Segfaults & Bounds Bugs (AddressSanitizer)",
          syntax: `# Compile with Address & Undefined Behavior Sanitizers:
g++ -std=c++17 -fsanitize=address,undefined -g main.cpp -o debug_main

# Run with your test input:
./debug_main < input.txt`,
          description:
            "Sanitizers print exact source line numbers and memory traces when array out-of-bounds or segmentation faults occur.",
        },
        {
          id: "cpp-cli-judge",
          name: "5. Judge Sandbox Evaluation Command",
          syntax: `# How the MiniAlgothon judge compiles and runs your code in the sandbox:
g++ -O2 -std=c++17 -o main main.cpp
./main  # (stdin piped in isolated Linux cgroup)`,
          description:
            "The exact compilation pipeline used by the evaluation server.",
        },
      ],
    },
    {
      id: "syntax-structure",
      title: "Syntax & Program Structure",
      summary: "Basic syntax rules, boilerplate structure, and headers.",
      items: [
        {
          id: "cpp-boilerplate",
          name: "Main Program Structure",
          syntax: `#include <iostream>

int main() {
    std::cout << "Hello, World!" << "\\n";
    return 0;
}`,
          description:
            "Every C++ executable begins execution at the main() function and returns 0 on successful termination.",
        },
        {
          id: "cpp-comments",
          name: "Comments",
          syntax: `// Single-line comment

/* 
   Multi-line 
   comment block 
*/`,
          description:
            "Comments are ignored by the compiler and used for notes or disabling code.",
        },
        {
          id: "cpp-namespace",
          name: "Namespaces",
          syntax: `using namespace std; // Brings all std symbols into global scope

// Or access symbols explicitly:
std::vector<int> arr;
std::cin >> x;`,
          description:
            "Prevents naming collisions by organizing code into named scopes.",
        },
      ],
    },
    {
      id: "data-types",
      title: "Data Types & Variables",
      summary: "Primitive types, type modifiers, and variable declarations.",
      items: [
        {
          id: "cpp-primitives",
          name: "Primitive Types",
          syntax: `int age = 25;                  // 32-bit integer (-2*10^9 to 2*10^9)
long long bigNum = 1e18;       // 64-bit integer (-9*10^18 to 9*10^18)
double price = 19.99;          // 64-bit floating point number
char letter = 'A';             // Single 8-bit character
bool isActive = true;          // Boolean (true or false)
std::string text = "Hello";    // String of characters`,
          description:
            "C++ is statically typed. Variables must be declared with their type before use.",
        },
        {
          id: "cpp-type-casting",
          name: "Type Casting",
          syntax: `double ratio = static_cast<double>(total) / count;
int truncated = static_cast<int>(3.99); // 3

// Parsing numbers from strings:
int x = std::stoi("123");
long long y = std::stoll("9876543210");
std::string s = std::to_string(456);`,
          description:
            "Convert between numeric types and strings using static_cast and std helper functions.",
        },
      ],
    },
    {
      id: "operators",
      title: "Operators",
      summary: "Arithmetic, comparison, logical, and bitwise operators.",
      items: [
        {
          id: "cpp-arithmetic-logical",
          name: "Arithmetic & Logical Operators",
          syntax: `// Arithmetic: +  -  *  /  %  ++  --
int sum = a + b;
int remainder = a % b; // Modulo (remainder)

// Comparison: ==  !=  <  >  <=  >=
bool isMatch = (a == b);

// Logical: && (AND)  || (OR)  ! (NOT)
if (age >= 18 && hasId) { ... }`,
          description:
            "Operators for mathematical calculations and boolean condition evaluations.",
        },
        {
          id: "cpp-bitwise",
          name: "Bitwise Operators",
          syntax: `int andBits = a & b;  // Bitwise AND
int orBits  = a | b;  // Bitwise OR
int xorBits = a ^ b;  // Bitwise XOR
int notBits = ~a;     // Bitwise NOT
int shiftL  = a << 1; // Left shift (multiply by 2)
int shiftR  = a >> 1; // Right shift (divide by 2)`,
          description:
            "Manipulate individual bits of integer values directly.",
        },
      ],
    },
    {
      id: "control-flow",
      title: "Conditionals & Control Flow",
      summary: "Decision making using if, else if, else, switch, and ternary.",
      items: [
        {
          id: "cpp-if-else",
          name: "If, Else If, Else",
          syntax: `if (score >= 90) {
    grade = 'A';
} else if (score >= 75) {
    grade = 'B';
} else {
    grade = 'C';
}`,
          description:
            "Executes blocks of code conditionally based on boolean truth values.",
        },
        {
          id: "cpp-ternary",
          name: "Ternary Operator",
          syntax: `// Syntax: condition ? expression_if_true : expression_if_false
string result = (score >= 50) ? "PASS" : "FAIL";`,
          description:
            "Compact one-line conditional assignment.",
        },
        {
          id: "cpp-switch",
          name: "Switch Statement",
          syntax: `switch (command) {
    case 1:
        start();
        break;
    case 2:
        stop();
        break;
    default:
        unknown();
        break;
}`,
          description:
            "Matches an integer or char variable against multiple constant values.",
        },
      ],
    },
    {
      id: "loops",
      title: "Loops & Iteration",
      summary: "for, while, do-while, range-based for loops, and break/continue.",
      items: [
        {
          id: "cpp-for-loop",
          name: "For Loops",
          syntax: `// Standard indexed loop:
for (int i = 0; i < n; i++) {
    cout << i << " ";
}

// Range-based for loop (C++11):
for (const auto& item : items) {
    cout << item << " ";
}`,
          description:
            "Repeats execution for a fixed count or across elements in a container.",
        },
        {
          id: "cpp-while-loop",
          name: "While & Do-While",
          syntax: `while (count > 0) {
    count--;
}

do {
    process();
} while (hasMore);`,
          description:
            "Repeats code while a boolean condition remains true. Do-while guarantees at least one execution.",
        },
        {
          id: "cpp-break-continue",
          name: "Break & Continue",
          syntax: `for (int i = 0; i < 10; i++) {
    if (i == 3) continue; // Skip to next iteration
    if (i == 8) break;    // Exit loop completely
}`,
          description:
            "Controls loop iteration flow prematurely.",
        },
      ],
    },
    {
      id: "functions",
      title: "Functions & References",
      summary: "Function declarations, parameters, pass-by-reference, and lambdas.",
      items: [
        {
          id: "cpp-function-def",
          name: "Function Definition",
          syntax: `// return_type function_name(parameter_list)
int add(int a, int b) {
    return a + b;
}

void printMessage(const string& msg) {
    cout << msg << "\\n";
}`,
          description:
            "Reusable blocks of code with defined return types and parameter types.",
        },
        {
          id: "cpp-pass-by-ref",
          name: "Pass by Reference (&)",
          syntax: `// Modifies the original vector without copying (O(1) overhead):
void incrementAll(vector<int>& arr) {
    for (int& x : arr) {
        x++;
    }
}`,
          description:
            "Use '&' to pass variables by reference to avoid copying overhead and allow in-place mutations.",
        },
        {
          id: "cpp-lambda",
          name: "Lambda Expressions",
          syntax: `// [captures](parameters) -> return_type { body }
auto isEven = [](int x) -> bool {
    return x % 2 == 0;
};`,
          description:
            "Anonymous inline functions useful for custom sorting and predicate filters.",
        },
      ],
    },
    {
      id: "io",
      title: "Standard Input / Output",
      summary: "Fast I/O, reading numbers, reading lines, and formatting output.",
      items: [
        {
          id: "cpp-fast-io",
          name: "Fast I/O & cin / cout",
          syntax: `ios::sync_with_stdio(false);
cin.tie(nullptr);

int n;
cin >> n;
cout << "Result: " << n << "\\n"; // Use '\\n' instead of endl`,
          description:
            "Optimizes standard stream execution speed by disabling C synchronization.",
        },
        {
          id: "cpp-getline",
          name: "Reading Full Lines",
          syntax: `string line;
getline(cin, line);`,
          description:
            "Reads an entire line of text including spaces until a newline character.",
        },
      ],
    },
  ],
};
