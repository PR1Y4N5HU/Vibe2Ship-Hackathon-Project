import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API routes FIRST
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Initialize Gemini AI SDK safely
  const geminiKey = process.env.GEMINI_API_KEY || "";
  const ai = new GoogleGenAI({ apiKey: geminiKey });

  app.post("/api/gemini/decompose", async (req, res) => {
    try {
      if (!geminiKey) {
        throw new Error("GEMINI_API_KEY environment variable is not set.");
      }
      const { title, description, deadline, currentTime } = req.body;
      if (!title) {
        return res.status(400).json({ error: "Title is required" });
      }

      const prompt = `Decompose this task into 3 to 5 clear, actionable steps for a student, professional, or entrepreneur.
Task: "${title}"
Description: "${description || 'None'}"
Task Deadline: "${deadline || 'None'}"
Current Time: "${currentTime || new Date().toISOString()}"

Identify the single MOST CRITICAL, foundational, or highest-leverage step that the user must execute first. Mark exactly one step with isMostImportant = true.

Intelligently distribute the steps across different target completion dates and times (as "dueDate") leading up to the Task Deadline. Ensure that earlier steps are assigned earlier dates/times, and the last steps are closest to the deadline. Formulate realistic date/time values based on the Task Deadline and Current Time, returning them in the ISO format (YYYY-MM-DDTHH:mm:ss).`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              steps: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    description: { type: Type.STRING },
                    isMostImportant: { type: Type.BOOLEAN },
                    dueDate: { type: Type.STRING, description: "Target completion date-time for this step in ISO format (YYYY-MM-DDTHH:mm:ss)" }
                  },
                  required: ["title", "description", "isMostImportant", "dueDate"]
                }
              }
            },
            required: ["steps"]
          }
        },
      });

      const responseText = response.text;
      if (!responseText) {
        throw new Error("No response text from Gemini API");
      }

      const parsed = JSON.parse(responseText.trim());
      res.json(parsed);
    } catch (err: any) {
      console.error("Decompose error:", err);
      res.status(500).json({ error: err.message || "Failed to decompose task" });
    }
  });

  app.post("/api/gemini/prioritize", async (req, res) => {
    try {
      if (!geminiKey) {
        throw new Error("GEMINI_API_KEY environment variable is not set.");
      }
      const { tasks } = req.body;
      if (!tasks || !Array.isArray(tasks) || tasks.length === 0) {
        return res.status(400).json({ error: "Tasks array is required" });
      }

      const prompt = `Review the following list of tasks. Reorder them intelligently based on urgency (deadline proximity), importance level, and user preference. Provide a brief, helpful explanation of why the primary task is focused first.
Tasks: ${JSON.stringify(tasks.map(t => ({
        id: t.id,
        title: t.title,
        deadline: t.deadline,
        importance: t.importance,
        userPreference: t.userPreference
      })))}

Return a JSON object with sortedTaskIds and focusReason.`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              sortedTaskIds: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              },
              focusReason: { type: Type.STRING }
            },
            required: ["sortedTaskIds", "focusReason"]
          }
        },
      });

      const responseText = response.text;
      if (!responseText) {
        throw new Error("No response text from Gemini API");
      }

      const parsed = JSON.parse(responseText.trim());
      res.json(parsed);
    } catch (err: any) {
      console.error("Prioritize error:", err);
      res.status(500).json({ error: err.message || "Failed to prioritize tasks" });
    }
  });

  app.post("/api/gemini/recall", async (req, res) => {
    try {
      if (!geminiKey) {
        throw new Error("GEMINI_API_KEY environment variable is not set.");
      }
      const { title, description, steps } = req.body;
      if (!title) {
        return res.status(400).json({ error: "Task title is required" });
      }

      const prompt = `Generate a quick active-recall quiz question about the following task.
This question is used to prevent distraction and ensure cognitive reinforcement of the task.
Task: "${title}"
Description: "${description || 'None'}"
Steps: ${JSON.stringify(steps || [])}

Create a question that tests whether the user actually remembers the details, objectives, or key steps of this task.
Provide 3 multiple-choice options, and indicate the 0-based index of the correct option.`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              question: { type: Type.STRING },
              options: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              },
              correctAnswerIndex: { type: Type.INTEGER }
            },
            required: ["question", "options", "correctAnswerIndex"]
          }
        },
      });

      const responseText = response.text;
      if (!responseText) {
        throw new Error("No response text from Gemini API");
      }

      const parsed = JSON.parse(responseText.trim());
      res.json(parsed);
    } catch (err: any) {
      console.error("Recall error:", err);
      res.status(500).json({ error: err.message || "Failed to generate recall quiz" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
