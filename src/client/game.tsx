import { useState, useEffect, CSSProperties } from "react";
import { createRoot } from "react-dom/client";

type Report = {
  id: number | string;
  title: string;
  category: string;
  priority: number;
  confidence: number;
  content: string;
  riskScore?: number;
  recommendation?: string;
  engineReason?: string; // Added to catch the engine's reason from the backend
};

export const Game = () => {
  const [data, setData] = useState<Report[]>([]);
  const [selected, setSelected] = useState<Report | null>(null);

  /* -------------------------
     FETCH MOD QUEUE (FROM REAL BACKEND)
  --------------------------*/
  const fetchQueue = async () => {
    try {
      const res = await fetch("/api/modqueue");
      const json = await res.json();

      // The Backend has already run the ModBuddy Engine! 
      // We just need to sort the posts by most dangerous first.
      const posts = (json.posts || []).sort(
        (a: Report, b: Report) => (b.riskScore || 0) - (a.riskScore || 0)
      );

      setData(posts);
      setSelected(posts[0] || null);
    } catch (err) {
      console.error("Failed to load mod queue", err);
    }
  };

  useEffect(() => {
    fetchQueue();
  }, []);

  const getColor = (p: number) => {
    if (p >= 5) return "#ef4444";
    if (p >= 3) return "#f59e0b";
    return "#22c55e";
  };

  /* -------------------------
     REAL MOD ACTIONS (OPTIMISTIC)
  --------------------------*/
  const action = async (type: string) => {
    if (!selected) return;

    // Capture the current post in case the server fails and we need to roll back
    const targetPost = selected;

    // 1. Optimistic Update: Instantly mutate local state
    setData((prevData) => {
      const nextQueue = prevData.filter((item) => item.id !== targetPost.id);
      // Auto-advance the queue to keep the moderator moving
      setSelected(nextQueue[0] || null);
      return nextQueue;
    });

    // 2. Fire the network request in the background
    try {
      const res = await fetch(`/api/${type.toLowerCase()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId: targetPost.id }),
      });

      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      
    } catch (err) {
      console.error(`${type} failed for post ${targetPost.id}`, err);
      
      // Rollback: If the API fails, shove the post back into the queue
      setData((prevData) => [targetPost, ...prevData]);
      setSelected((prevSelected) => prevSelected ? prevSelected : targetPost);
      alert(`Network error: Failed to ${type}. Post returned to queue.`);
    }
  };

  return (
    <div style={styles.container}>
      
      {/* HEADER */}
      <div style={styles.header}>
        <h1 style={styles.title}>ModBuddy Dashboard</h1>
        <p style={styles.sub}>AI Moderation System</p>
        <button onClick={fetchQueue} style={{ marginTop: 10 }}>
          Refresh Queue
        </button>
      </div>

      {/* MAIN GRID */}
      <div style={styles.grid}>

        {/* LEFT QUEUE */}
        <div style={styles.panel}>
          <h3>Queue</h3>
          {data.map((item) => (
            <div
              key={item.id}
              onClick={() => setSelected(item)}
              style={{
                ...styles.card,
                borderLeft: `5px solid ${getColor(item.priority)}`
              }}
            >
              <b>{item.title}</b>
              <p style={{ fontSize: 11, opacity: 0.8 }}>
                Risk: {item.riskScore} | {item.recommendation}
              </p>
              <p style={{ fontSize: 12 }}>{item.category}</p>
            </div>
          ))}
        </div>

        {/* CENTER DETAILS */}
        <div style={styles.panel}>
          <h3>Details</h3>
          {selected && (
            <div style={styles.box}>
              <h4>{selected.title}</h4>
              <p>{selected.content}</p>
              <p>Category: {selected.category}</p>
              <p>Priority: {selected.priority}/5</p>

              <div style={{ display: "flex", gap: 10, marginTop: 15 }}>
                <button style={styles.approve} onClick={() => action("APPROVE")}>
                  Approve
                </button>
                <button style={styles.remove} onClick={() => action("REMOVE")}>
                  Remove
                </button>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT AI PANEL */}
        <div style={styles.panel}>
          <h3>AI Insights</h3>
          {selected && (
            <div style={styles.box}>
              <p>Confidence: {selected.confidence}%</p>
              <p>Risk Score: {selected.riskScore}</p>
              <p>
                Recommendation: <b>{selected.recommendation}</b>
              </p>
              {selected.engineReason && (
                <p>
                  <b>Engine Reason:</b> {selected.engineReason}
                </p>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

/* STYLES */
const styles: { [key: string]: CSSProperties } = {
  container: {
    fontFamily: "Arial",
    background: "#0b1220",
    minHeight: "100vh",
    color: "white",
    padding: "20px"
  },
  header: { marginBottom: 20 },
  title: { fontSize: 28, fontWeight: "bold" },
  sub: { opacity: 0.7 },
  grid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr",
    gap: 15
  },
  panel: {
    background: "#111a2e",
    padding: 15,
    borderRadius: 12
  },
  card: {
    background: "#1a2440",
    padding: 10,
    marginBottom: 10,
    borderRadius: 8,
    cursor: "pointer"
  },
  box: {
    background: "#1a2440",
    padding: 12,
    borderRadius: 10
  },
  approve: {
    background: "#22c55e",
    border: "none",
    padding: 8,
    color: "white",
    borderRadius: 6,
    cursor: "pointer"
  },
  remove: {
    background: "#ef4444",
    border: "none",
    padding: 8,
    color: "white",
    borderRadius: 6,
    cursor: "pointer"
  }
};

const container = document.getElementById("root");
if (container) {
  const root = createRoot(container);
  root.render(<Game />);
}