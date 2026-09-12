"use client";

import { useState } from "react";
import { EyeIcon, PencilIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Markdown } from "@/components/markdown";

type ViewMode = "edit" | "split" | "preview";

const PLACEHOLDER = "Write the problem statement in Markdown. LaTeX via $…$ is supported.";

interface StatementTabProps {
  statement: string;
  constraints?: string;
  onStatementChange: (val: string) => void;
  onConstraintsChange: (val: string) => void;
}

function Preview({ statement }: { statement: string }) {
  return (
    <div className="max-h-112 min-h-88 overflow-y-auto rounded-lg border bg-muted/10 p-4">
      <Markdown>{statement || "*No statement provided.*"}</Markdown>
    </div>
  );
}

export function StatementTab({
  statement,
  constraints = "",
  onStatementChange,
  onConstraintsChange,
}: StatementTabProps) {
  const [view, setView] = useState<ViewMode>("split");

  const editor = (
    <Textarea
      id="problem-statement"
      value={statement}
      onChange={(e) => onStatementChange(e.target.value)}
      rows={16}
      placeholder={PLACEHOLDER}
      required
      spellCheck={false}
      className="min-h-88 font-mono text-xs leading-relaxed"
    />
  );

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="border-b">
          <CardTitle className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Problem statement
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Markdown with LaTeX, shown to competitors exactly as previewed here.
          </p>
          <Tabs
            value={view}
            onValueChange={(v) => setView(v as ViewMode)}
            className="col-start-2 row-span-2 row-start-1 self-start justify-self-end"
          >
            <TabsList className="h-8">
              <TabsTrigger value="edit" className="h-7 gap-1 text-xs">
                <PencilIcon className="size-3" />
                <span className="hidden sm:inline">Edit</span>
              </TabsTrigger>
              <TabsTrigger value="split" className="hidden h-7 text-xs md:inline-flex">
                Split
              </TabsTrigger>
              <TabsTrigger value="preview" className="h-7 gap-1 text-xs">
                <EyeIcon className="size-3" />
                <span className="hidden sm:inline">Preview</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>

        <CardContent>
          {view === "edit" && editor}
          {view === "preview" && <Preview statement={statement} />}
          {view === "split" && (
            <div className="grid gap-4 md:grid-cols-2">
              {editor}
              <Preview statement={statement} />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Field>
            <FieldLabel htmlFor="problem-constraints">Constraints</FieldLabel>
            <Textarea
              id="problem-constraints"
              value={constraints}
              onChange={(e) => onConstraintsChange(e.target.value)}
              rows={4}
              spellCheck={false}
              placeholder={"- $1 \\le N \\le 10^5$\n- $0 \\le A_i \\le 10^9$"}
              className="font-mono text-xs"
            />
            <FieldDescription>
              Rendered as a bullet list beneath the statement. Markdown and LaTeX both work.
            </FieldDescription>
          </Field>
        </CardContent>
      </Card>
    </div>
  );
}
