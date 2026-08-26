import type { LanguageDoc } from "./types";

export const PYTHON_DOC: LanguageDoc = {
  slug: "python",
  name: "Python",
  version: "Python 3.12",
  iconName: "python",
  summary:
    "Core syntax, execution commands, data types, operators, indentation rules, functions, collections, and standard I/O for Python 3.",
  topics: [
    {
      id: "compile-and-run",
      title: "How to Run & Test (Windows, Linux, macOS)",
      summary:
        "Platform-specific commands to run Python scripts, pipe input files, and debug interactively.",
      items: [
        {
          id: "py-cli-linux",
          name: "1. Linux (Ubuntu / Debian / Fedora / WSL)",
          syntax: `# 1. Check Python version (requires Python 3.10+):
python3 --version

# 2. Run script with standard input redirection:
python3 solution.py < input.txt

# 3. Save output to file & benchmark execution time:
python3 solution.py < input.txt > output.txt
time python3 solution.py < input.txt`,
          description:
            "Standard workflow for Linux terminals and Windows Subsystem for Linux (WSL).",
        },
        {
          id: "py-cli-windows",
          name: "2. Windows (PowerShell & Command Prompt)",
          syntax: `# --- Windows Command Prompt (cmd.exe) ---
# Run script:
python solution.py < input.txt > output.txt
# Or using the Python launcher:
py -3 solution.py < input.txt

# --- Windows PowerShell ---
# Run script with input redirection via pipe:
Get-Content input.txt | python solution.py
# Or save output to file:
Get-Content input.txt | python solution.py | Out-File -Encoding utf8 output.txt`,
          description:
            "Running Python on Windows using standard Command Prompt and PowerShell.",
          notes: [
            "In PowerShell, use 'Get-Content input.txt | python solution.py' since '<' is reserved.",
          ],
        },
        {
          id: "py-cli-macos",
          name: "3. macOS (Terminal)",
          syntax: `# 1. Verify Python 3 installation:
python3 --version

# 2. Run with input file:
python3 solution.py < input.txt > output.txt

# 3. Interactive debugging (drops into REPL after execution):
python3 -i solution.py < input.txt`,
          description:
            "Workflow for macOS Terminal using built-in or Homebrew Python 3.",
        },
        {
          id: "py-cli-judge",
          name: "4. Judge Sandbox Execution Command",
          syntax: `# How the judge runs your code in the sandbox:
python3 -u solution.py  # (-u disables output buffering for instant evaluation)`,
          description:
            "The exact command used by the isolated Linux judge environment.",
        },
      ],
    },
    {
      id: "syntax-structure",
      title: "Syntax & Indentation",
      summary: "Indentation rules, entry points, and comments in Python.",
      items: [
        {
          id: "py-boilerplate",
          name: "Main Script Structure",
          syntax: `def main():
    print("Hello, World!")

if __name__ == "__main__":
    main()`,
          description:
            "Python scripts execute sequentially top-to-bottom. The if __name__ == '__main__': block acts as the standard entry point.",
        },
        {
          id: "py-indentation",
          name: "Indentation & Blocks",
          syntax: `if is_ready:
    # 4 spaces indentation defines block scope
    step_one()
    step_two()`,
          description:
            "Python uses whitespace indentation (4 spaces) instead of curly braces {} to define code blocks.",
        },
        {
          id: "py-comments",
          name: "Comments",
          syntax: `# Single-line comment

"""
Multi-line docstring
or block comment
"""`,
          description:
            "Use # for inline comments and triple quotes for docstrings.",
        },
      ],
    },
    {
      id: "data-types",
      title: "Data Types & Variables",
      summary: "Numbers, strings, booleans, casting, and slicing.",
      items: [
        {
          id: "py-primitives",
          name: "Variables & Primitive Types",
          syntax: `x = 42                 # Integer (arbitrary precision, no overflow)
pi = 3.14159           # Float
name = "MiniAlgothon"  # String
is_valid = True        # Boolean (True or False)
nothing = None         # NoneType (represents absence of value)`,
          description:
            "Python is dynamically typed. Variable types are inferred automatically at runtime.",
        },
        {
          id: "py-type-casting",
          name: "Type Conversions",
          syntax: `num = int("123")         # String to integer
dec = float("3.14")       # String to float
text = str(456)           # Integer to string
chars = list("hello")     # String to list of characters: ['h', 'e', 'l', 'l', 'o']
joined = "".join(chars)   # List of strings to single string`,
          description:
            "Convert values between types using built-in conversion constructors.",
        },
        {
          id: "py-slicing",
          name: "String & Sequence Slicing",
          syntax: `s = "ABCDEFG"
sub = s[1:4]     # "BCD" (index 1 up to index 4 exclusive)
start = s[:3]    # "ABC" (first 3 characters)
rev = s[::-1]    # "GFEDCBA" (reversed)`,
          description:
            "Extract substrings or reverse sequences using slice notation [start:stop:step].",
        },
      ],
    },
    {
      id: "operators",
      title: "Operators",
      summary: "Arithmetic, comparison, logical, and membership operators.",
      items: [
        {
          id: "py-arithmetic",
          name: "Arithmetic Operators",
          syntax: `add = a + b
sub = a - b
mul = a * b
div = a / b     # Float division: 7 / 2 -> 3.5
floor_div = a // b # Integer floor division: 7 // 2 -> 3
rem = a % b     # Modulo (remainder)
power = a ** b  # Exponentiation: 2 ** 10 -> 1024`,
          description:
            "Mathematical operations. Note the difference between float division (/) and integer floor division (//).",
        },
        {
          id: "py-logical-membership",
          name: "Logical & Membership Operators",
          syntax: `# Logical: and, or, not
if age >= 18 and has_ticket:
    pass

# Membership: in, not in
if "key" in dictionary:
    pass

if element in my_list:
    pass`,
          description:
            "Evaluate boolean conditions and test for item presence within collections.",
        },
      ],
    },
    {
      id: "control-flow",
      title: "Conditionals & Control Flow",
      summary: "Decision making using if, elif, else, and match/case.",
      items: [
        {
          id: "py-if-elif",
          name: "If, Elif, Else",
          syntax: `if score >= 90:
    grade = "A"
elif score >= 75:
    grade = "B"
else:
    grade = "C"`,
          description:
            "Conditional branches executed in order until the first matching true condition.",
        },
        {
          id: "py-ternary",
          name: "Ternary Operator (Inline If)",
          syntax: `# Syntax: value_if_true if condition else value_if_false
status = "PASS" if score >= 50 else "FAIL"`,
          description:
            "Concise conditional expression that returns one of two values.",
        },
        {
          id: "py-match",
          name: "Match / Case (Pattern Matching)",
          syntax: `match command:
    case "start":
        run_engine()
    case "stop":
        halt_engine()
    case _:
        default_action()`,
          description:
            "Structural pattern matching introduced in Python 3.10+.",
        },
      ],
    },
    {
      id: "loops",
      title: "Loops & Iteration",
      summary: "for, while, range, enumerate, zip, and list comprehensions.",
      items: [
        {
          id: "py-for-loops",
          name: "For Loops & Range",
          syntax: `# Repeat N times: 0, 1, 2, 3, 4
for i in range(5):
    print(i)

# Iterate over a list:
for item in ["apple", "banana", "cherry"]:
    print(item)`,
          description:
            "Iterates over sequences or generator ranges.",
        },
        {
          id: "py-enumerate-zip",
          name: "Enumerate & Zip",
          syntax: `# Enumerate: get index and value
for index, val in enumerate(items):
    print(index, val)

# Zip: iterate over multiple lists in parallel
for name, score in zip(names, scores):
    print(name, score)`,
          description:
            "Built-in iterators for indexed loops and parallel sequence processing.",
        },
        {
          id: "py-list-comprehension",
          name: "List Comprehensions",
          syntax: `# [expression for item in iterable if condition]
squares = [x * x for x in range(10)]
evens = [x for x in nums if x % 2 == 0]`,
          description:
            "Concise syntax for constructing new lists from existing iterables.",
        },
      ],
    },
    {
      id: "functions",
      title: "Functions & Lambdas",
      summary: "Function declarations, default parameters, and lambda expressions.",
      items: [
        {
          id: "py-function-def",
          name: "Function Definition",
          syntax: `def add(a: int, b: int = 0) -> int:
    """Returns the sum of a and b."""
    return a + b`,
          description:
            "Define reusable procedures with optional default arguments and type hints.",
        },
        {
          id: "py-lambda",
          name: "Lambda Expressions",
          syntax: `# lambda arguments: expression
multiply = lambda x, y: x * y
double = lambda x: x * 2`,
          description:
            "Small anonymous functions defined in a single line.",
        },
      ],
    },
    {
      id: "io",
      title: "Standard Input / Output",
      summary: "Fast I/O, reading integers, reading lines, and formatting output.",
      items: [
        {
          id: "py-fast-io",
          name: "Fast Standard Input",
          syntax: `import sys
input = sys.stdin.readline

# Read an integer:
n = int(input())

# Read list of integers on one line:
arr = list(map(int, input().split()))

# Fast output:
sys.stdout.write(f"Answer: {n}\\n")`,
          description:
            "Using sys.stdin.readline is significantly faster than built-in input() for competitive programming.",
        },
      ],
    },
  ],
};
