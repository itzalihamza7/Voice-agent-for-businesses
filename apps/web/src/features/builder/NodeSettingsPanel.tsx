"use client";

import type { FlowIssue, FlowNode } from "@voice-agent/shared";
import type { ReactNode } from "react";
import { NODE_CATALOG, newId } from "./node-catalog";

// Edits the settings of the selected node. Each node type has its own small form.

interface Props {
  node: FlowNode;
  issues: FlowIssue[];
  onChange: (data: FlowNode["data"]) => void;
  onDelete: () => void;
}

export function NodeSettingsPanel({ node, issues, onChange, onDelete }: Props) {
  const kind = NODE_CATALOG[node.type];
  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-semibold">{kind.label}</h2>
        <p className="text-sm text-gray-500">{kind.description}</p>
      </div>

      <Form node={node} onChange={onChange} />

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

function Form({ node, onChange }: Pick<Props, "node" | "onChange">) {
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
        </>
      );
    case "aiResponse":
      return (
        <TextArea
          label="Instructions for the AI"
          rows={5}
          value={node.data.instructions}
          onChange={(instructions) => onChange({ ...node.data, instructions })}
        />
      );
    case "branch":
      return (
        <div className="space-y-2">
          <p className="text-sm font-medium">Paths</p>
          {node.data.conditions.map((condition, index) => (
            <div key={condition.id} className="flex gap-2">
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
              onChange({ conditions: [...node.data.conditions, { id: newId("c"), label: "" }] })
            }
          >
            + Add path
          </button>
          <p className="text-xs text-gray-500">
            &quot;Otherwise&quot; is taken when no path matches.
          </p>
        </div>
      );
    case "tool":
      return (
        <TextInput
          label="Tool name"
          placeholder="lookupOrder"
          value={node.data.toolName}
          onChange={(toolName) => onChange({ ...node.data, toolName })}
        />
      );
    case "knowledgeLookup":
      return (
        <TextArea
          label="What to look up"
          value={node.data.query}
          onChange={(query) => onChange({ ...node.data, query })}
        />
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
