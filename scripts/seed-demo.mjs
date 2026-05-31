const apiUrl = process.env.OPENDINQ_API_URL ?? "http://localhost:3011";

const response = await fetch(`${apiUrl.replace(/\/$/, "")}/api/seed/demo`, {
  method: "POST"
});

if (!response.ok) {
  const body = await response.text();
  throw new Error(`Demo seed failed with ${response.status}: ${body}`);
}

const body = await response.json();
console.log(`Seeded ${body.profileCount} demo profiles: ${body.handles.join(", ")}`);
