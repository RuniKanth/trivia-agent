import path from "path";
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, "..", ".env") });
console.log("ENV keys loaded:", {
  GEMINI: !!process.env.GEMINI_API_KEY,
  OPENAI: !!process.env.OPENAI_API_KEY,
});
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import gameRoutes from "./routes/game";

const app = express();
app.use(cors());
app.use(bodyParser.json({ strict: false }));
app.use((err: any, _req: any, res: any, next: any) => {
  if (err instanceof SyntaxError && "body" in err) {
    console.error("JSON parse error:", err.message);
    return res.status(400).json({
      error: "Invalid JSON body.",
      details: err.message,
    });
  }
  next(err);
});

app.use("/api", gameRoutes);

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
