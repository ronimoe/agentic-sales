export const SimChip = ({ label, tip }: { label: string; tip?: string }) => <span title={tip} className="chip chip-wait">{label}</span>;
