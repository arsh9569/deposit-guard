export default function StudentDashboard() {
  return (
    <main style={{ padding: '40px', maxWidth: '1100px', margin: '0 auto' }}>
      <h1>Student Dashboard</h1>
      <p>Welcome to NidhiKosh — Student Portal</p>

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '20px',
          marginTop: '30px',
        }}
      >
        {[
          ['My Deposits', 'View your security deposits'],
          ['FDR Status', 'Track fixed deposit records'],
          ['Refund Requests', 'Track refund applications'],
          ['My Profile', 'View your student details'],
        ].map(([title, description]) => (
          <article
            key={title}
            style={{
              background: '#fff',
              padding: '24px',
              borderRadius: '12px',
              border: '1px solid #dce4ee',
            }}
          >
            <h2 style={{ fontSize: '18px', color: '#12345a' }}>{title}</h2>
            <p>{description}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
