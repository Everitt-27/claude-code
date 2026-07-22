import { useState } from "react";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useStore } from "../store/useStore";
import { useUI } from "../store/useUI";
import {
  EmptyState,
  Field,
  IconChevron,
  IconGrip,
  IconMove,
  IconPlus,
  IconPrint,
  IconTrash,
  Segmented,
  Sheet,
} from "../components/ui";
import { Allocation, Kit, KitStatus, RequiredItem } from "../lib/types";
import { itemRemaining, itemTransferred } from "../lib/engine";
import { fmtQty } from "../lib/format";
import { ReturnSheet } from "../components/ReturnSheet";
import { downloadBlob, openPdf, printPdf } from "../lib/download";
import { kitToCsv } from "../lib/exportCsv";

const STATUSES: { value: KitStatus; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "consumed", label: "Consumed" },
  { value: "cancelled", label: "Cancelled" },
];

export function KitDetail({ kitId }: { kitId: string }) {
  const kit = useStore((s) => s.kits.find((k) => k.id === kitId));
  const closeKit = useUI((s) => s.closeKit);
  const setActiveKit = useUI((s) => s.setActiveKit);
  const setMoveTarget = useUI((s) => s.setMoveTarget);
  const reorderItems = useStore((s) => s.reorderItems);
  const updateKit = useStore((s) => s.updateKit);
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [busyExport, setBusyExport] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (!kit) {
    return (
      <div className="container">
        <EmptyState icon="🚫" title="Kit not found" text="This kit no longer exists." action={<button className="btn" onClick={closeKit}>Back to kits</button>} />
      </div>
    );
  }

  const order = kit.order.length ? kit.order : kit.items.map((i) => i.id);
  const orderedItems = order.map((id) => kit.items.find((i) => i.id === id)).filter(Boolean) as RequiredItem[];

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = order.indexOf(String(active.id));
    const newIndex = order.indexOf(String(over.id));
    reorderItems(kitId, arrayMove(order, oldIndex, newIndex));
  }

  async function doPrint() {
    setBusyExport(true);
    try {
      const { generateKitFormPdf } = await import("../lib/kitForm");
      printPdf(await generateKitFormPdf(kit!));
    } finally {
      setBusyExport(false);
    }
  }
  async function doPreview() {
    setBusyExport(true);
    try {
      const { generateKitFormPdf } = await import("../lib/kitForm");
      openPdf(await generateKitFormPdf(kit!));
    } finally {
      setBusyExport(false);
    }
  }
  async function doExportPdf() {
    setBusyExport(true);
    try {
      const { generateKitFormPdf } = await import("../lib/kitForm");
      const bytes = await generateKitFormPdf(kit!);
      downloadBlob(bytes, `KitForm-${kit!.batch || kit!.id}.pdf`, "application/pdf");
    } finally {
      setBusyExport(false);
    }
  }
  function doExportCsv() {
    downloadBlob(kitToCsv(kit!), `Kit-${kit!.batch || kit!.id}.csv`, "text/csv");
  }

  return (
    <>
      <header className="nav">
        <div className="nav__row">
          <button className="btn btn--sm" onClick={closeKit}>
            ‹ Kits
          </button>
          <div className="nav__actions">
            <button className="btn btn--sm" onClick={() => setShowEdit(true)}>
              Edit
            </button>
          </div>
        </div>
        <div className="nav__title-lg" style={{ paddingBottom: 2 }}>
          {kit.product || "Untitled"}
        </div>
        <div style={{ padding: "0 16px 8px" }} className="small muted">
          <span className={`badge ${kit.type === "herb" ? "badge--green" : "badge--blue"}`}>
            {kit.type === "herb" ? "Herb Kit" : "Packaging Kit"}
          </span>{" "}
          {kit.customer || "—"} · Batch {kit.batch || "—"} · {kit.fishbowlLocation || "no IP location"}
        </div>
      </header>

      <div className="container">
        <div style={{ marginBottom: 12 }}>
          <Segmented value={kit.status} onChange={(v) => updateKit(kitId, { status: v })} options={STATUSES} />
        </div>

        <div className="hstack" style={{ gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          <button
            className="btn btn--green"
            onClick={() => {
              setActiveKit(kitId);
              useUI.getState().toggleBubble(true);
            }}
          >
            <IconMove /> Kit this order
          </button>
        </div>

        {orderedItems.length === 0 ? (
          <EmptyState
            icon="📋"
            title="No required items"
            text="Add items from a Master Formula, or use Edit to add them manually."
          />
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={order} strategy={verticalListSortingStrategy}>
              <div className="stack">
                {orderedItems.map((item) => (
                  <SortableItem key={item.id} kitId={kitId} item={item} onAdd={() => setMoveTarget({ kitId, itemId: item.id, itemCode: item.itemCode, itemName: item.name })} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}

        {/* Bottom controls — excluded from the generated document. */}
        <div className="group" style={{ marginTop: 20, padding: 12 }}>
          <div className="section__header" style={{ padding: "2px 0 8px" }}>
            Form & export
          </div>
          <div className="hstack" style={{ gap: 8, flexWrap: "wrap" }}>
            <button className="btn btn--primary" onClick={doPrint} disabled={busyExport}>
              <IconPrint /> Print
            </button>
            <button className="btn" onClick={doPreview} disabled={busyExport}>
              Print Preview
            </button>
            <button className="btn" onClick={doExportPdf} disabled={busyExport}>
              Export PDF
            </button>
            <button className="btn" onClick={doExportCsv}>
              Export CSV
            </button>
          </div>
          <p className="tiny muted" style={{ marginTop: 8 }}>
            The printed form is a generated PDF (WH-0001-MPKF-A-V5) — rows follow the order above, multiple lots print as
            separate rows, and the output contains no app URL or browser header/footer.
          </p>
        </div>

        <button className="btn btn--danger btn--block" style={{ marginTop: 16 }} onClick={() => setShowDelete(true)}>
          <IconTrash /> Delete or Cancel Kit
        </button>
      </div>

      {showEdit && <EditKitSheet kit={kit} onClose={() => setShowEdit(false)} />}
      {showDelete && <DeleteKitSheet kit={kit} onClose={() => setShowDelete(false)} />}
    </>
  );
}

function SortableItem({ kitId, item, onAdd }: { kitId: string; item: RequiredItem; onAdd: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const [expanded, setExpanded] = useState(true);
  const transferred = itemTransferred(item);
  const remaining = itemRemaining(item);
  const required = item.requiredAmount;
  const pct = required && required > 0 ? Math.min(100, Math.round((transferred / required) * 100)) : transferred > 0 ? 100 : 0;
  const over = required != null && transferred > required;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <div className="group" ref={setNodeRef} style={style}>
      <div className="row" style={{ alignItems: "flex-start" }}>
        <button className="btn btn--sm" style={{ minHeight: 32, padding: 4, cursor: "grab", touchAction: "none" }} {...attributes} {...listeners} aria-label="Drag to reorder">
          <IconGrip />
        </button>
        <button className="row__label" style={{ border: "none", background: "none", textAlign: "left" }} onClick={() => setExpanded((v) => !v)}>
          <div className="hstack" style={{ gap: 6 }}>
            <span style={{ fontWeight: 700 }}>{item.name || item.itemCode || "Unnamed item"}</span>
            {!item.matched && item.itemCode && <span className="badge badge--orange">unmatched</span>}
          </div>
          <div className="small mono muted">{item.itemCode || "—"} · {item.section}</div>
          <div className="small" style={{ marginTop: 4 }}>
            <strong>{fmtQty(transferred)}</strong> of {required != null ? fmtQty(required) : "—"} {item.requiredUom} transferred
            {remaining != null && remaining > 0 && <span className="muted"> · {fmtQty(remaining)} remaining</span>}
            {over && <span className="badge badge--orange" style={{ marginLeft: 6 }}>over by {fmtQty(transferred - (required ?? 0))}</span>}
          </div>
          <div className="progress" style={{ marginTop: 6 }}>
            <div className="progress__bar" style={{ width: `${pct}%`, background: over ? "var(--orange)" : "var(--green)" }} />
          </div>
        </button>
        <IconChevron className="row__chevron" style={{ transform: expanded ? "rotate(90deg)" : "none" }} />
      </div>

      {expanded && (
        <>
          {item.allocations.map((a) => (
            <AllocationRow key={a.id} kitId={kitId} item={item} alloc={a} />
          ))}
          <button className="row row--button" onClick={onAdd}>
            <IconPlus className="row__chevron" />
            <div className="row__label" style={{ color: "var(--accent)", fontWeight: 600 }}>
              Add lot / location
            </div>
          </button>
        </>
      )}
    </div>
  );
}

function AllocationRow({ kitId, item, alloc }: { kitId: string; item: RequiredItem; alloc: Allocation }) {
  const edit = useStore((s) => s.edit);
  const removeAlloc = useStore((s) => s.removeAlloc);
  const [showReturn, setShowReturn] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [amt, setAmt] = useState(String(alloc.amount));
  const [pkgs, setPkgs] = useState(alloc.packages != null ? String(alloc.packages) : "");

  return (
    <>
      <div className="row" style={{ background: "var(--card-2)" }}>
        <div className="row__label">
          <div className="small mono">
            {fmtQty(alloc.amount)} {alloc.uom} · Lot {alloc.yeLot || "—"}
          </div>
          <div className="tiny muted">
            {alloc.location}
            {alloc.packages != null && ` · ${alloc.packages} pkg`}
            {alloc.expiration && ` · exp ${alloc.expiration}`}
          </div>
        </div>
        <div className="hstack" style={{ gap: 4 }}>
          <button className="btn btn--sm" onClick={() => setShowEdit(true)}>
            Edit
          </button>
          <button className="btn btn--sm btn--tinted" onClick={() => setShowReturn(true)}>
            Return
          </button>
          <button className="btn btn--sm btn--danger" onClick={() => removeAlloc({ kitId, itemId: item.id, allocId: alloc.id })} aria-label="Reverse allocation">
            <IconTrash />
          </button>
        </div>
      </div>

      {showEdit && (
        <Sheet
          title="Edit allocation"
          onClose={() => setShowEdit(false)}
          footer={
            <>
              <button className="btn" style={{ flex: 1 }} onClick={() => setShowEdit(false)}>
                Cancel
              </button>
              <button
                className="btn btn--primary"
                style={{ flex: 2 }}
                onClick={() => {
                  edit({ kitId, itemId: item.id, allocId: alloc.id, newAmount: Number(amt.replace(/,/g, "")), newPackages: pkgs.trim() === "" ? null : Number(pkgs) });
                  setShowEdit(false);
                }}
              >
                Save — adjust by difference
              </button>
            </>
          }
        >
          <div className="container">
            <p className="small muted">Inventory is adjusted only by the difference between the old and new amount.</p>
            <Field label="Amount In Process">
              <input className="input mono" inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} />
            </Field>
            <Field label="# of Packages">
              <input className="input mono" inputMode="numeric" value={pkgs} placeholder="—" onChange={(e) => setPkgs(e.target.value)} />
            </Field>
          </div>
        </Sheet>
      )}

      {showReturn && <ReturnSheet kitId={kitId} item={item} alloc={alloc} onClose={() => setShowReturn(false)} />}
    </>
  );
}

function EditKitSheet({ kit, onClose }: { kit: Kit; onClose: () => void }) {
  const updateKit = useStore((s) => s.updateKit);
  const [f, setF] = useState({
    customer: kit.customer,
    product: kit.product,
    batch: kit.batch,
    mmrEdition: kit.mmrEdition,
    fishbowlLocation: kit.fishbowlLocation,
    dueDate: kit.dueDate,
    notes: kit.notes,
  });
  return (
    <Sheet
      title="Edit kit details"
      onClose={onClose}
      footer={
        <button
          className="btn btn--primary btn--block"
          onClick={() => {
            updateKit(kit.id, f);
            onClose();
          }}
        >
          Save
        </button>
      }
    >
      <div className="container">
        <Field label="Customer">
          <input className="input" value={f.customer} onChange={(e) => setF({ ...f, customer: e.target.value })} />
        </Field>
        <Field label="Product">
          <input className="input" value={f.product} onChange={(e) => setF({ ...f, product: e.target.value })} />
        </Field>
        <Field label="Batch #">
          <input className="input" value={f.batch} onChange={(e) => setF({ ...f, batch: e.target.value })} />
        </Field>
        <Field label="Formula/MMR Edition">
          <input className="input" value={f.mmrEdition} onChange={(e) => setF({ ...f, mmrEdition: e.target.value })} />
        </Field>
        <Field label="Fish Bowl Location (In Process)">
          <input className="input" value={f.fishbowlLocation} onChange={(e) => setF({ ...f, fishbowlLocation: e.target.value })} />
        </Field>
        <Field label="Due date">
          <input className="input" type="date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} />
        </Field>
        <Field label="Notes">
          <textarea className="textarea" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        </Field>
      </div>
    </Sheet>
  );
}

function DeleteKitSheet({ kit, onClose }: { kit: Kit; onClose: () => void }) {
  const cancelReturn = useStore((s) => s.cancelKitReturn);
  const cancelLeave = useStore((s) => s.cancelKitLeave);
  const deleteKit = useStore((s) => s.deleteKit);
  const closeKit = useUI((s) => s.closeKit);
  const setActiveKit = useUI((s) => s.setActiveKit);
  const activeKitId = useUI((s) => s.activeKitId);
  const hasMaterial = kit.items.some((i) => i.allocations.length > 0);

  function done() {
    if (activeKitId === kit.id) setActiveKit(null);
    onClose();
    closeKit();
  }

  return (
    <Sheet title="Delete or cancel kit" onClose={onClose}>
      <div className="container">
        <p className="small muted">
          Deleting or cancelling a kit never silently loses inventory. Choose how to handle any transferred material.
        </p>
        <div className="group" style={{ marginTop: 8 }}>
          <button
            className="row row--button"
            onClick={() => {
              cancelReturn(kit.id);
              done();
            }}
          >
            <div className="row__label">
              <div style={{ fontWeight: 700 }}>Return material & cancel</div>
              <div className="tiny muted">Every allocation is returned to its original source location, then the kit is cancelled. Reversals are recorded.</div>
            </div>
          </button>
          <button
            className="row row--button"
            onClick={() => {
              cancelLeave(kit.id);
              done();
            }}
          >
            <div className="row__label">
              <div style={{ fontWeight: 700 }}>Leave material in place & archive</div>
              <div className="tiny muted">Material stays in its In Process location; the kit is archived (cancelled).</div>
            </div>
          </button>
          <button
            className="row row--button"
            onClick={() => {
              if (hasMaterial) return;
              deleteKit(kit.id);
              done();
            }}
            style={hasMaterial ? { opacity: 0.5 } : undefined}
          >
            <div className="row__label">
              <div style={{ fontWeight: 700, color: hasMaterial ? undefined : "var(--danger)" }}>Delete kit permanently</div>
              <div className="tiny muted">
                {hasMaterial
                  ? "Return or leave material first — this kit still holds transferred stock."
                  : "No material is transferred, so the kit record can be removed outright."}
              </div>
            </div>
          </button>
        </div>
      </div>
    </Sheet>
  );
}
