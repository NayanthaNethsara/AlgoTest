"use client";

import { BookOpenIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { EmptyState } from "@/components/shell/data-states";
import type { Sample } from "@/types/problem";

interface SamplesTabProps {
  samples: Sample[];
  onAddSample: () => void;
  onRemoveSample: (index: number) => void;
  onSampleChange: (index: number, field: keyof Sample, value: string) => void;
}

export function SamplesTab({
  samples,
  onAddSample,
  onRemoveSample,
  onSampleChange,
}: SamplesTabProps) {
  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          Public sample cases
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Shown inside the statement. These are <strong>not</strong> used for judging.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={onAddSample}
          className="col-start-2 row-span-2 row-start-1 gap-1.5 self-start justify-self-end"
        >
          <PlusIcon /> Add sample
        </Button>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {samples.length === 0 ? (
          <EmptyState
            icon={<BookOpenIcon />}
            title="No sample cases"
            description="Competitors rely on samples to understand the input format."
            action={
              <Button variant="outline" size="sm" onClick={onAddSample} className="gap-1.5">
                <PlusIcon /> Add sample
              </Button>
            }
          />
        ) : (
          samples.map((s, idx) => (
            <fieldset key={idx} className="flex flex-col gap-3 rounded-lg border bg-muted/10 p-4">
              <legend className="sr-only">Sample {idx + 1}</legend>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                  Sample #{idx + 1}
                </span>
                {samples.length > 1 && (
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => onRemoveSample(idx)}
                          aria-label={`Remove sample ${idx + 1}`}
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        />
                      }
                    >
                      <Trash2Icon />
                    </TooltipTrigger>
                    <TooltipContent>Remove sample</TooltipContent>
                  </Tooltip>
                )}
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor={`sample-input-${idx}`}>Standard input</FieldLabel>
                  <Textarea
                    id={`sample-input-${idx}`}
                    value={s.input}
                    onChange={(e) => onSampleChange(idx, "input", e.target.value)}
                    rows={3}
                    spellCheck={false}
                    placeholder={"5\n1 2 3 4 5"}
                    className="font-mono text-xs"
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor={`sample-output-${idx}`}>Standard output</FieldLabel>
                  <Textarea
                    id={`sample-output-${idx}`}
                    value={s.output}
                    onChange={(e) => onSampleChange(idx, "output", e.target.value)}
                    rows={3}
                    spellCheck={false}
                    placeholder="15"
                    className="font-mono text-xs"
                  />
                </Field>
              </div>

              <Field>
                <FieldLabel htmlFor={`sample-explanation-${idx}`}>Explanation</FieldLabel>
                <Input
                  id={`sample-explanation-${idx}`}
                  value={s.explanation || ""}
                  onChange={(e) => onSampleChange(idx, "explanation", e.target.value)}
                  placeholder="The sum of all elements is 15."
                  className="text-xs"
                />
              </Field>
            </fieldset>
          ))
        )}
      </CardContent>
    </Card>
  );
}
