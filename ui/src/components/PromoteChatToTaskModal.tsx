import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface PromoteChatToTaskModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialContent: string;
  onConfirm: (data: {
    title: string;
    description: string;
    priority: "low" | "medium" | "high" | "urgent";
  }) => Promise<void>;
  loading?: boolean;
}

export function PromoteChatToTaskModal({
  open,
  onOpenChange,
  initialContent,
  onConfirm,
  loading = false,
}: PromoteChatToTaskModalProps) {
  const defaultTitle =
    initialContent
      .split("\n")[0]
      ?.replace(/^#+\s*/, "")
      .slice(0, 60)
      .trim() || "Tugas dari Obrolan";

  const [title, setTitle] = useState(defaultTitle);
  const [description, setDescription] = useState(initialContent);
  const [priority, setPriority] = useState<"low" | "medium" | "high" | "urgent">(
    "medium",
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    await onConfirm({ title: title.trim(), description: description.trim(), priority });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Buat Tugas dari Obrolan</DialogTitle>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="task-title">Judul Tugas</Label>
            <Input
              id="task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Contoh: Analisa dan perbaikan bug"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="task-desc">Deskripsi</Label>
            <Textarea
              id="task-desc"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Rincian instruksi tugas"
            />
          </div>

          <div className="space-y-2">
            <Label>Prioritas</Label>
            <Select
              value={priority}
              onValueChange={(val: "low" | "medium" | "high" | "urgent") =>
                setPriority(val)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Rendah (Low)</SelectItem>
                <SelectItem value="medium">Sedang (Medium)</SelectItem>
                <SelectItem value="high">Tinggi (High)</SelectItem>
                <SelectItem value="urgent">Mendesak (Urgent)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={loading}
              onClick={() => onOpenChange(false)}
            >
              Batal
            </Button>
            <Button type="submit" disabled={loading || !title.trim()}>
              {loading ? "Menyimpan..." : "Buat Tugas"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
