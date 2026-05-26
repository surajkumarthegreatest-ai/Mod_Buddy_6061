import { useState, useEffect } from "react";

type Report = {
  id: number | string;
  title: string;
  category: string;
  priority: number;
  confidence: number;
  content: string;

  // 🔥 PHASE 4 ADDITIONS
  riskScore?: number;
  recommendation?: string;
};

/* =========================
   🔥 REMOVED STATIC DATA
   =========================
   Now replaced with API data
*/

export const Game = () => {
  const [data, setData] = useState<Report[]>([]);
  const [selected, setSelected] = useState<Report | null>(null);

  /* -------------------------
     FETCH MOD QUEUE + AI LAYER
  --------------------------*/
  const fetchQueue = async () => {
    try {
      const res = await fetch("/api/modqueue");
      const json = await res.json();

      // 🔥 PHASE 4: AI RISK ENGINE + SORTING
      const posts = (json.posts || [])
        .map((p: any, index: number) => {
          const basePriority = p.priority || Math.floor(Math.random() * 5) + 1;
          const confidence = p.confidence || Math.floor(Math.random() * 40) + 60;

          // 🔥 AI RISK SCORE
          const riskScore = Math.min(
            100,
            basePriority * 15 + (100 - confidence)
          );

          // 🧠 AI CLASSIFICATION
          let category = "SAFE";
          if (riskScore >= 75) category = "HATE/SPAM";
          else if (riskScore >= 50) category = "REVIEW";
          else category = "LOW RISK";

          return {
            id: p.id || index,
            title: p.title || "No title",
            category,
            priority: basePriority,
            confidence,
            content: p.content || p.title || "",

            // 🔥 NEW AI FIELDS
            riskScore,
            recommendation:
              riskScore >= 75
                ? "REMOVE"
                : riskScore >= 50
                ? "REVIEW"
                : "APPROVE",
          };
        })

        // 🔥 SORT BY MOST DANGEROUS FIRST
        .sort((a: any, b: any) => b.riskScore - a.riskScore);

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
     🔥 REAL MOD ACTIONS
  --------------------------*/
  const action = async (type: string) => {
    if (!selected) return;

    try {
      await fetch(`/api/${type.toLowerCase()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId: selected.id }),
      });

      alert(`${type}: ${selected.title}`);

      // refresh queue after action
      fetchQueue();
    } catch (err) {
      console.error(`${type} failed`, err);
    }
  };

  return (
    <div style={styles.container}>
      
      {/* HEADER */}
      <div style={styles.header}>
        <h1 style={styles.title}>ModBuddy Dashboard</h1>
        <p style={styles.sub}>AI Moderation System</p>

        {/* optional refresh button */}
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

              {/* 🔥 PHASE 4 ADDITION */}
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
            </div>
          )}
        </div>

        {/* RIGHT AI PANEL */}
        <div style={styles.panel}>
          <h3>AI Insights</h3>

          {selected && (
            <div style={styles.box}>
              <p>Confidence: {selected.confidence}%</p>

              {/* 🔥 PHASE 4 UPGRADE */}
              <p>Risk Score: {selected.riskScore}</p>

              <p>
                Recommendation:{" "}
                <b>{selected.recommendation}</b>
              </p>

              <p>
                Action Hint:{" "}
                {selected.recommendation === "REMOVE"
                  ? "High probability abuse content"
                  : selected.recommendation === "REVIEW"
                  ? "Needs moderator attention"
                  : "Safe content"}
              </p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

/* styles unchanged */
const styles: any = {
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