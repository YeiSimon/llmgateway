"use client";

import { cn } from "@/lib/utils";

const FREE_RANGES = [
	{ value: "1h", label: "1h" },
	{ value: "4h", label: "4h" },
	{ value: "24h", label: "24h" },
	{ value: "7d", label: "7d" },
] as const;

const PRO_RANGES = [{ value: "30d", label: "30d" }] as const;

export type TimeRangeValue =
	| (typeof FREE_RANGES)[number]["value"]
	| (typeof PRO_RANGES)[number]["value"];

interface TimeRangePickerProps {
	value: TimeRangeValue;
	onChange: (value: TimeRangeValue) => void;
	// Restrict which ranges are shown. Defaults to all ranges.
	allowedValues?: readonly TimeRangeValue[];
}

export function TimeRangePicker({
	value,
	onChange,
	allowedValues,
}: TimeRangePickerProps) {
	const allRanges = [...FREE_RANGES, ...PRO_RANGES];
	const visibleRanges = allowedValues
		? allRanges.filter((r) => allowedValues.includes(r.value))
		: allRanges;

	return (
		<div className="inline-flex items-center rounded-md border bg-muted p-0.5">
			{visibleRanges.map((range) => (
				<button
					key={range.value}
					type="button"
					onClick={() => onChange(range.value)}
					className={cn(
						"px-3 py-1 text-sm font-medium rounded-sm transition-colors",
						value === range.value
							? "bg-background text-foreground shadow-sm"
							: "text-muted-foreground hover:text-foreground",
					)}
				>
					{range.label}
				</button>
			))}
		</div>
	);
}
