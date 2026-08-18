import { useState } from "react";
import { Edit3, Eye } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Markdown } from "@/components/markdown";

interface StatementTabProps {
  statement: string;
  constraints?: string;
  onStatementChange: (val: string) => void;
  onConstraintsChange: (val: string) => void;
}

export function StatementTab({
  statement,
  constraints = "",
  onStatementChange,
  onConstraintsChange,
}: StatementTabProps) {
  const [statementViewTab, setStatementViewTab] = useState<"edit" | "preview" | "split">("split");

  return (
    <div className="flex flex-col gap-6">
      <Card className="p-5 flex flex-col gap-4 shadow-sm border border-border">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Problem Statement (Markdown & MathJax)
            </h2>
            <p className="text-xs text-muted-foreground">
              The full problem description shown to competitors.
            </p>
          </div>

          <Tabs
            value={statementViewTab}
            onValueChange={(v) => setStatementViewTab(v as "edit" | "preview" | "split")}
          >
            <TabsList className="h-8">
              <TabsTrigger value="edit" className="gap-1 text-xs h-7">
                <Edit3 className="h-3 w-3" /> Edit
              </TabsTrigger>
              <TabsTrigger value="split" className="text-xs h-7">
                Split
              </TabsTrigger>
              <TabsTrigger value="preview" className="gap-1 text-xs h-7">
                <Eye className="h-3 w-3" /> Preview
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {statementViewTab === "edit" && (
          <Textarea
            value={statement}
            onChange={(e) => onStatementChange(e.target.value)}
            rows={16}
            placeholder="Write problem statement in Markdown format..."
            className="font-mono text-xs leading-relaxed"
            required
          />
        )}

        {statementViewTab === "preview" && (
          <div className="min-h-[350px] rounded-md border bg-muted/10 p-5">
            <Markdown>{statement || "*No statement provided.*"}</Markdown>
          </div>
        )}

        {statementViewTab === "split" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Textarea
              value={statement}
              onChange={(e) => onStatementChange(e.target.value)}
              rows={16}
              placeholder="Write statement in Markdown format..."
              className="font-mono text-xs leading-relaxed"
              required
            />
            <div className="min-h-[350px] max-h-[400px] overflow-y-auto rounded-md border bg-muted/10 p-4">
              <Markdown>{statement || "*No statement provided.*"}</Markdown>
            </div>
          </div>
        )}
      </Card>

      {/* Constraints Block */}
      <Card className="p-5 flex flex-col gap-3 shadow-sm border border-border">
        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Constraints (Markdown & LaTeX)
        </label>
        <Textarea
          value={constraints}
          onChange={(e) => onConstraintsChange(e.target.value)}
          rows={4}
          placeholder="- $1 \le N \le 10^5$&#10;- $0 \le A_i \le 10^9$"
          className="font-mono text-xs"
        />
      </Card>
    </div>
  );
}
