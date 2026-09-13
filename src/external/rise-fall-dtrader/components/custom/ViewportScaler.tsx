
export default function ViewportScaler({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ width: '100%', minHeight: '100dvh', overflowX: 'hidden' }}>
      {children}
    </div>
  );
}
