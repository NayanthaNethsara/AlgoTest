import type { LanguageDoc } from "./types";

export const ALGORITHMS_DOC: LanguageDoc = {
  slug: "algorithms",
  name: "Algorithms",
  version: "Cheat Sheet & Templates",
  iconName: "algorithms",
  summary:
    "Universal algorithm templates and competitive programming patterns: Binary Search, Two Pointers, Prefix Sums, BFS/DFS, Dijkstra, Dynamic Programming, and Number Theory.",
  topics: [
    {
      id: "binary-search",
      title: "Binary Search & Search on Answer",
      summary:
        "O(log N) search techniques: classic binary search, lower/upper bound, and binary search on the answer space.",
      items: [
        {
          id: "algo-bs-answer",
          name: "1. Binary Search on Answer (Monotonic Predicate)",
          syntax: `// Pattern: Find minimum value in range [low, high] satisfying check(mid) == true
long long low = 1, high = 1e18;
long long ans = high;

while (low <= high) {
    long long mid = low + (high - low) / 2;
    if (isValid(mid)) {
        ans = mid;         // Record potential answer
        high = mid - 1;    // Try smaller value
    } else {
        low = mid + 1;     // Must be strictly larger
    }
}
// 'ans' holds the optimal minimum valid value`,
          description:
            "Universal pattern for optimization problems (e.g. allocating tasks, minimizing maximum load, capacity search).",
        },
        {
          id: "algo-bs-bounds",
          name: "2. Lower Bound & Upper Bound (Discrete Array)",
          syntax: `// Lower Bound: First index where arr[i] >= target
int lower_bound(const vector<int>& arr, int target) {
    int l = 0, r = arr.size();
    while (l < r) {
        int mid = l + (r - l) / 2;
        if (arr[mid] >= target) r = mid;
        else l = mid + 1;
    }
    return l;
}

// Upper Bound: First index where arr[i] > target
int upper_bound(const vector<int>& arr, int target) {
    int l = 0, r = arr.size();
    while (l < r) {
        int mid = l + (r - l) / 2;
        if (arr[mid] > target) r = mid;
        else l = mid + 1;
    }
    return l;
}`,
          description:
            "O(log N) boundaries on sorted arrays. Number of occurrences of X is upper_bound(X) - lower_bound(X).",
        },
      ],
    },
    {
      id: "two-pointers",
      title: "Two Pointers & Sliding Window",
      summary:
        "O(N) linear scan techniques for contiguous subarrays and pair matching.",
      items: [
        {
          id: "algo-sliding-window",
          name: "1. Variable-Size Sliding Window",
          syntax: `// Longest subarray with sum <= K (non-negative elements):
long long current_sum = 0;
int max_len = 0;
int left = 0;

for (int right = 0; right < n; right++) {
    current_sum += arr[right];
    
    while (current_sum > K && left <= right) {
        current_sum -= arr[left];
        left++;
    }
    
    max_len = max(max_len, right - left + 1);
}`,
          description:
            "Linear O(N) technique where both left and right pointers only move forward.",
        },
        {
          id: "algo-two-pointers-opposite",
          name: "2. Two Pointers from Opposite Ends",
          syntax: `// Find if any pair in a sorted array sums to target:
int left = 0, right = n - 1;
bool found = false;

while (left < right) {
    long long sum = (long long)arr[left] + arr[right];
    if (sum == target) {
        found = true;
        break;
    } else if (sum < target) {
        left++;
    } else {
        right--;
    }
}`,
          description:
            "Pair searching on sorted sequences in O(N) time and O(1) space.",
        },
      ],
    },
    {
      id: "prefix-sums",
      title: "Prefix Sums & Difference Arrays",
      summary:
        "O(1) range sum queries and O(1) range addition modifications.",
      items: [
        {
          id: "algo-1d-prefix",
          name: "1. 1D Range Sum Queries (1-Indexed)",
          syntax: `// Precomputation (O(N)):
vector<long long> pref(n + 1, 0);
for (int i = 0; i < n; i++) {
    pref[i + 1] = pref[i] + arr[i];
}

// Range sum query for subarray [L, R] (1-indexed) in O(1):
long long query(int L, int R) {
    return pref[R] - pref[L - 1];
}`,
          description:
            "Answer arbitrary range sum queries in O(1) time after O(N) preprocessing.",
        },
        {
          id: "algo-diff-array",
          name: "2. Difference Array (Range Increments)",
          syntax: `// Apply Q operations: add 'val' to all elements in range [L, R]
vector<long long> diff(n + 2, 0);

void add_range(int L, int R, long long val) {
    diff[L] += val;
    diff[R + 1] -= val;
}

// Reconstruct final array in O(N):
vector<long long> result(n + 1, 0);
for (int i = 1; i <= n; i++) {
    result[i] = result[i - 1] + diff[i];
}`,
          description:
            "Applies multiple range increments in O(1) per query and O(N) final pass.",
        },
      ],
    },
    {
      id: "graph-traversal",
      title: "Graph Traversal (BFS & DFS)",
      summary:
        "Breadth-First Search for shortest paths and Depth-First Search for connectivity.",
      items: [
        {
          id: "algo-bfs-shortest-path",
          name: "1. Breadth-First Search (Shortest Path in Unweighted Graph)",
          syntax: `// Returns shortest distances from start_node in an unweighted graph:
vector<int> bfs(int start_node, int num_nodes, const vector<vector<int>>& adj) {
    vector<int> dist(num_nodes + 1, -1);
    queue<int> q;

    dist[start_node] = 0;
    q.push(start_node);

    while (!q.empty()) {
        int u = q.front();
        q.pop();

        for (int v : adj[u]) {
            if (dist[v] == -1) {
                dist[v] = dist[u] + 1;
                q.push(v);
            }
        }
    }
    return dist; // dist[i] holds shortest distance from start_node to i
}`,
          description:
            "Finds the shortest path in unweighted graphs in O(V + E) time.",
        },
        {
          id: "algo-dfs",
          name: "2. Depth-First Search (DFS & Flood Fill)",
          syntax: `vector<bool> visited(num_nodes + 1, false);

void dfs(int u, const vector<vector<int>>& adj) {
    visited[u] = true;
    for (int v : adj[u]) {
        if (!visited[v]) {
            dfs(v, adj);
        }
    }
}`,
          description:
            "Explores connected components, detects cycles, and performs 2D grid flood fills.",
        },
      ],
    },
    {
      id: "dijkstra",
      title: "Dijkstra's Shortest Path",
      summary:
        "Single-source shortest paths on non-negative weighted graphs using a priority queue.",
      items: [
        {
          id: "algo-dijkstra-template",
          name: "Dijkstra's Algorithm (O((V + E) log V))",
          syntax: `struct Edge { int to; long long weight; };

vector<long long> dijkstra(int start, int n, const vector<vector<Edge>>& adj) {
    const long long INF = 1e18;
    vector<long long> dist(n + 1, INF);
    // Min-heap storing pairs: {distance, node}
    priority_queue<pair<long long, int>, 
                   vector<pair<long long, int>>, 
                   greater<pair<long long, int>>> pq;

    dist[start] = 0;
    pq.push({0, start});

    while (!pq.empty()) {
        auto [d, u] = pq.top();
        pq.pop();

        if (d > dist[u]) continue; // Stale heap entry

        for (const auto& edge : adj[u]) {
            if (dist[u] + edge.weight < dist[edge.to]) {
                dist[edge.to] = dist[u] + edge.weight;
                pq.push({dist[edge.to], edge.to});
            }
        }
    }
    return dist;
}`,
          description:
            "Calculates shortest paths on non-negative weighted graphs in O((V + E) log V).",
        },
      ],
    },
    {
      id: "dynamic-programming",
      title: "Dynamic Programming Classics",
      summary:
        "0/1 Knapsack (space-optimized) and Longest Increasing Subsequence.",
      items: [
        {
          id: "algo-knapsack",
          name: "1. 0/1 Knapsack (1D Space Optimized)",
          syntax: `// items: weights[] and values[], capacity: W
vector<long long> dp(W + 1, 0);

for (int i = 0; i < n; i++) {
    // Traverse backwards from W down to weight to ensure 0/1 usage:
    for (int w = W; w >= weights[i]; w--) {
        dp[w] = max(dp[w], dp[w - weights[i]] + values[i]);
    }
}
// dp[W] contains maximum value achievable`,
          description:
            "Solves 0/1 Knapsack in O(N * W) time using only O(W) memory.",
        },
        {
          id: "algo-lis",
          name: "2. Longest Increasing Subsequence (O(N log N))",
          syntax: `int lengthOfLIS(const vector<int>& nums) {
    vector<int> tails;
    for (int x : nums) {
        auto it = lower_bound(tails.begin(), tails.end(), x);
        if (it == tails.end()) {
            tails.push_back(x);
        } else {
            *it = x;
        }
    }
    return tails.size();
}`,
          description:
            "Finds the length of the Longest Increasing Subsequence in O(N log N) using binary search.",
        },
      ],
    },
    {
      id: "number-theory",
      title: "Math & Number Theory",
      summary:
        "GCD/LCM, fast modular exponentiation, and prime generation.",
      items: [
        {
          id: "algo-mod-pow",
          name: "1. Fast Modular Exponentiation (O(log B))",
          syntax: `// Calculates (base^exp) % mod in O(log exp) time:
long long mod_pow(long long base, long long exp, long long mod) {
    long long res = 1;
    base %= mod;
    while (exp > 0) {
        if (exp & 1) res = (__int128)res * base % mod;
        base = (__int128)base * base % mod;
        exp >>= 1;
    }
    return res;
}`,
          description:
            "Computes powers under modulo in O(log B). Use __int128 in C++ to prevent intermediate overflow.",
        },
        {
          id: "algo-sieve",
          name: "2. Sieve of Eratosthenes (Prime Generation)",
          syntax: `// Precomputes all primes up to N in O(N log log N):
vector<bool> is_prime(N + 1, true);
is_prime[0] = is_prime[1] = false;

for (int p = 2; p * p <= N; p++) {
    if (is_prime[p]) {
        for (int i = p * p; i <= N; i += p) {
            is_prime[i] = false;
        }
    }
}`,
          description:
            "Generates prime status for all integers up to N in O(N log log N).",
        },
      ],
    },
  ],
};
