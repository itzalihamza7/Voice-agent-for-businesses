"use client";

import {
  ANSWER_TYPES,
  type AnswerType,
  type FlowIssue,
  type FlowNode,
  type ToolInfo,
} from "@voice-agent/shared";
import type { ReactNode } from "react";
import { NODE_CATALOG, newId } from "./node-catalog";
import { toolParameters } from "./tool-list";

// Edits the settings of the selected node. Each node type has its own small form.

const ANSWER_TYPE_LABELS: Record<AnswerType, string> = {
  text: "Any text",
  name: "A name",
  phone: "A phone number",
  email: "An email address",
  date: 'A date (e.g. "next Friday")',
  time: 'A time (e.g. "half past three")',
  number: "A number",
  yesNo: "Yes or no",
};

interface Props {
  node: FlowNode;
  issues: FlowIssue[];
  /** Every tool the agent can use, for Tool and AI response steps. */
  tools: ToolInfo[];
  onChange: (data: FlowNode["data"]) => void;
  onDelete: () => void;
}

export function NodeSettingsPanel({ node, issues, tools, onChange, onDelete }: Props) {
  const kind = NODE_CATALOG[node.type];
  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-semibold">{kind.label}</h2>
        <p className="text-sm text-gray-500">{kind.description}</p>
      </div>

      <Form node={node} tools={tools} onChange={onChange} />

      {issues.length > 0 && (
        <ul className="space-y-1 rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">
          {issues.map((issue, index) => (
            // Two unnamed Branch paths can produce the same message, so the index is part of the key.
            <li key={`${index}-${issue.message}`}>{issue.message}</li>
          ))}
        </ul>
      )}

      {node.type !== "start" && (
        <button
          type="button"
          onClick={onDelete}
          className="text-sm text-red-600 underline hover:text-red-800"
        >
          Delete step
        </button>
      )}
    </div>
  );
}

function Form({ node, tools, onChange }: Pick<Props, "node" | "tools" | "onChange">) {
  switch (node.type) {
    case "start":
      return <p className="text-sm text-gray-500">Connect Start to the first step of the call.</p>;
    case "say":
      return (
        <TextArea
          label="What the agent says"
          value={node.data.text}
          onChange={(text) => onChange({ ...node.data, text })}
        />
      );
    case "ask":
      return (
        <>
          <TextArea
            label="Question"
            value={node.data.question}
            onChange={(question) => onChange({ ...node.data, question })}
          />
          <TextInput
            label="Save the answer as (variable)"
            placeholder="order_number"
            value={node.data.variable}
            onChange={(variable) => onChange({ ...node.data, variable })}
          />
          <label className="block text-sm">
            <span className="font-medium">Expected answer</span>
            <select
              aria-label="Expected answer"
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
              value={node.data.answerType}
              onChange={(event) =>
                onChange({ ...node.data, answerType: event.target.value as AnswerType })
              }
            >
              {ANSWER_TYPES.map((type) => (
                <option key={type} value={type}>
                  {ANSWER_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-gray-500">
              {node.data.answerType === "text"
                ? "Saved exactly as the caller says it."
                : "Turned into a clean value; the caller is asked again if it isn't understood."}
              {(node.data.answerType === "date" || node.data.answerType === "time") &&
                ` Also saves {{${node.data.variable || "variable"}_spoken}}, easy to say aloud.`}
            </span>
          </label>
        </>
      );
    case "aiResponse":
      return (
        <>
          <TextArea
            label="Instructions for the AI"
            rows={5}
            value={node.data.instructions}
            onChange={(instructions) => onChange({ ...node.data, instructions })}
          />
          <fieldset className="space-y-1">
            <legend className="text-sm font-medium">Tools the AI may use</legend>
            <p className="text-xs text-gray-500">
              The AI can call these (several times if needed) before it answers, e.g. to look up
              free times instead of guessing.
            </p>
            {tools.map((tool) => (
              <label key={tool.name} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={node.data.tools.includes(tool.name)}
                  onChange={(event) =>
                    onChange({
                      ...node.data,
                      tools: event.target.checked
                        ? [...node.data.tools, tool.name]
                        : node.data.tools.filter((name) => name !== tool.name),
                    })
                  }
                />
                <span>
                  <code className="text-xs">{tool.name}</code>
                  <span className="block text-xs text-gray-500">{tool.description}</span>
                </span>
              </label>
            ))}
          </fieldset>
        </>
      );
    case "branch":
      return (
        <div className="space-y-2">
          <p className="text-sm font-medium">Paths</p>
          {node.data.conditions.map((condition, index) => (
            <div key={condition.id} className="flex gap-2">
              <div className="flex-1 space-y-1">
                <TextInput
                  label={`Path ${index + 1}: when…`}
                  placeholder="Caller wants to book"
                  value={condition.label}
                  onChange={(label) =>
                    onChange({
                      conditions: node.data.conditions.map((c) =>
                        c.id === condition.id ? { ...c, label } : c,
                      ),
                    })
                  }
                />
                <div className="flex gap-1">
                  <TextInput
                    label={`Path ${index + 1}: rule variable`}
                    placeholder="availability_requestedTimeFree"
                    value={condition.variable}
                    onChange={(variable) =>
                      onChange({
                        conditions: node.data.conditions.map((c) =>
                          c.id === condition.id ? { ...c, variable } : c,
                        ),
                      })
                    }
                  />
                  <TextInput
                    label="equals"
                    placeholder="true"
                    value={condition.equals}
                    onChange={(equals) =>
                      onChange({
                        conditions: node.data.conditions.map((c) =>
                          c.id === condition.id ? { ...c, equals } : c,
                        ),
                      })
                    }
                  />
                </div>
                <TextInput
                  label={`Path ${index + 1}: keywords (optional)`}
                  placeholder="book, appointment"
                  value={condition.keywords}
                  onChange={(keywords) =>
                    onChange({
                      conditions: node.data.conditions.map((c) =>
                        c.id === condition.id ? { ...c, keywords } : c,
                      ),
                    })
                  }
                />
              </div>
              <button
                type="button"
                aria-label={`Remove path ${index + 1}`}
                className="self-end pb-1 text-gray-400 hover:text-red-600"
                onClick={() =>
                  onChange({
                    conditions: node.data.conditions.filter((c) => c.id !== condition.id),
                  })
                }
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            className="text-sm text-blue-600 underline"
            onClick={() =>
              onChange({
                conditions: [
                  ...node.data.conditions,
                  { id: newId("c"), label: "", keywords: "", variable: "", equals: "" },
                ],
              })
            }
          >
            + Add path
          </button>
          <p className="text-xs text-gray-500">
            &quot;Otherwise&quot; is taken when no path matches. A rule (variable equals value) is
            checked first, in code: best for tool results, e.g. availability_requestedTimeFree =
            true. Otherwise the AI picks the path from what the caller said; keywords are used
            without AI, and shown next to the AI&apos;s choice for comparison.
          </p>
        </div>
      );
    case "tool": {
      const tool = tools.find((t) => t.name === node.data.toolName);
      const saveAs = node.data.saveAs || "result";
      return (
        <>
          <label className="block text-sm">
            <span className="font-medium">Tool</span>
            <select
              aria-label="Tool"
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
              value={node.data.toolName}
              onChange={(event) => onChange({ ...node.data, toolName: event.target.value })}
            >
              <option value="">Choose a tool…</option>
              {node.data.toolName && !tool && (
                <option value={node.data.toolName}>{node.data.toolName} (not available)</option>
              )}
              {tools.map((t) => (
                <option key={t.name} value={t.name}>
                  {t.name} ({t.source})
                </option>
              ))}
            </select>
            {tool && <span className="mt-1 block text-xs text-gray-500">{tool.description}</span>}
          </label>
          {tool && (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Arguments</legend>
              <p className="text-xs text-gray-500">
                Use {"{{variables}}"}, e.g. {"{{preferred_date}}"}. Leave empty to let the AI fill
                it in from the conversation.
              </p>
              {toolParameters(tool).map((parameter) => (
                <TextInput
                  key={parameter.name}
                  label={`${parameter.name}${parameter.required ? " *" : ""}`}
                  placeholder={parameter.description}
                  value={node.data.arguments[parameter.name] ?? ""}
                  onChange={(value) =>
                    onChange({
                      ...node.data,
                      arguments: { ...node.data.arguments, [parameter.name]: value },
                    })
                  }
                />
              ))}
            </fieldset>
          )}
          <TextInput
            label="Save the result as (optional)"
            placeholder="availability"
            value={node.data.saveAs}
            onChange={(value) => onChange({ ...node.data, saveAs: value })}
          />
          <p className="text-xs text-gray-500">
            The result&apos;s fields become variables
            {tool?.resultFields
              ? `: ${tool.resultFields.map((field) => `{{${saveAs}_${field}}}`).join(", ")}`
              : `, e.g. {{${saveAs}_status}}`}
            . The AI and later steps always see the full result.
          </p>
        </>
      );
    }
    case "knowledgeLookup":
      return (
        <>
          <TextArea
            label="Topic (optional)"
            value={node.data.query}
            onChange={(query) => onChange({ ...node.data, query })}
          />
          <p className="text-xs text-gray-500">
            The search uses what the caller just asked; the topic helps when their words are vague.
            Documents are managed on the Knowledge base page.
          </p>
          <label className="block text-sm">
            <span className="font-medium">Search</span>
            <select
              aria-label="Search mode"
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
              value={node.data.mode}
              onChange={(event) =>
                onChange({ ...node.data, mode: event.target.value as typeof node.data.mode })
              }
            >
              <option value="hybrid">Hybrid: meaning + keywords (default)</option>
              <option value="vector">Meaning only (vector)</option>
              <option value="keyword">Keywords only</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-medium">Passages to give the AI</span>
            <select
              aria-label="Passages to give the AI"
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
              value={node.data.limit}
              onChange={(event) => onChange({ ...node.data, limit: Number(event.target.value) })}
            >
              {[1, 2, 3, 4, 5, 6, 8].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={node.data.rewrite}
              onChange={(event) => onChange({ ...node.data, rewrite: event.target.checked })}
            />
            <span>
              Rewrite the question first
              <span className="block text-xs text-gray-500">
                The AI turns spoken words into a search query (~1 s).
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={node.data.rerank}
              onChange={(event) => onChange({ ...node.data, rerank: event.target.checked })}
            />
            <span>
              Check relevance (rerank)
              <span className="block text-xs text-gray-500">
                The AI rates the passages and drops unrelated ones (~1 s). Recommended: without it,
                small models invented answers from unrelated passages.
              </span>
            </span>
          </label>
        </>
      );
    case "transfer":
      return (
        <>
          <TextInput
            label="Phone number"
            placeholder="+14155550123"
            value={node.data.phoneNumber}
            onChange={(phoneNumber) => onChange({ ...node.data, phoneNumber })}
          />
          <TextArea
            label="Message before transferring (optional)"
            value={node.data.message}
            onChange={(message) => onChange({ ...node.data, message })}
          />
        </>
      );
    case "end":
      return (
        <TextArea
          label="Goodbye message (optional)"
          value={node.data.message}
          onChange={(message) => onChange({ ...node.data, message })}
        />
      );
  }
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block flex-1 text-sm">
      <span className="font-medium">{label}</span>
      {children}
    </label>
  );
}

interface InputProps {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}

function TextInput({ label, value, placeholder, onChange }: InputProps) {
  return (
    <Field label={label}>
      <input
        className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
}

function TextArea({ label, value, onChange, rows = 3 }: InputProps & { rows?: number }) {
  return (
    <Field label={label}>
      <textarea
        className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
        rows={rows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
}
