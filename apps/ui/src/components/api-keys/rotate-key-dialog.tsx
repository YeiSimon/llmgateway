"use client";

import { Copy } from "lucide-react";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";

import { Button } from "@/lib/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/lib/components/dialog";
import { Input } from "@/lib/components/input";
import { Label } from "@/lib/components/label";
import { toast } from "@/lib/components/use-toast";
import { useAppConfig } from "@/lib/config";
import { extractOrgAndProjectFromPath } from "@/lib/navigation-utils";

interface RotateKeyDialogProps {
	keyId: string;
	keyDescription: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSuccess?: () => void;
}

export function RotateKeyDialog({
	keyId,
	keyDescription,
	open,
	onOpenChange,
	onSuccess,
}: RotateKeyDialogProps) {
	const config = useAppConfig();
	const pathname = usePathname();
	const { projectId } = useMemo(
		() => extractOrgAndProjectFromPath(pathname),
		[pathname],
	);

	const [gracePeriodDays, setGracePeriodDays] = useState(7);
	const [newToken, setNewToken] = useState<string | null>(null);
	const [isRotating, setIsRotating] = useState(false);

	const handleRotate = async () => {
		if (!projectId) {
			return;
		}

		setIsRotating(true);
		try {
			const res = await fetch(
				`${config.apiUrl}/keys/projects/${projectId}/keys/${keyId}/rotate`,
				{
					method: "POST",
					credentials: "include",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ gracePeriodDays }),
				},
			);

			if (!res.ok) {
				throw new Error("Rotation failed");
			}

			const data = (await res.json()) as { newKey: { token: string } };
			setNewToken(data.newKey.token);
			onSuccess?.();
			toast({ title: "API key rotated successfully." });
		} catch {
			toast({
				title: "Failed to rotate API key.",
				variant: "destructive",
			});
		} finally {
			setIsRotating(false);
		}
	};

	const handleCopy = () => {
		if (!newToken) {
			return;
		}
		void navigator.clipboard.writeText(newToken);
		toast({ title: "New API key copied to clipboard." });
	};

	const handleClose = () => {
		setNewToken(null);
		setGracePeriodDays(7);
		onOpenChange(false);
	};

	return (
		<Dialog open={open} onOpenChange={handleClose}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Rotate API Key</DialogTitle>
					<DialogDescription>
						Rotating <strong>{keyDescription}</strong>. A new key will be
						created. The old key enters a grace period during which both work.
					</DialogDescription>
				</DialogHeader>

				{newToken ? (
					<div className="space-y-4 py-4">
						<div className="rounded-md bg-muted p-3 space-y-2">
							<p className="text-sm font-medium text-green-600">
								New key created — copy it now.
							</p>
							<p className="text-xs text-muted-foreground">
								This is the only time the full key will be shown. Update all
								references before the grace period expires.
							</p>
						</div>
						<div className="flex gap-2">
							<Input readOnly value={newToken} className="font-mono text-sm" />
							<Button variant="outline" size="icon" onClick={handleCopy}>
								<Copy className="h-4 w-4" />
							</Button>
						</div>
						<DialogFooter>
							<Button onClick={handleClose}>Done</Button>
						</DialogFooter>
					</div>
				) : (
					<div className="space-y-4 py-4">
						<div className="space-y-2">
							<Label htmlFor="grace-period">Grace Period (days)</Label>
							<Input
								id="grace-period"
								type="number"
								min={0}
								max={30}
								value={gracePeriodDays}
								onChange={(e) => setGracePeriodDays(Number(e.target.value))}
							/>
							<p className="text-xs text-muted-foreground">
								The old key will continue to work for this many days after
								rotation. Set to 0 for immediate revocation.
							</p>
						</div>
						<DialogFooter>
							<Button variant="outline" onClick={handleClose}>
								Cancel
							</Button>
							<Button onClick={handleRotate} disabled={isRotating}>
								{isRotating ? "Rotating..." : "Rotate Key"}
							</Button>
						</DialogFooter>
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}
