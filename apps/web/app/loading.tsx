export default function Loading() {
  return (
    <div className="container-page py-10" aria-busy="true" aria-label="Loading">
      <div className="skeleton h-9 w-64 mb-6" />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => <div key={i} className="skeleton aspect-[3/4]" />)}
      </div>
    </div>
  );
}
