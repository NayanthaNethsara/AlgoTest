import type { LanguageDoc } from "./types";

export const JAVA_DOC: LanguageDoc = {
  slug: "java",
  name: "Java",
  version: "OpenJDK 17 / 21",
  iconName: "java",
  summary:
    "Competitive programming guide for Java: fast I/O, collections framework, PriorityQueue, BigInteger, and sorting techniques.",
  topics: [
    {
      id: "compile-and-run",
      title: "How to Compile & Run (Windows, Linux, macOS)",
      summary:
        "Commands to compile and execute Java programs with standard I/O redirection.",
      items: [
        {
          id: "java-cli-linux-mac",
          name: "1. Linux & macOS",
          syntax: `# 1. Install OpenJDK (Ubuntu / Debian):
sudo apt update && sudo apt install -y default-jdk

# 2. Compile Java source file:
javac Main.java

# 3. Execute with input file:
java Main < input.txt

# 4. Measure execution time & memory:
time java -Xss32m -Xmx256m Main < input.txt > output.txt`,
          description:
            "Standard commands for compiling and running Java applications.",
          notes: [
            "Always name the file 'Main.java' with a public class 'Main' for submission.",
          ],
        },
        {
          id: "java-cli-windows",
          name: "2. Windows (PowerShell & Command Prompt)",
          syntax: `# --- Windows Command Prompt (cmd.exe) ---
# Compile:
javac Main.java
# Run with input redirection:
java Main < input.txt > output.txt

# --- Windows PowerShell ---
# Compile:
javac Main.java
# Run with piped input:
Get-Content input.txt | java Main`,
          description:
            "Windows execution using CMD or PowerShell.",
        },
        {
          id: "java-cli-judge",
          name: "3. Judge Sandbox Evaluation Command",
          syntax: `# The exact command used by the Labyrithm evaluation sandbox:
javac Main.java
java -XX:+UseSerialGC -Xss32m -Xmx256m Main < input.txt`,
          description:
            "Configured with serial garbage collection and a 32MB thread stack to prevent StackOverflowError during deep recursion.",
        },
      ],
    },
    {
      id: "fast-io",
      title: "Fast I/O Template (Avoid TLE)",
      summary:
        "Using Scanner in Java frequently causes Time Limit Exceeded (TLE) on large inputs. Use BufferedReader and StringTokenizer.",
      items: [
        {
          id: "java-fast-io-template",
          name: "FastScanner & PrintWriter Template",
          syntax: `import java.io.*;
import java.util.*;

public class Main {
    static class FastScanner {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        StringTokenizer st;

        String next() {
            while (st == null || !st.hasMoreElements()) {
                try {
                    String line = br.readLine();
                    if (line == null) return null;
                    st = new StringTokenizer(line);
                } catch (IOException e) {
                    return null;
                }
            }
            return st.nextToken();
        }

        int nextInt() { return Integer.parseInt(next()); }
        long nextLong() { return Long.parseLong(next()); }
        double nextDouble() { return Double.parseDouble(next()); }
    }

    public static void main(String[] args) throws Exception {
        FastScanner in = new FastScanner();
        PrintWriter out = new PrintWriter(new BufferedOutputStream(System.out));

        String token = in.next();
        if (token != null) {
            int n = Integer.parseInt(token);
            long sum = 0;
            for (int i = 0; i < n; i++) {
                sum += in.nextLong();
            }
            out.println("Sum: " + sum);
        }

        out.flush(); // Crucial: flush before termination!
    }
}`,
          description:
            "Standard competitive programming template in Java. Reading with BufferedReader is up to 10x faster than Scanner.",
        },
      ],
    },
    {
      id: "data-types",
      title: "Data Types & Variables",
      summary: "Primitive types, 64-bit longs, casting, and BigInteger.",
      items: [
        {
          id: "java-primitives",
          name: "Numeric & Primitive Types",
          syntax: `int x = 1_000_000_000;        // 32-bit signed int (-2e9 to 2e9)
long bigVal = 100_000_000_000L; // 64-bit int (ALWAYS suffix with 'L')
double ratio = 3.14159;         // 64-bit floating point
boolean flag = true;            // true or false
char ch = 'A';
String str = "Hello";`,
          description:
            "Always suffix 64-bit integer literals with 'L' to prevent 32-bit integer overflow during initialization.",
        },
        {
          id: "java-biginteger",
          name: "BigInteger (Arbitrary Precision)",
          syntax: `import java.math.BigInteger;

BigInteger a = new BigInteger("12345678901234567890");
BigInteger b = BigInteger.valueOf(42);

BigInteger sum = a.add(b);
BigInteger prod = a.multiply(b);
BigInteger mod = a.mod(BigInteger.valueOf(1_000_000_007));
BigInteger pow = a.pow(10);`,
          description:
            "Built-in arbitrary-precision integer arithmetic for problems exceeding 64-bit bounds.",
        },
      ],
    },
    {
      id: "collections",
      title: "Collections & Data Structures",
      summary: "ArrayList, HashMap, PriorityQueue (Heap), ArrayDeque (Queue), and TreeSet.",
      items: [
        {
          id: "java-lists",
          name: "ArrayList (Dynamic Array)",
          syntax: `List<Integer> list = new ArrayList<>();
list.add(10);
list.add(20);
int val = list.get(0);
list.set(0, 99);
int size = list.size();

// Sorting:
Collections.sort(list); // Ascending
Collections.sort(list, Collections.reverseOrder()); // Descending`,
          description:
            "Dynamic contiguous array list.",
        },
        {
          id: "java-maps-sets",
          name: "HashMap & HashSet",
          syntax: `Map<Integer, Integer> freq = new HashMap<>();
// Safe frequency counting:
freq.put(x, freq.getOrDefault(x, 0) + 1);

if (freq.containsKey(x)) {
    int count = freq.get(x);
}

Set<String> seen = new HashSet<>();
seen.add("abc");
boolean exists = seen.contains("abc");`,
          description:
            "O(1) average lookup, insertion, and deletion.",
        },
        {
          id: "java-priority-queue",
          name: "PriorityQueue (Min/Max Heap)",
          syntax: `// Min-Heap (default):
PriorityQueue<Integer> minHeap = new PriorityQueue<>();
minHeap.add(42);
int smallest = minHeap.poll(); // Removes and returns min element

// Max-Heap:
PriorityQueue<Integer> maxHeap = new PriorityQueue<>(Collections.reverseOrder());
maxHeap.add(42);
int largest = maxHeap.poll();`,
          description:
            "Essential for Dijkstra's algorithm and greedy scheduling.",
        },
        {
          id: "java-treeset",
          name: "TreeSet / TreeMap (Ordered Set/Map)",
          syntax: `TreeSet<Integer> set = new TreeSet<>();
set.add(10);
set.add(25);
set.add(40);

// Binary search operations (O(log N)):
Integer lower = set.floor(25);   // Greatest element <= 25 (25)
Integer strictlyLess = set.lower(25); // Greatest element < 25 (10)
Integer ceiling = set.ceiling(30); // Smallest element >= 30 (40)
Integer higher = set.higher(25);  // Smallest element > 25 (40)`,
          description:
            "Self-balancing Red-Black tree providing O(log N) predecessor and successor queries (equivalent to C++ lower_bound/upper_bound).",
        },
      ],
    },
    {
      id: "arrays-and-sorting",
      title: "Arrays & Sorting",
      summary: "Array allocation, multi-dimensional grids, Arrays.sort(), and custom Comparators.",
      items: [
        {
          id: "java-sorting-primitives",
          name: "Sorting Primitives (Dual-Pivot Quicksort)",
          syntax: `int[] arr = new int[n];
// Fill array:
Arrays.fill(arr, -1);

// Sort ascending:
Arrays.sort(arr);

// Binary search on sorted array:
int idx = Arrays.binarySearch(arr, target); // Returns index >= 0 if found`,
          description:
            "Arrays.sort() uses Dual-Pivot Quicksort on primitive arrays (O(N log N) average).",
        },
        {
          id: "java-custom-comparator",
          name: "Custom Sorting (Pairs / Objects)",
          syntax: `int[][] intervals = new int[n][2];

// Sort by starting time ascending, then by ending time descending:
Arrays.sort(intervals, (a, b) -> {
    if (a[0] != b[0]) return Integer.compare(a[0], b[0]);
    return Integer.compare(b[1], a[1]);
});`,
          description:
            "Use lambda expressions and Integer.compare() to prevent subtraction overflow bugs.",
        },
      ],
    },
  ],
};
