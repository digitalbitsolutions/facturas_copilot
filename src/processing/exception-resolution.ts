export type ResolutionAction =
  | "request_replacement"
  | "discard_non_invoice"
  | "retry_after_correction"
  | "update_supplier_and_resubmit"
  | "confirm_duplicate"
  | "retry_after_technical_fix";

type Rule = { actions: readonly ResolutionAction[]; discarded?: readonly ResolutionAction[] };

const rules: Record<string, Rule> = {
  "EX-02": { actions: ["request_replacement"] },
  "EX-03": { actions: ["discard_non_invoice"], discarded: ["discard_non_invoice"] },
  "EX-04": { actions: ["retry_after_correction"] },
  "EX-05": { actions: ["request_replacement"] },
  "EX-06": { actions: ["update_supplier_and_resubmit"] },
  "EX-07": { actions: ["confirm_duplicate"], discarded: ["confirm_duplicate"] },
  "EX-08": { actions: ["retry_after_technical_fix"] },
  "EX-09": { actions: ["retry_after_technical_fix"] },
};

export function validateResolution(code: string, action: string, responsible: string, result: string): { action: ResolutionAction; finalState: "Resuelta" | "Descartada" } {
  if (!responsible.trim()) throw new TypeError("responsible is required");
  if (!result.trim()) throw new TypeError("result is required");
  const rule = rules[code];
  if (!rule) throw new TypeError(`Unsupported exception code '${code}'`);
  if (!rule.actions.includes(action as ResolutionAction)) throw new TypeError(`Action '${action}' is not allowed for ${code}`);
  const resolutionAction = action as ResolutionAction;
  return { action: resolutionAction, finalState: rule.discarded?.includes(resolutionAction) ? "Descartada" : "Resuelta" };
}

export function allowedResolutionActions(code: string): readonly ResolutionAction[] { return rules[code]?.actions ?? []; }
