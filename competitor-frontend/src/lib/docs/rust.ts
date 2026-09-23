import type { LanguageDoc } from "./types";

export const RUST_DOC: LanguageDoc = {
  slug: "rust",
  name: "Rust",
  version: "rustc 1.77+ (2021 Edition)",
  iconName: "rust",
  summary:
    "Fast competitive programming guide for Rust: compilation, fast I/O, vectors, pattern matching, binary search, and standard collections.",
  topics: [
    {
      id: "compile-and-run",
      title: "How to Compile & Run (Windows, Linux, macOS)",
      summary:
        "Commands to install rustc, compile with release optimizations, and run with redirected input.",
      items: [
        {
          id: "rust-cli-linux",
          name: "1. Linux & macOS",
          syntax: `# 1. Install Rust toolchain (via rustup):
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# 2. Compile standalone source file with release optimizations:
rustc -O -C opt-level=3 -C strip=symbols main.rs -o main

# 3. Execute with input file:
./main < input.txt

# 4. Measure execution time:
time ./main < input.txt > output.txt`,
          description:
            "Standard terminal commands for Linux and macOS environments.",
        },
        {
          id: "rust-cli-windows",
          name: "2. Windows (PowerShell / Command Prompt)",
          syntax: `# --- Windows Command Prompt (cmd.exe) ---
# Compile:
rustc -O main.rs -o main.exe
# Run with input file:
main.exe < input.txt > output.txt

# --- Windows PowerShell ---
# Compile:
rustc -O main.rs -o main.exe
# Run with piped input:
Get-Content input.txt | .\\main.exe`,
          description:
            "Windows execution with rustc and redirected input files.",
        },
        {
          id: "rust-cli-judge",
          name: "3. Judge Sandbox Evaluation Command",
          syntax: `# The exact command used by the Labyrithm evaluation sandbox:
rustc -O -C strip=symbols main.rs -o main
./main  # (stdin piped in isolated Linux cgroup)`,
          description:
            "Compiled with -O optimizations and symbols stripped for speed and low memory footprint.",
        },
      ],
    },
    {
      id: "fast-io",
      title: "Fast Input / Output Template",
      summary:
        "Fast I/O template using BufRead to avoid Time Limit Exceeded (TLE) on 10^5+ inputs.",
      items: [
        {
          id: "rust-fast-io-template",
          name: "Competitive Programming Fast I/O Boilerplate",
          syntax: `use std::io::{self, BufRead, Write, BufWriter};

fn main() -> io::Result<()> {
    let stdin = io::stdin();
    let mut lines = stdin.lock().lines();
    let stdout = io::stdout();
    let mut out = BufWriter::new(stdout.lock());

    // Read first line (e.g. single number N):
    if let Some(Ok(line)) = lines.next() {
        let n: usize = line.trim().parse().unwrap();

        // Read next line of space-separated integers:
        if let Some(Ok(second_line)) = lines.next() {
            let nums: Vec<i64> = second_line
                .split_whitespace()
                .map(|token| token.parse::<i64>().unwrap())
                .collect();

            // Fast buffered output:
            writeln!(out, "Count: {}, Sum: {}", n, nums.iter().sum::<i64>())?;
        }
    }

    out.flush()?;
    Ok(())
}`,
          description:
            "Locking stdin and buffering stdout prevents per-token syscall overhead.",
          notes: [
            "Never use unbuffered println! in loops with > 10,000 outputs; use writeln!(out, ...) with BufWriter.",
          ],
        },
        {
          id: "rust-scanner",
          name: "Whitespace Token Scanner",
          syntax: `use std::io::{self, Read};

struct Scanner {
    tokens: std::str::SplitWhitespace<'static>,
}

impl Scanner {
    fn new(input: &'static str) -> Self {
        Self { tokens: input.split_whitespace() }
    }
    fn next<T: std::str::FromStr>(&mut self) -> T {
        self.tokens.next().unwrap().parse().ok().unwrap()
    }
}

fn main() {
    let mut buffer = String::new();
    io::stdin().read_to_string(&mut buffer).unwrap();
    let leaked: &'static str = Box::leak(buffer.into_boxed_str());
    let mut sc = Scanner::new(leaked);

    let n: usize = sc.next();
    let k: i64 = sc.next();
    println!("N = {}, K = {}", n, k);
}`,
          description:
            "Reads entire input into memory in one syscall and tokenizes by whitespace.",
        },
      ],
    },
    {
      id: "data-types",
      title: "Data Types & Variables",
      summary: "Primitive scalar types, mutability, casting, and arrays.",
      items: [
        {
          id: "rust-primitives",
          name: "Numeric & Primitive Types",
          syntax: `let x: i32 = -42;              // 32-bit signed int (-2*10^9 to 2*10^9)
let big_num: i64 = 1_000_000_000_000_000_000; // 64-bit int (~9e18)
let index: usize = 0;          // Pointer-sized unsigned int (used for vector indexes)
let pi: f64 = 3.1415926535;    // 64-bit float
let is_valid: bool = true;     // Boolean
let ch: char = 'A';            // Unicode scalar value`,
          description:
            "Variables are immutable by default. Add 'mut' to declare mutable variables.",
        },
        {
          id: "rust-casting",
          name: "Type Casting with 'as'",
          syntax: `let a: i32 = 10;
let b: usize = a as usize;     // Cast to index type
let c: i64 = a as i64;         // Widen to 64-bit to prevent overflow
let ratio: f64 = (a as f64) / 3.0;

// Parsing from string:
let val: i64 = "12345".parse().unwrap();`,
          description:
            "Use the 'as' keyword for explicit numeric conversions.",
        },
      ],
    },
    {
      id: "control-flow",
      title: "Control Flow & Pattern Matching",
      summary: "if/else, match expressions, and destructuring.",
      items: [
        {
          id: "rust-if-else",
          name: "If / Else Expressions",
          syntax: `// If is an expression that returns a value (like a ternary):
let result = if score >= 90 { "EXCELLENT" } else { "PASS" };

if score >= 90 {
    println!("A");
} else if score >= 75 {
    println!("B");
} else {
    println!("C");
}`,
          description:
            "Conditions must evaluate strictly to a boolean (no implicit 0/1 truthiness).",
        },
        {
          id: "rust-match",
          name: "Pattern Matching (match)",
          syntax: `match command {
    1 => start(),
    2 | 3 => pause(),
    4..=10 => handle_range(),
    _ => println!("Default fallback"),
}`,
          description:
            "Pattern matching is exhaustive and guarantees all branches are handled.",
        },
      ],
    },
    {
      id: "loops",
      title: "Loops & Iteration",
      summary: "for in range, iterators, while, and loop.",
      items: [
        {
          id: "rust-for-loops",
          name: "For Loops & Ranges",
          syntax: `// 0 to n-1:
for i in 0..n { ... }

// 0 to n (inclusive):
for i in 0..=n { ... }

// Reverse loop from n-1 down to 0:
for i in (0..n).rev() { ... }

// Iterating over elements:
for &val in &nums { ... }

// Iterating with index:
for (i, &val) in nums.iter().enumerate() { ... }`,
          description:
            "Half-open ranges 0..n are idiomatic for 0-indexed competitive arrays.",
        },
        {
          id: "rust-while-loop",
          name: "While & Infinite Loop",
          syntax: `let mut count = n;
while count > 0 {
    count /= 2;
}

// Loop with break value:
let found_index = loop {
    if condition() { break idx; }
};`,
          description:
            "While loops execute as long as condition is met; loop { } runs until explicit break.",
        },
      ],
    },
    {
      id: "collections",
      title: "Standard Collections & Sorting",
      summary: "Vec, HashMap, HashSet, BinaryHeap (Priority Queue), and VecDeque.",
      items: [
        {
          id: "rust-vector",
          name: "Vec<T> (Dynamic Array)",
          syntax: `// Create with initial capacity:
let mut vec = Vec::with_capacity(n);
let mut grid = vec![vec![0i64; cols]; rows]; // 2D vector

vec.push(10);
vec.pop();
let length = vec.len();
let last = vec.last();

// Sorting:
vec.sort();           // Stable O(N log N)
vec.sort_unstable();  // Fast in-place unstable sort (faster for integers)

// Custom comparator (e.g. descending order):
vec.sort_unstable_by(|a, b| b.cmp(a));`,
          description:
            "Dynamic array with contiguous memory. Use sort_unstable() for maximum performance.",
        },
        {
          id: "rust-binary-search",
          name: "Binary Search",
          syntax: `// Vector MUST be sorted first:
vec.sort_unstable();

// Find exact element (returns Result<usize, usize>):
match vec.binary_search(&target) {
    Ok(index) => println!("Found at {}", index),
    Err(insertion_point) => println!("Insert at {}", insertion_point),
}

// Lower bound / partition_point (find first element >= target):
let idx = vec.partition_point(|&x| x < target);`,
          description:
            "partition_point implements lower_bound in O(log N).",
        },
        {
          id: "rust-hashmap",
          name: "HashMap & HashSet",
          syntax: `use std::collections::{HashMap, HashSet};

let mut freq = HashMap::new();
*freq.entry(key).or_insert(0) += 1; // Count frequencies

if freq.contains_key(&key) {
    let count = freq[&key];
}

let mut seen = HashSet::new();
seen.insert(val);`,
          description:
            "Hash tables with O(1) average lookup and insertion.",
        },
        {
          id: "rust-heap",
          name: "BinaryHeap (Priority Queue)",
          syntax: `use std::collections::BinaryHeap;
use std::cmp::Reverse;

// Max-Heap (default):
let mut max_heap = BinaryHeap::new();
max_heap.push(42);
let top = max_heap.pop(); // Returns Option<T>

// Min-Heap using std::cmp::Reverse:
let mut min_heap = BinaryHeap::new();
min_heap.push(Reverse(42));
let Reverse(smallest) = min_heap.pop().unwrap();`,
          description:
            "Priority queue backed by a binary heap. Use Reverse(x) for min-heaps (e.g., Dijkstra).",
        },
      ],
    },
  ],
};
