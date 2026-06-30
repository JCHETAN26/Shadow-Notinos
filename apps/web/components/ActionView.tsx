import type { PatchAction } from "@/lib/types";

const TYPE_LABEL: Record<PatchAction["type"], string> = {
  append_callout: "Callout",
  append_code_block: "Code block",
  append_todo: "To-do",
  append_bullets: "Bullets",
  create_review_task: "Review task",
  update_doc_status: "Doc status",
};

/** Render a single proposed patch action as a Notion-native preview. */
export function ActionView({ action }: { action: PatchAction }) {
  return (
    <div className="rounded-lg border">
      <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-1.5">
        <span className="text-xs font-medium">{TYPE_LABEL[action.type]}</span>
        {"targetHeading" in action && (
          <span className="font-mono text-xs text-muted-foreground">↳ {action.targetHeading}</span>
        )}
      </div>
      <div className="px-3 py-2.5 text-sm">{renderBody(action)}</div>
    </div>
  );
}

function renderBody(action: PatchAction) {
  switch (action.type) {
    case "append_callout":
      return (
        <div className="flex gap-2 rounded-md bg-muted px-3 py-2">
          <span>{action.icon ?? "💡"}</span>
          <span>{action.text}</span>
        </div>
      );
    case "append_code_block":
      return (
        <pre className="overflow-x-auto rounded-md bg-foreground px-3 py-2 font-mono text-xs text-background">
          <code>{action.code}</code>
        </pre>
      );
    case "append_todo":
      return (
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={action.checked} readOnly className="accent-foreground" />
          <span>{action.text}</span>
        </label>
      );
    case "append_bullets":
      return (
        <ul className="list-disc space-y-1 pl-5">
          {action.bullets.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      );
    case "create_review_task":
      return (
        <div>
          <div className="font-medium">{action.title}</div>
          <div className="text-muted-foreground">
            {action.reason} · priority {action.priority}
          </div>
        </div>
      );
    case "update_doc_status":
      return (
        <div>
          Set doc status to <span className="font-medium">{action.status}</span>
          <div className="text-muted-foreground">{action.reason}</div>
        </div>
      );
  }
}
