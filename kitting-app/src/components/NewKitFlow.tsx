import { useRef, useState } from "react";
import { useStore } from "../store/useStore";
import { useUI } from "../store/useUI";
import { Field, IconCamera, IconImport, IconWarn, Segmented, Sheet } from "./ui";
import { KitType, RequiredItem } from "../lib/types";
import { parseMasterFormula, PreliminaryFields } from "../lib/formula";
import { makeId } from "../lib/ids";
import { IpSelector } from "./IpSelector";
import { BatchLibraryPicker } from "./BatchLibrary";

type Step = "type" | "source" | "extract" | "review";

export function NewKitFlow({ onClose }: { onClose: () => void }) {
  const createKit = useStore((s) => s.createKit);
  const setKitItems = useStore((s) => s.setKitItems);
  const updateKit = useStore((s) => s.updateKit);
  const pushToast = useStore((s) => s.pushToast);
  const openKit = useUI((s) => s.openKit);
  const setActiveKit = useUI((s) => s.setActiveKit);

  const [step, setStep] = useState<Step>("type");
  const [type, setType] = useState<KitType>("herb");
  const [progress, setProgress] = useState<{ msg: string; pct: number }>({ msg: "", pct: 0 });
  const [confidence, setConfidence] = useState<number | null>(null);
  const [method, setMethod] = useState<string>("manual");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [prelim, setPrelim] = useState<PreliminaryFields>({ customer: "", product: "", batch: "", mmrEdition: "" });
  const [items, setItems] = useState<RequiredItem[]>([]);
  const [ip, setIp] = useState("");
  const [dueDate, setDueDate] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  async function runExtraction(file: File) {
    setStep("extract");
    setProgress({ msg: "Starting…", pct: 0 });
    try {
      // Heavy PDF/OCR libraries load on demand.
      const { extractDocument } = await import("../lib/extract");
      const res = await extractDocument(file, (msg, pct) => setProgress({ msg, pct: pct ?? 0 }));
      const parsed = parseMasterFormula(res.text, type);
      setMethod(res.method);
      setConfidence(Math.round(res.confidence * 100) / 100);
      setPrelim(parsed.preliminary);
      setItems(parsed.items);
      setWarnings(parsed.warnings);
      setStep("review");
    } catch (e) {
      // In the sandbox OCR is unavailable; drop into manual review rather than
      // bouncing back, so the user can key the formula in by hand.
      pushToast({ message: (e as Error).message, kind: "info" });
      setMethod("manual");
      setConfidence(null);
      setWarnings([(e as Error).message]);
      setStep("review");
    }
  }

  function fromBatchText(text: string, meta: Partial<PreliminaryFields>) {
    const parsed = parseMasterFormula(text, type);
    setMethod("pdf-text");
    setConfidence(Math.round(parsed.confidence * 100) / 100);
    setPrelim({ ...parsed.preliminary, ...meta });
    setItems(parsed.items);
    setWarnings(parsed.warnings);
    setStep("review");
  }

  function addBlankItem() {
    setItems((its) => [
      ...its,
      {
        id: makeId("req"),
        itemCode: "",
        name: "",
        requiredAmount: null,
        requiredUom: type === "packaging" ? "ea" : "",
        packagingQty: null,
        section: type === "packaging" ? "Packaging" : "Ingredients",
        allocations: [],
        matched: false,
      },
    ]);
  }

  function finalize() {
    const kitId = createKit(type, {
      customer: prelim.customer,
      product: prelim.product,
      batch: prelim.batch,
      mmrEdition: prelim.mmrEdition,
      fishbowlLocation: ip,
      dueDate,
      extraction: confidence != null ? { method: method as any, confidence, sourceName: "Master Formula" } : undefined,
    });
    setKitItems(kitId, items.filter((i) => i.itemCode || i.name));
    updateKit(kitId, {}); // touch
    setActiveKit(kitId);
    pushToast({ message: `${type === "herb" ? "Herb" : "Packaging"} kit created — start moving stock.`, kind: "success" });
    openKit(kitId);
    onClose();
  }

  const titleByStep: Record<Step, string> = {
    type: "New kit",
    source: "Master Formula",
    extract: "Extracting…",
    review: "Review & create",
  };

  return (
    <Sheet
      title={titleByStep[step]}
      onClose={onClose}
      footer={
        step === "review" ? (
          <>
            <button className="btn" onClick={() => setStep("source")} style={{ flex: 1 }}>
              Back
            </button>
            <button className="btn btn--green" onClick={finalize} style={{ flex: 2 }}>
              Create {type === "herb" ? "Herb" : "Packaging"} Kit
            </button>
          </>
        ) : undefined
      }
    >
      <div className="container">
        {step === "type" && (
          <>
            <div className="section__header">Kit type</div>
            <Segmented
              value={type}
              onChange={(v) => setType(v)}
              options={[
                { value: "herb", label: "Herb Kit" },
                { value: "packaging", label: "Packaging Kit" },
              ]}
            />
            <p className="small muted" style={{ margin: "12px 0" }}>
              {type === "herb"
                ? "Herb kits extract every ingredient section (including repeated “Ingredients” and “Other Ingredients”). Packaging rows are ignored."
                : "Packaging kits extract only rows under “Packaging”. Ingredient rows are ignored."}
            </p>
            <button className="btn btn--primary btn--block" onClick={() => setStep("source")}>
              Continue
            </button>
          </>
        )}

        {step === "source" && (
          <>
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf,image/*"
              style={{ display: "none" }}
              onChange={(e) => e.target.files?.[0] && runExtraction(e.target.files[0])}
            />
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: "none" }}
              onChange={(e) => e.target.files?.[0] && runExtraction(e.target.files[0])}
            />
            <div className="section__header">Supply the Master Formula</div>
            <div className="group">
              <button className="row row--button" onClick={() => cameraRef.current?.click()}>
                <IconCamera className="row__chevron" />
                <div className="row__label">
                  <div style={{ fontWeight: 600 }}>Capture with camera</div>
                  <div className="tiny muted">Photograph the printed formula — OCR handles rotated/imperfect photos.</div>
                </div>
              </button>
              <button className="row row--button" onClick={() => fileRef.current?.click()}>
                <IconImport className="row__chevron" />
                <div className="row__label">
                  <div style={{ fontWeight: 600 }}>Upload image or PDF</div>
                  <div className="tiny muted">Text PDFs use native extraction; scans/images use OCR automatically.</div>
                </div>
              </button>
            </div>

            <BatchLibraryPicker
              customer={prelim.customer}
              onPick={(doc) =>
                fromBatchText(doc.text ?? "", {
                  customer: doc.customer,
                  product: doc.product,
                  batch: doc.batch,
                  mmrEdition: doc.mmrEdition,
                })
              }
              onCustomer={(c) => setPrelim((p) => ({ ...p, customer: c }))}
            />

            <button className="btn btn--block" style={{ marginTop: 12 }} onClick={() => setStep("review")}>
              Skip — enter kit manually
            </button>
          </>
        )}

        {step === "extract" && (
          <div style={{ padding: 24, textAlign: "center" }}>
            <div className="spin" style={{ fontSize: 40 }}>◍</div>
            <div style={{ fontWeight: 700, marginTop: 12 }}>{progress.msg || "Working…"}</div>
            <div className="progress" style={{ margin: "16px auto", maxWidth: 320 }}>
              <div className="progress__bar" style={{ width: `${Math.round((progress.pct || 0) * 100)}%` }} />
            </div>
            <p className="small muted">Real extraction runs on-device — no data leaves your browser.</p>
          </div>
        )}

        {step === "review" && (
          <>
            {confidence != null && (
              <div className="group" style={{ padding: 12, marginBottom: 12 }}>
                <div className="hstack">
                  <span className={`badge ${confidence > 0.8 ? "badge--green" : confidence > 0.5 ? "badge--orange" : "badge--red"}`}>
                    {method === "ocr" ? "OCR" : method === "pdf-text" ? "PDF text" : "Manual"} · {Math.round(confidence * 100)}% confidence
                  </span>
                  <span className="tiny muted">Review and correct everything below before creating the kit.</span>
                </div>
                {warnings.map((w) => (
                  <div key={w} className="hstack tiny" style={{ color: "var(--orange)", marginTop: 6 }}>
                    <IconWarn className="" /> {w}
                  </div>
                ))}
              </div>
            )}

            <div className="section__header">Preliminary fields</div>
            <div className="group" style={{ marginBottom: 8 }}>
              <PrelimRow label="Customer" value={prelim.customer} onChange={(v) => setPrelim({ ...prelim, customer: v })} />
              <PrelimRow label="Product" value={prelim.product} onChange={(v) => setPrelim({ ...prelim, product: v })} />
              <PrelimRow label="Batch #" value={prelim.batch} onChange={(v) => setPrelim({ ...prelim, batch: v })} />
              <PrelimRow label="Formula/MMR Edition" value={prelim.mmrEdition} onChange={(v) => setPrelim({ ...prelim, mmrEdition: v })} />
            </div>

            <Field label="Due date (optional)">
              <input className="input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </Field>

            <div className="section__header">Fish Bowl Location (In Process)</div>
            <IpSelector value={ip} batch={prelim.batch} onChange={setIp} />

            <div className="section__header" style={{ marginTop: 12 }}>
              Required items ({items.length}) · {type === "herb" ? "ingredients only" : "packaging only"}
            </div>
            <div className="group">
              {items.map((it, idx) => (
                <div className="row" key={it.id} style={{ alignItems: "flex-start", flexWrap: "wrap", gap: 6 }}>
                  <div style={{ width: "100%", display: "flex", gap: 6 }}>
                    <input
                      className="input mono"
                      style={{ flex: "0 0 34%", minHeight: 38 }}
                      placeholder="Item code"
                      value={it.itemCode}
                      onChange={(e) => updateItem(idx, { itemCode: e.target.value }, setItems)}
                    />
                    <input
                      className="input"
                      style={{ flex: 1, minHeight: 38 }}
                      placeholder="Name"
                      value={it.name}
                      onChange={(e) => updateItem(idx, { name: e.target.value }, setItems)}
                    />
                  </div>
                  <div style={{ width: "100%", display: "flex", gap: 6 }}>
                    <input
                      className="input mono"
                      style={{ flex: 1, minHeight: 38 }}
                      inputMode="decimal"
                      placeholder="Required amount"
                      value={it.requiredAmount ?? ""}
                      onChange={(e) =>
                        updateItem(idx, { requiredAmount: e.target.value === "" ? null : Number(e.target.value) }, setItems)
                      }
                    />
                    <input
                      className="input"
                      style={{ flex: "0 0 90px", minHeight: 38 }}
                      placeholder="UOM"
                      value={it.requiredUom}
                      onChange={(e) => updateItem(idx, { requiredUom: e.target.value }, setItems)}
                    />
                    <button className="btn btn--sm btn--danger" onClick={() => setItems((its) => its.filter((_, i) => i !== idx))}>
                      ✕
                    </button>
                  </div>
                </div>
              ))}
              <button className="row row--button" onClick={addBlankItem}>
                <div className="row__label" style={{ color: "var(--accent)", fontWeight: 600 }}>
                  + Add item
                </div>
              </button>
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}

function updateItem(idx: number, patch: Partial<RequiredItem>, setItems: React.Dispatch<React.SetStateAction<RequiredItem[]>>) {
  setItems((its) => its.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
}

function PrelimRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="row">
      <div className="row__label small muted" style={{ flex: "0 0 140px" }}>
        {label}
      </div>
      <input
        className="input"
        style={{ border: "none", background: "transparent", boxShadow: "none", textAlign: "right" }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="—"
      />
    </div>
  );
}
