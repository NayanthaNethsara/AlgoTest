import React from "react";
import Link from "next/link";
import {
  Terminal,
  ArrowRight,
  Cpu,
  CheckCircle2,
  XCircle,
  Clock,
  HardDrive,
  AlertOctagon,
  FileX,
  FastForward,
  Play,
  Send,
  HelpCircle,
} from "lucide-react";
import type { LanguageDoc, LanguageSlug } from "@/lib/docs/types";
import {
  CppIcon,
  PythonIcon,
  JavaScriptIcon,
} from "@/components/icons/language-icons";

interface DocsHubViewProps {
  languages: LanguageDoc[];
}

const VERDICTS = [
  {
    code: "AC",
    name: "Accepted",
    icon: <CheckCircle2 className="h-4 w-4 text-emerald-400" />,
    color: "bg-emerald-500/10 border-emerald-500/40 text-emerald-400",
    description:
      "Your program produced the exact expected output for all test cases within the allowed time and memory limits.",
  },
  {
    code: "WA",
    name: "Wrong Answer",
    icon: <XCircle className="h-4 w-4 text-rose-400" />,
    color: "bg-rose-500/10 border-rose-500/40 text-rose-400",
    description:
      "The program output differed from the correct answer. Check edge cases (N=0, N=1, max constraints), 0 vs 1 indexing, and numeric overflow.",
  },
  {
    code: "TLE",
    name: "Time Limit Exceeded",
    icon: <Clock className="h-4 w-4 text-amber-400" />,
    color: "bg-amber-500/10 border-amber-500/40 text-amber-400",
    description:
      "Your solution exceeded the CPU time limit (typically 1.0s - 2.0s). Look for infinite loops, O(N^2) complexity on N=10^5, or slow I/O.",
  },
  {
    code: "MLE",
    name: "Memory Limit Exceeded",
    icon: <HardDrive className="h-4 w-4 text-purple-400" />,
    color: "bg-purple-500/10 border-purple-500/40 text-purple-400",
    description:
      "Allocated RAM exceeded the 256MB boundary. Check for oversized static arrays, excessive recursion depth, or unbounded object creation.",
  },
  {
    code: "RTE",
    name: "Runtime Error",
    icon: <AlertOctagon className="h-4 w-4 text-orange-400" />,
    color: "bg-orange-500/10 border-orange-500/40 text-orange-400",
    description:
      "The program crashed (exit code != 0). Common causes: array out-of-bounds, segmentation faults, division by zero, or unhandled exceptions.",
  },
  {
    code: "CE",
    name: "Compilation Error",
    icon: <FileX className="h-4 w-4 text-yellow-400" />,
    color: "bg-yellow-500/10 border-yellow-500/40 text-yellow-400",
    description:
      "C++ code failed to build. Click the submission details in the Submissions tab to read the full compiler diagnostic log.",
  },
  {
    code: "SK",
    name: "Skipped",
    icon: <FastForward className="h-4 w-4 text-muted-foreground" />,
    color: "bg-muted/40 border-border text-muted-foreground",
    description:
      "The testcase was skipped because an earlier critical test in the same subtask group failed.",
  },
];

export function DocsHubView({ languages }: DocsHubViewProps) {
  const getLanguageIcon = (slug: LanguageSlug) => {
    switch (slug) {
      case "cpp":
        return <CppIcon className="h-6 w-6" />;
      case "python":
        return <PythonIcon className="h-6 w-6" />;
      case "javascript":
        return <JavaScriptIcon className="h-6 w-6" />;
    }
  };

  return (
    <div className="space-y-8 font-mono">
      {/* Header Banner */}
      <div className="flex flex-col gap-3 pixel-raised bg-card p-4 sm:p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center pixel-flat bg-primary text-primary-foreground">
            <Terminal className="h-5 w-5" />
          </div>
          <div>
            <div className="text-[11px] text-primary font-bold uppercase tracking-wider">
              &gt; MAN_PAGE // INDEX
            </div>
            <h1 className="text-base sm:text-lg font-bold text-foreground tracking-tight">
              Language Documentation & Syntax Reference
            </h1>
            <p className="text-xs sm:text-[13px] text-muted-foreground mt-0.5 leading-relaxed">
              Concise language guides covering basic syntax, variables, data types, control flow, loops, functions, and standard I/O for competitive programming.
            </p>
          </div>
        </div>
      </div>

      {/* Language Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {languages.map((lang) => (
          <div
            key={lang.slug}
            className="pixel-raised bg-card p-5 flex flex-col justify-between gap-5 group"
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-11 w-11 aspect-square pixel-flat bg-muted/60 flex items-center justify-center p-2 shrink-0">
                    {getLanguageIcon(lang.slug)}
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-foreground tracking-tight">
                      {lang.name}
                    </h2>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {lang.version}
                    </span>
                  </div>
                </div>
              </div>

              <p className="text-xs text-muted-foreground leading-relaxed">
                {lang.summary}
              </p>

              {/* Topics Overview Chips */}
              <div className="space-y-1.5 pt-2 border-t-2 border-border/50">
                <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                  Topics Covered:
                </div>
                <div className="flex flex-wrap gap-1">
                  {lang.topics.map((t) => (
                    <span
                      key={t.id}
                      className="pixel-flat bg-muted/50 text-foreground text-[10px] px-1.5 py-0.5"
                    >
                      {t.title}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <Link
              href={`/docs/${lang.slug}`}
              className="pixel-flat bg-primary text-primary-foreground px-3 py-2 text-xs font-bold flex items-center justify-between transition-transform active:scale-[0.98] select-none"
            >
              <span>Explore {lang.name} Guide</span>
              <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </div>
        ))}
      </div>

      {/* Online Judge & Evaluation Guide Section */}
      <div className="space-y-6 pt-4 border-t-2 border-border/60">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center pixel-flat bg-secondary text-secondary-foreground">
            <Cpu className="h-4 w-4" />
          </div>
          <div>
            <div className="text-[10px] text-primary font-bold uppercase tracking-wider">
              &gt; EVALUATION_ENGINE // ONLINE_JUDGE_GUIDE
            </div>
            <h2 className="text-base sm:text-lg font-bold text-foreground tracking-tight">
              How the Online Judge & Execution Works
            </h2>
          </div>
        </div>

        {/* Execution Model & Testing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Card 1: Standard I/O Rules */}
          <div className="pixel-raised bg-card p-5 space-y-3">
            <div className="flex items-center gap-2 border-b-2 border-border/50 pb-2">
              <Terminal className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-bold text-foreground uppercase tracking-wide">
                1. Standard Input & Output (stdin / stdout)
              </h3>
            </div>

            <p className="text-xs sm:text-[13px] text-muted-foreground leading-relaxed">
              Your solution must read test data strictly from <strong className="text-foreground">standard input (stdin / fd 0)</strong> and print results to <strong className="text-foreground">standard output (stdout / fd 1)</strong>.
            </p>

            <ul className="list-disc list-inside space-y-1.5 text-xs text-muted-foreground leading-relaxed pt-1">
              <li>
                <strong className="text-foreground">No Interactive Prompts:</strong> Do not print prompts like <code className="pixel-flat px-1 py-0.5 text-emerald-400 bg-black/60">&quot;Enter N:&quot;</code> because the judge checks exact byte-for-byte equality with truth data.
              </li>
              <li>
                <strong className="text-foreground">Whitespace & Newlines:</strong> Output each value separated by spaces or newlines exactly as requested in the problem statement.
              </li>
              <li>
                <strong className="text-foreground">Debugging Logs (stderr):</strong> Anything written to <code className="pixel-flat px-1 py-0.5 text-foreground bg-black/60">stderr</code> is captured for your viewing but ignored for verdict comparisons.
              </li>
            </ul>
          </div>

          {/* Card 2: Run Code vs Submit */}
          <div className="pixel-raised bg-card p-5 space-y-3">
            <div className="flex items-center gap-2 border-b-2 border-border/50 pb-2">
              <Play className="h-4 w-4 text-emerald-400" />
              <h3 className="text-sm font-bold text-foreground uppercase tracking-wide">
                2. &quot;Run Code&quot; vs &quot;Submit Solution&quot;
              </h3>
            </div>

            <p className="text-xs sm:text-[13px] text-muted-foreground leading-relaxed">
              Understanding the difference between testing in the workspace and final grading:
            </p>

            <div className="space-y-2.5 pt-1 text-xs">
              <div className="pixel-flat bg-muted/40 p-2.5 space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-foreground">
                  <Play className="h-3.5 w-3.5 text-emerald-400" />
                  <span>Run Code (Interactive Testing)</span>
                </div>
                <p className="text-muted-foreground leading-normal">
                  Executes your code against sample test cases or custom input in the editor. Does not count towards submissions or contest penalties.
                </p>
              </div>

              <div className="pixel-flat bg-primary/10 border-primary/40 p-2.5 space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-primary">
                  <Send className="h-3.5 w-3.5" />
                  <span>Submit Solution (Official Grading)</span>
                </div>
                <p className="text-muted-foreground leading-normal">
                  Grades your solution against the full hidden test suite, evaluates subtasks, awards points, and updates the leaderboard.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Verdicts Reference Matrix */}
        <div className="pixel-raised bg-card p-5 space-y-4">
          <div className="flex items-center justify-between border-b-2 border-border/50 pb-2.5">
            <div className="flex items-center gap-2">
              <HelpCircle className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-bold text-foreground uppercase tracking-wide">
                3. Judge Verdicts & Status Meanings
              </h3>
            </div>
            <span className="text-[11px] text-muted-foreground">
              Reference Matrix
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {VERDICTS.map((v) => (
              <div
                key={v.code}
                className="pixel-flat bg-black/40 border border-border/70 p-3 flex flex-col gap-1.5"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {v.icon}
                    <span className="text-xs font-bold text-foreground">
                      {v.name}
                    </span>
                  </div>
                  <span
                    className={`pixel-flat px-2 py-0.5 text-[10px] font-bold border ${v.color}`}
                  >
                    {v.code}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {v.description}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Subtasks & Scoring Card */}
        <div className="pixel-raised bg-card p-5 space-y-3">
          <div className="flex items-center gap-2 border-b-2 border-border/50 pb-2">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-bold text-foreground uppercase tracking-wide">
              4. Subtasks & Partial Scoring
            </h3>
          </div>

          <p className="text-xs sm:text-[13px] text-muted-foreground leading-relaxed">
            Problems may feature multiple subtasks with increasing constraint limits (e.g. Subtask 1 with <code className="pixel-flat px-1 text-foreground bg-black/60">N &le; 100</code> for 30 points, and Subtask 2 with <code className="pixel-flat px-1 text-foreground bg-black/60">N &le; 100,000</code> for 70 points).
          </p>

          <p className="text-xs text-muted-foreground leading-relaxed">
            Points are awarded for each subtask where all test cases pass with an <strong className="text-emerald-400">Accepted (AC)</strong> verdict. Even if your solution times out on large inputs, solving smaller subtasks earns valuable partial credit on the leaderboard.
          </p>
        </div>
      </div>
    </div>
  );
}
