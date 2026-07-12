export function SortArrow({
  active,
  ascending,
}: {
  active: boolean;
  ascending: boolean;
}) {
  if (!active) return null;
  return ascending ? <> ▲</> : <> ▼</>;
}
