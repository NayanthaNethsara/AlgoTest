import type { LanguageDoc } from "./types";

export const JAVASCRIPT_DOC: LanguageDoc = {
  slug: "javascript",
  name: "JavaScript",
  version: "Node.js 20 LTS",
  iconName: "javascript",
  summary:
    "Core syntax, CLI execution, variables, data types, operators, control flow, functions, objects, arrays, and standard I/O for Node.js.",
  topics: [
    {
      id: "compile-and-run",
      title: "How to Run & Test (Windows, Linux, macOS)",
      summary:
        "Platform-specific commands to execute JavaScript with Node.js, test with input files, and enforce memory limits.",
      items: [
        {
          id: "js-cli-linux",
          name: "1. Linux (Ubuntu / Debian / Fedora / WSL)",
          syntax: `# 1. Check Node.js version (Node.js 18+ or 20+ recommended):
node -v

# 2. Execute script with input redirection:
node solution.js < input.txt

# 3. Save output to file & benchmark execution time:
node solution.js < input.txt > output.txt
time node solution.js < input.txt`,
          description:
            "Standard workflow for Linux terminals and Windows Subsystem for Linux (WSL).",
        },
        {
          id: "js-cli-windows",
          name: "2. Windows (PowerShell & Command Prompt)",
          syntax: `# --- Windows Command Prompt (cmd.exe) ---
# Run script with input and output redirection:
node solution.js < input.txt > output.txt

# --- Windows PowerShell ---
# Run script with input piped via Get-Content:
Get-Content input.txt | node solution.js
# Or save output to file:
Get-Content input.txt | node solution.js | Out-File -Encoding utf8 output.txt`,
          description:
            "Running Node.js scripts on Windows via PowerShell and Command Prompt.",
          notes: [
            "In PowerShell, use 'Get-Content input.txt | node solution.js' since '<' is reserved.",
          ],
        },
        {
          id: "js-cli-macos",
          name: "3. macOS (Terminal)",
          syntax: `# 1. Verify Node.js:
node -v

# 2. Run with input and output files:
node solution.js < input.txt > output.txt`,
          description:
            "Workflow for macOS Terminal using built-in or Homebrew Node.js.",
        },
        {
          id: "js-cli-memory",
          name: "4. Memory Limit Flag & Judge Configuration",
          syntax: `# Run with 256MB V8 heap allocation (matches judge sandbox limit):
node --max-old-space-size=256 solution.js < input.txt

# Judge Sandbox Execution:
node solution.js`,
          description:
            "Simulates the 256MB memory boundary enforced in the competitive sandbox.",
        },
      ],
    },
    {
      id: "syntax-structure",
      title: "Syntax & Variables",
      summary: "Variable declarations (let, const), program entry, and comments.",
      items: [
        {
          id: "js-boilerplate",
          name: "Main Script Structure",
          syntax: `function main() {
    console.log("Hello, World!");
}

main();`,
          description:
            "Standard Node.js script execution entry point.",
        },
        {
          id: "js-variables",
          name: "let vs const",
          syntax: `let count = 0;       // Mutable variable (can be reassigned)
const MAX_LIMIT = 100; // Constant (cannot be reassigned)

// Note: Avoid 'var' in modern JavaScript due to function scoping rules.`,
          description:
            "Always prefer const by default; use let only when the variable will be reassigned.",
        },
        {
          id: "js-comments",
          name: "Comments",
          syntax: `// Single-line comment

/*
  Multi-line 
  comment block
*/`,
          description:
            "Standard C-style comments.",
        },
      ],
    },
    {
      id: "data-types",
      title: "Data Types & Conversions",
      summary: "Numbers, BigInt, Strings, Booleans, Null/Undefined, and casting.",
      items: [
        {
          id: "js-primitives",
          name: "Primitive Types",
          syntax: `const num = 42;                 // 64-bit IEEE float (safe up to 2^53 - 1)
const big = 9007199254740992n;  // BigInt for 64-bit+ integers
const str = "MiniAlgothon";     // String
const bool = true;              // Boolean
const empty = null;             // Explicit absence of value
const notSet = undefined;       // Uninitialized variable`,
          description:
            "JavaScript is dynamically typed. For numbers exceeding 9 * 10^15, use BigInt.",
        },
        {
          id: "js-type-casting",
          name: "Type Conversions",
          syntax: `const intVal = parseInt("123", 10); // String to int with radix
const floatVal = parseFloat("3.14");
const bigVal = BigInt("999999999999999999");
const strVal = String(456);

// Template Literals (String interpolation):
const name = "Alice";
const greeting = \`Hello, \${name}! Total: \${intVal * 2}\`;`,
          description:
            "Convert between types using parseInt, parseFloat, BigInt, String, or template literals.",
        },
      ],
    },
    {
      id: "operators",
      title: "Operators",
      summary: "Arithmetic, strict equality (===), logical, and nullish coalescing.",
      items: [
        {
          id: "js-arithmetic",
          name: "Arithmetic Operators",
          syntax: `const sum = a + b;
const diff = a - b;
const product = a * b;
const quotient = a / b;  // Returns floating point (e.g. 7 / 2 is 3.5)
const floorDiv = Math.floor(a / b); // Integer division: 3
const rem = a % b;       // Modulo
const exp = a ** b;      // Power (2 ** 3 is 8)`,
          description:
            "Standard mathematical operators. Use Math.floor() for integer floor division.",
        },
        {
          id: "js-equality-logical",
          name: "Strict Equality & Logical Operators",
          syntax: `// Strict equality (checks value AND type):
if (a === b) { ... }  // True if equal and same type
if (a !== b) { ... }  // True if not equal or different type

// Logical operators:
if (isReady && hasAccess) { ... } // AND
if (isAdmin || isOwner) { ... }   // OR
if (!isValid) { ... }             // NOT

// Nullish Coalescing (??): defaults only if null or undefined
const fallback = value ?? "default";`,
          description:
            "Always use === and !== instead of == and != to avoid unexpected type coercions.",
        },
      ],
    },
    {
      id: "control-flow",
      title: "Conditionals & Control Flow",
      summary: "Decision making with if-else, switch, and ternary.",
      items: [
        {
          id: "js-if-else",
          name: "If, Else If, Else",
          syntax: `if (score >= 90) {
    grade = "A";
} else if (score >= 75) {
    grade = "B";
} else {
    grade = "C";
}`,
          description:
            "Standard conditional branching structure.",
        },
        {
          id: "js-ternary",
          name: "Ternary Operator",
          syntax: `// condition ? expression_if_true : expression_if_false
const status = score >= 50 ? "PASS" : "FAIL";`,
          description:
            "Compact inline conditional expression.",
        },
        {
          id: "js-switch",
          name: "Switch Statement",
          syntax: `switch (action) {
    case "START":
        startProcess();
        break;
    case "STOP":
        stopProcess();
        break;
    default:
        handleUnknown();
        break;
}`,
          description:
            "Matches an expression against multiple case clauses.",
        },
      ],
    },
    {
      id: "loops",
      title: "Loops & Iteration",
      summary: "for, for-of, for-in, while, and array iteration methods.",
      items: [
        {
          id: "js-for-loops",
          name: "For & For-Of Loops",
          syntax: `// 1. Classic indexed loop:
for (let i = 0; i < n; i++) {
    console.log(i);
}

// 2. For-Of loop (iterates over elements):
const fruits = ["apple", "banana", "cherry"];
for (const fruit of fruits) {
    console.log(fruit);
}`,
          description:
            "Iterates sequentially by index or directly across iterable elements.",
        },
        {
          id: "js-while-loop",
          name: "While & Do-While",
          syntax: `while (count > 0) {
    count--;
}

do {
    process();
} while (hasMore);`,
          description:
            "Repeats code while a boolean condition remains true.",
        },
        {
          id: "js-array-methods",
          name: "Array Iteration Methods",
          syntax: `const nums = [1, 2, 3, 4];

// Map: transform each element
const doubled = nums.map(x => x * 2);

// Filter: keep matching elements
const evens = nums.filter(x => x % 2 === 0);

// Reduce: accumulate into single value
const total = nums.reduce((acc, curr) => acc + curr, 0);`,
          description:
            "Functional array transformation methods.",
        },
      ],
    },
    {
      id: "functions",
      title: "Functions & Arrow Functions",
      summary: "Function definitions, arrow syntax, and callbacks.",
      items: [
        {
          id: "js-function-def",
          name: "Function Declaration vs Arrow Function",
          syntax: `// Standard Function:
function add(a, b = 0) {
    return a + b;
}

// Arrow Function (concise lambda syntax):
const multiply = (a, b) => a * b;

// Arrow function with body block:
const compute = (x) => {
    const res = x * 2;
    return res + 1;
};`,
          description:
            "Arrow functions provide a clean, modern syntax for function expressions.",
        },
      ],
    },
    {
      id: "io",
      title: "Standard Input / Output",
      summary: "Fast synchronous input parsing and buffered output in Node.js.",
      items: [
        {
          id: "js-fast-io",
          name: "Fast Standard Input & Output",
          syntax: `const fs = require("fs");

// Read entire stdin buffer synchronously:
const input = fs.readFileSync(0, "utf-8");
const tokens = input.trim().split(/\\s+/);
let ptr = 0;

const nextInt = () => parseInt(tokens[ptr++], 10);
const nextStr = () => tokens[ptr++];

const n = nextInt();

// Fast output:
process.stdout.write(\`Result: \${n}\\n\`);`,
          description:
            "fs.readFileSync(0, 'utf-8') with whitespace tokenizer is the fastest way to read standard input in Node.js.",
        },
      ],
    },
  ],
};
